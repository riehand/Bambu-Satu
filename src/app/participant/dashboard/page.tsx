import { Suspense } from "react";
import Loading from "@/app/participant/loading";
import { requirePageRole } from "@/lib/auth/session";
import { DashboardView } from "@/components/participant/dashboard";
import { getAssessmentHistory, getQuota } from "@/lib/assessment/service";
import { loadAssessmentData } from "@/lib/assessment/page-data";

async function ParticipantDashboardContent() {
  const profile = await requirePageRole("PARTICIPANT");

  const [quota, history] = await Promise.all([loadAssessmentData(() => getQuota(profile.id)), loadAssessmentData(() => getAssessmentHistory(profile.id))]);
  return <DashboardView fullName={profile.fullName} quota={quota.data} quotaError={quota.error} history={history.data} historyError={history.error}/>;
}

export default function ParticipantDashboard() {
  return <Suspense fallback={<Loading/>}><ParticipantDashboardContent/></Suspense>;
}
