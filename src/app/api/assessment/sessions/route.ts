import { assessmentApi, readAssessmentJson } from "@/lib/assessment/http";
import { startAssessmentSession } from "@/lib/assessment/service";
import { startAssessmentSchema } from "@/lib/validations/assessment";
export async function POST(request: Request) {
  const response = await assessmentApi(async id => {
    const body = startAssessmentSchema.parse(await readAssessmentJson(request));
    return startAssessmentSession(id, body.processingConsent);
  }, request);
  if (response.ok) {
    const body = await response.clone().json();
    if (!body.data.resumed) return new Response(response.body, { status: 201, headers: response.headers });
  }
  return response;
}
