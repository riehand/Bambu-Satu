import { beforeAll,afterAll,afterEach,it,expect } from "vitest";
import { Prisma,PrismaClient } from "@prisma/client";
import { createHash,randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fixtureId } from "../fixtures/assessment";
import { provisionSyntheticSigner,withVerifiedAuth,signedTransaction,runtimeConnection } from "./stage3e1b-context";
import { sendTrustedMessage,bookTrustedAppointment,transitionTrustedConsultation } from "./stage3e1d-services";
const owner=new PrismaClient({log:[]});
const p=fixtureId(12000),other=fixtureId(12001),psy=fixtureId(9710),otherPsy=fixtureId(9711),admin=fixtureId(9750);
const as=<T>(id:string,work:()=>Promise<T>)=>withVerifiedAuth({getUser:async()=>({data:{user:{id,email_confirmed_at:"2026-01-01"}},error:null})},work);
async function call<T=Record<string,string>>(id:string,query:Prisma.Sql):Promise<T> {
 return as(id,()=>signedTransaction(async tx=>(await tx.$queryRaw<Array<{value:T}>>(query))[0].value));
}
async function waitRuntimeLock(){
 const deadline=Date.now()+5000;
 while(Date.now()<deadline){
  const [row]=await owner.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM pg_stat_activity WHERE usename='website_runtime' AND wait_event_type='Lock' AND query ILIKE '%wb_guard.%'`;
  if(Number(row.n)>0)return;
  await new Promise(r=>setTimeout(r,25));
 }
 throw new Error("Expected an observed runtime lock wait");
}
let report:string,assessment:string,seq=0;
async function slot(){return owner.psychologistAvailability.create({data:{psychologistId:psy,availabilityDate:new Date(Date.UTC(2041,0,++seq)),sessionType:"MORNING",status:"AVAILABLE"}});}
const book=(s:string,actor=p,affirmative=true)=>as(actor,()=>bookTrustedAppointment({psychologistId:psy,assessmentSessionId:assessment,reportId:report,availabilityId:s,reportConsent:affirmative}));
const transition=(id:string,action:string,actor=psy)=>as(actor,()=>transitionTrustedConsultation({appointmentId:id,action}));
const grant=(id:string|null)=>call<string>(p,Prisma.sql`SELECT wb_guard.grant_consent(${report}::uuid,${psy}::uuid,${id}::uuid,true) AS value`);
const access=()=>call<string|null>(psy,Prisma.sql`SELECT wb_guard.report_access(${report}::uuid) AS value`);
async function windowFixture(){
 const s=await slot();await owner.psychologistAvailability.update({where:{id:s.id},data:{status:"BOOKED"}});
 const scheduledStartAt=new Date(Date.now()-60000),scheduledEndAt=new Date(scheduledStartAt.getTime()+7200000);
 return owner.appointment.create({data:{participantId:p,psychologistId:psy,assessmentSessionId:assessment,reportId:report,availabilityId:s.id,scheduledStartAt,scheduledEndAt,consultationSession:{create:{scheduledStartAt,scheduledEndAt}}},include:{consultationSession:true}});
}
async function opened(){const a=await windowFixture();await transition(a.id,"participant-check-in",p);await transition(a.id,"psychologist-check-in");await transition(a.id,"start");return a;}
const read=(id:string,actor=p,limit=30,cursor:string|null=null)=>call<{items:Array<{id:string;body:string;own:boolean}>;nextCursor:string|null}>(actor,Prisma.sql`SELECT wb_guard.read_messages(${id}::uuid,${limit}::integer,${cursor}::uuid) AS value`);
beforeAll(async()=>{
 const [marker]=await owner.$queryRaw<Array<{token:string}>>`SELECT token FROM rehearsal.identity`;expect(marker.token).toBe(process.env.PHASE3_REHEARSAL_TOKEN);
 const [key]=await owner.$queryRaw<Array<{secret:Uint8Array}>>`SELECT secret FROM wb_guard.signing_key`;provisionSyntheticSigner(Buffer.from(key.secret));
 const a=await owner.assessmentSession.findFirstOrThrow({where:{participantId:p,status:"COMPLETED"},include:{report:true}});assessment=a.id;report=a.report!.id;
 // Explicitly authorized synthetic prerequisite, not evidence of PDF/Storage finalization.
 await owner.report.update({where:{id:report},data:{status:"GENERATED",filePathOrObjectKey:`reports/${report}.pdf`,generatedAt:new Date()}});
});
afterEach(async()=>{for(const c of await owner.consent.findMany({where:{participantId:p,revokedAt:null,expiredAt:null}}))await call(p,Prisma.sql`SELECT wb_guard.revoke_consent(${c.id}::uuid) AS value`);});
afterAll(async()=>{await owner.$disconnect();await runtimeConnection.$disconnect();});
it("books atomically with Jakarta schedule, consent and audit; duplicate slot loses",async()=>{
 const s=await slot();const result=await book(s.id);expect(result.appointmentId).toBeTruthy();
 const a=await owner.appointment.findUniqueOrThrow({where:{id:result.appointmentId},include:{consultationSession:true,consents:{include:{auditEvents:true}}}});
 expect(a.status).toBe("CONFIRMED");expect(a.scheduledStartAt.getUTCHours()).toBe(2);expect(a.consultationSession?.status).toBe("SCHEDULED");expect(a.consents).toHaveLength(1);expect(a.consents[0].auditEvents).toHaveLength(1);
 await expect(book(s.id)).rejects.toThrow();
});
it("rejects wrong participant, role, consent and rolls back every booking write",async()=>{
 const s=await slot();for(const actor of [other,psy,admin])await expect(book(s.id,actor)).rejects.toThrow();await expect(book(s.id,p,false)).rejects.toThrow();
 await expect(as(p,()=>signedTransaction(async tx=>{await tx.$queryRaw`SELECT wb_guard.book_appointment(${psy}::uuid,${assessment}::uuid,${report}::uuid,${s.id}::uuid,true)`;throw new Error("FAULT_AFTER_CONSENT");}))).rejects.toThrow("FAULT_AFTER_CONSENT");
 expect(await owner.appointment.count({where:{availabilityId:s.id}})).toBe(0);expect((await owner.psychologistAvailability.findUniqueOrThrow({where:{id:s.id}})).status).toBe("AVAILABLE");
});
it("serializes concurrent booking attempts",async()=>{const s=await slot();const results=await Promise.allSettled([book(s.id),book(s.id)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(await owner.appointment.count({where:{availabilityId:s.id}})).toBe(1);});
it("denies raw writes, owner assumption, unsigned and forged contexts",async()=>{
 for(const sql of ["INSERT INTO public.appointments(id) VALUES(gen_random_uuid())","UPDATE public.consents SET revoked_at=now() WHERE false","INSERT INTO public.consultation_messages(id) VALUES(gen_random_uuid())","SET ROLE wb_booking","SET ROLE wb_chat"]){await expect(as(p,()=>signedTransaction(tx=>tx.$executeRawUnsafe(sql)))).rejects.toThrow();}
 await expect(runtimeConnection.$queryRaw`SELECT wb_guard.transition_consultation(${randomUUID()}::uuid,'start')`).rejects.toThrow();
 await expect(as(p,()=>signedTransaction(async tx=>{await tx.$queryRaw`SELECT set_config('wellbeing.claim','{"sub":"forged"}',true)`;return tx.$queryRaw`SELECT wb_guard.report_access(${report}::uuid)`;}))).rejects.toThrow();
});
it("grants, revokes idempotently, regrants without mutating history",async()=>{
 const id=await grant(null);expect(await access()).toBe(id);await expect(grant(null)).rejects.toMatchObject({code:"P2010",meta:{code:"23505"}});
 const revoke=()=>call<string>(p,Prisma.sql`SELECT wb_guard.revoke_consent(${id}::uuid) AS value`);expect(await revoke()).toEqual(await revoke());expect(await access()).toBeNull();
 const next=await grant(null);expect(next).not.toBe(id);expect(await access()).toBe(next);await call(p,Prisma.sql`SELECT wb_guard.revoke_consent(${next}::uuid) AS value`);
 expect(await owner.consentAuditEvent.count({where:{consentId:id,action:"REVOKED"}})).toBe(1);
});
it("enforces check-ins, assignment, lifecycle consistency and expires appointment consent on early close",async()=>{
 const a=await windowFixture();const consent=await grant(a.id);
 await expect(transition(a.id,"start")).rejects.toThrow("CHECK_INS_REQUIRED");await expect(transition(a.id,"participant-check-in",other)).rejects.toThrow();await expect(transition(a.id,"start",otherPsy)).rejects.toThrow();
 const first=await transition(a.id,"participant-check-in",p);expect(await transition(a.id,"participant-check-in",p)).toEqual(first);
 await transition(a.id,"psychologist-check-in");await transition(a.id,"start");await expect(transition(a.id,"end",p)).rejects.toThrow();
 await transition(a.id,"end");const ended=await transition(a.id,"end");expect(ended.status).toBe("COMPLETED");
 expect((await owner.consent.findUniqueOrThrow({where:{id:consent}})).expiredAt).not.toBeNull();expect(await access()).toBeNull();await expect(grant(a.id)).rejects.toThrow();
});
it("keeps standalone consent independent of appointment closure",async()=>{
 const standalone=await grant(null);const a=await opened();await grant(a.id);await transition(a.id,"end");expect(await access()).toBe(standalone);await call(p,Prisma.sql`SELECT wb_guard.revoke_consent(${standalone}::uuid) AS value`);
});
it("sends both ways, confirms postcommit, deduplicates and paginates scoped messages",async()=>{
 const a=await opened();const command={clientMessageId:randomUUID(),body:"  synthetic hello  "};
 const first=await as(p,()=>sendTrustedMessage(a.id,command));expect(first.body).toBe("synthetic hello");expect((await as(p,()=>sendTrustedMessage(a.id,command))).id).toBe(first.id);
 await expect(as(p,()=>sendTrustedMessage(a.id,{...command,body:"changed"}))).rejects.toThrow("IDEMPOTENCY_CONFLICT");
 await as(psy,()=>sendTrustedMessage(a.id,{clientMessageId:randomUUID(),body:"reply"}));const page=await read(a.id,p,1);expect(page.items).toHaveLength(1);expect(page.items[0].own).toBe(false);expect(page.nextCursor).toBeTruthy();expect((await read(a.id,p,1,page.nextCursor)).items[0].id).toBe(first.id);
 await expect(read(a.id,other)).rejects.toThrow();await expect(read(a.id,otherPsy)).rejects.toThrow();await expect(read(a.id,p,1,randomUUID())).rejects.toThrow("INVALID_CURSOR");
 await transition(a.id,"end");await expect(read(a.id)).rejects.toThrow("CHAT_CLOSED");await expect(as(p,()=>sendTrustedMessage(a.id,command))).rejects.toThrow("CHAT_CLOSED");
});
it("rejects invalid bodies directly in SQL and refuses inactive parties",async()=>{
 const a=await opened();for(const body of [" ","\u00a0\ufeff","x".repeat(2001),"??".repeat(1001)])await expect(call(p,Prisma.sql`SELECT wb_guard.send_message(${a.id}::uuid,${randomUUID()}::uuid,${body}) AS value`)).rejects.toThrow();
 await owner.user.update({where:{id:psy},data:{isActive:false}});try{await expect(read(a.id)).rejects.toThrow();await expect(transition(a.id,"end")).rejects.toThrow();}finally{await owner.user.update({where:{id:psy},data:{isActive:true}});}
});
it("detects deferred deadline rollback instead of reporting a phantom send",async()=>{
 const a=await opened();const end=new Date(Date.now()+1000),start=new Date(end.getTime()-7200000);
 await owner.appointment.update({where:{id:a.id},data:{scheduledStartAt:start,scheduledEndAt:end}});await owner.consultationSession.update({where:{appointmentId:a.id},data:{scheduledStartAt:start,scheduledEndAt:end}});
 await expect(as(p,()=>sendTrustedMessage(a.id,{clientMessageId:randomUUID(),body:"must roll back"},()=>new Promise(resolve=>setTimeout(resolve,1400))))).rejects.toThrow();
 expect(await owner.consultationMessage.count({where:{consultationSessionId:a.consultationSession!.id}})).toBe(0);
});
it("gateway roles cannot log in, bypass RLS, own protected tables or leak pooled claims",async()=>{
 const roles=await owner.$queryRaw<Array<{rolname:string;rolcanlogin:boolean;rolbypassrls:boolean;rolsuper:boolean}>>`SELECT rolname,rolcanlogin,rolbypassrls,rolsuper FROM pg_roles WHERE rolname IN ('wb_booking','wb_consent','wb_lifecycle','wb_chat')`;
 expect(roles).toHaveLength(4);for(const r of roles)expect(r).toMatchObject({rolcanlogin:false,rolbypassrls:false,rolsuper:false});
 const tables=await owner.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND pg_get_userbyid(relowner) IN ('wb_booking','wb_consent','wb_lifecycle','wb_chat')`;expect(Number(tables[0].n)).toBe(0);
 await runtimeConnection.$disconnect();await expect(runtimeConnection.$queryRaw`SELECT wb_guard.report_access(${report}::uuid)`).rejects.toThrow();
});


it("rejects non-generated metadata, unavailable and past slots without writes",async()=>{
 const s=await slot();await owner.report.update({where:{id:report},data:{status:"PENDING"}});
 try{await expect(book(s.id)).rejects.toThrow("REPORT_NOT_GENERATED");}finally{await owner.report.update({where:{id:report},data:{status:"GENERATED"}});}
 await owner.psychologistAvailability.update({where:{id:s.id},data:{status:"UNAVAILABLE"}});await expect(book(s.id)).rejects.toThrow("SLOT_NOT_AVAILABLE");
 await owner.psychologistAvailability.update({where:{id:s.id},data:{status:"AVAILABLE",availabilityDate:new Date("2001-01-01")}});await expect(book(s.id)).rejects.toThrow("SLOT_START_PASSED");expect(await owner.appointment.count({where:{availabilityId:s.id}})).toBe(0);
});
it("concurrent message retries persist one row and reject impersonation arguments",async()=>{
 const a=await opened(),command={clientMessageId:randomUUID(),body:"same request"};
 const results=await Promise.all([as(p,()=>sendTrustedMessage(a.id,command)),as(p,()=>sendTrustedMessage(a.id,command))]);expect(results[0].id).toBe(results[1].id);expect(await owner.consultationMessage.count({where:{consultationSessionId:a.consultationSession!.id}})).toBe(1);
 await expect(as(p,()=>sendTrustedMessage(a.id,{...command,senderId:psy}))).rejects.toThrow();
 await expect(call(p,Prisma.sql`SELECT wb_guard.send_message(${a.id}::uuid,${randomUUID()}::uuid,'forged',${psy}::uuid) AS value`)).rejects.toThrow();
});
it("rechecks the server deadline after waiting for an appointment lock",async()=>{
 const a=await opened();const end=new Date(Date.now()+900),start=new Date(end.getTime()-7200000);
 await owner.appointment.update({where:{id:a.id},data:{scheduledStartAt:start,scheduledEndAt:end}});await owner.consultationSession.update({where:{appointmentId:a.id},data:{scheduledStartAt:start,scheduledEndAt:end}});
 let release!:()=>void,locked!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{locked=r;});
 const blocker=owner.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM public.appointments WHERE id=${a.id}::uuid FOR UPDATE`;locked();await gate;});
 await ready;const pending=as(p,()=>sendTrustedMessage(a.id,{clientMessageId:randomUUID(),body:"queued"}));const assertion=expect(pending).rejects.toThrow("CHAT_CLOSED");
 try{await waitRuntimeLock();await new Promise(r=>setTimeout(r,1200));}finally{release();await blocker;}await assertion;expect(await owner.consultationMessage.count({where:{consultationSessionId:a.consultationSession!.id}})).toBe(0);
});
it("deadline expiry appends one derived SYSTEM audit and rejects arbitrary helper invocation",async()=>{
 const a=await windowFixture();const c=await grant(a.id);const end=new Date(Date.now()+100),start=new Date(end.getTime()-7200000);
 await owner.appointment.update({where:{id:a.id},data:{scheduledStartAt:start,scheduledEndAt:end}});await owner.consultationSession.update({where:{appointmentId:a.id},data:{scheduledStartAt:start,scheduledEndAt:end}});await new Promise(r=>setTimeout(r,150));
 const expire=()=>call<number>(p,Prisma.sql`SELECT wb_guard.expire_consents(${a.id}::uuid) AS value`);expect(await expire()).toBe(1);expect(await expire()).toBe(0);
 expect(await owner.consentAuditEvent.findMany({where:{consentId:c,action:"EXPIRED"},select:{actorType:true,actorUserId:true}})).toEqual([{actorType:"SYSTEM",actorUserId:null}]);
 await expect(call(p,Prisma.sql`SELECT wb_guard.d_expire(${a.id}::uuid) AS value`)).rejects.toThrow();
});

it("serializes close before send and prevents post-close messages",async()=>{
 const a=await opened();let release!:()=>void,locked!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{locked=r;});
 const closing=as(psy,()=>signedTransaction(async tx=>{await tx.$queryRaw`SELECT wb_guard.transition_consultation(${a.id}::uuid,'end')`;locked();await gate;}));await ready;
 const sending=expect(as(p,()=>sendTrustedMessage(a.id,{clientMessageId:randomUUID(),body:"too late"}))).rejects.toThrow("CHAT_CLOSED");
 try{await waitRuntimeLock();}finally{release();await closing;}await sending;expect(await owner.consultationMessage.count({where:{consultationSessionId:a.consultationSession!.id}})).toBe(0);
});
it("concurrent grant has one winner; committed revoke prevents later report access",async()=>{
 const results=await Promise.allSettled([grant(null),grant(null)]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);const id=(results.find(r=>r.status==="fulfilled") as PromiseFulfilledResult<string>).value;
 let release!:()=>void,locked!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{locked=r;});
 const revoking=as(p,()=>signedTransaction(async tx=>{await tx.$queryRaw`SELECT wb_guard.revoke_consent(${id}::uuid)`;locked();await gate;}));await ready;const reading=access();
 try{await waitRuntimeLock();}finally{release();await revoking;}expect(await reading).toBeNull();
});
it("rejects profile deactivation committed while a request waits",async()=>{
 const a=await opened();let release!:()=>void,locked!:()=>void;const gate=new Promise<void>(r=>{release=r;}),ready=new Promise<void>(r=>{locked=r;});
 const deactivating=owner.$transaction(async tx=>{await tx.user.update({where:{id:psy},data:{isActive:false}});locked();await gate;});await ready;
 const sending=expect(as(p,()=>sendTrustedMessage(a.id,{clientMessageId:randomUUID(),body:"inactive peer"}))).rejects.toThrow();
 try{await waitRuntimeLock();release();await deactivating;await sending;}finally{release();await owner.user.update({where:{id:psy},data:{isActive:true}});}
 expect(await owner.consultationMessage.count({where:{consultationSessionId:a.consultationSession!.id}})).toBe(0);
});


it("rejects future, inconsistent and unapproved late lifecycle transitions",async()=>{
 const s=await slot(),future=await book(s.id);await expect(transition(future.appointmentId,"participant-check-in",p)).rejects.toThrow("CONSULTATION_NOT_OPEN");
 const a=await windowFixture();await owner.consultationSession.update({where:{appointmentId:a.id},data:{status:"PARTICIPANT_LATE"}});await expect(transition(a.id,"participant-check-in",p)).rejects.toThrow("CONSULTATION_POLICY_PENDING");
 await owner.consultationSession.update({where:{appointmentId:a.id},data:{status:"READY"}});await expect(transition(a.id,"start")).rejects.toThrow("CONSULTATION_INCONSISTENT");await expect(transition(a.id,"cancel")).rejects.toThrow();
});
it("after cursor reconnect is stable and rejects a cursor from another session",async()=>{
 const a=await opened(),b=await opened();const first=await as(p,()=>sendTrustedMessage(a.id,{clientMessageId:randomUUID(),body:"first"}));const second=await as(psy,()=>sendTrustedMessage(a.id,{clientMessageId:randomUUID(),body:"second"}));
 const page=await call<{items:Array<{id:string}>}>(p,Prisma.sql`SELECT wb_guard.read_messages(${a.id}::uuid,30,${first.id}::uuid,'after') AS value`);expect(page.items.map(m=>m.id)).toEqual([second.id]);
 await expect(read(b.id,p,1,first.id)).rejects.toThrow("INVALID_CURSOR");
 await expect(as(p,()=>signedTransaction(tx=>tx.consultationMessage.findMany()))).rejects.toThrow();
});
it("rejects signed wrong-purpose calls, admin chat access and caller-supplied booking state",async()=>{
 const a=await opened();await expect(read(a.id,admin)).rejects.toThrow();await expect(call(admin,Prisma.sql`SELECT wb_guard.send_message(${a.id}::uuid,${randomUUID()}::uuid,'admin') AS value`)).rejects.toThrow();
 await expect(withVerifiedAuth({getUser:async()=>({data:{user:{id:p,email_confirmed_at:"2026-01-01"}},error:null})},()=>signedTransaction(tx=>tx.$queryRaw`SELECT wb_guard.read_messages(${a.id}::uuid)`),"report-finalize")).rejects.toThrow();
 const s=await slot();await expect(as(p,()=>bookTrustedAppointment({psychologistId:psy,assessmentSessionId:assessment,reportId:report,availabilityId:s.id,reportConsent:true,status:"COMPLETED"}))).rejects.toThrow();
 await expect(call(p,Prisma.sql`SELECT wb_guard.book_appointment(${psy}::uuid,${randomUUID()}::uuid,${report}::uuid,${s.id}::uuid,true) AS value`)).rejects.toThrow();
});
it("two different participants contend for one slot with exactly one complete booking",async()=>{
 const otherAssessment=await owner.assessmentSession.findFirstOrThrow({where:{participantId:other,status:"COMPLETED"},include:{report:true}});const r=otherAssessment.report!;
 await owner.report.update({where:{id:r.id},data:{status:"GENERATED",filePathOrObjectKey:`reports/${r.id}.pdf`,generatedAt:new Date()}});
 const s=await slot();const results=await Promise.allSettled([book(s.id),call(other,Prisma.sql`SELECT wb_guard.book_appointment(${psy}::uuid,${otherAssessment.id}::uuid,${r.id}::uuid,${s.id}::uuid,true) AS value`)]);
 expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);const a=await owner.appointment.findFirstOrThrow({where:{availabilityId:s.id},include:{consents:{include:{auditEvents:true}},consultationSession:true}});expect(a.consents).toHaveLength(1);expect(a.consents[0].auditEvents).toHaveLength(1);expect(a.consultationSession).not.toBeNull();
});
it("a consent INSERT fault rolls back slot, appointment and session",async()=>{
 const s=await slot();
 await owner.$executeRawUnsafe("CREATE FUNCTION rehearsal.fail_d_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_CONSENT_FAILURE'; END $$");
 await owner.$executeRawUnsafe("CREATE TRIGGER fail_d_consent BEFORE INSERT ON public.consents FOR EACH ROW EXECUTE FUNCTION rehearsal.fail_d_consent()");
 try{await expect(book(s.id)).rejects.toThrow("INJECTED_CONSENT_FAILURE");}finally{await owner.$executeRawUnsafe("DROP TRIGGER fail_d_consent ON public.consents");await owner.$executeRawUnsafe("DROP FUNCTION rehearsal.fail_d_consent()");}
 expect(await owner.appointment.count({where:{availabilityId:s.id}})).toBe(0);expect((await owner.psychologistAvailability.findUniqueOrThrow({where:{id:s.id}})).status).toBe("AVAILABLE");
});
it("concurrent starts produce exactly one transition and preserve its timestamp",async()=>{
 const a=await windowFixture();await transition(a.id,"participant-check-in",p);await transition(a.id,"psychologist-check-in");const results=await Promise.allSettled([transition(a.id,"start"),transition(a.id,"start")]);expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);const s=await owner.consultationSession.findUniqueOrThrow({where:{appointmentId:a.id}});expect(s.status).toBe("IN_PROGRESS");expect(s.startedAt).not.toBeNull();expect((await owner.appointment.findUniqueOrThrow({where:{id:a.id}})).status).toBe("IN_PROGRESS");
});



it("preserves eight migration hashes and chatbot catalogs/data after gateway installation",async()=>{
 const migrations=await owner.$queryRaw<Array<{migration_name:string;checksum:string}>>`SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;expect(migrations).toHaveLength(8);
 for(const m of migrations)expect(m.checksum).toBe(createHash("sha256").update(readFileSync(`prisma/migrations/${m.migration_name}/migration.sql`)).digest("hex"));
 const [catalog]=await owner.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM (SELECT * FROM rehearsal.stage3e1d_chatbot_before EXCEPT SELECT c.oid,c.relname,c.relowner,c.relacl::text,c.relrowsecurity FROM pg_class c WHERE c.relnamespace='chatbot'::regnamespace) AS differences`;expect(Number(catalog.n)).toBe(0);
 for(const table of ["chat_sessions","checkins","messages","safety_events","user_memories"])expect(await owner.$queryRawUnsafe(`SELECT * FROM chatbot.${table}`)).toEqual([{id:1,marker:"SYNTHETIC ONLY"}]);
 for(const sql of ["SELECT * FROM chatbot.messages","SELECT * FROM public._prisma_migrations","UPDATE public.consultation_sessions SET status='COMPLETED' WHERE false","INSERT INTO public.consents(id) VALUES(gen_random_uuid())","DELETE FROM public.consent_audit_events WHERE false"])await expect(as(p,()=>signedTransaction(tx=>tx.$queryRawUnsafe(sql)))).rejects.toThrow();
 const [paths]=await runtimeConnection.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM pg_roles WHERE rolname IN ('wb_booking','wb_consent','wb_lifecycle','wb_chat','website_deployer') AND pg_has_role(session_user,oid,'SET')`;expect(Number(paths.n)).toBe(0);
 const [trigger]=await owner.$queryRaw<Array<{prosecdef:boolean;owner:string}>>`SELECT prosecdef,pg_get_userbyid(proowner) AS owner FROM pg_proc WHERE oid='public.guard_consultation_message()'::regprocedure`;expect(trigger).toEqual({prosecdef:true,owner:"wb_chat"});
 const triggers=await owner.$queryRaw<Array<{tgname:string;tgdeferrable:boolean;tginitdeferred:boolean}>>`SELECT tgname,tgdeferrable,tginitdeferred FROM pg_trigger WHERE tgrelid='public.consultation_messages'::regclass AND NOT tgisinternal`;expect(triggers).toContainEqual({tgname:"consultation_message_commit_guard",tgdeferrable:true,tginitdeferred:true});
});
