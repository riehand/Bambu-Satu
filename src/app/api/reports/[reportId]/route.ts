import { appointmentApi } from "@/lib/appointments/http";
import { getReportForActor } from "@/lib/appointments/service";
import { reportIdSchema } from "@/lib/validations/appointment";

export async function GET(_request: Request, context: { params: Promise<{ reportId: string }> }) {
  return appointmentApi("PARTY", async ({ id, role }) => {
    if (role !== "PARTICIPANT" && role !== "PSYCHOLOGIST") return null;
    return getReportForActor(id, role, reportIdSchema.parse((await context.params).reportId));
  });
}
