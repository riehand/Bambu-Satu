import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertPhase3RehearsalEnvironment } from "../../scripts/phase3-safety.mjs";
import { fixtureId } from "../fixtures/assessment";

// Hanya dependency connection diganti. Semua service, transaksi, SQL, guard asli.
vi.mock("@/lib/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { assertPhase3RehearsalEnvironment } = await import("../../scripts/phase3-safety.mjs");
  assertPhase3RehearsalEnvironment();
  const url = new URL(process.env.DATABASE_URL!);
  url.username = "website_runtime";
  return { prisma: new PrismaClient({ datasources: { db: { url: url.href } }, log: [] }) };
});
import { prisma as runtime } from "@/lib/prisma";
import { startAssessmentSession, saveAnswers, submitAssessment } from "@/lib/assessment/service";
import { createAppointment, getReportArtifactForActor, grantAppointmentConsent } from "@/lib/appointments/service";
import { transitionConsultation } from "@/lib/consultations/service";
import { sendChatMessage } from "@/lib/consultations/chat-service";
import { adminOverview } from "@/lib/admin/service";
import { getPsychologistProfile, setDailyAvailability, updatePsychologistProfile } from "@/lib/psychologist/service";

assertPhase3RehearsalEnvironment();
const owner = new PrismaClient({ log: [] });
function connection(role: string, clone = false) {
  const url = new URL(process.env.DATABASE_URL!);
  url.username = role;
  if (clone) url.pathname = "/wellbeing_stage3e1_deployer";
  return new PrismaClient({ datasources: { db: { url: url.href } }, log: [] });
}
const flutter = connection("flutter_runtime"), service = connection("service_role"), anon = connection("anon"), authenticated = connection("authenticated");
const deployer = connection("website_deployer",true), cloneOwner = connection("postgres",true);
const evidence = (check: string, details: object = {}) => appendFileSync(join(process.env.PHASE3_EVIDENCE_DIR!,"stage3e1-checks.jsonl"), JSON.stringify({ check,...details })+"\n");
const participant = fixtureId(9702), psychologist = fixtureId(9710), admin = fixtureId(9750);
const proposal = (name: string) => readFileSync(`docs/sql/stage3e1/${name}.sql`,"utf8");
const objectBody = proposal("03-object-privileges").replace(/^BEGIN;$/m,"").replace(/^COMMIT;$/m,"");
const recoveryBody = proposal("05-recovery").replace(/^BEGIN;$/m,"").replace(/^COMMIT;$/m,"");
// Prisma raw prepared statement tidak menerima multi-command; DO memakai SQL body statis reviewed.
const executeBody = (body: string, settings = "") => owner.$executeRawUnsafe(`DO $outer$ BEGIN ${settings} EXECUTE $reviewed$${body}$reviewed$; END $outer$;`);
const denied = async (client: PrismaClient, sql: string) => {
  await expect(client.$queryRawUnsafe(sql)).rejects.toMatchObject({ code: "P2010", meta: { code: "42501" } });
};
beforeAll(async () => {
  for (const client of [owner,cloneOwner]) {
    const rows = await client.$queryRaw<Array<{ token: string }>>`SELECT token FROM rehearsal.identity`;
    expect(rows[0].token).toBe(process.env.PHASE3_REHEARSAL_TOKEN);
  }
});
afterAll(async () => { await Promise.all([owner,runtime,flutter,service,anon,authenticated,deployer,cloneOwner].map(c=>c.$disconnect())); });

it("verifies eight migration hashes in both isolated databases", async () => {
  for (const client of [owner,deployer]) {
    const rows = await client.$queryRaw<Array<{ migration_name: string; checksum: string }>>`SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
    expect(rows).toHaveLength(8);
    for (const row of rows) expect(row.checksum).toBe(createHash("sha256").update(readFileSync(`prisma/migrations/${row.migration_name}/migration.sql`)).digest("hex"));
  }
  evidence("8 checksum cocok pada kedua DB; 6 pending diterapkan login website_deployer");
});
it("proves actual session identities and absence of role elevation paths", async () => {
  for (const [client,name] of [[runtime,"website_runtime"],[flutter,"flutter_runtime"],[deployer,"website_deployer"]] as const) {
    const rows = await client.$queryRaw<Array<{ session: string; role: string; safe: boolean; memberships: bigint }>>`
      SELECT session_user AS session,current_user AS role,NOT (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication) AS safe,
        (SELECT count(*) FROM pg_roles t WHERE t.oid<>r.oid AND (pg_has_role(r.oid,t.oid,'USAGE') OR pg_has_role(r.oid,t.oid,'SET'))) AS memberships
      FROM pg_roles r WHERE rolname=current_user`;
    expect(rows[0]).toEqual({ session:name,role:name,safe:true,memberships:BigInt(0) });
    await denied(client,"SET ROLE postgres");
    await denied(client,"SELECT * FROM auth.users");
  }
  await denied(runtime,"CREATE TABLE public.stage3e_forbidden(id int)");
  await denied(flutter,"CREATE TABLE public.stage3e_forbidden(id int)");
  await denied(runtime,"CREATE SCHEMA stage3e_forbidden");
  for (const client of [runtime,flutter,anon,authenticated,service]) await denied(client,"SET ROLE website_deployer");
  expect(await owner.$queryRaw`SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='S'`).toEqual([]);
  evidence("Login TCP nyata, bukan SET ROLE postgres; atribut dan jalur eskalasi ditolak");
});
it("observes service_role default exposure before narrow revocation", async () => {
  for (const table of ["assessment_sessions","assessment_answers","assessment_scores","reports","appointments","consultation_sessions","consents","consent_audit_events","_prisma_migrations"]) {
    const rows = await service.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) FROM public.${table}`);
    expect(rows[0].count).toBeGreaterThan(BigInt(0));
  }
  await denied(service,"SELECT * FROM public.consultation_messages");
  const funcs = await owner.$queryRaw<Array<{ allowed: boolean }>>`SELECT has_function_privilege('service_role','public.handle_auth_user_created()','EXECUTE') AS allowed`;
  expect(funcs[0].allowed).toBe(true);
  evidence("RISIKO baseline service_role: clinical/ledger terbaca; chat sudah ditolak migrasi 8");
});
it("requires approval and rolls back all revokes when inherited or SET-only access remains", async () => {
  await expect(executeBody(objectBody)).rejects.toMatchObject({ code:"P2010",meta:{code:"P0001"} });
  await owner.$executeRawUnsafe("CREATE ROLE stage3e_inherited_probe NOLOGIN");
  await owner.$executeRawUnsafe("GRANT SELECT ON public.reports TO stage3e_inherited_probe");
  for (const options of ["INHERIT TRUE, SET FALSE","INHERIT FALSE, SET TRUE"]) {
    await owner.$executeRawUnsafe(`GRANT stage3e_inherited_probe TO service_role WITH ${options}`);
    try {
      await expect(executeBody(objectBody,"PERFORM set_config('wellbeing.stage3e_objects','reviewed-exact-website-objects',true);")).rejects.toMatchObject({ code:"P2010",meta:{code:"P0001"} });
      // Ledger diproses lebih dahulu: kegagalan reports harus membatalkan revoke ledger.
      await expect(service.$queryRaw`SELECT count(*) FROM public._prisma_migrations`).resolves.toBeTruthy();
    } finally { await owner.$executeRawUnsafe("REVOKE stage3e_inherited_probe FROM service_role"); }
  }
  evidence("Approval + INHERIT dan SET-only negatives; ACL rollback terverifikasi");
});
it("removes separate column grants and exact service-role access without changing defaults", async () => {
  await owner.$executeRawUnsafe("GRANT SELECT(checksum),UPDATE(logs) ON public._prisma_migrations TO service_role");
  await executeBody(objectBody,"PERFORM set_config('wellbeing.stage3e_objects','reviewed-exact-website-objects',true);");
  for (const client of [runtime,flutter,service,anon,authenticated]) {
    await denied(client,"SELECT checksum FROM public._prisma_migrations");
    await denied(client,"UPDATE public._prisma_migrations SET logs='synthetic' WHERE false");
    await denied(client,"DELETE FROM public._prisma_migrations WHERE false");
  }
  for (const table of ["users","academic_periods","assessment_question_sets","questions","assessment_sessions","assessment_answers","assessment_scores","reports","psychologist_profiles","psychologist_availability","appointments","consultation_sessions","consents","consent_audit_events","consultation_messages"]) {
    await denied(service,`SELECT id FROM public.${table}`);
    await denied(flutter,`SELECT id FROM public.${table}`);
  }
  const drift = await owner.$queryRaw`(SELECT * FROM rehearsal.stage3e1_defaults_before EXCEPT SELECT * FROM pg_default_acl) UNION ALL (SELECT * FROM pg_default_acl EXCEPT SELECT * FROM rehearsal.stage3e1_defaults_before)`;
  expect(drift).toEqual([]);
  evidence("Exact object dan column revokes efektif; default ACL tidak berubah");
});
it("preserves shared signup/email triggers and authenticated own-profile boundary", async () => {
  const id = fixtureId(9891);
  await owner.$executeRaw`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(${id}::uuid,'stage3e1@example.test','{"full_name":"Synthetic Stage3E","phone_number":"08000000000","institutional_id":"STAGE3E9891","user_type":"STUDENT","role":"SUPERADMIN"}'::jsonb)`;
  await owner.$executeRaw`UPDATE auth.users SET email='stage3e1-updated@example.test' WHERE id=${id}::uuid`;
  const own = await authenticated.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub',${id},true)`;
    return tx.$queryRaw<Array<{id:string;role:string;email:string}>>`SELECT id,role,email FROM public.users`;
  });
  expect(own).toEqual([{id,role:"PARTICIPANT",email:"stage3e1-updated@example.test"}]);
  await denied(authenticated,"SELECT password_hash FROM public.users");
  await denied(runtime,"SELECT password_hash FROM public.users");
  await denied(anon,"SELECT id FROM public.users");
  await expect(runtime.user.findUnique({where:{id},select:{id:true,role:true,isActive:true}})).resolves.toBeNull();
  evidence("Auth trigger kontrak utuh; own-profile browser lulus; runtime profile NULL (blocker)");
});
it("denies private SECURITY DEFINER/function entrypoints and preserves their definitions", async () => {
  for (const client of [runtime,flutter,service,anon,authenticated]) {
    for (const name of ["handle_auth_user_created","handle_auth_email_changed","phase2_guard_answer","guard_consultation_message"]) await denied(client,`SELECT public.${name}()`);
  }
  expect(await owner.$queryRaw`(SELECT * FROM rehearsal.stage3e1_functions_before EXCEPT SELECT oid,proowner,prosrc,prosecdef,proconfig FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'auth'::regnamespace))`).toEqual([]);
  evidence("EXECUTE privat ditolak; owner, body, SECURITY DEFINER/search_path tetap");
});
it("isolates synthetic Flutter rows and ledgers across actual runtime connections", async () => {
  for (const table of ["messages","user_memories","safety_events","_backend_migrations"]) {
    await denied(runtime,`SELECT * FROM chatbot.${table}`);
    await denied(deployer,`SELECT * FROM chatbot.${table}`);
  }
  await denied(runtime,"UPDATE chatbot._backend_migrations SET checksum='forbidden' WHERE false");
  await denied(flutter,"UPDATE chatbot._backend_migrations SET checksum='forbidden' WHERE false");
  const rows = await flutter.$queryRaw<Array<{marker:string}>>`SELECT marker FROM chatbot.messages WHERE id=1`;
  expect(rows).toEqual([{marker:"SYNTHETIC ONLY"}]);
  await expect(flutter.$transaction(async tx=>{
    await tx.$executeRaw`INSERT INTO chatbot.messages(id,marker) VALUES(9891,'SYNTHETIC ROLLBACK')`;
    await tx.$queryRaw`SELECT id FROM public.reports`;
  })).rejects.toMatchObject({code:"P2010",meta:{code:"42501"}});
  expect(await flutter.$queryRaw`SELECT id FROM chatbot.messages WHERE id=9891`).toEqual([]);
  evidence("Flutter own schema lulus; akses silang/ledger ditolak; rollback mutation dibuktikan");
});
it("demonstrates RLS denial for all runtime clinical reads and required row locks", async () => {
  for (const table of ["academic_periods","assessment_question_sets","questions","assessment_sessions","assessment_answers","assessment_scores","reports","psychologist_profiles","psychologist_availability","appointments","consultation_sessions","consents","consent_audit_events","consultation_messages"]) {
    expect(await runtime.$queryRawUnsafe(`SELECT id FROM public.${table}`)).toEqual([]);
  }
  for (const table of ["users","academic_periods","appointments","consultation_sessions","consents"]) {
    expect(await runtime.$queryRawUnsafe(`SELECT id FROM public.${table} FOR UPDATE`)).toEqual([]);
    expect(await runtime.$queryRawUnsafe(`SELECT id FROM public.${table} FOR SHARE`)).toEqual([]);
  }
  // GUC dapat diset oleh login biasa; identitas mentah bukan attestasi JWT.
  const spoofed = await runtime.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub',${participant},true)`;
    return tx.user.findMany({select:{id:true}});
  });
  expect(spoofed).toEqual([]);
  evidence("Grant object dan row-lock ada tetapi RLS default-deny; spoof GUC tidak memberi akses");
});
it("records actual application workflow blockers under the nonprivileged runtime", async () => {
  const assessment = await owner.assessmentSession.findFirstOrThrow({where:{participantId:participant},include:{report:true}});
  await expect(startAssessmentSession(participant,true)).rejects.toMatchObject({code:"NO_ACTIVE_ACADEMIC_PERIOD"});
  await expect(saveAnswers(assessment.id,participant,{expectedRevision:0,answers:[{questionId:fixtureId(1),answerValue:0}]})).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
  await expect(submitAssessment(assessment.id,participant,{expectedRevision:0})).rejects.toMatchObject({code:"RESOURCE_NOT_FOUND"});
  await expect(getReportArtifactForActor(participant,"PARTICIPANT",assessment.report!.id)).rejects.toMatchObject({code:"REPORT_NOT_FOUND"});
  await expect(adminOverview(admin,{from:"2030-01-01",to:"2030-01-31"})).rejects.toMatchObject({code:"FORBIDDEN"});
  evidence("Runtime asli: start NO_ACTIVE_ACADEMIC_PERIOD; save/submit RESOURCE_NOT_FOUND; PDF REPORT_NOT_FOUND; admin FORBIDDEN");
});
it("blocks runtime booking and send/end races without leaving partial writes", async () => {
  const appointment = await owner.appointment.findFirstOrThrow({where:{participantId:participant}});
  const before = await owner.consultationMessage.count();
  const booking = {psychologistId:appointment.psychologistId,assessmentSessionId:appointment.assessmentSessionId,reportId:appointment.reportId,availabilityId:appointment.availabilityId,reportConsent:true};
  const booked = await Promise.allSettled([createAppointment(participant,booking),createAppointment(participant,booking)]);
  expect(booked.every(x=>x.status==="rejected")).toBe(true);
  for (const result of booked) if (result.status==="rejected") expect(result.reason).toMatchObject({code:"ASSESSMENT_REQUIRED"});
  await expect(grantAppointmentConsent(participant,appointment.id,true)).rejects.toMatchObject({code:"APPOINTMENT_NOT_FOUND"});
  const raced = await Promise.allSettled([
    sendChatMessage({id:participant,role:"PARTICIPANT"},appointment.id,{clientMessageId:randomUUID(),body:"Sintetis"}),
    transitionConsultation({id:psychologist,role:"PSYCHOLOGIST"},appointment.id,"end"),
  ]);
  expect(raced.every(x=>x.status==="rejected")).toBe(true);
  for (const result of raced) if (result.status==="rejected") expect(result.reason).toMatchObject({code:"FORBIDDEN"});
  expect(await owner.consultationMessage.count()).toBe(before);
  expect(await owner.appointment.findUnique({where:{id:appointment.id}})).toEqual(appointment);
  evidence("Race runtime ditolak sebelum mutasi, BUKAN kelulusan booking/chat/lifecycle fungsional");
});
it("records psychologist profile and availability write failures without partial changes", async () => {
  const before = await owner.psychologistProfile.findUnique({where:{userId:psychologist}});
  await expect(getPsychologistProfile(psychologist)).resolves.toBeNull();
  for (const operation of [
    ()=>updatePsychologistProfile(psychologist,{professionalTitle:"Synthetic"}),
    ()=>setDailyAvailability(psychologist,"2038-01-01",{sessions:[{sessionType:"MORNING",available:true},{sessionType:"AFTERNOON",available:false},{sessionType:"EVENING",available:false}]}),
  ]) {
    let failure: unknown;
    try { await operation(); } catch(error) { failure=error; }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("row-level security");
  }
  expect(await owner.psychologistProfile.findUnique({where:{userId:psychologist}})).toEqual(before);
  expect(await owner.psychologistAvailability.count({where:{psychologistId:psychologist,availabilityDate:new Date("2038-01-01")}})).toBe(0);
  evidence("Profile/availability INSERT gagal RLS; tidak ada partial write");
});
it("denies direct runtime INSERTs through RLS and the invoker chat guard", async () => {
  await denied(runtime,"INSERT INTO public.reports(id,assessment_session_id,updated_at) VALUES(gen_random_uuid(),gen_random_uuid(),now())");
  // BEFORE trigger berjalan sebelum WITH CHECK. Invoker tidak melihat appointment
  // melalui RLS; guard menolak 23514 sebelum INSERT mencapai pemeriksaan RLS tabel.
  await expect(runtime.$queryRawUnsafe("INSERT INTO public.consultation_messages(id,consultation_session_id,sender_id,client_message_id,body) VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'SYNTHETIC')")).rejects.toMatchObject({code:"P2010",meta:{code:"23514",message:"ERROR: CHAT_WINDOW_CLOSED"}});
  evidence("Report INSERT 42501 RLS; chat BEFORE invoker guard 23514 CHAT_WINDOW_CLOSED");
});
it("verifies deployer-owned pending objects, no Auth ownership, and preserved baseline constraints", async () => {
  const owners = await deployer.$queryRaw<Array<{name:string;owner:string}>>`SELECT relname AS name,pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'`;
  expect(owners.filter(x=>!["users","_prisma_migrations"].includes(x.name)).every(x=>x.owner==="website_deployer")).toBe(true);
  expect(owners.find(x=>x.name==="users")?.owner).toBe("postgres");
  expect(await cloneOwner.$queryRaw`(SELECT * FROM rehearsal.deployer_baseline_constraints EXCEPT SELECT conrelid,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace IN ('public'::regnamespace,'auth'::regnamespace,'chatbot'::regnamespace))`).toEqual([]);
  expect(await cloneOwner.$queryRaw`(SELECT * FROM rehearsal.profile_before EXCEPT SELECT * FROM public.users)`).toEqual([]);
  expect(await cloneOwner.$queryRaw`(SELECT * FROM rehearsal.auth_triggers_before EXCEPT SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal)`).toEqual([]);
  await denied(deployer,"SELECT id FROM public.users");
  await denied(deployer,"UPDATE chatbot._backend_migrations SET checksum='forbidden' WHERE false");
  // Owner dapat melewati RLS meskipun atribut NOBYPASSRLS. Deployer bukan runtime.
  await expect(deployer.$transaction(async tx=>{
    const row = await tx.academicPeriod.create({data:{name:"SYNTHETIC OWNER PROBE",startDate:new Date("2040-01-01"),endDate:new Date("2040-06-30"),status:"INACTIVE"}});
    expect(await tx.academicPeriod.findUnique({where:{id:row.id}})).not.toBeNull();
    throw new Error("SYNTHETIC_OWNER_ROLLBACK");
  })).rejects.toThrow("SYNTHETIC_OWNER_ROLLBACK");
  expect(await cloneOwner.academicPeriod.count()).toBe(0);
  evidence("6 pending milik deployer; REFERENCES(id) users cukup; Auth/schema chatbot tidak diberi");
});
it("recovers only deployer ledger access after an intentional local failure", async () => {
  await expect(executeBody(recoveryBody)).rejects.toMatchObject({code:"P2010",meta:{code:"P0001"}});
  await owner.$executeRawUnsafe("REVOKE UPDATE ON public._prisma_migrations FROM website_deployer");
  const localDeployer = connection("website_deployer");
  try {
    await denied(localDeployer,"UPDATE public._prisma_migrations SET logs='synthetic' WHERE false");
    await executeBody(recoveryBody,"PERFORM set_config('wellbeing.stage3e_recovery','reviewed-deployer-ledger-only',true);");
    await expect(localDeployer.$executeRaw`UPDATE public._prisma_migrations SET logs='synthetic' WHERE false`).resolves.toBe(0);
  } finally { await localDeployer.$disconnect(); }
  await denied(service,"SELECT checksum FROM public._prisma_migrations");
  evidence("Recovery khusus ledger deployer; service/browser grant tidak dipulihkan");
});
it("preserves all existing constraints and synthetic chatbot catalogs/data across both databases", async () => {
  expect(await owner.$queryRaw`(SELECT * FROM rehearsal.stage3e1_constraints_before EXCEPT SELECT conrelid,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace IN ('public'::regnamespace,'auth'::regnamespace,'chatbot'::regnamespace))`).toEqual([]);
  for (const client of [owner,cloneOwner]) {
    // Main Flutter grants are the sole intentional ACL delta; OIDs/owner/RLS remain.
    expect(await client.$queryRaw`SELECT b.relname FROM rehearsal.chatbot_before b JOIN pg_class c ON c.oid=b.oid WHERE (b.relname,b.relowner,b.relrowsecurity) IS DISTINCT FROM (c.relname,c.relowner,c.relrowsecurity)`).toEqual([]);
    for (const table of ["chat_sessions","checkins","messages","safety_events","user_memories"]) expect(await client.$queryRawUnsafe(`SELECT * FROM chatbot.${table}`)).toEqual([{id:1,marker:"SYNTHETIC ONLY"}]);
    expect(await client.$queryRaw`SELECT * FROM chatbot._backend_migrations`).toEqual([{id:"synthetic-chatbot-baseline",checksum:"synthetic-only"}]);
  }
  expect(await cloneOwner.$queryRaw`(SELECT * FROM rehearsal.chatbot_before EXCEPT SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity FROM pg_class c WHERE c.relnamespace='chatbot'::regnamespace)`).toEqual([]);
  evidence("Constraints/data/identity/Auth/chatbot dipertahankan; least-privilege workflow tetap INCOMPLETE");
});
