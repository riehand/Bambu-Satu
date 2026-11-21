import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listChatMessages, sendChatMessage } from "@/lib/consultations/chat-service";
import { transitionConsultation } from "@/lib/consultations/service";
import { grantAppointmentConsent } from "@/lib/appointments/service";
import { assertPhase3RehearsalEnvironment } from "../../scripts/phase3-safety.mjs";
import { fixtureId } from "../fixtures/assessment";
assertPhase3RehearsalEnvironment();
const participant = { id: fixtureId(9702), role: "PARTICIPANT" as const };
const psychologist = { id: fixtureId(9710), role: "PSYCHOLOGIST" as const };
const observer = new PrismaClient({ log: [] }), blocker = new PrismaClient({ log: [] });
let index = 0, assessmentSessionId: string, reportId: string;
const evidence = (check: string, details: object = {}) => appendFileSync(join(process.env.PHASE3_EVIDENCE_DIR!, "stage3b-checks.jsonl"), JSON.stringify({ check, ...details }) + "\n");
const command = (body = "Pesan sintetis") => ({ clientMessageId: randomUUID(), body });
beforeAll(async () => {
  const identity = await prisma.$queryRaw<Array<{ token: string }>>`SELECT token FROM rehearsal.identity`;
  expect(identity[0].token).toBe(process.env.PHASE3_REHEARSAL_TOKEN);
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string; checksum: string }>>`SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  expect(migrations).toHaveLength(8);
  for (const migration of migrations) expect(migration.checksum).toBe(createHash("sha256").update(readFileSync(`prisma/migrations/${migration.migration_name}/migration.sql`)).digest("hex"));
  const assessment = await prisma.assessmentSession.findFirstOrThrow({ where: { participantId: participant.id, status: "COMPLETED" }, include: { report: true } });
  assessmentSessionId = assessment.id; reportId = assessment.report!.id;
  evidence("eight successful migrations with matching checksums");
});
afterAll(async () => { await Promise.all([prisma.$disconnect(), observer.$disconnect(), blocker.$disconnect()]); });
async function fixture() {
  const start = new Date(Date.now() - 300000), end = new Date(start.getTime() + 7200000);
  const slot = await prisma.psychologistAvailability.create({ data: { psychologistId: psychologist.id, availabilityDate: new Date(Date.UTC(2032, 0, ++index)), sessionType: "MORNING", status: "BOOKED" } });
  const row = await prisma.appointment.create({ data: { participantId: participant.id, psychologistId: psychologist.id, assessmentSessionId, reportId,
    availabilityId: slot.id, scheduledStartAt: start, scheduledEndAt: end,
    consultationSession: { create: { scheduledStartAt: start, scheduledEndAt: end } } }, include: { consultationSession: true } });
  await grantAppointmentConsent(participant.id, row.id, true);
  await transitionConsultation(participant, row.id, "participant-check-in");
  await transitionConsultation(psychologist, row.id, "psychologist-check-in");
  await transitionConsultation(psychologist, row.id, "start");
  return { id: row.id, sessionId: row.consultationSession!.id };
}
async function windowEnding(id: string, milliseconds: number) {
  const end = new Date(Date.now() + milliseconds), start = new Date(end.getTime() - 7200000);
  await prisma.$transaction([
    prisma.appointment.update({ where: { id }, data: { scheduledStartAt: start, scheduledEndAt: end } }),
    prisma.consultationSession.update({ where: { appointmentId: id }, data: { scheduledStartAt: start, scheduledEndAt: end } }),
  ]);
}
async function held(id: string) {
  let acquired!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { acquired = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const done = blocker.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM public.appointments WHERE id=${id}::uuid FOR UPDATE`;
    acquired(); await gate;
  }, { timeout: 20000 });
  await ready;
  return async () => { release(); await done; };
}
async function waitForLocks(count: number) {
  let pids: number[] = [];
  for (let i = 0; i < 120; i++) {
    const rows = await observer.$queryRaw<Array<{ pid: number }>>`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%public.appointments%'`;
    pids = [...new Set(rows.map(row => row.pid))];
    if (pids.length >= count) { evidence("independent connections blocked on appointment", { waitingBackendPids: pids }); return; }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  expect(pids.length).toBeGreaterThanOrEqual(count);
}

it("new table has RLS, no policies, scoped indexes, validated FKs and deferred guard", async () => {
  const rows = await prisma.$queryRaw<Array<{ rls: boolean; policies: bigint; fks: bigint; deferred: boolean; indexdef: string }>>`
    SELECT c.relrowsecurity AS rls,
      (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid) AS policies,
      (SELECT count(*) FROM pg_constraint WHERE conrelid=c.oid AND contype='f' AND convalidated AND confdeltype='r') AS fks,
      (SELECT tgdeferrable AND tginitdeferred FROM pg_trigger WHERE tgrelid=c.oid AND tgname='consultation_message_commit_guard') AS deferred,
      (SELECT indexdef FROM pg_indexes WHERE indexname='consultation_messages_session_order_idx') AS indexdef
    FROM pg_class c WHERE c.oid='public.consultation_messages'::regclass`;
  expect(rows[0]).toMatchObject({ rls: true, policies: BigInt(0), fks: BigInt(2), deferred: true });
  expect(rows[0].indexdef).toContain("(consultation_session_id, created_at, id)");
  evidence("chat catalog constraints verified");
});
it("default-granted browser and BYPASSRLS service_role cannot read or mutate chat", async () => {
  const roles = ["anon", "authenticated", "service_role", "chatbot_runtime"];
  for (const role of roles) {
    const grants = await prisma.$queryRaw<Array<{ access: boolean }>>`SELECT has_table_privilege(${role},'public.consultation_messages','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(${role},'public.consultation_messages','SELECT,INSERT,UPDATE,REFERENCES') AS access`;
    expect(grants[0].access).toBe(false);
    for (const statement of ["SELECT id FROM public.consultation_messages", "DELETE FROM public.consultation_messages WHERE false", "UPDATE public.consultation_messages SET body='SYNTHETIC' WHERE false", "INSERT INTO public.consultation_messages(id) VALUES(gen_random_uuid())"]) {
      await expect(prisma.$transaction(async tx => { await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`); await tx.$executeRawUnsafe(statement); })).rejects.toThrow();
    }
  }
  evidence("browser service_role chatbot_runtime denied table and column access");
});
it("existing public ACL/RLS, Auth trigger definitions and synthetic external object catalogs remain unchanged", async () => {
  // Catalog-only verification; chat never reads or writes chatbot-owned application data.
  const checks = await prisma.$queryRaw<Array<{ preserved: boolean }>>`SELECT NOT EXISTS (
    SELECT 1 FROM rehearsal.public_before b JOIN pg_class c ON c.oid=b.oid
    WHERE (c.relname,c.relowner,c.relacl,c.relrowsecurity) IS DISTINCT FROM (b.relname,b.relowner,b.relacl,b.relrowsecurity)
  ) AND NOT EXISTS (
    SELECT 1 FROM rehearsal.chatbot_before b FULL JOIN (SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity FROM pg_class c WHERE c.relnamespace='chatbot'::regnamespace) c USING(oid)
    WHERE (c.relname,c.relowner,c.relacl,c.relrowsecurity) IS DISTINCT FROM (b.relname,b.relowner,b.relacl,b.relrowsecurity)
  ) AND NOT EXISTS (
    (SELECT * FROM rehearsal.auth_triggers_before EXCEPT SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal)
    UNION ALL (SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal EXCEPT SELECT * FROM rehearsal.auth_triggers_before)
  ) AS preserved`;
  expect(checks[0].preserved).toBe(true);
  evidence("prior object ACL RLS and Auth catalogs preserved");
});
it("simultaneous participant and psychologist sends serialize and do not grant report consent", async () => {
  const f = await fixture(), before = await prisma.consent.count();
  const release = await held(f.id);
  const running = Promise.all([sendChatMessage(participant, f.id, command()), sendChatMessage(psychologist, f.id, command())]);
  try { await waitForLocks(2); } finally { await release(); }
  const messages = (await running).map(result => result.message);
  expect(new Set(messages.map(message => message.id)).size).toBe(2);
  const page = await listChatMessages(participant, f.id, { limit: 30 });
  expect(page.items).toHaveLength(2);
  expect(page.items[0].createdAt < page.items[1].createdAt).toBe(true);
  expect(page.items.map(item => item.own).sort()).toEqual([false, true]);
  expect(page.items.find(item => !item.own)?.clientMessageId).toBeNull();
  expect(await prisma.consent.count()).toBe(before);
});
it("concurrent identical idempotency keys commit one message; changed body conflicts", async () => {
  const f = await fixture(), payload = command(), release = await held(f.id);
  const running = Promise.all([sendChatMessage(participant, f.id, payload), sendChatMessage(participant, f.id, payload)]);
  try { await waitForLocks(2); } finally { await release(); }
  const results = await running;
  expect(results[0].message.id).toBe(results[1].message.id);
  expect(results.map(result => result.replayed).sort()).toEqual([false, true]);
  await expect(sendChatMessage(participant, f.id, { ...payload, body: "Berbeda" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  expect(await prisma.consultationMessage.count({ where: { consultationSessionId: f.sessionId } })).toBe(1);
  // The same client UUID belongs to a sender+session, never a global message identity.
  await sendChatMessage(psychologist, f.id, payload);
  const other = await fixture(); await sendChatMessage(participant, other.id, payload);
});
it("completion queued before a send denies the send without partial data", async () => {
  const f = await fixture(), release = await held(f.id);
  const end = transitionConsultation(psychologist, f.id, "end");
  let sending: ReturnType<typeof Promise.allSettled>;
  try {
    await waitForLocks(1);
    sending = Promise.allSettled([sendChatMessage(participant, f.id, command())]);
    await waitForLocks(2);
  } finally { await release(); }
  await end;
  expect((await sending!)[0]).toMatchObject({ status: "rejected", reason: { code: "CHAT_CLOSED" } });
  expect(await prisma.consultationMessage.count({ where: { consultationSessionId: f.sessionId } })).toBe(0);
});
it("send queued first commits before completion and closed sessions reject new sends and history", async () => {
  const f = await fixture(), payload = command(), release = await held(f.id);
  const send = sendChatMessage(participant, f.id, payload);
  let end!: ReturnType<typeof transitionConsultation>;
  try { await waitForLocks(1); end = transitionConsultation(psychologist, f.id, "end"); await waitForLocks(2); }
  finally { await release(); }
  const message = (await send).message; const closed = await end;
  expect(message.createdAt <= closed.endedAt!).toBe(true);
  await expect(sendChatMessage(participant, f.id, payload)).rejects.toMatchObject({ code: "CHAT_CLOSED" });
  await expect(listChatMessages(psychologist, f.id, { limit: 30 })).rejects.toMatchObject({ code: "CHAT_CLOSED" });
  expect(await prisma.consultationMessage.count({ where: { consultationSessionId: f.sessionId } })).toBe(1);
});
it("expiry while a request waits for the appointment lock rejects the pending send", async () => {
  const f = await fixture(); await windowEnding(f.id, 750);
  const release = await held(f.id);
  const sending = Promise.allSettled([sendChatMessage(participant, f.id, command())]);
  try { await waitForLocks(1); await new Promise(resolve => setTimeout(resolve, 850)); }
  finally { await release(); }
  expect((await sending)[0]).toMatchObject({ status: "rejected", reason: { code: "CHAT_CLOSED" } });
  expect(await prisma.consultationMessage.count({ where: { consultationSessionId: f.sessionId } })).toBe(0);
});
it("deferred trigger rolls back an inserted message when the transaction crosses scheduled end", async () => {
  const f = await fixture(); await windowEnding(f.id, 750);
  let inserted = false;
  let commitErrorReported = false;
  await prisma.$transaction(async tx => {
    await tx.consultationMessage.create({ data: { consultationSessionId: f.sessionId, senderId: participant.id, ...command() } });
    inserted = true;
    await tx.$queryRaw`SELECT 1 FROM pg_sleep(1)`;
  }).catch(() => { commitErrorReported = true; });
  expect(inserted).toBe(true);
  expect(await prisma.consultationMessage.count({ where: { consultationSessionId: f.sessionId } })).toBe(0);
  evidence("deferred commit clock guard rolled back an inserted row", { commitErrorReported });
});
it("service never confirms a deferred rollback even when Prisma resolves the transaction", async () => {
  const f = await fixture(); await windowEnding(f.id, 750);
  await prisma.$executeRawUnsafe(`CREATE FUNCTION rehearsal.stage3b_delay_send() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.consultation_session_id='${f.sessionId}'::uuid THEN PERFORM pg_sleep(1); END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe("CREATE TRIGGER stage3b_delay_send AFTER INSERT ON public.consultation_messages FOR EACH ROW EXECUTE FUNCTION rehearsal.stage3b_delay_send()");
  try { await expect(sendChatMessage(participant, f.id, command())).rejects.toMatchObject({ code: "CHAT_SEND_FAILED" }); }
  finally { await prisma.$executeRawUnsafe("DROP TRIGGER stage3b_delay_send ON public.consultation_messages"); }
  expect(await prisma.consultationMessage.count({ where: { consultationSessionId: f.sessionId } })).toBe(0);
  evidence("service rejects unconfirmed commit after deferred rollback");
});
it("failed transaction rolls back the message and allows a retry with the same key", async () => {
  const f = await fixture(), payload = command();
  await expect(prisma.$transaction(async tx => {
    await tx.consultationMessage.create({ data: { consultationSessionId: f.sessionId, senderId: participant.id, ...payload } });
    throw new Error("synthetic rollback");
  })).rejects.toThrow("synthetic rollback");
  expect(await prisma.consultationMessage.count({ where: { consultationSessionId: f.sessionId } })).toBe(0);
  expect((await sendChatMessage(participant, f.id, payload)).replayed).toBe(false);
});
it("other participants, unassigned psychologists and forged roles cannot read or send", async () => {
  const f = await fixture();
  for (const actor of [{ id: fixtureId(9701), role: "PARTICIPANT" as const }, { id: fixtureId(9711), role: "PSYCHOLOGIST" as const }, { id: participant.id, role: "PSYCHOLOGIST" as const }]) {
    await expect(sendChatMessage(actor, f.id, command())).rejects.toMatchObject({ status: actor.id === participant.id ? 403 : 404 });
    await expect(listChatMessages(actor, f.id, { limit: 30 })).rejects.toMatchObject({ status: actor.id === participant.id ? 403 : 404 });
  }
  await prisma.user.update({ where: { id: psychologist.id }, data: { isActive: false } });
  try { await expect(sendChatMessage(participant, f.id, command())).rejects.toMatchObject({ code: "FORBIDDEN" }); }
  finally { await prisma.user.update({ where: { id: psychologist.id }, data: { isActive: true } }); }
});
it("database constraints reject empty/oversized bodies and a sender outside the assigned parties", async () => {
  const f = await fixture();
  for (const body of ["", " \n\t ", "x".repeat(2001)]) {
    await expect(prisma.consultationMessage.create({ data: { consultationSessionId: f.sessionId, senderId: participant.id, ...command(body) } })).rejects.toThrow();
  }
  await expect(prisma.consultationMessage.create({ data: { consultationSessionId: f.sessionId, senderId: fixtureId(9711), ...command() } })).rejects.toThrow();
  expect(await prisma.consultationMessage.count({ where: { consultationSessionId: f.sessionId } })).toBe(0);
});
it("cursor pages are stable and reconnect after-cursor includes peer messages without repeats", async () => {
  const f = await fixture();
  const sent = [];
  for (let i = 0; i < 5; i++) sent.push((await sendChatMessage(participant, f.id, command())).message.id);
  const last = await listChatMessages(participant, f.id, { limit: 2 });
  const middle = await listChatMessages(participant, f.id, { limit: 2, before: last.nextCursor! });
  const first = await listChatMessages(participant, f.id, { limit: 2, before: middle.nextCursor! });
  expect([...first.items, ...middle.items, ...last.items].map(item => item.id)).toEqual(sent);
  expect(first.nextCursor).toBeNull();
  const peer = await sendChatMessage(psychologist, f.id, command());
  const mine = await sendChatMessage(participant, f.id, command());
  const after = await listChatMessages(participant, f.id, { limit: 1, after: last.latestCursor! });
  expect(after.items[0].id).toBe(peer.message.id);
  const more = await listChatMessages(participant, f.id, { limit: 1, after: after.latestCursor! });
  expect(more.items[0].id).toBe(mine.message.id);
  expect((await listChatMessages(participant, f.id, { limit: 1, after: more.latestCursor! })).items).toEqual([]);
  const other = await fixture();
  await expect(listChatMessages(participant, other.id, { limit: 2, before: last.nextCursor! })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
});
it("database overrides client timestamps and gives rapid inserts strictly increasing cursor order", async () => {
  const f = await fixture();
  const rows = await prisma.$transaction(async tx => {
    const result = [];
    for (let i = 0; i < 10; i++) result.push(await tx.consultationMessage.create({ data: { consultationSessionId: f.sessionId, senderId: participant.id, createdAt: new Date("2000-01-01"), ...command() } }));
    return result;
  });
  for (let i = 1; i < rows.length; i++) expect(rows[i].createdAt.getTime()).toBeGreaterThan(rows[i - 1].createdAt.getTime());
  expect(rows[0].createdAt.getFullYear()).toBeGreaterThan(2000);
  evidence("strict ordering under rapid inserts and server-authoritative timestamps");
});
