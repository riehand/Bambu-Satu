/**
 * WEMWBS Scoring Engine
 * 
 * The Warwick-Edinburgh Mental Wellbeing Scale (WEMWBS) — 14-item version.
 * 
 * Reference: https://warwick.ac.uk/services/innovations/wemwbs/
 * Copyright: University of Warwick and University of Edinburgh, 2006.
 * 
 * IMPORTANT: WEMWBS is copyright-protected. A licence from the University of
 * Warwick is required before using the scale in any application.
 * 
 * This module contains ONLY deterministic scoring logic.
 * No AI/LLM involvement in score calculation.
 */

export const WEMWBS_TOTAL_ITEMS = 14;
export const WEMWBS_MIN_ANSWER = 1;
export const WEMWBS_MAX_ANSWER = 5;
export const WEMWBS_MIN_TOTAL = WEMWBS_TOTAL_ITEMS * WEMWBS_MIN_ANSWER; // 14
export const WEMWBS_MAX_TOTAL = WEMWBS_TOTAL_ITEMS * WEMWBS_MAX_ANSWER; // 70

export interface WemwbsAnswers {
  /** Map of WEMWBS question number (1–14) to answer value (1–5) */
  [questionNumber: number]: number;
}

export interface WemwbsResult {
  wemwbsScore: number;
}

/**
 * Calculate WEMWBS total score from a complete set of 14 answers.
 * 
 * The total score is the simple sum of all 14 item responses.
 * No clinical cutoff categories are applied — only raw total.
 * 
 * @param answers - Map of question numbers (1-14) to values (1-5)
 * @returns Total WEMWBS score
 * @throws Error if any answer is missing or out of range
 */
export function calculateWemwbs(answers: WemwbsAnswers): WemwbsResult {
  for (let i = 1; i <= WEMWBS_TOTAL_ITEMS; i++) {
    if (answers[i] === undefined || answers[i] === null) {
      throw new Error(`Missing WEMWBS answer for question ${i}`);
    }
    if (!Number.isInteger(answers[i]) || answers[i] < WEMWBS_MIN_ANSWER || answers[i] > WEMWBS_MAX_ANSWER) {
      throw new Error(`Invalid WEMWBS answer for question ${i}: must be integer ${WEMWBS_MIN_ANSWER}–${WEMWBS_MAX_ANSWER}`);
    }
  }

  let total = 0;
  for (let i = 1; i <= WEMWBS_TOTAL_ITEMS; i++) {
    total += answers[i];
  }

  return { wemwbsScore: total };
}
