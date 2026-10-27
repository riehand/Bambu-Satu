import { requirePageRole } from "@/lib/auth/session";
import { getQuota } from "@/lib/assessment/service";
import { loadAssessmentData } from "@/lib/assessment/page-data";
import { Introduction } from "@/components/participant/introduction";
export default async function AssessmentPage() {
  const profile = await requirePageRole("PARTICIPANT");
  const quota = await loadAssessmentData(() => getQuota(profile.id));
  return <Introduction quota={quota.data} error={quota.error}/>;
}
