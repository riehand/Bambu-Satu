import { psychologistApi, readPsychologistJson } from "@/lib/psychologist/http";
import { getPsychologistProfile, updatePsychologistProfile } from "@/lib/psychologist/service";
import { psychologistProfilePatchSchema } from "@/lib/validations/psychologist";

export function GET() {
  return psychologistApi("PSYCHOLOGIST", async (userId) => ({ data: await getPsychologistProfile(userId) }));
}

export function PATCH(request: Request) {
  return psychologistApi("PSYCHOLOGIST", async (userId) => {
    const input = psychologistProfilePatchSchema.parse(await readPsychologistJson(request));
    return { data: await updatePsychologistProfile(userId, input) };
  }, request, true);
}
