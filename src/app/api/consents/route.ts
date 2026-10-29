import { appointmentApi } from "@/lib/appointments/http";
import { listOwnConsents } from "@/lib/appointments/service";

export async function GET() {
  return appointmentApi("PARTICIPANT", ({ id }) => listOwnConsents(id));
}
