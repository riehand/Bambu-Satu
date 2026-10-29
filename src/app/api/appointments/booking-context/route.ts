import { appointmentApi } from "@/lib/appointments/http";
import { getBookingContext } from "@/lib/appointments/service";

export async function GET() {
  return appointmentApi("PARTICIPANT", ({ id }) => getBookingContext(id));
}
