import { afterAll,beforeAll,expect,it,vi } from "vitest";
import { Prisma,PrismaClient } from "@prisma/client";
import { createHash,randomUUID } from "node:crypto";
import { readFileSync,appendFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureId,syntheticQuestionSet } from "../fixtures/assessment";
vi.mock("@/lib/prisma",async()=>({prisma:(await import("./stage3e1b-context")).scopedPrisma}));
vi.mock("@/lib/reports/storage",async importOriginal=>{
  const actual=await importOriginal<typeof import("@/lib/reports/storage")>();
  return {...actual,downloadReportObject:vi.fn(async()=>{throw new actual.ReportStorageError("unavailable");}),uploadReportObject:vi.fn(async()=>{throw new Error("Unexpected upload");})};
});
import { generateReportForParticipant } from "@/lib/reports/service";
import { uploadReportObject } from "@/lib/reports/storage";
import { provisionSyntheticSigner,withVerifiedAuth,signedTransaction,scopedPrisma,runtimeConnection } from "./stage3e1b-context";
import { startAssessmentSession,saveAnswers,getAssessmentHistory } from "@/lib/assessment/service";
import { calculateDass21 } from "@/lib/assessment/scoring/dass21";
import { calculateWemwbs } from "@/lib/assessment/scoring/wemwbs";
import { adminRestrictedOverview } from "@/lib/admin/service";
import { submitTrustedAssessment } from "./stage3e1c-services";
const owner=new PrismaClient({log:[]});
const participant=(n:number)=>fixtureId(12000+n),psy=fixtureId(9710),otherPsy=fixtureId(9711),admin=fixtureId(9750);
const as=<T>(id:string,work:()=>Promise<T>,purpose:"interactive"|"report-finalize"="interactive")=>withVerifiedAuth({getUser:async()=>({data:{user:{id,email_confirmed_at:"2026-01-01"}},error:null})},work,purpose);
const evidence=(check:string)=>appendFileSync(join(process.env.PHASE3_EVIDENCE_DIR!,"stage3e1c-checks.jsonl"),JSON.stringify({check})+"\n");
const denied={code:"P2010",meta:{code:"42501"}};
let completedId:string;
async function prepared(n:number,subtotal=7) {
  const id=participant(n);
  const started=await as(id,()=>startAssessmentSession(id,true));
  const session=await owner.assessmentSession.findUniqueOrThrow({where:{id:started.assessmentSessionId}});
  const questions=await owner.question.findMany({where:{questionSetId:session.questionSetId},orderBy:{questionNumber:"asc"}});
  const indices:Record<string,number>={};const dass:Record<number,number>={},wem:Record<number,number>={};
  const answers=questions.map(q=>{
    const i=indices[q.scoringDimension]??0;indices[q.scoringDimension]=i+1;
    const value=q.instrument==="DASS21"?Math.max(0,Math.min(3,subtotal-i*3)):(subtotal===21?5:1+subtotal%5);
    (q.instrument==="DASS21"?dass:wem)[q.questionNumber]=value;
    return {questionId:q.id,answerValue:value};
  });
  await as(id,()=>saveAnswers(session.id,id,{expectedRevision:0,answers}));
  return {id,sessionId:session.id,expected:{...calculateDass21(dass),...calculateWemwbs(wem)}};
}
beforeAll(async()=>{
  const [marker]=await owner.$queryRaw<Array<{token:string}>>`SELECT token FROM rehearsal.identity`;
  expect(marker.token).toBe(process.env.PHASE3_REHEARSAL_TOKEN);
  const [key]=await owner.$queryRaw<Array<{secret:Uint8Array}>>`SELECT secret FROM wb_guard.signing_key`;
  provisionSyntheticSigner(Buffer.from(key.secret));
  for(let n=0;n<35;n++) {
    const meta=JSON.stringify({full_name:`Synthetic trusted ${n}`,phone_number:"08000000000",institutional_id:`TRUST${n}`,user_type:"STUDENT"});
    await owner.$executeRaw`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(${participant(n)}::uuid,${`trust${n}@example.test`},${meta}::jsonb)`;
  }
});
afterAll(async()=>{await Promise.all([owner.$disconnect(),runtimeConnection.$disconnect()]);});
it("matches existing scoring engines across every DASS subtotal and completes atomic metadata/history",async()=>{
  for(let n=0;n<=21;n++) {
    const p=await prepared(n,n);
    const result=await as(p.id,()=>submitTrustedAssessment({sessionId:p.sessionId,expectedRevision:1}));
    expect(result).toMatchObject({status:"COMPLETED",revision:2,score:p.expected,report:{status:"PENDING"}});
    expect(result.completedAt).not.toBeNull();
    expect(await as(p.id,()=>getAssessmentHistory(p.id))).toHaveLength(1);
    expect(await owner.report.findUnique({where:{assessmentSessionId:p.sessionId}})).toMatchObject({filePathOrObjectKey:null,generatedAt:null});
    completedId=p.sessionId;
  }
  evidence("PASS 22 runtime submissions, DASS 0..42 parity for all 3 dimensions, WEMWBS parity incl 14/70, PENDING metadata and history");
},120000);
it("makes concurrent submissions and lost-response retries idempotent",async()=>{
  const p=await prepared(22);
  const results=await Promise.all([as(p.id,()=>submitTrustedAssessment({sessionId:p.sessionId,expectedRevision:1})),as(p.id,()=>submitTrustedAssessment({sessionId:p.sessionId,expectedRevision:1}))]);
  expect(results[0].report?.id).toBe(results[1].report?.id);
  expect(await owner.assessmentScore.count({where:{assessmentSessionId:p.sessionId}})).toBe(1);
  expect(await owner.report.count({where:{assessmentSessionId:p.sessionId}})).toBe(1);
  expect((await as(p.id,()=>submitTrustedAssessment({sessionId:p.sessionId,expectedRevision:0}))).revision).toBe(2);
  evidence("PASS concurrent duplicate submit produces one score/report; completed retry returns original result");
});
it("rejects stale revisions and rolls back a fully executed gateway on injected fault",async()=>{
  const p=await prepared(23);
  await expect(as(p.id,()=>submitTrustedAssessment({sessionId:p.sessionId,expectedRevision:0}))).rejects.toThrow("STALE_REVISION");
  await expect(as(p.id,()=>signedTransaction(async tx=>{
    await tx.$queryRaw`SELECT wb_guard.submit_assessment(${p.sessionId}::uuid,1)`;
    throw new Error("INJECTED_AFTER_FINAL_WRITE");
  }))).rejects.toThrow("INJECTED_AFTER_FINAL_WRITE");
  expect(await owner.assessmentSession.findUnique({where:{id:p.sessionId}})).toMatchObject({status:"IN_PROGRESS",revision:1});
  expect(await owner.assessmentScore.count({where:{assessmentSessionId:p.sessionId}})).toBe(0);
  expect(await owner.report.count({where:{assessmentSessionId:p.sessionId}})).toBe(0);
  expect((await as(p.id,()=>submitTrustedAssessment({sessionId:p.sessionId,expectedRevision:1}))).status).toBe("COMPLETED");
  evidence("PASS stale revision rejection and full score/report/session rollback; clean retry succeeds");
});
it("rejects arbitrary score totals, role/subject spoofing and unapproved gateway use",async()=>{
  for(const id of [participant(1),psy,admin])await expect(as(id,()=>signedTransaction(tx=>tx.$queryRaw`SELECT wb_guard.submit_assessment(${completedId}::uuid,1)`))).rejects.toMatchObject(denied);
  await expect(as(participant(21),()=>submitTrustedAssessment({sessionId:completedId,expectedRevision:1,depressionScore:0}))).rejects.toThrow();
  await expect(as(participant(21),()=>signedTransaction(tx=>tx.$queryRawUnsafe("SELECT wb_guard.submit_assessment($1::uuid,1,0,0,0,14)",completedId)))).rejects.toMatchObject({code:"P2010",meta:{code:"42883"}});
  for(const sql of ["INSERT INTO public.assessment_scores(id) VALUES(gen_random_uuid())","UPDATE public.assessment_scores SET depression_score=0 WHERE false","SET ROLE wb_score_gateway","SET ROLE wb_display_projection"]) {
    await expect(as(participant(21),()=>signedTransaction(tx=>tx.$executeRawUnsafe(sql)))).rejects.toMatchObject(denied);
  }
  await expect(as(participant(21),()=>signedTransaction(tx=>tx.$queryRaw`SELECT wb_guard.submit_assessment(${completedId}::uuid,1)`),"report-finalize")).rejects.toMatchObject(denied);
  await expect(as(participant(21),()=>signedTransaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('wellbeing.claim','{"sub":"forged","purpose":"interactive"}',true)`;
    return tx.$queryRaw`SELECT wb_guard.submit_assessment(${completedId}::uuid,1)`;
  }))).rejects.toMatchObject(denied);
  await expect(runtimeConnection.$queryRaw`SELECT wb_guard.submit_assessment(${completedId}::uuid,1)`).rejects.toMatchObject(denied);
  evidence("PASS totals arguments rejected, direct score writes denied, wrong role/subject/purpose and forged claim denied");
});
it("protects completed answers and score/report association from direct writes",async()=>{
  const before=await owner.assessmentAnswer.findMany({where:{assessmentSessionId:completedId},orderBy:{id:"asc"}});
  expect(await as(participant(21),()=>signedTransaction(tx=>tx.$executeRaw`UPDATE public.assessment_answers SET answer_value=0 WHERE assessment_session_id=${completedId}::uuid`))).toBe(0);
  expect(await owner.assessmentAnswer.findMany({where:{assessmentSessionId:completedId},orderBy:{id:"asc"}})).toEqual(before);
  await expect(as(participant(21),()=>signedTransaction(tx=>tx.$executeRaw`INSERT INTO public.reports(id,assessment_session_id,status,updated_at) VALUES(${randomUUID()}::uuid,${completedId}::uuid,'PENDING',clock_timestamp())`))).rejects.toMatchObject(denied);
  expect(await as(participant(1),()=>scopedPrisma.assessmentScore.findMany({where:{assessmentSessionId:completedId}}))).toEqual([]);
  evidence("PASS immutable completed answers; direct report INSERT and cross-owner clinical read denied");
});
it("keeps GENERATED/fake keys blocked even with a correctly signed report-finalize purpose",async()=>{
  const report=await owner.report.findUniqueOrThrow({where:{assessmentSessionId:completedId}});
  for(const purpose of ["interactive","report-finalize"] as const) {
    await expect(as(participant(21),()=>signedTransaction(tx=>tx.$executeRaw`UPDATE public.reports SET status='GENERATED',file_path_or_object_key='reports/fake.pdf',generated_at=clock_timestamp() WHERE id=${report.id}::uuid`),purpose)).rejects.toMatchObject(denied);
    await expect(as(participant(21),()=>signedTransaction(tx=>tx.$queryRaw`SELECT wb_guard.finalize_report(${report.id}::uuid,'reports/fake.pdf')`),purpose)).rejects.toMatchObject(denied);
  }
  await expect(as(participant(21),()=>signedTransaction(tx=>tx.$executeRaw`UPDATE public.reports SET assessment_session_id=${randomUUID()}::uuid WHERE id=${report.id}::uuid`))).rejects.toMatchObject(denied);
  const attempts=await Promise.allSettled(Array.from({length:2},()=>as(participant(21),()=>signedTransaction(tx=>tx.$queryRaw`SELECT wb_guard.finalize_report(${report.id}::uuid,'reports/fake.pdf')`))));
  expect(attempts.every(r=>r.status==="rejected")).toBe(true);
  expect(await owner.report.findUnique({where:{id:report.id}})).toMatchObject({status:"PENDING",filePathOrObjectKey:null,generatedAt:null});
  evidence("PASS finalization authorization denial/retries/concurrency preserve PENDING; real Storage finalization BLOCKED");
});
it("keeps actual generation service PENDING when isolated Storage is unavailable",async()=>{
  const report=await owner.report.findUniqueOrThrow({where:{assessmentSessionId:completedId}});
  await expect(as(participant(21),()=>generateReportForParticipant(participant(21),report.id))).rejects.toMatchObject({code:"REPORT_ARTIFACT_NOT_READY",status:503});
  await expect(as(participant(21),()=>generateReportForParticipant(participant(21),report.id))).rejects.toMatchObject({code:"REPORT_GENERATION_RATE_LIMITED",status:429});
  expect(uploadReportObject).not.toHaveBeenCalled();
  expect(await owner.report.findUnique({where:{id:report.id}})).toMatchObject({status:"PENDING",filePathOrObjectKey:null,generatedAt:null});
  evidence("PASS actual generation failure/retry feedback preserves PENDING; Storage explicitly mocked unavailable, no fake PDF/attestation");
});
it("returns only approved psychologist directory fields and hides participant/inactive identities",async()=>{
  const read=(id:string)=>as(participant(0),()=>signedTransaction(tx=>tx.$queryRaw<Array<{display:unknown}>>`SELECT wb_guard.psychologist_display(${id}::uuid) AS display`));
  const [row]=await read(psy);expect(row.display).toMatchObject({id:psy,active:true});
  expect(Object.keys(row.display as object).sort()).toEqual(["active","fullName","id"]);
  expect((await read(participant(1)))[0].display).toBeNull();
  await owner.user.update({where:{id:psy},data:{isActive:false}});
  try{expect((await read(psy))[0].display).toBeNull();}finally{await owner.user.update({where:{id:psy},data:{isActive:true}});}
  await expect(as(otherPsy,()=>signedTransaction(tx=>tx.$queryRaw`SELECT wb_guard.psychologist_display(${psy}::uuid)`))).rejects.toMatchObject(denied);
  expect(await as(participant(0),()=>scopedPrisma.user.findUnique({where:{id:psy},select:{id:true,email:true,phoneNumber:true,institutionalId:true}}))).toBeNull();
  evidence("PASS participant directory projection: id/name/active only; raw contact columns still invisible");
});
it("allows both assigned parties to resolve counterpart without exposing unrelated participants",async()=>{
  const a=await owner.appointment.findFirstOrThrow({where:{participantId:fixtureId(9702)}});
  for(const [id,counterpart] of [[a.participantId,a.psychologistId],[a.psychologistId,a.participantId]]) {
    const [row]=await as(id,()=>signedTransaction(tx=>tx.$queryRaw<Array<{display:{counterpart:object}}>>`SELECT wb_guard.assignment_display(${a.id}::uuid) AS display`));
    expect(row.display.counterpart).toMatchObject({id:counterpart,active:true});
    expect(Object.keys(row.display.counterpart).sort()).toEqual(["active","fullName","id"]);
  }
  for(const id of [participant(0),otherPsy]) {
    const [row]=await as(id,()=>signedTransaction(tx=>tx.$queryRaw<Array<{display:unknown}>>`SELECT wb_guard.assignment_display(${a.id}::uuid) AS display`));
    expect(row.display).toBeNull();
  }
  await expect(as(admin,()=>signedTransaction(tx=>tx.$queryRaw`SELECT wb_guard.assignment_display(${a.id}::uuid)`))).rejects.toMatchObject(denied);
  evidence("PASS assigned participant/psychologist projection; outsider participant/wrong psychologist/admin denied");
});
it("integrates the real admin service with restricted aggregates without clinical row grants",async()=>{
  const query={from:"2026-11-01",to:"2026-11-30"};
  const result=await as(admin,()=>adminRestrictedOverview(admin,query));
  expect(result.activeParticipants).toBe(await owner.user.count({where:{role:"PARTICIPANT",isActive:true}}));
  expect(result.clinicalIndicatorsEnabled).toBe(false);
  expect(Object.keys(result).sort()).toEqual(["activeParticipants","activePsychologists","assessmentsStarted","assessmentsCompleted","appointments","clinicalIndicatorsEnabled"].sort());
  for(const id of [participant(0),psy])await expect(as(id,()=>adminRestrictedOverview(id,query))).rejects.toThrow();
  await expect(as(admin,()=>adminRestrictedOverview(admin,{...query,periodId:fixtureId(1)}))).rejects.toMatchObject({code:"FILTER_NOT_SUPPORTED"});
  await expect(as(admin,()=>adminRestrictedOverview(admin,{...query,reportId:randomUUID()} as typeof query))).rejects.toThrow();
  for(const count of [()=>scopedPrisma.assessmentAnswer.count(),()=>scopedPrisma.assessmentScore.count(),()=>scopedPrisma.report.count(),()=>scopedPrisma.consultationMessage.count()])expect(await as(admin,count)).toBe(0);
  await owner.user.update({where:{id:admin},data:{isActive:false}});
  try{await expect(as(admin,()=>adminRestrictedOverview(admin,query))).rejects.toThrow();}finally{await owner.user.update({where:{id:admin},data:{isActive:true}});}
  evidence("PASS current admin service opt-in path consumes DB aggregates; role/inactive/filter/clinical isolation verified");
});
it("rejects draft question association, incomplete input and arbitrary revisions",async()=>{
  const id=participant(24),started=await as(id,()=>startAssessmentSession(id,true));
  const draft=syntheticQuestionSet(),setId=randomUUID(),questionId=randomUUID();
  const {questions,...fields}=draft;
  await owner.assessmentQuestionSet.create({data:{...fields,dassOptions:fields.dassOptions as Prisma.InputJsonValue,wemwbsOptions:fields.wemwbsOptions as Prisma.InputJsonValue,id:setId,version:`SYNTHETIC-DRAFT-${setId}`,isPublished:false}});
  await owner.question.create({data:{...questions[0],id:questionId,questionSetId:setId}});
  await expect(as(id,()=>signedTransaction(tx=>tx.$executeRaw`INSERT INTO public.assessment_answers(id,assessment_session_id,question_id,answer_value,updated_at) VALUES(${randomUUID()}::uuid,${started.assessmentSessionId}::uuid,${questionId}::uuid,3,clock_timestamp())`))).rejects.toMatchObject(denied);
  await expect(as(id,()=>submitTrustedAssessment({sessionId:started.assessmentSessionId,expectedRevision:0}))).rejects.toThrow("Incomplete or invalid answers");
  await expect(as(id,()=>signedTransaction(tx=>tx.$queryRaw`SELECT wb_guard.submit_assessment(${started.assessmentSessionId}::uuid,NULL)`))).rejects.toMatchObject({code:"P2010",meta:{code:"22023"}});
  expect(await owner.assessmentAnswer.count({where:{assessmentSessionId:started.assessmentSessionId}})).toBe(0);
  evidence("PASS draft/wrong question association refused by restrictive policy; incomplete answers/null revision refused");
});
it("rejects a published but invalid scoring configuration without changing published content",async()=>{
  const draft=syntheticQuestionSet();const setId=randomUUID();
  const {questions,...fields}=draft;
  await owner.assessmentQuestionSet.create({data:{...fields,dassOptions:fields.dassOptions as Prisma.InputJsonValue,wemwbsOptions:fields.wemwbsOptions as Prisma.InputJsonValue,id:setId,version:`SYNTHETIC-INVALID-${setId}`,isPublished:false,dassInstructions:" "}});
  await owner.question.createMany({data:questions.map(q=>({...q,id:randomUUID(),questionSetId:setId}))});
  await owner.assessmentQuestionSet.update({where:{id:setId},data:{isPublished:true}});
  const period=await owner.academicPeriod.findFirstOrThrow({where:{status:"ACTIVE"}});
  const session=await owner.assessmentSession.create({data:{participantId:participant(30),academicPeriodId:period.id,questionSetId:setId,status:"IN_PROGRESS",processingConsentAt:new Date(),processingConsentVersion:"assessment-processing-id-v1"}});
  await expect(as(participant(30),()=>submitTrustedAssessment({sessionId:session.id,expectedRevision:0}))).rejects.toThrow("Approved content unavailable");
  expect(await owner.assessmentScore.count({where:{assessmentSessionId:session.id}})).toBe(0);
  expect((await owner.assessmentQuestionSet.findUniqueOrThrow({where:{id:setId}})).dassInstructions).toBe(" ");
  evidence("PASS invalid published scoring configuration refused; no silent repair of immutable content");
});
it("verifies helper privilege boundaries and all eight migration hashes",async()=>{
  const rows=await owner.$queryRaw<Array<{migration_name:string;checksum:string}>>`SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  expect(rows).toHaveLength(8);
  for(const row of rows)expect(row.checksum).toBe(createHash("sha256").update(readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`)).digest("hex"));
  const roles=await owner.$queryRaw<Array<{rolname:string;safe:boolean;owned:bigint}>>`SELECT rolname,NOT(rolsuper OR rolbypassrls OR rolcanlogin OR rolcreaterole OR rolcreatedb) AS safe,(SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relowner=r.oid) AS owned FROM pg_roles r WHERE rolname IN ('wb_score_gateway','wb_display_projection')`;
  expect(roles).toHaveLength(2);for(const role of roles){expect(role.safe).toBe(true);expect(role.owned).toBe(BigInt(0));}
  const [priv]=await runtimeConnection.$queryRaw<Array<{score:boolean;finalize:boolean;membership:boolean}>>`SELECT has_table_privilege(current_user,'public.assessment_scores','INSERT') AS score,has_function_privilege(current_user,'wb_guard.finalize_report(uuid,text)','EXECUTE') AS finalize,pg_has_role(current_user,'wb_score_gateway','SET') AS membership`;
  expect(priv).toEqual({score:false,finalize:false,membership:false});
  for(const role of ["anon","authenticated","service_role"]) {
    const [access]=await owner.$queryRaw<Array<{allowed:boolean}>>`SELECT has_function_privilege(${role},'wb_guard.submit_assessment(uuid,integer)','EXECUTE') OR has_function_privilege(${role},'wb_guard.assignment_display(uuid)','EXECUTE') AS allowed`;
    expect(access.allowed).toBe(false);
  }
  const [projection]=await owner.$queryRaw<Array<{private:boolean}>>`SELECT has_column_privilege('wb_display_projection','public.users','email','SELECT') OR has_column_privilege('wb_display_projection','public.users','phone_number','SELECT') OR has_column_privilege('wb_display_projection','public.users','institutional_id','SELECT') AS private`;
  expect(projection.private).toBe(false);
  evidence("PASS 8 checksums; helper owners non-owner/nonlogin/nonbypass; no score INSERT/finalize EXECUTE/role membership");
});

it("keeps definer object resolution fixed and restores runtime identity after calls",async()=>{
  const report=await owner.report.findUniqueOrThrow({where:{assessmentSessionId:completedId}});
  await as(participant(21),()=>signedTransaction(async tx=>{
    await tx.$executeRaw`CREATE TEMP TABLE users(id uuid) ON COMMIT DROP`;
    await tx.$executeRaw`CREATE TEMP TABLE assessment_sessions(id uuid) ON COMMIT DROP`;
    await tx.$executeRaw`SET LOCAL search_path=pg_temp,public`;
    const [row]=await tx.$queryRaw<Array<{id:string}>>`SELECT wb_guard.submit_assessment(${completedId}::uuid,1) AS id`;
    expect(row.id).toBe(report.id);
    const [identity]=await tx.$queryRaw<Array<{actor:string}>>`SELECT current_user AS actor`;
    expect(identity.actor).toBe("website_runtime");
  }));
  await expect(as(participant(21),()=>signedTransaction(tx=>tx.$executeRawUnsafe("CREATE FUNCTION wb_guard.unapproved() RETURNS integer LANGUAGE sql AS 'SELECT 1'")))).rejects.toMatchObject(denied);
  evidence("PASS temporary shadow tables cannot redirect definer; runtime identity restored; schema function creation denied");
});
