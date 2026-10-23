import { assessmentApi, readAssessmentJson } from "@/lib/assessment/http";
import { saveAnswers } from "@/lib/assessment/service";
import { sessionIdSchema } from "@/lib/validations/assessment";
export async function PUT(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return assessmentApi(async id => saveAnswers(sessionIdSchema.parse((await context.params).sessionId), id, await readAssessmentJson(request)), request);
}
