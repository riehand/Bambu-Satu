import { appointmentApi, readAppointmentJson } from "@/lib/appointments/http";
import { AppointmentError } from "@/lib/appointments/service";
import { transitionConsultation } from "@/lib/consultations/service";
import { consultationCommand, consultationParams } from "@/lib/validations/consultation";

export async function POST(request: Request, context: { params: Promise<{ appointmentId: string; action: string }> }) {
  return appointmentApi("PARTY", async actor => {
    const { appointmentId, action } = consultationParams.parse(await context.params);
    consultationCommand.parse(await readAppointmentJson(request));
    if (actor.role !== "PARTICIPANT" && actor.role !== "PSYCHOLOGIST") throw new AppointmentError("FORBIDDEN", "Akses tidak diizinkan.", 403);
    return transitionConsultation({ id: actor.id, role: actor.role }, appointmentId, action);
  }, request, true);
}
