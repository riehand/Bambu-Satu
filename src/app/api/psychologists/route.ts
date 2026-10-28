import { psychologistApi, PsychologistError } from "@/lib/psychologist/http";
import { listPsychologists } from "@/lib/psychologist/service";
import { psychologistDirectoryQuerySchema } from "@/lib/validations/psychologist";

export function GET(request: Request) {
  return psychologistApi("PARTICIPANT", async () => {
    const params = new URL(request.url).searchParams;
    const entries = [...params.entries()];
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      throw new PsychologistError("VALIDATION_ERROR", "Parameter pencarian tidak valid.", 422);
    }
    const query = psychologistDirectoryQuerySchema.parse(Object.fromEntries(entries));
    const result = await listPsychologists(query);
    return { data: result.items, meta: { page: result.page, limit: result.limit, total: result.total } };
  });
}
