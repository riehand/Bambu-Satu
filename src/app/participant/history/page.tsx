import { requirePageRole } from "@/lib/auth/session";
import { getAssessmentHistory } from "@/lib/assessment/service";
import { loadAssessmentData } from "@/lib/assessment/page-data";
import { DataError, HistoryList, PrivacyNote } from "@/components/participant/ui";
export default async function HistoryPage() {
  const profile = await requirePageRole("PARTICIPANT");
  const loaded = await loadAssessmentData(() => getAssessmentHistory(profile.id));
  return <><div className="wb-page-heading"><h1>Setiap check-in, bagian dari perjalanan.</h1><p>Lihat kembali hasil asesmen pribadi Anda.</p></div>{loaded.data ? <HistoryList history={loaded.data}/> : <DataError message={loaded.error}/>}<PrivacyNote/></>;
}
