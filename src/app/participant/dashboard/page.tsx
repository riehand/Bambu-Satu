import { requirePageRole } from "@/lib/auth/session";
import { DashboardView } from "@/components/participant/dashboard";
import { getAssessmentHistory, getQuota } from "@/lib/assessment/service";
import { loadAssessmentData } from "@/lib/assessment/page-data";

export default async function ParticipantDashboard() {
  const profile = await requirePageRole("PARTICIPANT");

  const [quota, history] = await Promise.all([loadAssessmentData(() => getQuota(profile.id)), loadAssessmentData(() => getAssessmentHistory(profile.id))]);
  return <DashboardView fullName={profile.fullName} quota={quota.data} quotaError={quota.error} history={history.data} historyError={history.error}/>;
}
