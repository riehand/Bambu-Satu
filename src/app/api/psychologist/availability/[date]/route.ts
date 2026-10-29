import { psychologistApi, readPsychologistJson } from "@/lib/psychologist/http";
import { setDailyAvailability } from "@/lib/psychologist/service";
import { availabilityDateSchema, availabilityDaySchema } from "@/lib/validations/availability";

export async function PUT(request: Request, context: { params: Promise<{ date: string }> }) {
  return psychologistApi("PSYCHOLOGIST", async (psychologistId) => {
    const { date: rawDate } = await context.params;
    const date = availabilityDateSchema.parse(rawDate);
    const body = availabilityDaySchema.parse(await readPsychologistJson(request));
    return { data: await setDailyAvailability(psychologistId, date, body) };
  }, request, true);
}
