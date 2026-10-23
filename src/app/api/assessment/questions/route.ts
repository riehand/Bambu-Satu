import { assessmentApi } from "@/lib/assessment/http";
import { getQuestions } from "@/lib/assessment/service";
import { questionsQuerySchema } from "@/lib/validations/assessment";
export async function GET(request: Request) {
  return assessmentApi(async id => {
    const query = questionsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return getQuestions(id, query.instrument, query.sessionId);
  });
}
