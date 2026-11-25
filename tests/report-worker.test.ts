import { beforeEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
const mocks = vi.hoisted(() => ({ read: vi.fn(), upload: vi.fn(), render: vi.fn(), verify: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/reports/storage", () => ({ downloadReportObject: mocks.read, uploadReportObject: mocks.upload, reportObjectKeyFor: (id: string) => `reports/${id}.pdf` }));
vi.mock("@/lib/reports/pdf", () => ({ generateAssessmentReportPdf: mocks.render, isExpectedAssessmentReportPdf: mocks.verify }));
import { reportWorker, digestPdf } from "@/lib/reports/worker";
const id = "00000000-0000-4000-8000-000000000301";
const data = { reportId: id, assessmentSessionId: "00000000-0000-4000-8000-000000000401", assessmentDate: "2026-11-01T00:00:00+00:00",
  scores: { depression: { score: 14, category: "MODERATE" }, anxiety: { score: 14, category: "MODERATE" }, stress: { score: 14, category: "NORMAL" }, wemwbs: { score: 42 } } };
const bytes = new TextEncoder().encode("%PDF-" + "SYNTHETIC-UNIT-ONLY".repeat(12));
let stored: Uint8Array | null;
const db = { $queryRaw: mocks.query } as unknown as PrismaClient;
beforeEach(() => {
  vi.resetAllMocks(); stored = null;
  mocks.read.mockImplementation(async () => stored);
  mocks.upload.mockImplementation(async (_id, pdf) => { stored = pdf; });
  mocks.render.mockResolvedValue(bytes); mocks.verify.mockResolvedValue(true);
  mocks.query.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join("?");
    if (sql.includes("worker_input")) return [{ data }];
    if (sql.includes("download_input")) return [{ data: { reportId: id, size: bytes.length, digest: digestPdf(bytes) } }];
    if (sql.includes("epoch")) return [{ epoch: BigInt(1000) }];
    if (sql.includes("finalize")) return [{ id }];
    throw new Error("Unexpected query");
  });
});
const finalizations = () => mocks.query.mock.calls.filter(([strings]) => strings.join("").includes("finalize"));
it("uses authoritative job input, uploads create-only, verifies read-back, then attests digest and association", async () => {
  expect(await reportWorker(db, "a".repeat(64)).generate(id)).toEqual({ reportId: id, status: "GENERATED" });
  expect(mocks.render).toHaveBeenCalledWith({ ...data, assessmentDate: "2026-11-01T00:00:00.000Z" });
  expect(mocks.read).toHaveBeenCalledTimes(2);
  const [, payload, signature] = finalizations()[0];
  expect(JSON.parse(payload)).toMatchObject({ reportId: id, jobId: id, key: `reports/${id}.pdf`, digest: digestPdf(bytes), size: bytes.length, iat: 1000, exp: 1030 });
  expect(signature).toMatch(/^[a-f0-9]{64}$/);
});
it("does not finalize when Storage is unavailable", async () => {
  mocks.read.mockRejectedValue(new Error("offline"));
  await expect(reportWorker(db, "a".repeat(64)).generate(id)).rejects.toThrow();
  expect(mocks.upload).not.toHaveBeenCalled(); expect(finalizations()).toHaveLength(0);
});
it("does not finalize a failed upload with no object", async () => {
  mocks.upload.mockRejectedValue(new Error("offline"));
  await expect(reportWorker(db, "a".repeat(64)).generate(id)).rejects.toThrow("ARTIFACT_UNVERIFIED");
  expect(finalizations()).toHaveLength(0);
});
it("recovers a lost upload response only after read-back", async () => {
  mocks.upload.mockImplementation(async () => { stored = bytes; throw new Error("response lost"); });
  await expect(reportWorker(db, "a".repeat(64)).generate(id)).resolves.toMatchObject({ status: "GENERATED" });
  expect(mocks.read).toHaveBeenCalledTimes(2);
});
it("never overwrites conflicting bytes even if PDF metadata validation would pass", async () => {
  stored = bytes.slice(); stored[20] ^= 1;
  await expect(reportWorker(db, "a".repeat(64)).generate(id)).rejects.toThrow("ARTIFACT_UNVERIFIED");
  expect(mocks.upload).not.toHaveBeenCalled(); expect(finalizations()).toHaveLength(0);
});
it("retries failed finalization without replacing the persisted artifact", async () => {
  const original = mocks.query.getMockImplementation()!;
  let fail = true;
  mocks.query.mockImplementation(async (...args) => {
    if (args[0].join("").includes("finalize") && fail) { fail = false; throw new Error("database unavailable"); }
    return original(...args);
  });
  const worker = reportWorker(db, "a".repeat(64));
  await expect(worker.generate(id)).rejects.toThrow("database unavailable");
  await expect(worker.generate(id)).resolves.toMatchObject({ status: "GENERATED" });
  expect(mocks.upload).toHaveBeenCalledOnce();
});
it("coalesces duplicate in-flight jobs for the same report", async () => {
  const worker = reportWorker(db, "a".repeat(64));
  const results = await Promise.all([worker.generate(id), worker.generate(id)]);
  expect(results[0]).toEqual(results[1]); expect(mocks.upload).toHaveBeenCalledOnce(); expect(finalizations()).toHaveLength(1);
});
it("rejects invalid or expired database job before any Storage operation", async () => {
  mocks.query.mockRejectedValue(new Error("job expired"));
  await expect(reportWorker(db, "a".repeat(64)).generate(id)).rejects.toThrow();
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.render).not.toHaveBeenCalled();
});
it.each(["missing", "corrupt", "expired"])("denies %s download artifact/ticket", async condition => {
  stored = condition === "missing" ? null : bytes.slice();
  if (condition === "corrupt") stored![20] ^= 1;
  if (condition === "expired") mocks.query.mockRejectedValue(new Error("ticket expired"));
  await expect(reportWorker(db, "a".repeat(64)).download(id)).rejects.toThrow();
});
it("downloads only bytes matching the database attestation", async () => {
  stored = bytes;
  expect(await reportWorker(db, "a".repeat(64)).download(id)).toEqual(bytes);
});
