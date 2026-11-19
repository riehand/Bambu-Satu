import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), updateMany: vi.fn(), download: vi.fn(), upload: vi.fn(),
  generatePdf: vi.fn(), verifyPdf: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { report: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } } }));
vi.mock("@/lib/reports/storage", () => ({
  downloadReportObject: mocks.download,
  uploadReportObject: mocks.upload,
  reportObjectKeyFor: (id: string) => `reports/${id.toLowerCase()}.pdf`,
  ReportStorageError: class ReportStorageError extends Error { constructor(readonly kind: "conflict" | "unavailable") { super(kind); } },
}));
vi.mock("@/lib/reports/pdf", () => ({
  generateAssessmentReportPdf: mocks.generatePdf,
  isExpectedAssessmentReportPdf: mocks.verifyPdf,
}));

import { generateReportForParticipant, getValidatedReportArtifact, ReportError } from "@/lib/reports/service";
import { ReportStorageError } from "@/lib/reports/storage";

const participantId = "00000000-0000-4000-8000-000000000201";
type ReportFixture = {
  id: string;
  assessmentSessionId: string;
  status: "PENDING" | "GENERATED";
  filePathOrObjectKey: string | null;
  generatedAt: Date | null;
  assessmentSession: {
    participantId: string;
    status: string;
    completedAt: Date | null;
    score: { depressionScore: number; depressionCategory: string; anxietyScore: number; anxietyCategory: string; stressScore: number; stressCategory: string; wemwbsScore: number };
  };
};
const reportTemplate = (): ReportFixture => ({
  id: "00000000-0000-4000-8000-000000000301",
  assessmentSessionId: "00000000-0000-4000-8000-000000000401",
  status: "PENDING" as const,
  filePathOrObjectKey: null,
  generatedAt: null,
  assessmentSession: {
    participantId,
    status: "COMPLETED",
    completedAt: new Date("2026-10-31T17:00:00.000Z"),
    score: {
      depressionScore: 8, depressionCategory: "NORMAL",
      anxietyScore: 10, anxietyCategory: "MODERATE",
      stressScore: 18, stressCategory: "MILD", wemwbsScore: 49,
    },
  },
});

let row: ReportFixture = reportTemplate();
let testId = 1;
let objectExists = false;
const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49]);

beforeEach(() => {
  for (const mock of [mocks.findUnique, mocks.updateMany, mocks.download, mocks.upload, mocks.generatePdf, mocks.verifyPdf]) mock.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T00:00:00.000Z"));
  objectExists = false;
  row = { ...reportTemplate(), id: `00000000-0000-4000-8000-${String(300 + testId++).padStart(12, "0")}` };
  mocks.findUnique.mockImplementation(async () => ({ ...row, assessmentSession: { ...row.assessmentSession, score: { ...row.assessmentSession.score } } }));
  mocks.updateMany.mockImplementation(async ({ where, data }: { where: { status: string }; data: Record<string, unknown> }) => {
    if (row.status !== where.status) return { count: 0 };
    row = { ...row, ...data } as typeof row;
    return { count: 1 };
  });
  mocks.download.mockImplementation(async () => objectExists ? pdfBytes : null);
  mocks.upload.mockImplementation(async () => { objectExists = true; });
  mocks.generatePdf.mockResolvedValue(pdfBytes);
  mocks.verifyPdf.mockResolvedValue(true);
});

afterEach(() => vi.useRealTimers());

it("generates, uploads with report identity, verifies, then conditionally finalizes metadata", async () => {
  const result = await generateReportForParticipant(participantId, row.id);
  expect(result).toEqual({ reportId: row.id, status: "GENERATED" });
  expect(mocks.upload).toHaveBeenCalledWith(row.id, pdfBytes);
  expect(mocks.updateMany).toHaveBeenCalledWith({
    where: { id: row.id, assessmentSessionId: row.assessmentSessionId, status: "PENDING", filePathOrObjectKey: null, generatedAt: null },
    data: { status: "GENERATED", filePathOrObjectKey: `reports/${row.id}.pdf`, generatedAt: expect.any(Date) },
  });
  expect(row.assessmentSession.score.depressionScore).toBe(8);
});

it("returns an already GENERATED report without reading, rendering, uploading, or replacing it", async () => {
  row = { ...row, status: "GENERATED", filePathOrObjectKey: `reports/${row.id}.pdf`, generatedAt: new Date() };
  const result = await generateReportForParticipant(participantId, row.id);
  expect(result).toEqual({ reportId: row.id, status: "GENERATED" });
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.generatePdf).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.updateMany).not.toHaveBeenCalled();
});

it("safely rate-limits repeated concurrent requests while one request recovers an existing artifact", async () => {
  mocks.download.mockResolvedValue(pdfBytes);
  const [first, second] = await Promise.allSettled([
    generateReportForParticipant(participantId, row.id),
    generateReportForParticipant(participantId, row.id),
  ]);
  expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]);
  const rejected = [first, second].find((result) => result.status === "rejected");
  expect(rejected).toMatchObject({ reason: expect.objectContaining({ code: "REPORT_GENERATION_RATE_LIMITED", status: 429 }) });
  expect(mocks.upload).toHaveBeenCalledTimes(0);
  expect(mocks.updateMany).toHaveBeenCalledTimes(1);
});

it("leaves a failed create-only upload retryable and does not persist failure metadata", async () => {
  mocks.upload.mockRejectedValueOnce(new ReportStorageError("unavailable"));
  await expect(generateReportForParticipant(participantId, row.id)).rejects.toMatchObject({ status: 503, retryAfterSeconds: 5 });
  expect(row.status).toBe("PENDING");
  expect(row.filePathOrObjectKey).toBeNull();
  expect(row.generatedAt).toBeNull();
  expect(mocks.updateMany).not.toHaveBeenCalled();
  expect(row.assessmentSession.score.wemwbsScore).toBe(49);

  vi.setSystemTime(Date.now() + 11_000);
  await expect(generateReportForParticipant(participantId, row.id)).resolves.toMatchObject({ status: "GENERATED" });
});

it("recovers a verified object after the database update fails without overwriting or rerendering it", async () => {
  let objectExists = false;
  mocks.download.mockImplementation(async () => objectExists ? pdfBytes : null);
  mocks.upload.mockImplementation(async () => { objectExists = true; });
  mocks.updateMany.mockRejectedValueOnce(new Error("synthetic database interruption"));

  await expect(generateReportForParticipant(participantId, row.id)).rejects.toMatchObject({ code: "REPORT_FINALIZATION_UNAVAILABLE", status: 503 });
  expect(row.status).toBe("PENDING");
  expect(row.filePathOrObjectKey).toBeNull();
  expect(row.assessmentSession.score.depressionScore).toBe(8);

  vi.setSystemTime(Date.now() + 11_000);
  await expect(generateReportForParticipant(participantId, row.id)).resolves.toMatchObject({ status: "GENERATED" });
  expect(mocks.generatePdf).toHaveBeenCalledTimes(1);
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(mocks.updateMany).toHaveBeenCalledTimes(2);
});

it("recovers a create-only upload conflict only after verifying the expected PDF", async () => {
  mocks.download.mockResolvedValueOnce(null).mockResolvedValueOnce(pdfBytes);
  mocks.upload.mockRejectedValueOnce(new ReportStorageError("conflict"));
  await expect(generateReportForParticipant(participantId, row.id)).resolves.toMatchObject({ status: "GENERATED" });
  expect(mocks.verifyPdf).toHaveBeenCalledWith(pdfBytes, expect.objectContaining({ reportId: row.id }));

  vi.setSystemTime(Date.now() + 11_000);
  row = { ...reportTemplate(), id: `00000000-0000-4000-8000-${String(300 + testId++).padStart(12, "0")}` };
  mocks.findUnique.mockImplementation(async () => ({ ...row, assessmentSession: { ...row.assessmentSession, score: { ...row.assessmentSession.score } } }));
  objectExists = false;
  mocks.download.mockResolvedValueOnce(null).mockResolvedValueOnce(pdfBytes);
  mocks.upload.mockRejectedValueOnce(new ReportStorageError("conflict"));
  mocks.verifyPdf.mockResolvedValueOnce(false);
  await expect(generateReportForParticipant(participantId, row.id)).rejects.toMatchObject({ code: "REPORT_ARTIFACT_NOT_READY", status: 503 });
  expect(row.status).toBe("PENDING");
});

it("refuses incomplete assessments before Storage access or metadata changes", async () => {
  row = { ...row, assessmentSession: { ...row.assessmentSession, status: "IN_PROGRESS" } };
  await expect(generateReportForParticipant(participantId, row.id)).rejects.toBeInstanceOf(ReportError);
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.updateMany).not.toHaveBeenCalled();
});

it.each(["missing", "corrupted", "storage failure", "wrong key"])("fails safely for a GENERATED artifact that is %s without repairing immutable metadata", async (scenario) => {
  row = { ...row, status: "GENERATED", filePathOrObjectKey: `reports/${row.id}.pdf`, generatedAt: new Date() };
  objectExists = true;
  if (scenario === "missing") objectExists = false;
  if (scenario === "corrupted") mocks.verifyPdf.mockResolvedValue(false);
  if (scenario === "storage failure") mocks.download.mockRejectedValue(new Error("private provider detail"));
  if (scenario === "wrong key") row.filePathOrObjectKey = "other/private/key.pdf";
  // Fixture categories are synthetic strings; the real Prisma payload uses enums.
  await expect(getValidatedReportArtifact(row as Parameters<typeof getValidatedReportArtifact>[0])).rejects.toMatchObject({ code: "REPORT_ARTIFACT_UNAVAILABLE", status: 503 });
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(mocks.updateMany).not.toHaveBeenCalled();
  expect(row.status).toBe("GENERATED");
});

it("uses persisted completed scores and never accepts client scoring data", async () => {
  const persisted = structuredClone(row.assessmentSession);
  await generateReportForParticipant(participantId, row.id);
  expect(mocks.generatePdf).toHaveBeenCalledWith({
    reportId: row.id, assessmentSessionId: row.assessmentSessionId, assessmentDate: persisted.completedAt!.toISOString(),
    scores: { depression: { score: 8, category: "NORMAL" }, anxiety: { score: 10, category: "MODERATE" }, stress: { score: 18, category: "MILD" }, wemwbs: { score: 49 } },
  });
  expect(row.assessmentSession).toEqual(persisted);
});

it("does not finalize when the uploaded object fails read-back validation", async () => {
  mocks.verifyPdf.mockResolvedValue(false);
  await expect(generateReportForParticipant(participantId, row.id)).rejects.toMatchObject({ code: "REPORT_ARTIFACT_NOT_READY" });
  expect(mocks.upload).toHaveBeenCalledTimes(1);
  expect(mocks.updateMany).not.toHaveBeenCalled();
  expect(row.status).toBe("PENDING");
});

it("keeps concurrent attempts after the throttle window safe through create-only upload and conditional finalization", async () => {
  let releaseFirst!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let uploads = 0;
  mocks.upload.mockImplementation(async () => {
    if (++uploads === 1) { started(); await gate; }
    if (objectExists) throw new ReportStorageError("conflict");
    objectExists = true;
  });
  const first = generateReportForParticipant(participantId, row.id);
  await waiting;
  vi.setSystemTime(Date.now() + 11_000);
  const second = await generateReportForParticipant(participantId, row.id);
  const finalizedAt = row.generatedAt;
  releaseFirst();
  expect(await first).toEqual(second);
  expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  expect(row.generatedAt).toBe(finalizedAt);
  expect(row.filePathOrObjectKey).toBe(`reports/${row.id}.pdf`);
});
