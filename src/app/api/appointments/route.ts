import { appointmentApi, readAppointmentJson } from "@/lib/appointments/http";
import { createAppointment, listParticipantAppointments } from "@/lib/appointments/service";
import { createAppointmentSchema } from "@/lib/validations/appointment";

export async function GET() {
  return appointmentApi("PARTICIPANT", ({ id }) => listParticipantAppointments(id));
}

export async function POST(request: Request) {
  return appointmentApi("PARTICIPANT", async ({ id }) => createAppointment(id, createAppointmentSchema.parse(await readAppointmentJson(request))), request, true, 201);
}
