import "server-only";
import { z } from "zod";
import { httpsService, stagingProject } from "@/lib/dal/staging-config";
import { prisma } from "@/lib/prisma";
import { DalError, databaseTransaction, assertDatabaseActor } from "@/lib/dal/context";
import { ReportError } from "./service";

async function callWorker(path: "generate" | "download", input: { jobId: string } | { ticketId: string }) {
  const endpoint = process.env.WELLBEING_PDF_WORKER_URL;
  const token = process.env.WELLBEING_PDF_WORKER_TOKEN;
  if (!endpoint || !token || !/^[a-f0-9]{64}$/.test(token)) throw new ReportError("REPORT_UNAVAILABLE", 503, 10);
  let url: URL;
  try {
    if (["staging", "hosted"].includes(process.env.WELLBEING_RUNTIME ?? "")) { stagingProject(); url = httpsService(endpoint); }
    else {
      if ((process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development") || !process.env.WELLBEING_LOCAL_RUNTIME_FILE) throw new Error();
      url = new URL(endpoint);
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    }
  } catch { throw new ReportError("REPORT_UNAVAILABLE", 503, 10); }
  try {
    const response = await fetch(new URL(path, url), { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input), cache: "no-store", signal: AbortSignal.timeout(40000), redirect: "error" });
    if (!response.ok) throw new Error("WORKER_UNAVAILABLE");
    return response;
  } catch { throw new ReportError("REPORT_ARTIFACT_NOT_READY", 503, 10); }
}

export async function generateWithReportWorker(participantId: string, reportId: string) {
  const [job] = await databaseTransaction(async tx => {
    assertDatabaseActor(participantId, "PARTICIPANT");
    return tx.$queryRaw<Array<{ id: string }>>`SELECT wb_pdf.enqueue(${reportId}::uuid) AS id`;
  });
  const response = await callWorker("generate", { jobId: job.id });
  const result = await response.json();
  if (result?.reportId !== reportId || result?.status !== "GENERATED") throw new ReportError("REPORT_FINALIZATION_UNAVAILABLE", 503, 10);
  // Trust the persisted metadata, not a worker HTTP 2xx response alone.
  const row = await prisma.report.findUnique({ where: { id: reportId }, select: { status: true, filePathOrObjectKey: true, generatedAt: true } });
  if (row?.status !== "GENERATED" || row.filePathOrObjectKey !== `reports/${reportId}.pdf` || !row.generatedAt) throw new ReportError("REPORT_FINALIZATION_UNAVAILABLE", 503, 10);
  return { reportId, status: "GENERATED" as const };
}

async function authorize(actorId: string, role: "PARTICIPANT" | "PSYCHOLOGIST", reportId: string, appointmentId: string | undefined, recordAccess: boolean) {
  try {
    return await databaseTransaction(async tx => {
      assertDatabaseActor(actorId, role);
      const [row] = await tx.$queryRaw<Array<{ metadata: unknown }>>`SELECT wb_pdf.authorize(${reportId}::uuid,${appointmentId ?? null}::uuid,${recordAccess}) AS metadata`;
      return z.object({ ticket: z.string().uuid().nullable(), digest: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().min(100).max(5242880) }).parse(row?.metadata);
    });
  } catch (error) {
    if (error instanceof DalError && error.code === "FORBIDDEN") throw new ReportError("REPORT_NOT_FOUND", 404);
    if (error instanceof DalError && error.code === "REPORT_NOT_GENERATED") throw new ReportError("REPORT_NOT_GENERATED", 409);
    throw error;
  }
}

export async function downloadWithReportWorker(actorId: string, role: "PARTICIPANT" | "PSYCHOLOGIST", reportId: string, appointmentId?: string) {
  const before = await authorize(actorId, role, reportId, appointmentId, false);
  if (!before.ticket) throw new ReportError("REPORT_ARTIFACT_UNAVAILABLE", 503, 10);
  const response = await callWorker("download", { ticketId: before.ticket });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { createHash } = await import("node:crypto");
  if (bytes.length !== before.size || createHash("sha256").update(bytes).digest("hex") !== before.digest) throw new ReportError("REPORT_ARTIFACT_UNAVAILABLE", 503, 10);
  // Recheck active identity/ownership/consent after Storage I/O and before sending bytes.
  const after = await authorize(actorId, role, reportId, appointmentId, true);
  if (after.digest !== before.digest || after.size !== before.size) throw new ReportError("REPORT_ARTIFACT_UNAVAILABLE", 503, 10);
  return bytes;
}
