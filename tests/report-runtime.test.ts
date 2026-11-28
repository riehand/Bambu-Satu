import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fixtureId } from "./fixtures/assessment";

const mocks = vi.hoisted(() => ({
  assertActor: vi.fn(),
  query: vi.fn(),
  findReport: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/dal/context", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/dal/context")>(),
  assertDatabaseActor: mocks.assertActor,
  databaseTransaction: (work: (tx: { $queryRaw: typeof mocks.query }) => Promise<unknown>) => work({ $queryRaw: mocks.query }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { report: { findUnique: mocks.findReport } } }));

import { DalError } from "@/lib/dal/context";
import { downloadWithReportWorker, generateWithReportWorker } from "@/lib/reports/runtime";

const actorId = fixtureId(201);
const reportId = fixtureId(301);
const jobId = fixtureId(302);
const ticketId = fixtureId(303);
const appointmentId = fixtureId(401);
const bytes = new Uint8Array(128).fill(42);
const digest = createHash("sha256").update(bytes).digest("hex");
const artifact = { ticket: ticketId, digest, size: bytes.length };
const ref = "abcdefghijklmnopqrst";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("WELLBEING_RUNTIME", "hosted");
  vi.stubEnv("WELLBEING_HOSTED_PROJECT_REF", ref);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${ref}.supabase.co`);
  vi.stubEnv("WELLBEING_LOCAL_RUNTIME_FILE", undefined);
  vi.stubEnv("WELLBEING_PDF_WORKER_URL", "https://worker.example.com");
  vi.stubEnv("WELLBEING_PDF_WORKER_TOKEN", "a".repeat(64));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("accepts generation only after checking the persisted artifact metadata", async () => {
  mocks.query.mockResolvedValue([{ id: jobId }]);
  mocks.fetch.mockResolvedValue(Response.json({ reportId, status: "GENERATED" }));
  mocks.findReport.mockResolvedValue({ status: "GENERATED", filePathOrObjectKey: `reports/${reportId}.pdf`, generatedAt: new Date(0) });

  await expect(generateWithReportWorker(actorId, reportId)).resolves.toEqual({ reportId, status: "GENERATED" });
  expect(mocks.assertActor).toHaveBeenCalledWith(actorId, "PARTICIPANT");
  expect(mocks.fetch).toHaveBeenCalledWith(new URL("https://worker.example.com/generate"), expect.objectContaining({
    method: "POST", body: JSON.stringify({ jobId }), redirect: "error",
  }));
  expect(mocks.findReport).toHaveBeenCalledWith({
    where: { id: reportId }, select: { status: true, filePathOrObjectKey: true, generatedAt: true },
  });
});

it("rejects a successful worker response while the report remains pending", async () => {
  mocks.query.mockResolvedValue([{ id: jobId }]);
  mocks.fetch.mockResolvedValue(Response.json({ reportId, status: "GENERATED" }));
  mocks.findReport.mockResolvedValue({ status: "PENDING" });

  await expect(generateWithReportWorker(actorId, reportId)).rejects.toMatchObject({ code: "REPORT_FINALIZATION_UNAVAILABLE" });
});

it("does not report generation success when the worker is down", async () => {
  mocks.query.mockResolvedValue([{ id: jobId }]);
  mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));

  await expect(generateWithReportWorker(actorId, reportId)).rejects.toMatchObject({ code: "REPORT_ARTIFACT_NOT_READY" });
  expect(mocks.findReport).not.toHaveBeenCalled();
});

it("refuses to send a hosted job to an unapproved URL", async () => {
  vi.stubEnv("WELLBEING_PDF_WORKER_URL", "http://127.0.0.1:8082");
  mocks.query.mockResolvedValue([{ id: jobId }]);

  await expect(generateWithReportWorker(actorId, reportId)).rejects.toMatchObject({ code: "REPORT_UNAVAILABLE" });
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("returns verified bytes only after the second authorization in the same appointment scope", async () => {
  mocks.query.mockResolvedValueOnce([{ metadata: artifact }]).mockResolvedValueOnce([{ metadata: { ...artifact, ticket: null } }]);
  mocks.fetch.mockResolvedValue(new Response(bytes));

  await expect(downloadWithReportWorker(actorId, "PSYCHOLOGIST", reportId, appointmentId)).resolves.toEqual(bytes);
  expect(mocks.assertActor).toHaveBeenCalledWith(actorId, "PSYCHOLOGIST");
  const bindings = mocks.query.mock.calls.map(([, ...values]) => values);
  expect(bindings).toEqual([[reportId, appointmentId, false], [reportId, appointmentId, true]]);
  const [before, after] = mocks.query.mock.invocationCallOrder;
  const [storageRead] = mocks.fetch.mock.invocationCallOrder;
  expect(before).toBeLessThan(storageRead);
  expect(after).toBeGreaterThan(storageRead);
});

it.each([{ size: bytes.length + 1 }, { digest: "0".repeat(64) }])("rejects invalid bytes before recording access (%o)", async mismatch => {
  mocks.query.mockResolvedValue([{ metadata: { ...artifact, ...mismatch } }]);
  mocks.fetch.mockResolvedValue(new Response(bytes));

  await expect(downloadWithReportWorker(actorId, "PSYCHOLOGIST", reportId, appointmentId)).rejects.toMatchObject({ code: "REPORT_ARTIFACT_UNAVAILABLE" });
  expect(mocks.query).toHaveBeenCalledTimes(1);
});

it("discards verified bytes if authorization is revoked during the worker read", async () => {
  mocks.query.mockResolvedValueOnce([{ metadata: artifact }]);
  mocks.fetch.mockImplementation(async () => {
    mocks.query.mockRejectedValueOnce(new DalError("FORBIDDEN"));
    return new Response(bytes);
  });

  await expect(downloadWithReportWorker(actorId, "PSYCHOLOGIST", reportId, appointmentId)).rejects.toMatchObject({ code: "REPORT_NOT_FOUND" });
  expect(mocks.query).toHaveBeenCalledTimes(2);
});
