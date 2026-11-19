import { getCurrentProfile } from "@/lib/auth/session";
import { AppointmentError, confirmReportDownloadAccess, getReportArtifactForActor } from "@/lib/appointments/service";
import { reportErrorResponse } from "@/lib/reports/http";
import { getValidatedReportArtifact } from "@/lib/reports/service";
import { appointmentIdSchema, reportIdSchema } from "@/lib/validations/appointment";

const downloadHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "Content-Type": "application/pdf",
  "Content-Disposition": "attachment",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request, context: { params: Promise<{ reportId: string }> }) {
  try {
    const actor = await getCurrentProfile();
    if (actor.role !== "PARTICIPANT" && actor.role !== "PSYCHOLOGIST") {
      throw new AppointmentError("FORBIDDEN", "Akses tidak diizinkan.", 403);
    }
    const reportId = reportIdSchema.parse((await context.params).reportId);
    const appointment = new URL(request.url).searchParams.get("appointmentId");
    const scope: [string?] = appointment === null ? [] : [appointmentIdSchema.parse(appointment)];
    const report = await getReportArtifactForActor(actor.id, actor.role, reportId, ...scope);
    const bytes = await getValidatedReportArtifact(report);
    await confirmReportDownloadAccess(actor.id, actor.role, reportId, ...scope);
    const headers = new Headers(downloadHeaders);
    headers.set("Content-Disposition", `attachment; filename="hasil-asesmen-${report.id}.pdf"`);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, { status: 200, headers });
  } catch (error) {
    return reportErrorResponse(error);
  }
}
