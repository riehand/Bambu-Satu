import { appointmentApi } from "@/lib/appointments/http";
import { listPsychologistAppointments } from "@/lib/appointments/service";

export async function GET() {
  return appointmentApi("PSYCHOLOGIST", ({ id }) => listPsychologistAppointments(id));
}
