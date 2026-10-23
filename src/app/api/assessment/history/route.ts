import { assessmentApi } from "@/lib/assessment/http";
import { getAssessmentHistory } from "@/lib/assessment/service";
export async function GET() { return assessmentApi(getAssessmentHistory); }
