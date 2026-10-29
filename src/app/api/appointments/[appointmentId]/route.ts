import { appointmentApi } from "@/lib/appointments/http";
import { AppointmentError, getAppointmentForParty } from "@/lib/appointments/service";
import { appointmentIdSchema } from "@/lib/validations/appointment";

export async function GET(_request: Request, context: { params: Promise<{ appointmentId: string }> }) {
  return appointmentApi("PARTY", async ({ id, role }) => {
    if (role !== "PARTICIPANT" && role !== "PSYCHOLOGIST") throw new AppointmentError("FORBIDDEN", "Akses tidak diizinkan.", 403);
    return getAppointmentForParty(id, role, appointmentIdSchema.parse((await context.params).appointmentId));
  });
}
