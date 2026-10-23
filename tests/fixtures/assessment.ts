// SYNTHETIC TEST DATA ONLY. These are not clinical questionnaire items or approvals.
import type { ApprovedSet } from "@/lib/assessment/content";
import { getDimensionForItem } from "@/lib/assessment/scoring/dass21";
export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function syntheticQuestionSet(): ApprovedSet {
  return {
    id: fixtureId(100), version: "SYNTHETIC-TEST-ONLY", isPublished: true, approvedAt: new Date("2026-10-01"), approvedBy: "TEST ONLY",
    dassSource: "SYNTHETIC", wemwbsLicenceReference: "SYNTHETIC-NOT-A-LICENCE", translationReference: "SYNTHETIC", presentationApprovalReference: "SYNTHETIC",
    dassInstructions: "Fixture sintetis untuk pengujian. Pilih opsi uji 0–3.", wemwbsInstructions: "Fixture sintetis untuk pengujian. Pilih opsi uji 1–5.",
    dassOptions: [0,1,2,3].map(value => ({ value, label: `Opsi uji sintetis ${value}` })),
    wemwbsOptions: [1,2,3,4,5].map(value => ({ value, label: `Opsi uji sintetis ${value}` })),
    createdAt: new Date("2026-10-01"),
    questions: Array.from({length:35}, (_,i) => ({ id: fixtureId(i+1), questionSetId: fixtureId(100), instrument: i<21 ? "DASS21" : "WEMWBS",
      questionNumber: i<21 ? i+1 : i-20, questionText: `Pernyataan sintetis ${i+1} untuk menguji tampilan.`,
      scoringDimension: i<21 ? getDimensionForItem(i+1)! : "WELLBEING", isActive: true, createdAt: new Date("2026-10-01"), updatedAt: new Date("2026-10-01") })),
  };
}
