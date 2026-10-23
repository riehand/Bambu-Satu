import { assessmentApi } from "@/lib/assessment/http";
import { submitAssessment } from "@/lib/assessment/service";
import { sessionIdSchema } from "@/lib/validations/assessment";
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return assessmentApi(async id => submitAssessment(sessionIdSchema.parse((await context.params).sessionId), id), request);
}
