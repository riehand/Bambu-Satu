import { notFound, redirect } from "next/navigation";
import { requirePageRole } from "@/lib/auth/session";
import { getAssessmentHistory, getSession } from "@/lib/assessment/service";
import { loadAssessmentData } from "@/lib/assessment/page-data";
import { sessionIdSchema } from "@/lib/validations/assessment";
import { ResultsView } from "@/components/participant/results";
import { DataError } from "@/components/participant/ui";
export default async function ResultsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const profile = await requirePageRole("PARTICIPANT");
  const id = sessionIdSchema.safeParse((await params).sessionId);
  if (!id.success) notFound();
  const loaded = await loadAssessmentData(async () => {
    const session = await getSession(id.data, profile.id);
    if (session.status !== "COMPLETED") redirect(`/participant/assessment/${id.data}`);
    return { session, history: await getAssessmentHistory(profile.id) };
  });
  if (!loaded.data) return <DataError message={loaded.error}/>;
  const { session, history } = loaded.data;
  if (!session.score || !session.completedAt || !session.report) return <DataError message="Hasil untuk sesi ini belum tersedia."/>;
  return <ResultsView sessionId={session.id} completedAt={session.completedAt.toISOString()} reportId={session.report.id} scores={session.score} history={history}/>;
}
