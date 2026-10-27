import { describe, expect, it } from "vitest";
import { calculateDass21, categorizeDepression, categorizeAnxiety, categorizeStress, getDimensionForItem } from "@/lib/assessment/scoring/dass21";
import { calculateWemwbs } from "@/lib/assessment/scoring/wemwbs";
import { validateQuestionSet } from "@/lib/assessment/content";
import { syntheticQuestionSet } from "./fixtures/assessment";
const values = (length: number, value: number) => Object.fromEntries(Array.from({length},(_,i) => [i+1,value]));
describe("verified deterministic scoring", () => {
  it("scores all-zero DASS and all-max DASS independently", () => {
    expect(calculateDass21(values(21,0))).toEqual({depressionScore:0, depressionCategory:"NORMAL", anxietyScore:0, anxietyCategory:"NORMAL", stressScore:0, stressCategory:"NORMAL"});
    expect(calculateDass21(values(21,3))).toEqual({depressionScore:42, depressionCategory:"EXTREMELY_SEVERE", anxietyScore:42, anxietyCategory:"EXTREMELY_SEVERE", stressScore:42, stressCategory:"EXTREMELY_SEVERE"});
  });
  it.each(Array.from({length:21},(_,i)=>i+1))("maps item %i to exactly one subscale and doubles it", item => {
    const answers = values(21,0); answers[item] = 1;
    const result = calculateDass21(answers);
    expect(result.depressionScore + result.anxietyScore + result.stressScore).toBe(2);
    expect(result[`${getDimensionForItem(item)!.toLowerCase()}Score` as "depressionScore"]).toBe(2);
  });
  it.each([
    [categorizeDepression, [9,13,20,27]], [categorizeAnxiety,[7,9,14,19]], [categorizeStress,[14,18,25,33]],
  ] as const)("checks every severity boundary", (categorize, boundaries) => {
    const labels = ["NORMAL","MILD","MODERATE","SEVERE","EXTREMELY_SEVERE"];
    boundaries.forEach((max,i) => { expect(categorize(max)).toBe(labels[i]); expect(categorize(max+1)).toBe(labels[i+1]); });
  });
  it("WEMWBS is a 14–70 total only", () => {
    expect(calculateWemwbs(values(14,1))).toEqual({wemwbsScore:14});
    expect(calculateWemwbs(values(14,5))).toEqual({wemwbsScore:70});
  });
  it.each([-1,4,0.5,NaN,Infinity])("rejects invalid DASS value %s", value => expect(() => calculateDass21({...values(21,0),1:value})).toThrow());
  it.each([0,6,1.5,NaN,Infinity])("rejects invalid WEMWBS value %s", value => expect(() => calculateWemwbs({...values(14,1),1:value})).toThrow());
  it("never scores incomplete assessments", () => { expect(()=>calculateDass21(values(20,0))).toThrow(); expect(()=>calculateWemwbs(values(13,1))).toThrow(); });
});
describe("instrument publication gate", () => {
  it("accepts structurally complete synthetic fixtures only for tests", () => expect(validateQuestionSet(syntheticQuestionSet()).questions).toHaveLength(35));
  it.each(["approvedAt","approvedBy","dassSource","wemwbsLicenceReference","translationReference","presentationApprovalReference"] as const)("requires %s", field => {
    const set = syntheticQuestionSet(); Object.assign(set,{[field]:null}); expect(()=>validateQuestionSet(set)).toThrow();
  });
  it("rejects missing, unpublished, misnumbered or mismapped content", () => {
    expect(()=>validateQuestionSet(null)).toThrow();
    const set = syntheticQuestionSet(); set.isPublished = false; expect(()=>validateQuestionSet(set)).toThrow();
    set.isPublished = true; set.questions[0].questionNumber = 2; expect(()=>validateQuestionSet(set)).toThrow();
    set.questions[0].questionNumber = 1; set.questions[0].scoringDimension = "ANXIETY"; expect(()=>validateQuestionSet(set)).toThrow();
  });
  it("requires approved response wording and exact option values", () => {
    const set = syntheticQuestionSet(); set.wemwbsOptions = [{value:0,label:"wrong"}]; expect(()=>validateQuestionSet(set)).toThrow();
  });
});
