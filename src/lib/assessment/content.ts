import { z } from "zod";
import type { AssessmentQuestionSet, Question } from "@prisma/client";
import { getDimensionForItem } from "./scoring/dass21";
import { AssessmentError } from "./errors";

const optionsSchema = z.array(z.strictObject({ value: z.number().int(), label: z.string().trim().min(1) }));
export type ApprovedSet = AssessmentQuestionSet & { questions: Question[] };
export function validateQuestionSet(set: ApprovedSet | null) {
  const unavailable = () => new AssessmentError("INSTRUMENT_CONTENT_UNAVAILABLE", "Materi asesmen masih dalam proses persetujuan. Silakan kembali nanti.", 503);
  if (!set || !set.isPublished || !set.approvedAt || !set.approvedBy?.trim() || !set.dassSource?.trim() ||
    !set.wemwbsLicenceReference?.trim() || !set.translationReference?.trim() || !set.presentationApprovalReference?.trim() ||
    !set.dassInstructions.trim() || !set.wemwbsInstructions.trim()) throw unavailable();
  const dassOptions = optionsSchema.safeParse(set.dassOptions);
  const wemwbsOptions = optionsSchema.safeParse(set.wemwbsOptions);
  if (!dassOptions.success || !wemwbsOptions.success ||
    dassOptions.data.map(o => o.value).join() !== "0,1,2,3" || wemwbsOptions.data.map(o => o.value).join() !== "1,2,3,4,5") throw unavailable();
  if (set.questions.length !== 35) throw unavailable();
  for (const instrument of ["DASS21", "WEMWBS"] as const) {
    const questions = set.questions.filter(q => q.instrument === instrument).sort((a,b) => a.questionNumber - b.questionNumber);
    if (questions.length !== (instrument === "DASS21" ? 21 : 14) || questions.some((q, i) =>
      q.questionNumber !== i + 1 || !q.isActive || !q.questionText.trim() ||
      q.scoringDimension !== (instrument === "DASS21" ? getDimensionForItem(i + 1) : "WELLBEING"))) throw unavailable();
  }
  return { ...set, dassOptions: dassOptions.data, wemwbsOptions: wemwbsOptions.data };
}
