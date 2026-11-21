import { appointmentApi } from "@/lib/appointments/http";
import { AppointmentError } from "@/lib/appointments/service";
import { listConsultations } from "@/lib/consultations/service";

export async function GET() {
  return appointmentApi("PARTY", async actor => {
    if (actor.role !== "PARTICIPANT" && actor.role !== "PSYCHOLOGIST") throw new AppointmentError("FORBIDDEN", "Akses tidak diizinkan.", 403);
    return listConsultations({ id: actor.id, role: actor.role });
  });
}
