import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listConsultations, transitionConsultation } from "@/lib/consultations/service";
import { confirmReportDownloadAccess, getReportArtifactForActor, grantAppointmentConsent, grantStandaloneConsent, revokeConsent } from "@/lib/appointments/service";
import { assertPhase3RehearsalEnvironment } from "../../scripts/phase3-safety.mjs";
import { fixtureId } from "../fixtures/assessment";
import { reconcileSyntheticConsultation } from "../../scripts/stage3a-reconciliation";
assertPhase3RehearsalEnvironment();
const participant = { id: fixtureId(9702), role: "PARTICIPANT" as const };
const psychologist = { id: fixtureId(9710), role: "PSYCHOLOGIST" as const };
const other = { id: fixtureId(9711), role: "PSYCHOLOGIST" as const };
const observer = new PrismaClient({ log: [] });
const blocker = new PrismaClient({ log: [] });
let fixtureIndex = 0;
let assessmentSessionId: string, reportId: string;
const evidence = (check: string, details: object = {}) => appendFileSync(join(process.env.PHASE3_EVIDENCE_DIR!, "stage3a-checks.jsonl"), JSON.stringify({ check, ...details }) + "\n");
beforeAll(async () => {
  const identity = await prisma.$queryRaw<Array<{ token: string }>>`SELECT token FROM rehearsal.identity`;
  expect(identity[0].token).toBe(process.env.PHASE3_REHEARSAL_TOKEN);
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string; checksum: string }>>`SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  expect(migrations).toHaveLength(7);
  for (const migration of migrations) expect(migration.checksum).toBe(createHash("sha256").update(readFileSync(`prisma/migrations/${migration.migration_name}/migration.sql`)).digest("hex"));
  const assessment = await prisma.assessmentSession.findFirstOrThrow({ where: { participantId: participant.id, status: "COMPLETED" }, include: { report: true } });
  assessmentSessionId = assessment.id; reportId = assessment.report!.id;
  evidence("seven migrations verified before lifecycle tests", { checksumsMatched: true });
});
afterAll(async () => { await Promise.all([prisma.$disconnect(), observer.$disconnect(), blocker.$disconnect()]); });

async function fixture() {
  const start = new Date(Date.now() - 300000), end = new Date(start.getTime() + 7200000);
  const slot = await prisma.psychologistAvailability.create({ data: { psychologistId: psychologist.id, availabilityDate: new Date(Date.UTC(2031, 0, ++fixtureIndex)), sessionType: "MORNING", status: "BOOKED" } });
  const row = await prisma.appointment.create({ data: { id: randomUUID(), participantId: participant.id, psychologistId: psychologist.id,
    assessmentSessionId, reportId, availabilityId: slot.id, scheduledStartAt: start, scheduledEndAt: end,
    consultationSession: { create: { scheduledStartAt: start, scheduledEndAt: end } } } });
  const grant = await grantAppointmentConsent(participant.id, row.id, true);
  return { id: row.id, consentId: grant.consentId, start, end };
}
const read = (id: string) => prisma.appointment.findUniqueOrThrow({ where: { id }, include: { consultationSession: true } });
async function ready(id: string) { await transitionConsultation(participant, id, "participant-check-in"); await transitionConsultation(psychologist, id, "psychologist-check-in"); }

async function race<T>(id: string, work: () => Promise<T>) {
  let release!: () => void, acquired!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const locked = new Promise<void>(resolve => { acquired = resolve; });
  const holder = blocker.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM public.appointments WHERE id=${id}::uuid FOR UPDATE`;
    acquired(); await gate;
  }, { timeout: 20000 });
  await locked;
  const running = work();
  let pids: number[] = [];
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      const waiters = await observer.$queryRaw<Array<{ pid: number }>>`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%public.appointments%'`;
      pids = [...new Set(waiters.map(row => row.pid))];
      if (pids.length >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  } finally { release(); await holder; }
  const result = await running;
  expect(pids.length).toBeGreaterThanOrEqual(2);
  evidence("independent connections raced lifecycle", { waitingBackendPids: pids });
  return result;
}

it("concurrent duplicate check-ins preserve one timestamp on independent connections", async () => {
  const f = await fixture();
  const results = await race(f.id, () => Promise.all([transitionConsultation(participant, f.id, "participant-check-in"), transitionConsultation(participant, f.id, "participant-check-in")]));
  expect(results[0].participantCheckedInAt).toBe(results[1].participantCheckedInAt);
  expect((await read(f.id)).consultationSession?.participantCheckedInAt?.toISOString()).toBe(results[0].participantCheckedInAt);
});
it("concurrent participant and psychologist check-ins produce READY without lost updates", async () => {
  const f = await fixture();
  await race(f.id, () => Promise.all([transitionConsultation(participant, f.id, "participant-check-in"), transitionConsultation(psychologist, f.id, "psychologist-check-in")]));
  expect(await read(f.id)).toMatchObject({ status: "CONFIRMED", consultationSession: { status: "READY", participantCheckedInAt: expect.any(Date), psychologistCheckedInAt: expect.any(Date) } });
});
it("concurrent starts accept exactly one and do not create consent", async () => {
  const f = await fixture(); await ready(f.id);
  const grantsBefore = await prisma.consent.count({ where: { appointmentId: f.id } });
  const results = await race(f.id, () => Promise.allSettled([transitionConsultation(psychologist, f.id, "start"), transitionConsultation(psychologist, f.id, "start")]));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "CONSULTATION_ALREADY_STARTED" } });
  expect(await read(f.id)).toMatchObject({ status: "IN_PROGRESS", consultationSession: { status: "IN_PROGRESS", startedAt: expect.any(Date), endedAt: null } });
  expect(await prisma.consent.count({ where: { appointmentId: f.id } })).toBe(grantsBefore);
});
it("competing start/end requests serialize without a partial or reopened session", async () => {
  const f = await fixture(); await ready(f.id);
  const results = await race(f.id, () => Promise.allSettled([transitionConsultation(psychologist, f.id, "start"), transitionConsultation(psychologist, f.id, "end")]));
  expect(results[0].status).toBe("fulfilled");
  const row = await read(f.id);
  expect(row.consultationSession!.status).toBe(row.status);
  if (row.status === "IN_PROGRESS") await transitionConsultation(psychologist, f.id, "end");
  expect(await read(f.id)).toMatchObject({ status: "COMPLETED", consultationSession: { status: "COMPLETED", endedAt: expect.any(Date) } });
});
it("a database failure after session start rolls back both lifecycle records", async () => {
  const f = await fixture(); await ready(f.id);
  await prisma.$executeRawUnsafe(`CREATE FUNCTION rehearsal.stage3a_fail_start() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${f.id}'::uuid AND NEW.status='IN_PROGRESS' THEN RAISE EXCEPTION 'synthetic injected failure'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe("CREATE TRIGGER stage3a_fail_start BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION rehearsal.stage3a_fail_start()");
  try { await expect(transitionConsultation(psychologist, f.id, "start")).rejects.toThrow(); }
  finally { await prisma.$executeRawUnsafe("DROP TRIGGER stage3a_fail_start ON public.appointments"); }
  expect(await read(f.id)).toMatchObject({ status: "CONFIRMED", consultationSession: { status: "READY", startedAt: null } });
});
it("expiry audit failure rolls back completion, consent expiry, and all linked timestamps", async () => {
  const f = await fixture(); await ready(f.id); await transitionConsultation(psychologist, f.id, "start");
  await prisma.$executeRawUnsafe(`CREATE FUNCTION rehearsal.stage3a_fail_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.consent_id='${f.consentId}'::uuid AND NEW.action='EXPIRED' THEN RAISE EXCEPTION 'synthetic injected expiry failure'; END IF; RETURN NEW; END $$`);
  await prisma.$executeRawUnsafe("CREATE TRIGGER stage3a_fail_expiry BEFORE INSERT ON public.consent_audit_events FOR EACH ROW EXECUTE FUNCTION rehearsal.stage3a_fail_expiry()");
  try { await expect(transitionConsultation(psychologist, f.id, "end")).rejects.toThrow(); }
  finally { await prisma.$executeRawUnsafe("DROP TRIGGER stage3a_fail_expiry ON public.consent_audit_events"); }
  expect(await read(f.id)).toMatchObject({ status: "IN_PROGRESS", completedAt: null, consultationSession: { status: "IN_PROGRESS", endedAt: null, endedBy: null, endReason: null } });
  expect(await prisma.consent.findUnique({ where: { id: f.consentId } })).toMatchObject({ expiredAt: null });
});
it("early close expires only this appointment, preserves audit history, and repeats without rewriting", async () => {
  const f = await fixture(); await ready(f.id); await transitionConsultation(psychologist, f.id, "start");
  const before = await prisma.consentAuditEvent.findMany({ where: { consentId: f.consentId } });
  const result = await transitionConsultation(psychologist, f.id, "end");
  expect((await transitionConsultation(psychologist, f.id, "end")).endedAt).toBe(result.endedAt);
  expect(await prisma.consent.findUnique({ where: { id: f.consentId } })).toMatchObject({ expiredAt: new Date(result.endedAt!), revokedAt: null });
  const after = await prisma.consentAuditEvent.findMany({ where: { consentId: f.consentId } });
  expect(after).toEqual(expect.arrayContaining(before)); expect(after.filter(e => e.action === "EXPIRED")).toHaveLength(1);
  expect(after.find(e => e.action === "EXPIRED")).toMatchObject({ actorType: "USER", actorUserId: psychologist.id });
  await expect(getReportArtifactForActor(psychologist.id, "PSYCHOLOGIST", reportId, f.id)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED" });
  const standalone = await grantStandaloneConsent(participant.id, { assessmentSessionId, reportId, psychologistId: psychologist.id, consent: true });
  expect((await getReportArtifactForActor(psychologist.id, "PSYCHOLOGIST", reportId, f.id)).id).toBe(reportId);
  expect(await prisma.consent.findUnique({ where: { id: standalone.consentId } })).toMatchObject({ expiredAt: null, revokedAt: null });
  await revokeConsent(participant.id, standalone.consentId);
  await expect(getReportArtifactForActor(psychologist.id, "PSYCHOLOGIST", reportId, f.id)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED" });
  await expect(transitionConsultation(participant, f.id, "participant-check-in")).rejects.toMatchObject({ code: "CONSULTATION_TERMINAL" });
});
it("scheduled end denies final download authorization and GET stays read-only without a scheduler", async () => {
  const f = await fixture(); await ready(f.id); await transitionConsultation(psychologist, f.id, "start");
  // Shift only synthetic fixture windows; immutable consent.expiresAt remains later.
  const pastEnd = new Date(Date.now() - 1), pastStart = new Date(pastEnd.getTime() - 7200000);
  await prisma.appointment.update({ where: { id: f.id }, data: { scheduledStartAt: pastStart, scheduledEndAt: pastEnd } });
  await prisma.consultationSession.update({ where: { appointmentId: f.id }, data: { scheduledStartAt: pastStart, scheduledEndAt: pastEnd } });
  const before = await read(f.id);
  const listed = (await listConsultations(participant)).items.find(item => item.appointmentId === f.id);
  expect(listed).toMatchObject({ effectiveStatus: "WINDOW_ENDED", sessionStatus: "IN_PROGRESS", endedAt: null });
  expect(await read(f.id)).toEqual(before);
  await expect(confirmReportDownloadAccess(psychologist.id, "PSYCHOLOGIST", reportId, f.id)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED" });
  await expect(transitionConsultation(psychologist, f.id, "end")).rejects.toMatchObject({ code: "CONSULTATION_WINDOW_ENDED" });
});
it("active profile and assignment protect mutations, lists, and private reports", async () => {
  const f = await fixture();
  await expect(transitionConsultation(other, f.id, "psychologist-check-in")).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND" });
  expect((await listConsultations(other)).items.some(row => row.appointmentId === f.id)).toBe(false);
  await expect(getReportArtifactForActor(other.id, "PSYCHOLOGIST", reportId, f.id)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED" });
  await expect(transitionConsultation({ id: fixtureId(9701), role: "PARTICIPANT" }, f.id, "participant-check-in")).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND" });
  await prisma.user.update({ where: { id: other.id }, data: { isActive: false } });
  try { await expect(listConsultations(other)).rejects.toMatchObject({ code: "FORBIDDEN" }); }
  finally { await prisma.user.update({ where: { id: other.id }, data: { isActive: true } }); }
});
it("a mismatched session window fails closed without changing either record", async () => {
  const f = await fixture();
  await prisma.consultationSession.update({ where: { appointmentId: f.id }, data: { scheduledStartAt: new Date(f.start.getTime() + 60000), scheduledEndAt: new Date(f.end.getTime() + 60000) } });
  await expect(transitionConsultation(participant, f.id, "participant-check-in")).rejects.toMatchObject({ code: "CONSULTATION_INCONSISTENT" });
  expect((await read(f.id)).consultationSession?.participantCheckedInAt).toBeNull();
});

it("isolated scheduled reconciliation requires explicit authorization and never infers no-show", async () => {
  const f = await fixture();
  await expect(reconcileSyntheticConsultation(f.id, "unapproved" as "synthetic-local-only")).rejects.toThrow(/authorization/);
  const end = new Date(Date.now() - 1), start = new Date(end.getTime() - 7200000);
  await prisma.appointment.update({ where: { id: f.id }, data: { scheduledStartAt: start, scheduledEndAt: end } });
  await prisma.consultationSession.update({ where: { appointmentId: f.id }, data: { scheduledStartAt: start, scheduledEndAt: end } });
  expect(await reconcileSyntheticConsultation(f.id, "synthetic-local-only")).toEqual({ changed: false });
  expect((await read(f.id)).consultationSession?.status).toBe("SCHEDULED");
});
it("concurrent isolated reconciliation closes an active session once at scheduled end", async () => {
  const f = await fixture(); await ready(f.id); await transitionConsultation(psychologist, f.id, "start");
  const end = new Date(Date.now() - 1), start = new Date(end.getTime() - 7200000);
  await prisma.appointment.update({ where: { id: f.id }, data: { scheduledStartAt: start, scheduledEndAt: end } });
  await prisma.consultationSession.update({ where: { appointmentId: f.id }, data: { scheduledStartAt: start, scheduledEndAt: end } });
  const results = await race(f.id, () => Promise.all([reconcileSyntheticConsultation(f.id, "synthetic-local-only"), reconcileSyntheticConsultation(f.id, "synthetic-local-only")]));
  expect(results.filter(result => result.changed)).toHaveLength(1);
  expect(await read(f.id)).toMatchObject({ status: "COMPLETED", completedAt: end, consultationSession: { endedAt: end, endedBy: "SYSTEM", endReason: "SCHEDULED_END_REACHED" } });
  expect(await prisma.consentAuditEvent.count({ where: { consentId: f.consentId, action: "EXPIRED" } })).toBe(1);
  expect(await reconcileSyntheticConsultation(f.id, "synthetic-local-only")).toEqual({ changed: false });
});
