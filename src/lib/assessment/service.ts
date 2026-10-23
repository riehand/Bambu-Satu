import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateDass21 } from "./scoring/dass21";
import { calculateWemwbs } from "./scoring/wemwbs";
import { AssessmentError } from "./errors";
import { validateQuestionSet } from "./content";
import { PROCESSING_CONSENT_VERSION } from "./consent";
import { saveAnswersSchema } from "@/lib/validations/assessment";
export { AssessmentError } from "./errors";

type DB = Prisma.TransactionClient;
const sessionSelect = {
  id: true, academicPeriodId: true, questionSetId: true, status: true,
  startedAt: true, completedAt: true, revision: true,
  processingConsentAt: true, processingConsentVersion: true,
  answers: { select: { questionId: true, answerValue: true } },
  score: true, report: { select: { id: true, status: true } },
} satisfies Prisma.AssessmentSessionSelect;

// All participant writes share a transaction-scoped lock. READ COMMITTED
// lets a waiting request read the preceding commit. No profile is modified.
// Session revisions additionally protect competing browser tabs.
async function participantTransaction<T>(participantId: string, work: (tx: DB) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${participantId}::uuid FOR UPDATE`;
    return work(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
}
export async function getActiveAcademicPeriod(db: DB = prisma) {
  const periods = await db.academicPeriod.findMany({ where: { status: "ACTIVE" }, take: 2 });
  if (periods.length > 1) throw new AssessmentError("ACADEMIC_PERIOD_CONFLICT", "Periode asesmen belum dapat digunakan.", 503);
  return periods[0] ?? null;
}
async function requirePeriod(db: DB, expectedId?: string) {
  await db.$queryRaw`SELECT id FROM academic_periods WHERE status = 'ACTIVE' FOR SHARE`;
  const period = await getActiveAcademicPeriod(db);
  if (!period || (expectedId && expectedId !== period.id))
    throw new AssessmentError("NO_ACTIVE_ACADEMIC_PERIOD", "Periode akademik untuk asesmen ini tidak aktif.", 409);
  return period;
}
async function completedCount(db: DB, participantId: string, academicPeriodId: string) {
  return db.assessmentSession.count({ where: { participantId, academicPeriodId, status: "COMPLETED" } });
}
async function approvedContent(db: DB, id?: string) {
  const sets = await db.assessmentQuestionSet.findMany({
    where: id ? { id, isPublished: true } : { isPublished: true },
    include: { questions: { orderBy: [{ instrument: "asc" }, { questionNumber: "asc" }] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1,
  });
  if (sets.length !== 1) return validateQuestionSet(null);
  return validateQuestionSet(sets[0]);
}
export async function getQuota(participantId: string) {
  const period = await getActiveAcademicPeriod();
  if (!period) throw new AssessmentError("NO_ACTIVE_ACADEMIC_PERIOD", "Belum ada periode akademik aktif. Asesmen belum tersedia.", 404);
  const [completed, inProgress] = await Promise.all([
    completedCount(prisma, participantId, period.id),
    prisma.assessmentSession.findFirst({ where: { participantId, academicPeriodId: period.id, status: "IN_PROGRESS" }, select: { id: true } }),
  ]);
  let availability: { code: string; message: string } | null = null;
  try { await approvedContent(prisma); } catch (error) {
    if (!(error instanceof AssessmentError)) throw error;
    availability = { code: error.code, message: error.message };
  }
  return { academicPeriod: { id: period.id, name: period.name }, limit: period.assessmentLimit,
    completed, remaining: Math.max(0, period.assessmentLimit - completed), inProgressSessionId: inProgress?.id ?? null, availability };
}
export async function startAssessmentSession(participantId: string, processingConsent: boolean) {
  if (processingConsent !== true) throw new AssessmentError("PROCESSING_CONSENT_REQUIRED", "Persetujuan pemrosesan diperlukan.", 422);
  return participantTransaction(participantId, async tx => {
    const period = await requirePeriod(tx);
    const existing = await tx.assessmentSession.findFirst({ where: { participantId, academicPeriodId: period.id, status: "IN_PROGRESS" } });
    if (existing) return { assessmentSessionId: existing.id, status: existing.status, academicPeriodId: period.id, startedAt: existing.startedAt.toISOString(), resumed: true };
    if (await completedCount(tx, participantId, period.id) >= period.assessmentLimit)
      throw new AssessmentError("ASSESSMENT_QUOTA_EXCEEDED", "Kuota asesmen untuk periode ini telah habis.", 409);
    const content = await approvedContent(tx);
    const session = await tx.assessmentSession.create({ data: {
      participantId, academicPeriodId: period.id, questionSetId: content.id, status: "IN_PROGRESS",
      processingConsentAt: new Date(), processingConsentVersion: PROCESSING_CONSENT_VERSION,
    } });
    return { assessmentSessionId: session.id, status: session.status, academicPeriodId: period.id, startedAt: session.startedAt.toISOString(), resumed: false };
  });
}
async function ownedSession(db: DB, sessionId: string, participantId: string) {
  const session = await db.assessmentSession.findFirst({ where: { id: sessionId, participantId }, select: sessionSelect });
  if (!session) throw new AssessmentError("RESOURCE_NOT_FOUND", "Sesi asesmen tidak ditemukan.", 404);
  return session;
}
export async function getSession(sessionId: string, participantId: string) { return ownedSession(prisma, sessionId, participantId); }
export async function getInProgressSession(participantId: string) {
  const period = await getActiveAcademicPeriod();
  return period ? prisma.assessmentSession.findFirst({ where: { participantId, academicPeriodId: period.id, status: "IN_PROGRESS" }, select: sessionSelect }) : null;
}
export async function getQuestionnaire(participantId: string, sessionId?: string) {
  const session = sessionId ? await getSession(sessionId, participantId) : null;
  const content = await approvedContent(prisma, session?.questionSetId);
  return { questions: content.questions.map(q => ({ id: q.id, instrument: q.instrument, questionNumber: q.questionNumber, questionText: q.questionText })),
    dassInstructions: content.dassInstructions, wemwbsInstructions: content.wemwbsInstructions,
    dassOptions: content.dassOptions, wemwbsOptions: content.wemwbsOptions };
}
export async function getQuestions(participantId: string, instrument?: "DASS21" | "WEMWBS", sessionId?: string) {
  const data = await getQuestionnaire(participantId, sessionId);
  return data.questions.filter(q => !instrument || q.instrument === instrument);
}
export async function saveAnswers(sessionId: string, participantId: string, input: unknown) {
  const parsed = saveAnswersSchema.safeParse(input);
  if (!parsed.success) throw new AssessmentError("VALIDATION_ERROR", "Format jawaban tidak valid.", 422);
  const { answers, expectedRevision } = parsed.data;
  return participantTransaction(participantId, async tx => {
    const session = await ownedSession(tx, sessionId, participantId);
    if (session.status !== "IN_PROGRESS") throw new AssessmentError("ASSESSMENT_ALREADY_COMPLETED", "Asesmen ini telah selesai.", 409);
    if (session.revision !== expectedRevision) throw new AssessmentError("STALE_REVISION", "Jawaban berubah di tab lain. Muat ulang untuk melanjutkan.", 409);
    await requirePeriod(tx, session.academicPeriodId);
    const content = await approvedContent(tx, session.questionSetId);
    for (const answer of answers) {
      const question = content.questions.find(q => q.id === answer.questionId);
      if (!question) throw new AssessmentError("INVALID_QUESTION_ID", "Soal tidak termasuk dalam sesi ini.", 422);
      const min = question.instrument === "DASS21" ? 0 : 1, max = question.instrument === "DASS21" ? 3 : 5;
      if (answer.answerValue < min || answer.answerValue > max) throw new AssessmentError("INVALID_ANSWER_VALUE", "Nilai jawaban tidak sesuai instrumen.", 422);
    }
    for (const answer of answers) await tx.assessmentAnswer.upsert({
      where: { session_question: { assessmentSessionId: sessionId, questionId: answer.questionId } },
      update: { answerValue: answer.answerValue }, create: { assessmentSessionId: sessionId, ...answer },
    });
    const updated = await tx.assessmentSession.update({ where: { id: sessionId }, data: { revision: { increment: 1 } } });
    return { saved: answers.length, revision: updated.revision };
  });
}
function submissionResult(session: Awaited<ReturnType<typeof ownedSession>>) {
  if (!session.score || !session.report || !session.completedAt) throw new AssessmentError("RESULT_UNAVAILABLE", "Hasil asesmen belum tersedia.", 503);
  const s = session.score;
  return { assessmentSessionId: session.id, status: "COMPLETED" as const, completedAt: session.completedAt.toISOString(),
    scores: { depression: { score: s.depressionScore, category: s.depressionCategory }, anxiety: { score: s.anxietyScore, category: s.anxietyCategory },
      stress: { score: s.stressScore, category: s.stressCategory }, wemwbs: { score: s.wemwbsScore } }, reportId: session.report.id };
}
export async function submitAssessment(sessionId: string, participantId: string) {
  return participantTransaction(participantId, async tx => {
    const session = await ownedSession(tx, sessionId, participantId);
    if (session.status === "COMPLETED") return submissionResult(session);
    const period = await requirePeriod(tx, session.academicPeriodId);
    if (await completedCount(tx, participantId, period.id) >= period.assessmentLimit)
      throw new AssessmentError("ASSESSMENT_QUOTA_EXCEEDED", "Kuota asesmen telah habis.", 409);
    const content = await approvedContent(tx, session.questionSetId);
    const dass: Record<number, number> = {}, wemwbs: Record<number, number> = {};
    for (const q of content.questions) {
      const answer = session.answers.find(a => a.questionId === q.id);
      if (!answer) throw new AssessmentError("ASSESSMENT_INCOMPLETE", "Lengkapi seluruh 35 jawaban sebelum mengirim.", 422);
      (q.instrument === "DASS21" ? dass : wemwbs)[q.questionNumber] = answer.answerValue;
    }
    const scores = { ...calculateDass21(dass), ...calculateWemwbs(wemwbs) };
    await tx.assessmentScore.create({ data: { assessmentSessionId: sessionId, ...scores } });
    await tx.report.create({ data: { assessmentSessionId: sessionId, status: "PENDING" } });
    await tx.assessmentSession.update({ where: { id: sessionId }, data: { status: "COMPLETED", completedAt: new Date(), revision: { increment: 1 } } });
    return submissionResult(await ownedSession(tx, sessionId, participantId));
  });
}
export async function getAssessmentHistory(participantId: string) {
  const sessions = await prisma.assessmentSession.findMany({ where: { participantId, status: "COMPLETED" },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }], select: { id: true, completedAt: true, score: true, report: { select: { id: true } } } });
  return sessions.map(s => ({ assessmentSessionId: s.id, completedAt: s.completedAt?.toISOString() ?? null,
    reportId: s.report?.id ?? null, scores: s.score }));
}
