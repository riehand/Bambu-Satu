import {beforeAll,afterAll,afterEach,it,expect,vi} from "vitest";
import {Prisma,PrismaClient} from "@prisma/client";
import {createHmac,createHash,randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {fixtureId,syntheticQuestionSet} from "../fixtures/assessment";
const authMock=vi.hoisted(()=>({id:"",confirmed:true}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:authMock.id,email_confirmed_at:authMock.confirmed?"2026-01-01":null}},error:null})}})}));
import {installLocalRuntime,withVerifiedDatabaseRequest,databaseTransaction,disconnectLocalRuntime} from "@/lib/dal/context";
import {prisma} from "@/lib/prisma";
import {getCurrentProfile} from "@/lib/auth/session";
import {startAssessmentSession,saveAnswers,submitAssessment,getAssessmentHistory,getSession} from "@/lib/assessment/service";
import {createAppointment,grantStandaloneConsent,grantAppointmentConsent,revokeConsent,listOwnConsents,authorizeReportGrant} from "@/lib/appointments/service";
import {transitionConsultation,listConsultations} from "@/lib/consultations/service";
import {sendChatMessage,listChatMessages} from "@/lib/consultations/chat-service";
import {getPsychologistProfile,setDailyAvailability} from "@/lib/psychologist/service";
import {adminRestrictedOverview,adminOverview} from "@/lib/admin/service";
import {POST as bookingPost} from "@/app/api/appointments/route";
import {POST as assessmentPost} from "@/app/api/assessment/sessions/route";
import {GET as chatGet,POST as chatPost} from "@/app/api/consultations/[appointmentId]/messages/route";
const owner=new PrismaClient({log:[]}),p=fixtureId(13000),other=fixtureId(13001),psy=fixtureId(9710),admin=fixtureId(9750);
const participant={id:p,role:"PARTICIPANT" as const},psychologist={id:psy,role:"PSYCHOLOGIST" as const};
const as=<T>(id:string,work:()=>Promise<T>)=>withVerifiedDatabaseRequest({getUser:async()=>({data:{user:{id,email_confirmed_at:"2026-01-01"}},error:null})},work);
let assessment:string,report:string,seq=0,signerFails=false;
async function slot(){return owner.psychologistAvailability.create({data:{psychologistId:psy,availabilityDate:new Date(Date.UTC(2042,0,++seq)),sessionType:"AFTERNOON",status:"AVAILABLE"}});}
const command=(id:string)=>({psychologistId:psy,assessmentSessionId:assessment,reportId:report,availabilityId:id,reportConsent:true});
async function windowFixture(){
 const s=await slot();await owner.psychologistAvailability.update({where:{id:s.id},data:{status:"BOOKED"}});
 const scheduledStartAt=new Date(Date.now()-60000),scheduledEndAt=new Date(scheduledStartAt.getTime()+7200000);
 return owner.appointment.create({data:{participantId:p,psychologistId:psy,assessmentSessionId:assessment,reportId:report,availabilityId:s.id,scheduledStartAt,scheduledEndAt,consultationSession:{create:{scheduledStartAt,scheduledEndAt}}},include:{consultationSession:true}});
}
async function opened(){const a=await windowFixture();await as(p,()=>transitionConsultation(participant,a.id,"participant-check-in"));await as(psy,()=>transitionConsultation(psychologist,a.id,"psychologist-check-in"));await as(psy,()=>transitionConsultation(psychologist,a.id,"start"));return a;}
const request=(path:string,body:unknown,origin="http://localhost:3000")=>new Request(`http://localhost:3000${path}`,{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
beforeAll(async()=>{
 const [marker]=await owner.$queryRaw<Array<{token:string}>>`SELECT token FROM rehearsal.identity`;expect(marker.token).toBe(process.env.PHASE3_REHEARSAL_TOKEN);
 const [key]=await owner.$queryRaw<Array<{secret:Uint8Array}>>`SELECT secret FROM wb_guard.signing_key`;
 const url=new URL(process.env.DATABASE_URL!);url.username="website_runtime";url.searchParams.set("connection_limit","2");
 await installLocalRuntime(url.href,marker.token,async payload=>{if(signerFails)throw new Error("synthetic unavailable signer");return createHmac("sha256",Buffer.from(key.secret)).update(payload).digest("hex");});
 for(const [i,id] of [p,other,fixtureId(13002)].entries())await owner.$executeRaw`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(${id}::uuid,${`dal${i}@example.test`},${JSON.stringify({full_name:`Synthetic DAL ${i}`,phone_number:"08000000000",institutional_id:`DAL1300${i}`,user_type:"STUDENT"})}::jsonb)`;
 const {questions,...set}=syntheticQuestionSet(),id=randomUUID();
 await owner.assessmentQuestionSet.create({data:{...set,id,version:`SYNTHETIC-DAL-${id}`,createdAt:new Date(),isPublished:false,dassOptions:set.dassOptions as Prisma.InputJsonValue,wemwbsOptions:set.wemwbsOptions as Prisma.InputJsonValue}});
 await owner.question.createMany({data:questions.map(q=>({...q,id:randomUUID(),questionSetId:id}))});await owner.assessmentQuestionSet.update({where:{id},data:{isPublished:true}});
 process.env.SITE_URL="http://localhost:3000";
});
afterEach(async()=>{for(const c of await owner.consent.findMany({where:{participantId:p,revokedAt:null,expiredAt:null}}))await as(p,()=>revokeConsent(p,c.id));});
afterAll(async()=>{await disconnectLocalRuntime();await owner.$disconnect();});
it("actual profile service observes verified identity and authoritative active role",async()=>{
 authMock.id=p;expect(await as(p,()=>getCurrentProfile())).toMatchObject({id:p,role:"PARTICIPANT",isActive:true});
 // The profile entrypoint now establishes its own freshly verified boundary.
 expect(await getCurrentProfile()).toMatchObject({id:p,role:"PARTICIPANT"});
 authMock.confirmed=false;await expect(getCurrentProfile()).rejects.toThrow();authMock.confirmed=true;
 await owner.user.update({where:{id:p},data:{isActive:false}});try{await expect(as(p,()=>getCurrentProfile())).rejects.toThrow();}finally{await owner.user.update({where:{id:p},data:{isActive:true}});}
});
it("actual assessment start/save/submit/history uses trusted scoring and PENDING report",async()=>{
 const started=await as(p,()=>startAssessmentSession(p,true));assessment=started.assessmentSessionId;
 const s=await owner.assessmentSession.findUniqueOrThrow({where:{id:assessment}});const qs=await owner.question.findMany({where:{questionSetId:s.questionSetId}});
 expect(await as(p,()=>saveAnswers(assessment,p,{expectedRevision:0,answers:qs.map(q=>({questionId:q.id,answerValue:q.instrument==="DASS21"?1:3}))}))).toMatchObject({saved:35,revision:1});
 await expect(as(p,()=>submitAssessment(assessment,p,{expectedRevision:0}))).rejects.toThrow();
 const result=await as(p,()=>submitAssessment(assessment,p,{expectedRevision:1}));report=result.reportId;
 expect(result).toMatchObject({status:"COMPLETED",scores:{depression:{score:14},anxiety:{score:14},stress:{score:14},wemwbs:{score:42}}});
 expect(await as(p,()=>submitAssessment(assessment,p,{expectedRevision:0}))).toEqual(result);expect(await as(p,()=>getAssessmentHistory(p))).toHaveLength(1);
 expect(await owner.report.findUnique({where:{id:report}})).toMatchObject({status:"PENDING",filePathOrObjectKey:null});
 await expect(as(other,()=>getSession(assessment,p))).rejects.toThrow();await expect(as(other,()=>startAssessmentSession(p,true))).rejects.toThrow();
 // Owner fixture only; real PDF finalization/Storage is expressly not accepted.
 await owner.report.update({where:{id:report},data:{status:"GENERATED",filePathOrObjectKey:`reports/${report}.pdf`,generatedAt:new Date()}});
});
it("actual psychologist profile and availability services remain scoped",async()=>{
 expect(await as(psy,()=>getPsychologistProfile(psy))).toBeTruthy();
 const rows=await as(psy,()=>setDailyAvailability(psy,"2043-01-01",{sessions:[{sessionType:"MORNING",available:true},{sessionType:"AFTERNOON",available:false},{sessionType:"EVENING",available:false}]}));expect(rows).toHaveLength(3);
 await expect(as(p,()=>setDailyAvailability(psy,"2043-01-02",{sessions:[{sessionType:"MORNING",available:true},{sessionType:"AFTERNOON",available:false},{sessionType:"EVENING",available:false}]}))).rejects.toThrow();
});
it("real booking service preserves DTO and persists atomic gateway rows",async()=>{
 const s=await slot();const result=await as(p,()=>createAppointment(p,command(s.id)));expect(result).toMatchObject({status:"CONFIRMED",psychologist:{id:psy},sessionType:"AFTERNOON"});expect(result.scheduledStartAt).toContain("T06:00:00.000Z");
 const a=await owner.appointment.findUniqueOrThrow({where:{id:result.appointmentId},include:{consents:{include:{auditEvents:true}},consultationSession:true}});expect(a.consents).toHaveLength(1);expect(a.consents[0].auditEvents).toHaveLength(1);expect(a.consultationSession?.status).toBe("SCHEDULED");
 await expect(as(other,()=>createAppointment(p,command(s.id)))).rejects.toThrow();
});
it("real booking concurrent requests and outer rollback leave no partial writes",async()=>{
 const s=await slot();const results=await Promise.allSettled([as(p,()=>createAppointment(p,command(s.id))),as(p,()=>createAppointment(p,command(s.id)))]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 const next=await slot();await expect(as(p,()=>databaseTransaction(async()=>{await createAppointment(p,command(next.id));throw new Error("ROLLBACK");}))).rejects.toThrow("ROLLBACK");expect(await owner.appointment.count({where:{availabilityId:next.id}})).toBe(0);expect((await owner.psychologistAvailability.findUniqueOrThrow({where:{id:next.id}})).status).toBe("AVAILABLE");
});
it("real consent grant/revoke/regrant and report authorization preserve history",async()=>{
 const input={assessmentSessionId:assessment,reportId:report,psychologistId:psy,consent:true};const first=await as(p,()=>grantStandaloneConsent(p,input));expect(await as(psy,()=>authorizeReportGrant(psy,report))).toMatchObject({consentId:first.consentId});
 const revoked=await as(p,()=>revokeConsent(p,first.consentId));expect(await as(p,()=>revokeConsent(p,first.consentId))).toEqual(revoked);await expect(as(psy,()=>authorizeReportGrant(psy,report))).rejects.toThrow();
 const next=await as(p,()=>grantStandaloneConsent(p,input));expect(next.consentId).not.toBe(first.consentId);expect(await as(p,()=>listOwnConsents(p))).toEqual(expect.arrayContaining([expect.objectContaining({consentId:first.consentId,active:false}),expect.objectContaining({consentId:next.consentId,active:true})]));
});
it("actual lifecycle check-ins/start/end and appointment consent expire atomically",async()=>{
 const a=await windowFixture();const consent=await as(p,()=>grantAppointmentConsent(p,a.id,true));await expect(as(psy,()=>transitionConsultation(psychologist,a.id,"start"))).rejects.toThrow();
 const check=await as(p,()=>transitionConsultation(participant,a.id,"participant-check-in"));expect((await as(p,()=>transitionConsultation(participant,a.id,"participant-check-in"))).participantCheckedInAt).toBe(check.participantCheckedInAt);
 await as(psy,()=>transitionConsultation(psychologist,a.id,"psychologist-check-in"));const results=await Promise.allSettled([as(psy,()=>transitionConsultation(psychologist,a.id,"start")),as(psy,()=>transitionConsultation(psychologist,a.id,"start"))]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 expect((await as(p,()=>listConsultations(participant))).items.some(i=>i.appointmentId===a.id)).toBe(true);
 const ended=await as(psy,()=>transitionConsultation(psychologist,a.id,"end"));expect(ended).toMatchObject({appointmentStatus:"COMPLETED",sessionStatus:"COMPLETED"});expect((await as(psy,()=>transitionConsultation(psychologist,a.id,"end"))).endedAt).toBe(ended.endedAt);expect((await owner.consent.findUniqueOrThrow({where:{id:consent.consentId}})).expiredAt).not.toBeNull();
});
it("actual chat send/retrieve preserve contract, pagination, retry and privacy",async()=>{
 const a=await opened(),c={clientMessageId:randomUUID(),body:"  synthetic chat  "};const first=await as(p,()=>sendChatMessage(participant,a.id,c));expect(first.message).toMatchObject({own:true,senderRole:"PARTICIPANT",body:"synthetic chat"});expect((await as(p,()=>sendChatMessage(participant,a.id,c))).message.id).toBe(first.message.id);
 await expect(as(p,()=>sendChatMessage(participant,a.id,{...c,body:"conflict"}))).rejects.toThrow();await as(psy,()=>sendChatMessage(psychologist,a.id,{clientMessageId:randomUUID(),body:"reply"}));
 const page=await as(p,()=>listChatMessages(participant,a.id,{limit:1}));expect(page.items).toHaveLength(1);expect(page.items[0].own).toBe(false);expect(page.nextCursor).toBeTruthy();const previous=await as(p,()=>listChatMessages(participant,a.id,{limit:1,before:page.nextCursor!}));expect(previous.items[0].id).toBe(first.message.id);
 await expect(as(other,()=>listChatMessages(participant,a.id,{limit:10}))).rejects.toThrow();await expect(as(p,()=>databaseTransaction(()=>sendChatMessage(participant,a.id,c)))).rejects.toThrow();
 await as(psy,()=>transitionConsultation(psychologist,a.id,"end"));await expect(as(p,()=>listChatMessages(participant,a.id,{limit:10}))).rejects.toThrow();
});
it("actual restricted admin service counts without clinical access or fabricated full dashboard",async()=>{
 const query={from:"2026-01-01",to:"2026-03-31"};const result=await as(admin,()=>adminRestrictedOverview(admin,query));expect(result.activeParticipants).toBe(await owner.user.count({where:{role:"PARTICIPANT",isActive:true}}));expect(result.clinicalIndicatorsEnabled).toBe(false);
 await expect(as(admin,()=>adminOverview(admin,query))).rejects.toMatchObject({code:"ADMIN_UNAVAILABLE"});await expect(as(p,()=>adminRestrictedOverview(admin,query))).rejects.toThrow();
 expect(await as(admin,()=>prisma.report.count())).toBe(0);
});
it("real API booking/assessment handlers verify Auth, origin and private responses",async()=>{
 authMock.id=p;const s=await slot();expect((await bookingPost(request("/api/appointments",command(s.id),"https://untrusted.test"))).status).toBe(403);
 const response=await bookingPost(request("/api/appointments",command(s.id)));expect(response.status).toBe(201);expect(response.headers.get("cache-control")).toContain("no-store");expect(await response.json()).toMatchObject({success:true,data:{status:"CONFIRMED"}});
 authMock.id=fixtureId(13002);const started=await assessmentPost(request("/api/assessment/sessions",{processingConsent:true}));expect(started.status).toBe(201);
 authMock.confirmed=false;try{expect((await assessmentPost(request("/api/assessment/sessions",{processingConsent:true}))).status).not.toBe(201);}finally{authMock.confirmed=true;}
});
it("real chat API handlers invoke the nonprivileged service and preserve response shape",async()=>{
 const a=await opened();authMock.id=p;const context={params:Promise.resolve({appointmentId:a.id})};
 const response=await chatPost(request(`/api/consultations/${a.id}/messages`,{clientMessageId:randomUUID(),body:"api synthetic"}),context);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({success:true,data:{message:{body:"api synthetic",own:true},replayed:false}});
 const page=await chatGet(new Request(`http://localhost:3000/api/consultations/${a.id}/messages`),context);expect(page.status).toBe(200);expect((await page.json()).data.items).toHaveLength(1);
});
it("missing context and unavailable signer cannot fall back to privileged singleton",async()=>{
 await expect(prisma.user.count()).rejects.toThrow("VERIFIED_REQUEST_REQUIRED");signerFails=true;try{await expect(as(p,()=>getAssessmentHistory(p))).rejects.toThrow("SIGNER_UNAVAILABLE");}finally{signerFails=false;}
 const [role]=await as(p,()=>prisma.$queryRaw<Array<{role:string}>>`SELECT session_user AS role`);expect(role.role).toBe("website_runtime");
});
it("global imported client and nested service transactions use the same backend transaction",async()=>{
 await as(p,()=>databaseTransaction(async tx=>{
  const [a]=await tx.$queryRaw<Array<{id:string}>>`SELECT pg_current_xact_id()::text AS id`;
  const [b]=await prisma.$queryRaw<Array<{id:string}>>`SELECT pg_current_xact_id()::text AS id`;expect(b.id).toBe(a.id);
  await prisma.$transaction(async nested=>{const [c]=await nested.$queryRaw<Array<{id:string}>>`SELECT pg_current_xact_id()::text AS id`;expect(c.id).toBe(a.id);await getAssessmentHistory(p);});
 }));
});
it("pool reuse, reconnect and rollback do not leak identity",async()=>{
 const results=await Promise.all(Array.from({length:12},(_,i)=>as(i%2?p:other,async()=>{const [r]=await prisma.$queryRaw<Array<{id:string}>>`SELECT wb_guard.subject() AS id`;return {id:r.id,expected:i%2?p:other};})));for(const r of results)expect(r.id).toBe(r.expected);
 await expect(as(p,()=>databaseTransaction(async()=>{throw new Error("ROLLBACK");}))).rejects.toThrow();await disconnectLocalRuntime();await expect(prisma.user.count()).rejects.toThrow();expect(await as(p,()=>getAssessmentHistory(p))).toHaveLength(1);
});
it("runtime cannot assume owners, mutate reports, access Flutter or migration ledgers",async()=>{
 for(const sql of ["SET ROLE wb_booking","SET ROLE website_deployer","SELECT * FROM chatbot.messages","SELECT * FROM public._prisma_migrations","UPDATE public.reports SET status='GENERATED' WHERE false","INSERT INTO public.appointments(id) VALUES(gen_random_uuid())"]){await expect(as(p,()=>prisma.$queryRawUnsafe(sql))).rejects.toThrow();}
 const rows=await owner.$queryRaw<Array<{migration_name:string;checksum:string}>>`SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;expect(rows).toHaveLength(8);for(const r of rows)expect(r.checksum).toBe(createHash("sha256").update(readFileSync(`prisma/migrations/${r.migration_name}/migration.sql`)).digest("hex"));
});
it("actual consent listing reconciles elapsed deadline with one expiry audit",async()=>{
 const a=await windowFixture(),c=await as(p,()=>grantAppointmentConsent(p,a.id,true));const end=new Date(Date.now()+100),start=new Date(end.getTime()-7200000);
 await owner.appointment.update({where:{id:a.id},data:{scheduledStartAt:start,scheduledEndAt:end}});await owner.consultationSession.update({where:{appointmentId:a.id},data:{scheduledStartAt:start,scheduledEndAt:end}});await new Promise(r=>setTimeout(r,150));
 expect(await as(p,()=>listOwnConsents(p))).toEqual(expect.arrayContaining([expect.objectContaining({consentId:c.consentId,active:false,expiredAt:expect.any(String)})]));await as(p,()=>listOwnConsents(p));expect(await owner.consentAuditEvent.count({where:{consentId:c.consentId,action:"EXPIRED"}})).toBe(1);
});
it("actual chat service rejects a deferred COMMIT rollback without acknowledging insertion",async()=>{
 const a=await opened();const end=new Date(Date.now()+900),start=new Date(end.getTime()-7200000);
 await owner.appointment.update({where:{id:a.id},data:{scheduledStartAt:start,scheduledEndAt:end}});await owner.consultationSession.update({where:{appointmentId:a.id},data:{scheduledStartAt:start,scheduledEndAt:end}});
 await owner.$executeRawUnsafe("CREATE FUNCTION rehearsal.pause_e_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1.3); RETURN NEW; END $$");await owner.$executeRawUnsafe("CREATE TRIGGER pause_e_message AFTER INSERT ON public.consultation_messages FOR EACH ROW EXECUTE FUNCTION rehearsal.pause_e_message()");
 try{await expect(as(p,()=>sendChatMessage(participant,a.id,{clientMessageId:randomUUID(),body:"must not acknowledge"}))).rejects.toMatchObject({code:"CHAT_SEND_FAILED"});}finally{await owner.$executeRawUnsafe("DROP TRIGGER pause_e_message ON public.consultation_messages");await owner.$executeRawUnsafe("DROP FUNCTION rehearsal.pause_e_message()");}
 expect(await owner.consultationMessage.count({where:{consultationSessionId:a.consultationSession!.id}})).toBe(0);
});
it("actual lifecycle completion wins a lock race against actual send service",async()=>{
 const a=await opened();let release!:()=>void,locked!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{locked=r;});
 const closing=as(psy,()=>databaseTransaction(async()=>{await transitionConsultation(psychologist,a.id,"end");locked();await gate;}));await ready;
 const sending=expect(as(p,()=>sendChatMessage(participant,a.id,{clientMessageId:randomUUID(),body:"queued"}))).rejects.toThrow();
 try{let observed=false;for(let i=0;i<100;i++){const [row]=await owner.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM pg_stat_activity WHERE usename='website_runtime' AND wait_event_type='Lock'`;if(Number(row.n)>0){observed=true;break;}await new Promise(r=>setTimeout(r,25));}expect(observed).toBe(true);}finally{release();await closing;}
 await sending;expect(await owner.consultationMessage.count({where:{consultationSessionId:a.consultationSession!.id}})).toBe(0);
});
it("a signed token captured from an earlier transaction cannot be replayed",async()=>{
 const [old]=await as(p,()=>prisma.$queryRaw<Array<{claim:string;mac:string}>>`SELECT current_setting('wellbeing.claim') AS claim,current_setting('wellbeing.mac') AS mac`);
 await expect(as(p,()=>databaseTransaction(async tx=>{await tx.$queryRaw`SELECT set_config('wellbeing.claim',${old.claim},true),set_config('wellbeing.mac',${old.mac},true)`;await tx.$queryRaw`SELECT wb_guard.subject()`;}))).rejects.toThrow();
 const [fresh]=await as(other,()=>prisma.$queryRaw<Array<{id:string}>>`SELECT wb_guard.subject() AS id`);expect(fresh.id).toBe(other);
});

import {PUT as answersPut} from "@/app/api/assessment/sessions/[sessionId]/answers/route";
import {POST as submitPost} from "@/app/api/assessment/sessions/[sessionId]/submit/route";
import {POST as consentPost} from "@/app/api/consents/psychologist-report/route";
import {POST as revokePost} from "@/app/api/consents/[consentId]/revoke/route";
import {POST as lifecyclePost} from "@/app/api/consultations/[appointmentId]/[action]/route";
it("actual answer and submit API handlers complete trusted assessment scoring",async()=>{
 const id=fixtureId(13002);authMock.id=id;const started=await as(id,()=>startAssessmentSession(id,true)),sessionId=started.assessmentSessionId;
 const session=await owner.assessmentSession.findUniqueOrThrow({where:{id:sessionId}}),questions=await owner.question.findMany({where:{questionSetId:session.questionSetId}}),context={params:Promise.resolve({sessionId})};
 const saved=await answersPut(new Request(request(`/api/assessment/sessions/${sessionId}/answers`,{expectedRevision:0,answers:questions.map(q=>({questionId:q.id,answerValue:q.instrument==="DASS21"?0:1}))}),{method:"PUT"}),context);expect(saved.status).toBe(200);
 const submitted=await submitPost(request(`/api/assessment/sessions/${sessionId}/submit`,{expectedRevision:1}),context);expect(submitted.status).toBe(200);expect(await submitted.json()).toMatchObject({success:true,data:{status:"COMPLETED",scores:{depression:{score:0},wemwbs:{score:14}}}});
});
it("actual consent API creates and revokes the grant with private responses",async()=>{
 authMock.id=p;const granted=await consentPost(request("/api/consents/psychologist-report",{assessmentSessionId:assessment,reportId:report,psychologistId:psy,consent:true}));expect(granted.status).toBe(201);const id=(await granted.json()).data.consentId;
 const revoked=await revokePost(request(`/api/consents/${id}/revoke`,{}),{params:Promise.resolve({consentId:id})});expect(revoked.status).toBe(200);expect(revoked.headers.get("cache-control")).toContain("no-store");expect((await owner.consent.findUniqueOrThrow({where:{id}})).revokedAt).not.toBeNull();
});
it("actual lifecycle API checks assignment and role before changing persisted state",async()=>{
 const a=await windowFixture();authMock.id=other;expect((await lifecyclePost(request("/api/consultations/check-in",{}),{params:Promise.resolve({appointmentId:a.id,action:"participant-check-in"})})).status).toBe(403);
 authMock.id=p;const response=await lifecyclePost(request("/api/consultations/check-in",{}),{params:Promise.resolve({appointmentId:a.id,action:"participant-check-in"})});expect(response.status).toBe(200);expect(await response.json()).toMatchObject({success:true,data:{appointmentId:a.id,participantCheckedInAt:expect.any(String)}});
});
