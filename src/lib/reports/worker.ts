import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { generateAssessmentReportPdf, isExpectedAssessmentReportPdf } from "./pdf";
import { downloadReportObject, reportObjectKeyFor, uploadReportObject } from "./storage";

const category = z.enum(["NORMAL", "MILD", "MODERATE", "SEVERE", "EXTREMELY_SEVERE"]);
const dimension = z.object({ score: z.number().int().min(0).max(42), category });
const inputSchema = z.object({
  reportId: z.string().uuid(), assessmentSessionId: z.string().uuid(),
  assessmentDate: z.string().datetime({ offset: true }).transform(date => new Date(date).toISOString()),
  scores: z.object({ depression: dimension, anxiety: dimension, stress: dimension,
    wemwbs: z.object({ score: z.number().int().min(14).max(70) }) }),
});
export const digestPdf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// Runs in the separate local worker process, never inside the interactive website.
export function reportWorker(db: PrismaClient, signingKey: string) {
  const running = new Map<string, Promise<{ reportId: string; status: "GENERATED" }>>();
  async function generate(jobId: string) {
    const [row] = await db.$queryRaw<Array<{ data: unknown }>>`SELECT wb_pdf.worker_input(${jobId}::uuid) AS data`;
    const data = inputSchema.parse(row?.data);
    const pending = running.get(data.reportId);
    if (pending) return pending;
    const work = (async () => {
      // The existing renderer is deterministic for the immutable authoritative input.
      // Compare the entire artifact, not only PDF metadata or a browser-supplied digest.
      const expected = await generateAssessmentReportPdf(data);
      const digest = digestPdf(expected);
      let stored = await downloadReportObject(data.reportId);
      if (!stored) {
        try { await uploadReportObject(data.reportId, expected); }
        catch { /* A lost response or create-only conflict still requires read-back. */ }
        stored = await downloadReportObject(data.reportId);
      }
      if (!stored || stored.length !== expected.length || digestPdf(stored) !== digest
        || !(await isExpectedAssessmentReportPdf(stored, data))) throw new Error("ARTIFACT_UNVERIFIED");
      const [clock] = await db.$queryRaw<Array<{ epoch: bigint }>>`SELECT floor(extract(epoch FROM clock_timestamp()))::bigint AS epoch`;
      const iat = Number(clock.epoch);
      const payload = JSON.stringify({ kid: "local-v1", reportId: data.reportId,
        assessmentSessionId: data.assessmentSessionId, jobId, bucket: "assessment-reports",
        key: reportObjectKeyFor(data.reportId), digest, size: stored.length, nonce: randomUUID(),
        worker: "wb_pdf_worker", iss: "wellbeing-local-pdf-worker", aud: "wellbeing-report-finalization-v1",
        iat, exp: iat + 30, objectIdentity: digest });
      const signature = createHmac("sha256", Buffer.from(signingKey, "hex")).update(payload).digest("hex");
      const [finalized] = await db.$queryRaw<Array<{ id: string }>>`SELECT wb_pdf.finalize(${payload},${signature}) AS id`;
      if (finalized?.id !== data.reportId) throw new Error("FINALIZATION_FAILED");
      return { reportId: data.reportId, status: "GENERATED" as const };
    })();
    running.set(data.reportId, work);
    try { return await work; } finally { running.delete(data.reportId); }
  }
  async function download(ticketId: string) {
    const [row] = await db.$queryRaw<Array<{ data: unknown }>>`SELECT wb_pdf.download_input(${ticketId}::uuid) AS data`;
    const metadata = z.object({ reportId: z.string().uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/),
      size: z.number().int().min(100).max(5242880) }).parse(row?.data);
    const bytes = await downloadReportObject(metadata.reportId);
    if (!bytes || bytes.length !== metadata.size || digestPdf(bytes) !== metadata.digest) throw new Error("ARTIFACT_UNAVAILABLE");
    return bytes;
  }
  return { generate, download };
}
