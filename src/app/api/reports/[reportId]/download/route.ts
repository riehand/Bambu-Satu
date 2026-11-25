import { getCurrentProfile, withApplicationDatabase } from "@/lib/auth/session";
import { gatewayMode, hasDatabaseRequest } from "@/lib/dal/context";
import { AppointmentError, confirmReportDownloadAccess, getReportArtifactForActor } from "@/lib/appointments/service";
import { reportErrorResponse } from "@/lib/reports/http";
import { getValidatedReportArtifact } from "@/lib/reports/service";
import { downloadWithReportWorker } from "@/lib/reports/runtime";
import { appointmentIdSchema, reportIdSchema } from "@/lib/validations/appointment";

const downloadHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "Content-Type": "application/pdf",
  "Content-Disposition": "attachment",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }): Promise<Response> {
  try {
    if (gatewayMode() && !hasDatabaseRequest()) {
      return await withApplicationDatabase(() => GET(request, context));
    }
    const actor = await getCurrentProfile();
    if (actor.role !== "PARTICIPANT" && actor.role !== "PSYCHOLOGIST") {
      throw new AppointmentError("FORBIDDEN", "Akses tidak diizinkan.", 403);
    }
    const reportId = reportIdSchema.parse((await context.params).reportId);
    const appointment = new URL(request.url).searchParams.get("appointmentId");
    const scope: [string?] = appointment === null ? [] : [appointmentIdSchema.parse(appointment)];
    let bytes: Uint8Array;
    if (gatewayMode()) {
      bytes = await downloadWithReportWorker(actor.id, actor.role, reportId, ...scope);
    } else {
      const report = await getReportArtifactForActor(actor.id, actor.role, reportId, ...scope);
      bytes = await getValidatedReportArtifact(report);
      await confirmReportDownloadAccess(actor.id, actor.role, reportId, ...scope);
    }
    const headers = new Headers(downloadHeaders);
    headers.set("Content-Disposition", `attachment; filename="hasil-asesmen-${reportId}.pdf"`);
    headers.set("Content-Length", String(bytes.byteLength));
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, { status: 200, headers });
  } catch (error) {
    return reportErrorResponse(error);
  }
}
