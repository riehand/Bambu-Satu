import "server-only";
import { ReportStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isExpectedAssessmentReportPdf, generateAssessmentReportPdf, type AssessmentReportPdfData } from "./pdf";
import { downloadReportObject, reportObjectKeyFor, ReportStorageError, uploadReportObject } from "./storage";

const reportSelect = {
  id: true,
  assessmentSessionId: true,
  status: true,
  filePathOrObjectKey: true,
  generatedAt: true,
  assessmentSession: {
    select: {
      participantId: true,
      status: true,
      completedAt: true,
      score: {
        select: {
          depressionScore: true, depressionCategory: true,
          anxietyScore: true, anxietyCategory: true,
          stressScore: true, stressCategory: true,
          wemwbsScore: true,
        },
      },
    },
  },
} satisfies Prisma.ReportSelect;

type ReportRow = Prisma.ReportGetPayload<{ select: typeof reportSelect }>;

export class ReportError extends Error {
  constructor(readonly code: string, readonly status: number, readonly retryAfterSeconds?: number) {
    super(code);
  }
}

const attemptWindowMs = 10_000;
const attempts = new Map<string, number>();

function takeAttempt(participantId: string, reportId: string) {
  const now = Date.now();
  const key = `${participantId}:${reportId}`;
  const allowedAt = attempts.get(key) ?? 0;
  if (allowedAt > now) return Math.max(1, Math.ceil((allowedAt - now) / 1000));
  if (attempts.size > 1000) {
    for (const [attemptKey, expiresAt] of attempts) if (expiresAt <= now) attempts.delete(attemptKey);
  }
  attempts.set(key, now + attemptWindowMs);
  return 0;
}

function pdfData(report: ReportRow): AssessmentReportPdfData {
  const score = report.assessmentSession.score;
  const date = report.assessmentSession.completedAt;
  if (!score || !date || report.assessmentSession.status !== "COMPLETED") {
    throw new ReportError("ASSESSMENT_NOT_COMPLETED", 409);
  }
  return {
    reportId: report.id,
    assessmentSessionId: report.assessmentSessionId,
    assessmentDate: date.toISOString(),
    scores: {
      depression: { score: score.depressionScore, category: score.depressionCategory },
      anxiety: { score: score.anxietyScore, category: score.anxietyCategory },
      stress: { score: score.stressScore, category: score.stressCategory },
      wemwbs: { score: score.wemwbsScore },
    },
  };
}

async function findReport(reportId: string) {
  return prisma.report.findUnique({ where: { id: reportId }, select: reportSelect });
}

async function readExistingArtifact(reportId: string, data: AssessmentReportPdfData) {
  let bytes: Uint8Array | null;
  try {
    bytes = await downloadReportObject(reportId);
  } catch {
    throw new ReportError("REPORT_ARTIFACT_NOT_READY", 503, 10);
  }
  if (!bytes) return null;
  if (!(await isExpectedAssessmentReportPdf(bytes, data))) {
    throw new ReportError("REPORT_ARTIFACT_NOT_READY", 503, 10);
  }
  return bytes;
}

async function finalizeReport(report: ReportRow, path: string) {
  let updated;
  try {
    updated = await prisma.report.updateMany({
      where: {
        id: report.id,
        assessmentSessionId: report.assessmentSessionId,
        status: ReportStatus.PENDING,
        filePathOrObjectKey: null,
        generatedAt: null,
      },
      data: { status: ReportStatus.GENERATED, filePathOrObjectKey: path, generatedAt: new Date() },
    });
  } catch {
    throw new ReportError("REPORT_FINALIZATION_UNAVAILABLE", 503, 10);
  }
  if (updated.count === 1) return { reportId: report.id, status: ReportStatus.GENERATED } as const;

  let latest: ReportRow | null;
  try {
    latest = await findReport(report.id);
  } catch {
    throw new ReportError("REPORT_FINALIZATION_RETRY", 503, 5);
  }
  if (latest?.status === ReportStatus.GENERATED && latest.filePathOrObjectKey === path && latest.generatedAt) {
    return { reportId: report.id, status: ReportStatus.GENERATED } as const;
  }
  throw new ReportError("REPORT_FINALIZATION_RETRY", 503, 5);
}

export async function generateReportForParticipant(participantId: string, reportId: string) {
  const report = await findReport(reportId);
  if (!report || report.assessmentSession.participantId !== participantId) throw new ReportError("REPORT_NOT_FOUND", 404);
  if (report.status === ReportStatus.GENERATED) return { reportId, status: ReportStatus.GENERATED } as const;
  const data = pdfData(report);
  if (report.status !== ReportStatus.PENDING || report.filePathOrObjectKey !== null || report.generatedAt !== null) {
    throw new ReportError("REPORT_GENERATION_UNAVAILABLE", 503, 10);
  }

  const retryAfter = takeAttempt(participantId, reportId);
  if (retryAfter) throw new ReportError("REPORT_GENERATION_RATE_LIMITED", 429, retryAfter);

  const path = reportObjectKeyFor(report.id);
  if (await readExistingArtifact(report.id, data)) return finalizeReport(report, path);

  let pdf: Uint8Array;
  try {
    pdf = await generateAssessmentReportPdf(data);
  } catch {
    throw new ReportError("REPORT_GENERATION_UNAVAILABLE", 503, 10);
  }

  try {
    await uploadReportObject(report.id, pdf);
  } catch (error) {
    if (!(error instanceof ReportStorageError)) throw new ReportError("REPORT_GENERATION_UNAVAILABLE", 503, 10);
    // A create-only conflict or network failure may still leave a persisted object.
    if (await readExistingArtifact(report.id, data)) return finalizeReport(report, path);
    throw new ReportError("REPORT_ARTIFACT_NOT_READY", 503, 5);
  }

  if (!(await readExistingArtifact(report.id, data))) throw new ReportError("REPORT_ARTIFACT_NOT_READY", 503, 5);
  return finalizeReport(report, path);
}

export async function getValidatedReportArtifact(report: ReportRow) {
  if (report.status !== ReportStatus.GENERATED || !report.filePathOrObjectKey || !report.generatedAt) {
    throw new ReportError("REPORT_NOT_GENERATED", 409);
  }
  const path = reportObjectKeyFor(report.id);
  if (report.filePathOrObjectKey !== path) throw new ReportError("REPORT_ARTIFACT_UNAVAILABLE", 503);
  const data = pdfData(report);
  let bytes: Uint8Array | null;
  try {
    bytes = await downloadReportObject(report.id);
  } catch {
    throw new ReportError("REPORT_ARTIFACT_UNAVAILABLE", 503, 5);
  }
  if (!bytes || !(await isExpectedAssessmentReportPdf(bytes, data))) {
    throw new ReportError("REPORT_ARTIFACT_UNAVAILABLE", 503, 5);
  }
  return bytes;
}
