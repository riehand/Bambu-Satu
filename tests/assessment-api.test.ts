import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({getUser:vi.fn(),findUnique:vi.fn(),getQuota:vi.fn(),getQuestions:vi.fn(),getSession:vi.fn(),startAssessmentSession:vi.fn(),saveAnswers:vi.fn(),submitAssessment:vi.fn(),getAssessmentHistory:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mocks.getUser}})}));
vi.mock("@/lib/prisma",()=>({prisma:{user:{findUnique:mocks.findUnique}}}));
vi.mock("@/lib/assessment/service",()=>mocks);
import {GET as quota} from "@/app/api/assessment/quota/route";
import {GET as questions} from "@/app/api/assessment/questions/route";
import {GET as session} from "@/app/api/assessment/sessions/[sessionId]/route";
import {GET as history} from "@/app/api/assessment/history/route";
import {POST as start} from "@/app/api/assessment/sessions/route";
import {PUT as save} from "@/app/api/assessment/sessions/[sessionId]/answers/route";
import {POST as submit} from "@/app/api/assessment/sessions/[sessionId]/submit/route";
import {AssessmentError} from "@/lib/assessment/errors";
const origin="http://localhost:3000", id="00000000-0000-4000-8000-000000000001";
const context={params:Promise.resolve({sessionId:id})};
const request=(method="GET",body?:unknown,from=origin)=>new Request(`${origin}/api/assessment/questions`,{method,headers:{origin:from,"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
const handlers=[()=>quota(),()=>questions(request()),()=>session(request(),context),()=>history(),()=>start(request("POST",{processingConsent:true})),()=>save(request("PUT",{}),context),()=>submit(request("POST"),context)];
beforeEach(()=>{
  vi.resetAllMocks();process.env.SITE_URL=origin;
  mocks.getUser.mockResolvedValue({data:{user:{id,email_confirmed_at:"2026-10-23"}},error:null});
  mocks.findUnique.mockResolvedValue({id,role:"PARTICIPANT",isActive:true});
  mocks.startAssessmentSession.mockResolvedValue({assessmentSessionId:id,resumed:false});
});
it.each(handlers.map((fn,index)=>({fn,index})))("endpoint $index rejects unverified identities",async({fn})=>{
  mocks.getUser.mockResolvedValue({data:{user:null},error:new Error("invalid")});const response=await fn();expect(response.status).toBe(401);expect(response.headers.get("cache-control")).toContain("no-store");
});
it.each(handlers.map((fn,index)=>({fn,index})))("endpoint $index rejects psychologist access",async({fn})=>{
  mocks.findUnique.mockResolvedValue({id,role:"PSYCHOLOGIST",isActive:true});expect((await fn()).status).toBe(403);
});
it("derives the actor from Supabase and rejects forged start fields",async()=>{
  expect((await start(request("POST",{processingConsent:true,userId:"forged",role:"PARTICIPANT"}))).status).toBe(422);
  expect((await start(request("POST",{processingConsent:true}))).status).toBe(201);expect(mocks.startAssessmentSession).toHaveBeenCalledWith(id,true);
});
it("requires consent and same origin on mutations",async()=>{
  expect((await start(request("POST",{processingConsent:false}))).status).toBe(422);
  expect((await start(request("POST",{processingConsent:true},"https://evil.test"))).status).toBe(403);
  expect((await save(request("PUT",{},"https://evil.test"),context)).status).toBe(403);
  expect((await submit(request("POST",undefined,"https://evil.test"),context)).status).toBe(403);
});
it("validates IDs, query filters and malformed JSON",async()=>{
  expect((await session(request(),{params:Promise.resolve({sessionId:"not-uuid"})})).status).toBe(422);
  expect((await questions(new Request(`${origin}/api/assessment/questions?instrument=INVALID`))).status).toBe(422);
  expect((await start(new Request(`${origin}/api/assessment/sessions`,{method:"POST",headers:{origin,"content-type":"application/json"},body:"{"}))).status).toBe(422);
});
it("preserves safe domain errors without exposing database details",async()=>{
  mocks.getQuota.mockRejectedValue(new Error("password and private connection string"));let response=await quota();expect(response.status).toBe(503);expect(await response.text()).not.toContain("password");
  mocks.getSession.mockRejectedValue(new AssessmentError("RESOURCE_NOT_FOUND","Tidak ditemukan",404));response=await session(request(),context);expect(response.status).toBe(404);
});
it("requires a reviewed revision and rejects client-supplied scores at submission",async()=>{
  expect((await submit(request("POST",{}),context)).status).toBe(422);
  expect((await submit(request("POST",{expectedRevision:4,scores:{wemwbs:70}}),context)).status).toBe(422);
  expect(mocks.submitAssessment).not.toHaveBeenCalled();
  expect((await submit(request("POST",{expectedRevision:4}),context)).status).toBe(200);
  expect(mocks.submitAssessment).toHaveBeenCalledWith(id,id,{expectedRevision:4});
});
it.each(["SUPERADMIN","INACTIVE"])("all assessment endpoints reject %s",async role=>{
  mocks.findUnique.mockResolvedValue({id,role:role==="INACTIVE"?"PARTICIPANT":role,isActive:role!=="INACTIVE"});
  for(const fn of handlers) expect((await fn()).status).toBe(403);
});
