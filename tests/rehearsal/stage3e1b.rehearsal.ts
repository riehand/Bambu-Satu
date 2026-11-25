import { afterAll,beforeAll,expect,it,vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createHash,createHmac,randomUUID } from "node:crypto";
import { appendFileSync,readFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureId,syntheticQuestionSet } from "../fixtures/assessment";
import { assertPhase3RehearsalEnvironment } from "../../scripts/phase3-safety.mjs";
vi.mock("@/lib/prisma",async()=>({prisma:(await import("./stage3e1b-context")).scopedPrisma}));
import { runtimeConnection as runtime,scopedPrisma,provisionSyntheticSigner,signedTransaction,withVerifiedAuth } from "./stage3e1b-context";
import { getSession,saveAnswers,startAssessmentSession,submitAssessment } from "@/lib/assessment/service";
import { getPsychologistProfile,setDailyAvailability,updatePsychologistProfile } from "@/lib/psychologist/service";
import { createAppointment,getReportArtifactForActor,grantAppointmentConsent,revokeConsent } from "@/lib/appointments/service";
import { listChatMessages,sendChatMessage } from "@/lib/consultations/chat-service";
import { transitionConsultation } from "@/lib/consultations/service";
import { adminOverview } from "@/lib/admin/service";
assertPhase3RehearsalEnvironment();
const owner=new PrismaClient({log:[]});
const participant=fixtureId(9961),other=fixtureId(9962),psychologist=fixtureId(9710),otherPsychologist=fixtureId(9711),admin=fixtureId(9750);
const actor=(id:string)=>({getUser:async()=>({data:{user:{id,email_confirmed_at:"2026-01-01"}},error:null})});
const as=<T>(id:string,work:()=>Promise<T>)=>withVerifiedAuth(actor(id),work);
const evidence=(check:string,details:object={})=>appendFileSync(join(process.env.PHASE3_EVIDENCE_DIR!,"stage3e1b-checks.jsonl"),JSON.stringify({check,...details})+"\n");
let sessionId:string,reportId:string,appointmentId:string;
let fixtureSignerKey:Buffer;
beforeAll(async()=>{
  const [identity]=await owner.$queryRaw<Array<{token:string}>>`SELECT token FROM rehearsal.identity`;
  expect(identity.token).toBe(process.env.PHASE3_REHEARSAL_TOKEN);
  const [key]=await owner.$queryRaw<Array<{secret:Uint8Array}>>`SELECT secret FROM wb_guard.signing_key`;
  fixtureSignerKey=Buffer.from(key.secret);
  provisionSyntheticSigner(fixtureSignerKey);
  for(const [index,id] of [participant,other].entries()) {
    const meta=JSON.stringify({full_name:`Synthetic RLS ${index}`,phone_number:"08000000000",institutional_id:`RLS996${index}`,user_type:"STUDENT"});
    await owner.$executeRaw`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(${id}::uuid,${`rls${index}@example.test`},${meta}::jsonb)`;
  }
  const appointment=await owner.appointment.findFirstOrThrow({where:{participantId:fixtureId(9702)}});
  reportId=appointment.reportId;appointmentId=appointment.id;
});
afterAll(async()=>{await Promise.all([owner.$disconnect(),runtime.$disconnect()]);});
it("preserves eight checksums and uses a non-owner login with no escalation path",async()=>{
  const rows=await owner.$queryRaw<Array<{migration_name:string;checksum:string}>>`SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  expect(rows).toHaveLength(8);
  for(const row of rows)expect(row.checksum).toBe(createHash("sha256").update(readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`)).digest("hex"));
  const [flags]=await runtime.$queryRaw<Array<{name:string;safe:boolean;owned:bigint;paths:bigint}>>`SELECT session_user AS name,NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole) AS safe,
    (SELECT count(*) FROM pg_class WHERE relowner=r.oid AND relnamespace='public'::regnamespace) AS owned,
    (SELECT count(*) FROM pg_roles t WHERE t.oid<>r.oid AND (pg_has_role(r.oid,t.oid,'SET') OR pg_has_role(r.oid,t.oid,'USAGE'))) AS paths FROM pg_roles r WHERE rolname=current_user`;
  expect(flags).toEqual({name:"website_runtime",safe:true,owned:BigInt(0),paths:BigInt(0)});
  evidence("runtime login nonprivilege; 8 migration hashes preserved");
});
it("requires server-side verified and confirmed Auth before issuing context",async()=>{
  await expect(withVerifiedAuth({getUser:async()=>({data:{user:null},error:new Error("invalid")})},()=>signedTransaction(tx=>tx.user.count()))).rejects.toThrow("AUTH_REQUIRED");
  await expect(withVerifiedAuth({getUser:async()=>({data:{user:{id:participant}},error:null})},()=>signedTransaction(tx=>tx.user.count()))).rejects.toThrow("AUTH_REQUIRED");
  await expect(scopedPrisma.user.count()).rejects.toThrow("VERIFIED_REQUEST_REQUIRED");
  await expect(runtime.$queryRaw`SELECT wb_guard.subject()`).rejects.toMatchObject({code:"P2010",meta:{code:"42501"}});
  evidence("Auth missing/invalid/unconfirmed: context not issued");
});
it("reads own profile and rejects cross-user profile reads and role spoofing",async()=>{
  for(const id of [participant,other,psychologist,admin]) {
    const [row]=await as(id,()=>signedTransaction(tx=>tx.$queryRaw<Array<{profile:{id:string;role:string}}>>`SELECT wb_guard.own_profile() AS profile`));
    expect(row.profile.id).toBe(id);
  }
  expect(await as(participant,()=>scopedPrisma.user.findMany({select:{id:true}}))).toEqual([{id:participant}]);
  expect(await as(participant,()=>scopedPrisma.user.findUnique({where:{id:other},select:{id:true,email:true}}))).toBeNull();
  await as(participant,()=>signedTransaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub',${admin},true),set_config('request.jwt.claim.role','SUPERADMIN',true)`;
    const [row]=await tx.$queryRaw<Array<{role:string}>>`SELECT wb_guard.actor_role() AS role`;
    expect(row.role).toBe("PARTICIPANT");
  }));
  evidence("PASS profile own; bare GUC spoof cannot escalate authoritative role");
});
it("rejects tampered subject, purpose, signature and unauthorized helper access",async()=>{
  for(const field of ["sub","purpose","exp","pid","tx"]) {
    await expect(as(participant,()=>signedTransaction(async tx=>{
      const [row]=await tx.$queryRaw<Array<{claim:string}>>`SELECT current_setting('wellbeing.claim') AS claim`;
      const payload=JSON.parse(row.claim);payload[field]=field==="sub"?psychologist:"forged";
      await tx.$queryRaw`SELECT set_config('wellbeing.claim',${JSON.stringify(payload)},true)`;
      return tx.$queryRaw`SELECT wb_guard.subject()`;
    }))).rejects.toMatchObject({code:"P2010",meta:{code:"42501"}});
  }
  for(const sql of ["SELECT secret FROM wb_guard.signing_key","SET ROLE wb_identity_guard","SET ROLE wb_operational_monitor","SET ROLE website_deployer","SET ROLE postgres","SELECT public.handle_auth_user_created()","SELECT wb_guard.protect_runtime_mutation()","SELECT * FROM chatbot.messages","SELECT * FROM public._prisma_migrations","UPDATE chatbot._backend_migrations SET checksum='forged' WHERE false"]) {
    await expect(runtime.$queryRawUnsafe(sql)).rejects.toMatchObject({code:"P2010",meta:{code:"42501"}});
  }
  evidence("Forged signed fields, key read, helper EXECUTE, SET ROLE, chatbot/ledger denied");
});
it("rejects inactive users and observes deactivation during a request",async()=>{
  await owner.user.update({where:{id:other},data:{isActive:false}});
  try {await expect(as(other,()=>scopedPrisma.user.count())).rejects.toThrow("ACTIVE_PROFILE_REQUIRED");}
  finally {await owner.user.update({where:{id:other},data:{isActive:true}});}
  await as(other,async()=>{
    await scopedPrisma.user.count();
    await owner.user.update({where:{id:other},data:{isActive:false}});
    try {await expect(scopedPrisma.user.count()).rejects.toThrow("ACTIVE_PROFILE_REQUIRED");}
    finally {await owner.user.update({where:{id:other},data:{isActive:true}});}
  });
  evidence("Active role read from DB per transaction, not trusted metadata");
});
it("starts and saves a participant assessment through actual Prisma service transactions",async()=>{
  const started=await as(participant,()=>startAssessmentSession(participant,true));sessionId=started.assessmentSessionId;
  const answers=syntheticQuestionSet().questions.map(q=>({questionId:q.id,answerValue:q.instrument==="DASS21"?1:3}));
  expect(await as(participant,()=>saveAnswers(sessionId,participant,{expectedRevision:0,answers}))).toMatchObject({saved:35,revision:1});
  const history=await as(participant,()=>getSession(sessionId,participant));
  expect(history.answers).toHaveLength(35);
  await expect(as(other,()=>getSession(sessionId,participant))).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
  await expect(as(psychologist,()=>startAssessmentSession(participant,true))).rejects.toThrow();
  await expect(as(participant,()=>startAssessmentSession(other,true))).rejects.toThrow();
  evidence("PASS assessment start/save/history; cross-user and forged actor denied");
});
it("records submit blocker and rejects forged scores or generated metadata",async()=>{
  await expect(as(participant,()=>submitAssessment(sessionId,participant,{expectedRevision:1}))).rejects.toThrow();
  expect(await owner.assessmentSession.findUnique({where:{id:sessionId}})).toMatchObject({status:"IN_PROGRESS",revision:1});
  expect(await owner.assessmentScore.count({where:{assessmentSessionId:sessionId}})).toBe(0);
  for(const sql of ["INSERT INTO public.assessment_scores(id) VALUES(gen_random_uuid())","UPDATE public.reports SET status='GENERATED' WHERE false","UPDATE public.assessment_scores SET depression_score=0 WHERE false","DELETE FROM public.consent_audit_events WHERE false"]) {
    await expect(as(participant,()=>signedTransaction(tx=>tx.$executeRawUnsafe(sql)))).rejects.toMatchObject({code:"P2010",meta:{code:"42501"}});
  }
  evidence("BLOCKED submit/finalize: no validated scoring/Storage gateway; transaction rollback verified");
});
it("completes own psychologist profile and availability writes and protects BOOKED slots",async()=>{
  await as(psychologist,()=>updatePsychologistProfile(psychologist,{professionalTitle:"Synthetic RLS psychologist"}));
  expect(await as(psychologist,()=>getPsychologistProfile(psychologist))).toMatchObject({professionalTitle:"Synthetic RLS psychologist"});
  expect(await as(otherPsychologist,()=>getPsychologistProfile(psychologist))).toBeNull();
  await expect(as(participant,()=>updatePsychologistProfile(psychologist,{professionalTitle:"forged"}))).rejects.toThrow();
  const input={sessions:[{sessionType:"MORNING" as const,available:true},{sessionType:"AFTERNOON" as const,available:false},{sessionType:"EVENING" as const,available:false}]};
  const slots=await as(psychologist,()=>setDailyAvailability(psychologist,"2039-01-01",input));
  expect(slots).toHaveLength(3);
  await expect(as(otherPsychologist,()=>setDailyAvailability(psychologist,"2039-01-02",input))).rejects.toThrow();
  const booked=await owner.psychologistAvailability.findFirstOrThrow({where:{psychologistId:psychologist,status:"BOOKED"}});
  await expect(as(psychologist,()=>signedTransaction(tx=>tx.$executeRaw`UPDATE public.psychologist_availability SET status='AVAILABLE' WHERE id=${booked.id}::uuid`))).rejects.toMatchObject({code:"P2010",meta:{code:"42501"}});
  evidence("PASS own psychologist profile/availability; cross-owner and BOOKED mutation denied");
});
it("allows own PDF database authorization but denies psychologist sharing without a safe cross-party model",async()=>{
  expect(await as(fixtureId(9702),()=>getReportArtifactForActor(fixtureId(9702),"PARTICIPANT",reportId))).toMatchObject({id:reportId,status:"GENERATED"});
  for(const id of [other,psychologist,admin]) {
    expect(await as(id,()=>scopedPrisma.report.findUnique({where:{id:reportId}}))).toBeNull();
    expect(await as(id,()=>scopedPrisma.assessmentScore.findMany())).toEqual([]);
  }
  await expect(as(psychologist,()=>getReportArtifactForActor(psychologist,"PSYCHOLOGIST",reportId))).rejects.toMatchObject({code:"REPORT_NOT_FOUND"});
  evidence("PASS own existing PDF metadata authorization; sharing remains BLOCKED (no Storage call)");
});
it("records fail-closed booking, consent, lifecycle and chat service acceptance blockers",async()=>{
  const a=await owner.appointment.findUniqueOrThrow({where:{id:appointmentId}});
  const before=await owner.appointment.count();
  const command={psychologistId:a.psychologistId,assessmentSessionId:a.assessmentSessionId,reportId:a.reportId,availabilityId:a.availabilityId,reportConsent:true};
  const results=await Promise.allSettled([as(a.participantId,()=>createAppointment(a.participantId,command)),as(a.participantId,()=>createAppointment(a.participantId,command))]);
  expect(results.every(r=>r.status==="rejected")).toBe(true);
  expect(await owner.appointment.count()).toBe(before);
  await expect(as(a.participantId,()=>grantAppointmentConsent(a.participantId,a.id,true))).rejects.toThrow();
  const c=await owner.consent.findFirstOrThrow({where:{appointmentId:a.id}});
  // Owner creates an active synthetic fixture only; tested mutation still uses runtime.
  const activeId=randomUUID();
  await owner.$executeRaw`INSERT INTO public.consents(id,participant_id,target_user_id,assessment_session_id,report_id,appointment_id,consent_type,purpose,scope,policy_version,granted_at,expires_at,created_at)
    SELECT ${activeId}::uuid,participant_id,target_user_id,assessment_session_id,report_id,appointment_id,consent_type,purpose,scope,policy_version,clock_timestamp(),clock_timestamp()+interval '1 day',clock_timestamp()
    FROM public.consents WHERE id=${c.id}::uuid`;
  await expect(as(a.participantId,()=>revokeConsent(a.participantId,activeId))).rejects.toThrow();
  expect(await owner.consent.findUnique({where:{id:activeId}})).toMatchObject({revokedAt:null});
  await expect(as(psychologist,()=>transitionConsultation({id:psychologist,role:"PSYCHOLOGIST"},a.id,"start"))).rejects.toThrow();
  await expect(as(a.participantId,()=>sendChatMessage({id:a.participantId,role:"PARTICIPANT"},a.id,{clientMessageId:randomUUID(),body:"Synthetic"}))).rejects.toThrow();
  await expect(as(other,()=>listChatMessages({id:other,role:"PARTICIPANT"},a.id,{limit:10}))).rejects.toThrow();
  evidence("BLOCKED booking/consent/lifecycle/chat services; races cannot leave partial mutations");
});
it("uses a restricted admin aggregate function without exposing raw clinical rows",async()=>{
  const [row]=await as(admin,()=>signedTransaction(tx=>tx.$queryRaw<Array<{counts:Record<string,unknown>}>>`SELECT wb_guard.operational_counts('2026-01-01'::date,'2026-03-31'::date) AS counts`));
  expect(row.counts.activeParticipants).toBe(await owner.user.count({where:{role:"PARTICIPANT",isActive:true}}));
  expect(row.counts.clinicalIndicatorsEnabled).toBe(false);
  expect(Object.keys(row.counts).sort()).toEqual(["activeParticipants","activePsychologists","appointments","assessmentsCompleted","assessmentsStarted","clinicalIndicatorsEnabled"].sort());
  for(const id of [participant,psychologist])await expect(as(id,()=>signedTransaction(tx=>tx.$queryRaw`SELECT wb_guard.operational_counts('2026-01-01','2026-03-31')`))).rejects.toMatchObject({code:"P2010",meta:{code:"42501"}});
  expect(await as(admin,()=>scopedPrisma.assessmentSession.findMany())).toEqual([]);
  const original=await as(admin,()=>adminOverview(admin,{from:"2026-01-01",to:"2026-03-31"}));
  expect(original.activeParticipants).toBe(0);
  evidence("PASS restricted aggregate prototype; original admin service undercounts via RLS and is NOT cutover-ready");
});
it("prevents context leakage under concurrent pooled transactions, rollback and reconnect",async()=>{
  const pids=new Set<number>();
  await Promise.all(Array.from({length:12},(_,i)=>as(i%2?other:participant,()=>signedTransaction(async tx=>{
    const [row]=await tx.$queryRaw<Array<{id:string;pid:number}>>`SELECT wb_guard.subject() AS id,pg_backend_pid() AS pid`;
    expect(row.id).toBe(i%2?other:participant);pids.add(row.pid);
    const users=await tx.user.findMany({select:{id:true}});expect(users).toEqual([{id:row.id}]);
  }))));
  expect(pids.size).toBeLessThanOrEqual(2);
  let captured:{claim:string;mac:string}|undefined;
  await expect(as(participant,()=>signedTransaction(async tx=>{
    [captured]=await tx.$queryRaw<Array<{claim:string;mac:string}>>`SELECT current_setting('wellbeing.claim') AS claim,current_setting('wellbeing.mac') AS mac`;
    throw new Error("ROLLBACK_CONTEXT");
  }))).rejects.toThrow("ROLLBACK_CONTEXT");
  const [cleared]=await runtime.$queryRaw<Array<{claim:string|null}>>`SELECT nullif(current_setting('wellbeing.claim',true),'') AS claim`;
  expect(cleared.claim).toBeNull();
  await runtime.$disconnect();
  await expect(runtime.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('wellbeing.claim',${captured!.claim},true),set_config('wellbeing.mac',${captured!.mac},true)`;
    return tx.$queryRaw`SELECT wb_guard.subject()`;
  })).rejects.toMatchObject({code:"P2010",meta:{code:"42501"}});
  expect(await as(other,()=>scopedPrisma.user.findMany({select:{id:true}}))).toEqual([{id:other}]);
  evidence("2-connection pool reused across 12 requests; rollback clears; signed token replay after reconnect denied");
});
it("serializes competing answer saves using real row locks and rolls back invalid writes",async()=>{
  const answer={questionId:fixtureId(1),answerValue:2};
  const results=await Promise.allSettled([as(participant,()=>saveAnswers(sessionId,participant,{expectedRevision:1,answers:[answer]})),as(participant,()=>saveAnswers(sessionId,participant,{expectedRevision:1,answers:[answer]}))]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
  const loser=results.find(r=>r.status==="rejected");if(loser?.status==="rejected")expect(loser.reason).toMatchObject({code:"STALE_REVISION"});
  await expect(as(psychologist,()=>signedTransaction(async tx=>{
    await tx.psychologistAvailability.create({data:{psychologistId:psychologist,availabilityDate:new Date("2039-02-01"),sessionType:"MORNING",status:"AVAILABLE"}});
    await tx.$queryRaw`SELECT secret FROM wb_guard.signing_key`;
  }))).rejects.toThrow();
  expect(await owner.psychologistAvailability.count({where:{psychologistId:psychologist,availabilityDate:new Date("2039-02-01")}})).toBe(0);
  evidence("PASS actual assessment concurrency: one save, one STALE_REVISION; failed transaction rolls back write");
});
it("preserves synthetic chatbot objects and verifies every clinical table still has RLS",async()=>{
  const [{rls}]=await owner.$queryRaw<Array<{rls:boolean}>>`SELECT bool_and(relrowsecurity) AS rls FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname<>'_prisma_migrations'`;
  expect(rls).toBe(true);
  for(const table of ["messages","user_memories","safety_events"])expect(await owner.$queryRawUnsafe(`SELECT * FROM chatbot.${table}`)).toEqual([{id:1,marker:"SYNTHETIC ONLY"}]);
  expect(await owner.$queryRaw`SELECT * FROM chatbot._backend_migrations`).toEqual([{id:"synthetic-chatbot-baseline",checksum:"synthetic-only"}]);
  evidence("All 15 website tables retain RLS; synthetic Flutter rows/ledger preserved; acceptance PARTIAL");
});

it("rejects correctly signed but expired, future, malformed or wrong-audience claims",async()=>{
  for(const variant of ["expired","future","audience","null-expiry"]) {
    await expect(as(participant,()=>signedTransaction(async tx=>{
      const [row]=await tx.$queryRaw<Array<{claim:string}>>`SELECT current_setting('wellbeing.claim') AS claim`;
      const claim=JSON.parse(row.claim);
      if(variant==="expired"){claim.iat-=120;claim.exp-=120;}
      if(variant==="future"){claim.iat+=120;claim.exp+=120;}
      if(variant==="audience")claim.aud="other-application";
      if(variant==="null-expiry")claim.exp=null;
      const payload=JSON.stringify(claim),mac=createHmac("sha256",fixtureSignerKey).update(payload).digest("hex");
      await tx.$queryRaw`SELECT set_config('wellbeing.claim',${payload},true),set_config('wellbeing.mac',${mac},true)`;
      return tx.$queryRaw`SELECT wb_guard.subject()`;
    }))).rejects.toMatchObject({code:"P2010",meta:{code:"42501"}});
  }
  evidence("Valid MAC does not bypass expiry, issuance time, audience or required nonnull fields");
});
it("rejects direct SQL identity rewrites and revoked-consent reactivation",async()=>{
  await expect(as(participant,()=>signedTransaction(tx=>tx.$executeRaw`UPDATE public.users SET id=${randomUUID()}::uuid WHERE id=${participant}::uuid`))).rejects.toThrow();
  await expect(as(participant,()=>signedTransaction(tx=>tx.$executeRaw`UPDATE public.assessment_answers SET id=${randomUUID()}::uuid WHERE assessment_session_id=${sessionId}::uuid`))).rejects.toThrow();
  const revoked=await owner.consent.findFirstOrThrow({where:{revokedAt:{not:null}}});
  const changed=await as(revoked.participantId,()=>signedTransaction(tx=>tx.$executeRaw`UPDATE public.consents SET revoked_at=NULL WHERE id=${revoked.id}::uuid`));
  expect(changed).toBe(0);
  expect(await as(revoked.targetUserId,()=>scopedPrisma.report.findUnique({where:{id:revoked.reportId}}))).toBeNull();
  expect(await owner.consent.findUnique({where:{id:revoked.id}})).toMatchObject({revokedAt:revoked.revokedAt});
  evidence("Direct SQL identity rewrite and revoked-consent reactivation denied; psychologist cannot read revoked report");
});

it("hides persisted chat messages after consultation expiry from parties and unrelated actors",async()=>{
  const message=await owner.consultationMessage.findFirstOrThrow({include:{consultationSession:{include:{appointment:true}}}});
  const session=message.consultationSession,a=session.appointment;
  const end=new Date(Date.now()-60000),start=new Date(end.getTime()-7200000);
  await owner.$transaction(async tx=>{
    await tx.appointment.update({where:{id:a.id},data:{scheduledStartAt:start,scheduledEndAt:end}});
    await tx.consultationSession.update({where:{id:session.id},data:{scheduledStartAt:start,scheduledEndAt:end}});
  });
  expect(await owner.consultationMessage.count({where:{consultationSessionId:session.id}})).toBeGreaterThan(0);
  for(const id of [a.participantId,a.psychologistId,other,admin]) {
    expect(await as(id,()=>scopedPrisma.consultationMessage.findMany({where:{consultationSessionId:session.id}}))).toEqual([]);
  }
  evidence("Expired consultation: existing message rows remain invisible to both parties, third participant and admin");
});
