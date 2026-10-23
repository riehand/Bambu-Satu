/**
 * DASS-21 Scoring Engine
 * 
 * Official reference: https://www2.psy.unsw.edu.au/groups/dass/
 * 
 * DASS-21 uses a subset of DASS-42 items. To compare with DASS-42 norms,
 * each dimension subtotal is multiplied by 2.
 * 
 * This module contains ONLY deterministic scoring logic.
 * No AI/LLM involvement in score calculation.
 */

// ─── Item-to-Dimension Mapping (DASS-21) ───────────────────
// Source: DASS Manual (Lovibond & Lovibond, 1995)
// These are the DASS-21 question numbers (1-21) mapped to dimensions.

export const DASS21_DEPRESSION_ITEMS = [3, 5, 10, 13, 16, 17, 21] as const;
export const DASS21_ANXIETY_ITEMS = [2, 4, 7, 9, 15, 19, 20] as const;
export const DASS21_STRESS_ITEMS = [1, 6, 8, 11, 12, 14, 18] as const;

export const DASS21_TOTAL_ITEMS = 21;
export const DASS21_ITEMS_PER_DIMENSION = 7;
export const DASS21_MIN_ANSWER = 0;
export const DASS21_MAX_ANSWER = 3;
export const DASS21_MULTIPLIER = 2;

// ─── Category Thresholds (after ×2) ────────────────────────
// Source: DASS Manual severity labels for DASS-42 norms
// Applied after multiplying DASS-21 subtotals by 2.

export type DassCategory = "NORMAL" | "MILD" | "MODERATE" | "SEVERE" | "EXTREMELY_SEVERE";

interface ThresholdBoundary {
  readonly max: number;
  readonly category: DassCategory;
}

const DEPRESSION_THRESHOLDS: readonly ThresholdBoundary[] = [
  { max: 9, category: "NORMAL" },
  { max: 13, category: "MILD" },
  { max: 20, category: "MODERATE" },
  { max: 27, category: "SEVERE" },
  // 28+ → EXTREMELY_SEVERE
];

const ANXIETY_THRESHOLDS: readonly ThresholdBoundary[] = [
  { max: 7, category: "NORMAL" },
  { max: 9, category: "MILD" },
  { max: 14, category: "MODERATE" },
  { max: 19, category: "SEVERE" },
  // 20+ → EXTREMELY_SEVERE
];

const STRESS_THRESHOLDS: readonly ThresholdBoundary[] = [
  { max: 14, category: "NORMAL" },
  { max: 18, category: "MILD" },
  { max: 25, category: "MODERATE" },
  { max: 33, category: "SEVERE" },
  // 34+ → EXTREMELY_SEVERE
];

export function categorizeScore(score: number, thresholds: readonly ThresholdBoundary[]): DassCategory {
  for (const { max, category } of thresholds) {
    if (score <= max) return category;
  }
  return "EXTREMELY_SEVERE";
}

export function categorizeDepression(score: number): DassCategory {
  return categorizeScore(score, DEPRESSION_THRESHOLDS);
}

export function categorizeAnxiety(score: number): DassCategory {
  return categorizeScore(score, ANXIETY_THRESHOLDS);
}

export function categorizeStress(score: number): DassCategory {
  return categorizeScore(score, STRESS_THRESHOLDS);
}

// ─── Dimension mapping lookup ──────────────────────────────

export function getDimensionForItem(questionNumber: number): "DEPRESSION" | "ANXIETY" | "STRESS" | null {
  if ((DASS21_DEPRESSION_ITEMS as readonly number[]).includes(questionNumber)) return "DEPRESSION";
  if ((DASS21_ANXIETY_ITEMS as readonly number[]).includes(questionNumber)) return "ANXIETY";
  if ((DASS21_STRESS_ITEMS as readonly number[]).includes(questionNumber)) return "STRESS";
  return null;
}

// ─── Scoring Function ──────────────────────────────────────

export interface Dass21Answers {
  /** Map of DASS-21 question number (1–21) to answer value (0–3) */
  [questionNumber: number]: number;
}

export interface Dass21Result {
  depressionScore: number;
  depressionCategory: DassCategory;
  anxietyScore: number;
  anxietyCategory: DassCategory;
  stressScore: number;
  stressCategory: DassCategory;
}

/**
 * Calculate DASS-21 scores from a complete set of 21 answers.
 * 
 * @param answers - Map of question numbers (1-21) to values (0-3)
 * @returns Scores and categories for depression, anxiety, stress
 * @throws Error if any answer is missing or out of range
 */
export function calculateDass21(answers: Dass21Answers): Dass21Result {
  // Validate completeness
  for (let i = 1; i <= DASS21_TOTAL_ITEMS; i++) {
    if (answers[i] === undefined || answers[i] === null) {
      throw new Error(`Missing DASS-21 answer for question ${i}`);
    }
    if (!Number.isInteger(answers[i]) || answers[i] < DASS21_MIN_ANSWER || answers[i] > DASS21_MAX_ANSWER) {
      throw new Error(`Invalid DASS-21 answer for question ${i}: must be integer ${DASS21_MIN_ANSWER}–${DASS21_MAX_ANSWER}`);
    }
  }

  // Sum each dimension
  const depressionRaw = DASS21_DEPRESSION_ITEMS.reduce((sum, q) => sum + answers[q], 0);
  const anxietyRaw = DASS21_ANXIETY_ITEMS.reduce((sum, q) => sum + answers[q], 0);
  const stressRaw = DASS21_STRESS_ITEMS.reduce((sum, q) => sum + answers[q], 0);

  // Multiply by 2 for DASS-42 norm comparison
  const depressionScore = depressionRaw * DASS21_MULTIPLIER;
  const anxietyScore = anxietyRaw * DASS21_MULTIPLIER;
  const stressScore = stressRaw * DASS21_MULTIPLIER;

  return {
    depressionScore,
    depressionCategory: categorizeDepression(depressionScore),
    anxietyScore,
    anxietyCategory: categorizeAnxiety(anxietyScore),
    stressScore,
    stressCategory: categorizeStress(stressScore),
  };
}
