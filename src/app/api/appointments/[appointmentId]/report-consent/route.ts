import { appointmentApi, readAppointmentJson } from "@/lib/appointments/http";
import { grantAppointmentConsent } from "@/lib/appointments/service";
import { affirmativeConsentSchema, appointmentIdSchema } from "@/lib/validations/appointment";

export async function POST(request: Request, context: { params: Promise<{ appointmentId: string }> }) {
  return appointmentApi("PARTICIPANT", async ({ id }) => {
    const appointmentId = appointmentIdSchema.parse((await context.params).appointmentId);
    const input = affirmativeConsentSchema.parse(await readAppointmentJson(request));
    return grantAppointmentConsent(id, appointmentId, input.consent);
  }, request, true);
}
