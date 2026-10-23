import { assessmentApi } from "@/lib/assessment/http";
import { getSession } from "@/lib/assessment/service";
import { sessionIdSchema } from "@/lib/validations/assessment";
export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return assessmentApi(async id => getSession(sessionIdSchema.parse((await context.params).sessionId), id));
}
