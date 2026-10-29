import { appointmentApi, readAppointmentJson } from "@/lib/appointments/http";
import { grantStandaloneConsent } from "@/lib/appointments/service";
import { standaloneConsentSchema } from "@/lib/validations/appointment";

export async function POST(request: Request) {
  return appointmentApi("PARTICIPANT", async ({ id }) => grantStandaloneConsent(id, standaloneConsentSchema.parse(await readAppointmentJson(request))), request, true, 201);
}
