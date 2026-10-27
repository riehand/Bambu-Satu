import { assessmentApi, readAssessmentJson } from "@/lib/assessment/http";
import { submitAssessment } from "@/lib/assessment/service";
import { sessionIdSchema, submitAssessmentSchema } from "@/lib/validations/assessment";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return assessmentApi(async id => submitAssessment(sessionIdSchema.parse((await context.params).sessionId), id,
    submitAssessmentSchema.parse(await readAssessmentJson(request))), request);
}
