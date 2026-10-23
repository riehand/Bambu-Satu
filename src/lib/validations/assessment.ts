import { z } from "zod";

/**
 * Validation schema for saving assessment answers.
 * Validates the shape of the request — instrument-specific range
 * checks are enforced in the service layer against question metadata.
 */
export const saveAnswersSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  answers: z.array(
    z.strictObject({
      questionId: z.string().uuid("ID soal tidak valid"),
      answerValue: z.number().int("Jawaban harus berupa bilangan bulat"),
    })
  ).min(1, "Minimal satu jawaban diperlukan").max(35, "Terlalu banyak jawaban dalam satu permintaan"),
}).refine(value => new Set(value.answers.map(answer => answer.questionId)).size === value.answers.length,
  "Satu soal hanya boleh dijawab sekali dalam satu permintaan");

export const startAssessmentSchema = z.strictObject({ processingConsent: z.literal(true) });
export const sessionIdSchema = z.string().uuid();
export const questionsQuerySchema = z.strictObject({
  instrument: z.enum(["DASS21", "WEMWBS"]).optional(),
  sessionId: sessionIdSchema.optional(),
});

export type SaveAnswersInput = z.infer<typeof saveAnswersSchema>;
