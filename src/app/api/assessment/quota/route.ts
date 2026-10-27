import { assessmentApi } from "@/lib/assessment/http";
import { getQuota } from "@/lib/assessment/service";
export async function GET() { return assessmentApi(getQuota); }
