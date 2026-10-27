import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureId, syntheticQuestionSet } from "./fixtures/assessment";
const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(), $transaction: vi.fn(),
  academicPeriod: { findMany: vi.fn() }, assessmentQuestionSet: { findMany: vi.fn() },
  assessmentSession: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
  assessmentAnswer: { upsert: vi.fn() }, assessmentScore: { create: vi.fn() }, report: { create: vi.fn() },
}));
vi.mock("@/lib/prisma",()=>({prisma:db}));
import { getActiveAcademicPeriod, getQuota, getSession, getQuestionnaire, getAssessmentHistory, startAssessmentSession, saveAnswers, submitAssessment } from "@/lib/assessment/service";
const participantId = fixtureId(200), sessionId=fixtureId(300), periodId=fixtureId(400);
const period = {id:periodId,name:"Synthetic semester",assessmentLimit:3,status:"ACTIVE"};
function session() { return { id:sessionId,academicPeriodId:periodId,questionSetId:fixtureId(100),status:"IN_PROGRESS",revision:0,startedAt:new Date(),completedAt:null,answers:[],score:null,report:null }; }
beforeEach(()=>{
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async fn=>fn(db)); db.$queryRaw.mockResolvedValue([{id:participantId}]);
  db.academicPeriod.findMany.mockResolvedValue([period]); db.assessmentQuestionSet.findMany.mockResolvedValue([syntheticQuestionSet()]);
  db.assessmentSession.count.mockResolvedValue(0); db.assessmentSession.findFirst.mockResolvedValue(null);
  db.assessmentSession.create.mockResolvedValue(session()); db.assessmentSession.update.mockResolvedValue({...session(),revision:1});
});
describe("periods, quota and ownership",()=>{
  it("handles no active period and rejects ambiguous configuration",async()=>{
    db.academicPeriod.findMany.mockResolvedValue([]); expect(await getActiveAcademicPeriod()).toBeNull(); await expect(getQuota(participantId)).rejects.toMatchObject({code:"NO_ACTIVE_ACADEMIC_PERIOD"});
    db.academicPeriod.findMany.mockResolvedValue([period,period]); await expect(getActiveAcademicPeriod()).rejects.toMatchObject({code:"ACADEMIC_PERIOD_CONFLICT"});
  });
  it("counts only completed sessions in the active period",async()=>{
    db.assessmentSession.count.mockResolvedValue(2); expect(await getQuota(participantId)).toMatchObject({remaining:1,completed:2,limit:3});
    expect(db.assessmentSession.count).toHaveBeenCalledWith({where:{participantId,academicPeriodId:periodId,status:"COMPLETED"}});
  });
  it("shows a content blocker without fabricating quota",async()=>{
    db.assessmentQuestionSet.findMany.mockResolvedValue([]); expect(await getQuota(participantId)).toMatchObject({remaining:3,availability:{code:"INSTRUMENT_CONTENT_UNAVAILABLE"}});
  });
  it("never fetches another participant's session or question set",async()=>{
    await expect(getSession(sessionId,participantId)).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
    expect(db.assessmentSession.findFirst.mock.calls[0][0].where).toEqual({id:sessionId,participantId});
    await expect(getQuestionnaire(participantId,sessionId)).rejects.toMatchObject({httpStatus:404}); expect(db.assessmentQuestionSet.findMany).not.toHaveBeenCalled();
  });
  it("scopes history to the participant",async()=>{
    db.assessmentSession.findMany.mockResolvedValue([]); expect(await getAssessmentHistory(participantId)).toEqual([]);
    expect(db.assessmentSession.findMany.mock.calls[0][0].where).toEqual({participantId,status:"COMPLETED"});
  });
});
describe("start and resume",()=>{
  it("requires explicit consent before any write",async()=>{
    await expect(startAssessmentSession(participantId,false)).rejects.toMatchObject({code:"PROCESSING_CONSENT_REQUIRED"}); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("records processing consent and locks before counting/creating",async()=>{
    await startAssessmentSession(participantId,true);
    expect(db.assessmentSession.create.mock.calls[0][0].data).toMatchObject({participantId,questionSetId:fixtureId(100),processingConsentVersion:"assessment-processing-id-v1",processingConsentAt:expect.any(Date)});
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(db.assessmentSession.count.mock.invocationCallOrder[0]);
  });
  it("resumes the same session without duplicating or consuming quota",async()=>{
    db.assessmentSession.findFirst.mockResolvedValue(session()); expect(await startAssessmentSession(participantId,true)).toMatchObject({assessmentSessionId:sessionId,resumed:true}); expect(db.assessmentSession.create).not.toHaveBeenCalled();
  });
  it("enforces quota and approved content",async()=>{
    db.assessmentSession.count.mockResolvedValue(3); await expect(startAssessmentSession(participantId,true)).rejects.toMatchObject({code:"ASSESSMENT_QUOTA_EXCEEDED"});
    db.assessmentSession.count.mockResolvedValue(0); db.assessmentQuestionSet.findMany.mockResolvedValue([]); await expect(startAssessmentSession(participantId,true)).rejects.toMatchObject({code:"INSTRUMENT_CONTENT_UNAVAILABLE"}); expect(db.assessmentSession.create).not.toHaveBeenCalled();
  });
});
describe("answer persistence",()=>{
  const input={expectedRevision:0,answers:[{questionId:fixtureId(1),answerValue:2}]};
  beforeEach(()=>db.assessmentSession.findFirst.mockResolvedValue(session()));
  it("upserts one answer and returns a committed revision",async()=>{
    expect(await saveAnswers(sessionId,participantId,input)).toEqual({saved:1,revision:1});
    expect(db.assessmentAnswer.upsert.mock.calls[0][0].where).toEqual({session_question:{assessmentSessionId:sessionId,questionId:fixtureId(1)}});
  });
  it.each([
    [{...input,expectedRevision:1},"STALE_REVISION"],
    [{...input,answers:[{questionId:fixtureId(1),answerValue:4}]},"INVALID_ANSWER_VALUE"],
    [{...input,answers:[{questionId:fixtureId(22),answerValue:0}]},"INVALID_ANSWER_VALUE"],
    [{...input,answers:[{questionId:fixtureId(999),answerValue:1}]},"INVALID_QUESTION_ID"],
    [{...input,answers:[...input.answers,...input.answers]},"VALIDATION_ERROR"],
    [{...input,userId:fixtureId(999)},"VALIDATION_ERROR"],
  ])("rejects invalid or stale save %#",async(value,code)=>{ await expect(saveAnswers(sessionId,participantId,value)).rejects.toMatchObject({code}); expect(db.assessmentAnswer.upsert).not.toHaveBeenCalled(); });
  it("never edits completed sessions",async()=>{ db.assessmentSession.findFirst.mockResolvedValue({...session(),status:"COMPLETED"}); await expect(saveAnswers(sessionId,participantId,input)).rejects.toMatchObject({code:"ASSESSMENT_ALREADY_COMPLETED"}); expect(db.assessmentAnswer.upsert).not.toHaveBeenCalled(); });
});
describe("atomic completion",()=>{
  it("requires the revision reviewed by the participant",async()=>{
    await expect(submitAssessment(sessionId,participantId,{})).rejects.toMatchObject({code:"VALIDATION_ERROR"});
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("rejects a stale review before counting quota or writing any result",async()=>{
    db.assessmentSession.findFirst.mockResolvedValue({...session(),revision:2});
    await expect(submitAssessment(sessionId,participantId,{expectedRevision:1})).rejects.toMatchObject({code:"STALE_REVISION"});
    expect(db.assessmentSession.count).not.toHaveBeenCalled();
    expect(db.assessmentScore.create).not.toHaveBeenCalled();
    expect(db.report.create).not.toHaveBeenCalled();
  });
  it("rechecks quota at submission even if answers were already saved",async()=>{
    db.assessmentSession.findFirst.mockResolvedValue(session());
    db.assessmentSession.count.mockResolvedValue(3);
    await expect(submitAssessment(sessionId,participantId,{expectedRevision:0})).rejects.toMatchObject({code:"ASSESSMENT_QUOTA_EXCEEDED"});
    expect(db.assessmentScore.create).not.toHaveBeenCalled();
  });
  it("cannot complete another participant's session",async()=>{
    await expect(submitAssessment(sessionId,participantId,{expectedRevision:0})).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
    expect(db.assessmentScore.create).not.toHaveBeenCalled();
  });
  it("rejects missing answers before scores or reports",async()=>{ db.assessmentSession.findFirst.mockResolvedValue(session()); await expect(submitAssessment(sessionId,participantId,{expectedRevision:0})).rejects.toMatchObject({code:"ASSESSMENT_INCOMPLETE"}); expect(db.assessmentScore.create).not.toHaveBeenCalled(); expect(db.report.create).not.toHaveBeenCalled(); });
  it("calculates scores, creates pending metadata and completes in one transaction",async()=>{
    const answers=syntheticQuestionSet().questions.map(q=>({questionId:q.id,answerValue:q.instrument==="DASS21"?0:3}));
    const result={...session(),status:"COMPLETED",completedAt:new Date("2026-10-23T10:00:00Z"),score:{depressionScore:0,depressionCategory:"NORMAL",anxietyScore:0,anxietyCategory:"NORMAL",stressScore:0,stressCategory:"NORMAL",wemwbsScore:42},report:{id:fixtureId(500)}};
    db.assessmentSession.findFirst.mockResolvedValueOnce({...session(),answers}).mockResolvedValue(result);
    const first=await submitAssessment(sessionId,participantId,{expectedRevision:0}); expect(first).toMatchObject({scores:{wemwbs:{score:42}},completedAt:"2026-10-23T10:00:00.000Z"});
    expect(db.report.create).toHaveBeenCalledWith({data:{assessmentSessionId:sessionId,status:"PENDING"}});
    expect(await submitAssessment(sessionId,participantId,{expectedRevision:0})).toEqual(first); expect(db.assessmentScore.create).toHaveBeenCalledTimes(1); expect(db.report.create).toHaveBeenCalledTimes(1);
  });
  it("propagates report failure so the transaction rolls back",async()=>{
    db.assessmentSession.findFirst.mockResolvedValue({...session(),answers:syntheticQuestionSet().questions.map(q=>({questionId:q.id,answerValue:1}))}); db.report.create.mockRejectedValue(new Error("write failed"));
    await expect(submitAssessment(sessionId,participantId,{expectedRevision:0})).rejects.toThrow("write failed"); expect(db.assessmentSession.update).not.toHaveBeenCalled();
  });
});

describe("persisted dashboard progress and period changes",()=>{
  it("loads the pinned question set and only the saved answer count for resume",async()=>{
    const questionSetId=fixtureId(101);
    db.assessmentSession.findFirst.mockResolvedValue({id:sessionId,questionSetId,updatedAt:new Date("2026-10-24T03:24:00Z"),_count:{answers:23}});
    expect(await getQuota(participantId)).toMatchObject({inProgressSessionId:sessionId,inProgress:{answered:23,total:35,updatedAt:"2026-10-24T03:24:00.000Z"}});
    expect(db.assessmentQuestionSet.findMany.mock.calls[0][0].where).toEqual({id:questionSetId,isPublished:true});
    expect(db.assessmentSession.findFirst.mock.calls[0][0].select).not.toHaveProperty("answers");
  });
  it("does not manufacture progress when no session exists",async()=>{
    expect(await getQuota(participantId)).toMatchObject({inProgress:null,inProgressSessionId:null});
  });
  it.each([{periods:[]},{periods:[{...period,id:fixtureId(401)}]}])("rejects save and submit after the session period is deactivated %#",async({periods})=>{
    db.assessmentSession.findFirst.mockResolvedValue(session());
    db.academicPeriod.findMany.mockResolvedValue(periods);
    await expect(saveAnswers(sessionId,participantId,{expectedRevision:0,answers:[{questionId:fixtureId(1),answerValue:1}]})).rejects.toMatchObject({code:"NO_ACTIVE_ACADEMIC_PERIOD"});
    await expect(submitAssessment(sessionId,participantId,{expectedRevision:0})).rejects.toMatchObject({code:"NO_ACTIVE_ACADEMIC_PERIOD"});
    expect(db.assessmentAnswer.upsert).not.toHaveBeenCalled();
    expect(db.assessmentScore.create).not.toHaveBeenCalled();
  });
});
