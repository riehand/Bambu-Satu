import { appointmentApi } from "@/lib/appointments/http";
import { revokeConsent } from "@/lib/appointments/service";
import { consentIdSchema } from "@/lib/validations/appointment";

export async function POST(_request: Request, context: { params: Promise<{ consentId: string }> }) {
  return appointmentApi("PARTICIPANT", async ({ id }) => revokeConsent(id, consentIdSchema.parse((await context.params).consentId)), _request, true);
}
