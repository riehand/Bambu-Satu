import { psychologistApi, PsychologistError } from "@/lib/psychologist/http";
import { getPsychologistById } from "@/lib/psychologist/service";
import { psychologistIdSchema } from "@/lib/validations/psychologist";

export async function GET(_request: Request, context: { params: Promise<{ psychologistId: string }> }) {
  return psychologistApi("PARTICIPANT", async () => {
    const { psychologistId } = await context.params;
    const id = psychologistIdSchema.parse(psychologistId);
    const profile = await getPsychologistById(id);
    if (!profile) throw new PsychologistError("RESOURCE_NOT_FOUND", "Profil psikolog tidak ditemukan.", 404);
    return { data: profile };
  });
}
