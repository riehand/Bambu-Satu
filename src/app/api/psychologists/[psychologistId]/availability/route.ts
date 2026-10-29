import { psychologistApi, PsychologistError, readAvailabilityRange } from "@/lib/psychologist/http";
import { listPublicAvailability } from "@/lib/psychologist/service";
import { psychologistIdSchema } from "@/lib/validations/psychologist";

export async function GET(request: Request, context: { params: Promise<{ psychologistId: string }> }) {
  return psychologistApi("PARTICIPANT", async () => {
    const { psychologistId } = await context.params;
    const id = psychologistIdSchema.parse(psychologistId);
    const availability = await listPublicAvailability(id, readAvailabilityRange(request));
    if (!availability) throw new PsychologistError("RESOURCE_NOT_FOUND", "Profil psikolog tidak ditemukan.", 404);
    return { data: availability };
  });
}
