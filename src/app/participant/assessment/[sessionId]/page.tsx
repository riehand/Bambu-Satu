import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageRole } from "@/lib/auth/session";
import { getQuestionnaire, getSession } from "@/lib/assessment/service";
import { loadAssessmentData } from "@/lib/assessment/page-data";
import { sessionIdSchema } from "@/lib/validations/assessment";
import { Questionnaire } from "@/components/participant/questionnaire";
import { Brand } from "@/components/participant/icons";
import { DataError } from "@/components/participant/ui";
export default async function QuestionnairePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const profile = await requirePageRole("PARTICIPANT");
  const parsed = sessionIdSchema.safeParse((await params).sessionId);
  if (!parsed.success) notFound();
  const loaded = await loadAssessmentData(async () => {
    const session = await getSession(parsed.data, profile.id);
    if (session.status === "COMPLETED") redirect(`/participant/assessment/${session.id}/results`);
    const content = await getQuestionnaire(profile.id, session.id);
    return { session, content };
  });
  if (!loaded.data) return <><header className="wb-question-header"><Brand/><Link href="/participant/dashboard" className="wb-button secondary">Kembali</Link></header><main className="wb-question-main"><DataError message={loaded.error}/></main></>;
  return <Questionnaire key={loaded.data.session.id} sessionId={loaded.data.session.id} initialAnswers={loaded.data.session.answers} initialRevision={loaded.data.session.revision} {...loaded.data.content}/>;
}
