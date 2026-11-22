import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminAppointments, adminOverview, adminPeriod, adminPeriods, adminPsychologists, createInactivePeriod } from "@/lib/admin/service";
import { listChatMessages } from "@/lib/consultations/chat-service";
import { getReportArtifactForActor } from "@/lib/appointments/service";
import { assertPhase3RehearsalEnvironment } from "../../scripts/phase3-safety.mjs";
import { fixtureId } from "../fixtures/assessment";
import { jakartaDate } from "@/lib/psychologist/availability-config";
assertPhase3RehearsalEnvironment();
const admin = fixtureId(9750), participant = fixtureId(9702), psychologist = fixtureId(9710), periodId = fixtureId(9712);
const observer = new PrismaClient({ log: [] }), blocker = new PrismaClient({ log: [] });
const evidence = (check: string, details: object = {}) => appendFileSync(join(process.env.PHASE3_EVIDENCE_DIR!, "stage3c-checks.jsonl"), JSON.stringify({ check, ...details }) + "\n");
const staged = { name: "SYNTHETIC STAGE 3C", startDate: "2035-01-01", endDate: "2035-06-30", assessmentLimit: 3 };
beforeAll(async () => {
  const identity = await prisma.$queryRaw<Array<{ token: string }>>`SELECT token FROM rehearsal.identity`;
  expect(identity[0].token).toBe(process.env.PHASE3_REHEARSAL_TOKEN);
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string; checksum: string }>>`SELECT migration_name,checksum FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
  expect(migrations).toHaveLength(8);
  for (const migration of migrations) expect(migration.checksum).toBe(createHash("sha256").update(readFileSync(`prisma/migrations/${migration.migration_name}/migration.sql`)).digest("hex"));
  // Privileged SYNTHETIC fixture setup only; no provisioning API or arbitrary public.users insert.
  const metadata = JSON.stringify({ full_name: "Synthetic admin", phone_number: "08000000000", institutional_id: "SYNTHETIC9750", user_type: "STUDENT", role: "SUPERADMIN" });
  await prisma.$executeRaw`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(${admin}::uuid,'admin-stage3c@example.test',${metadata}::jsonb)`;
  expect((await prisma.user.findUniqueOrThrow({ where: { id: admin } })).role).toBe("PARTICIPANT");
  await prisma.user.update({ where: { id: admin }, data: { role: "SUPERADMIN" } });
  evidence("eight unchanged migrations and Auth self-escalation prevention verified");
});
afterAll(async () => { await Promise.all([prisma.$disconnect(), observer.$disconnect(), blocker.$disconnect()]); });
it("rejects participants, psychologists and inactive admins for real database reads/writes", async () => {
  for (const actor of [participant, psychologist]) {
    await expect(adminPeriods(actor, { limit: 10 })).rejects.toMatchObject({ status: 403 });
    await expect(createInactivePeriod(actor, staged)).rejects.toMatchObject({ status: 403 });
  }
  await prisma.user.update({ where: { id: admin }, data: { isActive: false } });
  try { await expect(adminOverview(admin, { from: "2030-01-01", to: "2030-01-31" })).rejects.toMatchObject({ status: 403 }); }
  finally { await prisma.user.update({ where: { id: admin }, data: { isActive: true } }); }
});
it("overview matches actual operational totals and zero date windows without clinical data", async () => {
  const today = jakartaDate(new Date());
  const result = await adminOverview(admin, { from: today, to: today, periodId });
  const rows = await prisma.$queryRaw<Array<{ participants: bigint; psychologists: bigint; started: bigint; completed: bigint }>>`
    SELECT (SELECT count(*) FROM public.users WHERE role='PARTICIPANT' AND is_active) participants,
      (SELECT count(*) FROM public.users WHERE role='PSYCHOLOGIST' AND is_active) psychologists,
      (SELECT count(*) FROM public.assessment_sessions WHERE academic_period_id=${periodId}::uuid AND (started_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date=${today}::date) started,
      (SELECT count(*) FROM public.assessment_sessions WHERE academic_period_id=${periodId}::uuid AND status='COMPLETED' AND (completed_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date=${today}::date) completed`;
  expect(result).toMatchObject({ activeParticipants: Number(rows[0].participants), activePsychologists: Number(rows[0].psychologists), assessmentsStarted: Number(rows[0].started), assessmentsCompleted: Number(rows[0].completed), clinicalIndicatorsEnabled: false });
  const empty = await adminOverview(admin, { from: "2040-01-01", to: "2040-01-01" });
  expect(empty.assessmentsStarted).toBe(0); expect(empty.assessmentsCompleted).toBe(0); expect(empty.appointments.every(row => row.count === 0)).toBe(true);
  evidence("operational aggregate counts and empty windows verified");
});
it("creates future INACTIVE period and preserves historical period values and active index", async () => {
  const before = await prisma.academicPeriod.findUniqueOrThrow({ where: { id: periodId } });
  const created = await createInactivePeriod(admin, staged);
  expect(created).toMatchObject({ ...staged, status: "INACTIVE" }); expect(await adminPeriod(admin, created.id)).toEqual(created);
  expect(await prisma.academicPeriod.findUniqueOrThrow({ where: { id: periodId } })).toEqual(before);
  await expect(prisma.academicPeriod.create({ data: { name: "SYNTHETIC SECOND ACTIVE", startDate: new Date("2036-01-01"), endDate: new Date("2036-02-01"), status: "ACTIVE" } })).rejects.toThrow();
  evidence("inactive preparation preserves history and single-active database constraint");
});
it("rejects active-period overlap at inclusive boundary and invalid historical ranges", async () => {
  await expect(createInactivePeriod(admin, { ...staged, name: "SYNTHETIC OVERLAP", startDate: "2030-12-31", endDate: "2031-01-01" })).rejects.toMatchObject({ code: "PERIOD_OVERLAP" });
  await expect(createInactivePeriod(admin, { ...staged, startDate: "2000-01-01" })).rejects.toMatchObject({ code: "PERIOD_NOT_FUTURE" });
  await expect(createInactivePeriod(admin, { ...staged, startDate: "2035-02-30" })).rejects.toThrow();
  await expect(createInactivePeriod(admin, { ...staged, assessmentLimit: -1 })).rejects.toThrow();
});
it("concurrent period preparation serializes across connections and creates one record", async () => {
  let unlock!: () => void, acquired!: () => void;
  const gate = new Promise<void>(resolve => { unlock = resolve; }), ready = new Promise<void>(resolve => { acquired = resolve; });
  const holder = blocker.$transaction(async tx => { await tx.$executeRaw`LOCK TABLE public.academic_periods IN SHARE ROW EXCLUSIVE MODE`; acquired(); await gate; }, { timeout: 10000 });
  await ready;
  const command = { ...staged, name: "SYNTHETIC CONCURRENT" };
  const running = Promise.allSettled([createInactivePeriod(admin, command), createInactivePeriod(admin, command)]);
  let pids: number[] = [];
  try {
    for (let attempt = 0; attempt < 80; attempt++) {
      const rows = await observer.$queryRaw<Array<{ pid: number }>>`SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query ILIKE '%LOCK TABLE public.academic_periods%'`;
      pids = [...new Set(rows.map(row => row.pid))]; if (pids.length >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  } finally { unlock(); await holder; }
  const results = await running;
  expect(pids.length).toBeGreaterThanOrEqual(2); expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "PERIOD_DUPLICATE" } });
  expect(await prisma.academicPeriod.count({ where: { name: command.name } })).toBe(1);
  evidence("concurrent preparation serialized and duplicate denied", { waitingBackendPids: pids });
});
it("failed insert rolls back without changing existing periods", async () => {
  const before = await prisma.academicPeriod.count();
  await prisma.$executeRawUnsafe("CREATE FUNCTION rehearsal.stage3c_fail_period() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name='SYNTHETIC FAIL' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$");
  await prisma.$executeRawUnsafe("CREATE TRIGGER stage3c_fail_period BEFORE INSERT ON public.academic_periods FOR EACH ROW EXECUTE FUNCTION rehearsal.stage3c_fail_period()");
  try { await expect(createInactivePeriod(admin, { ...staged, name: "SYNTHETIC FAIL" })).rejects.toThrow(); }
  finally { await prisma.$executeRawUnsafe("DROP TRIGGER stage3c_fail_period ON public.academic_periods"); }
  expect(await prisma.academicPeriod.count()).toBe(before);
});
it("period and psychologist pagination are stable and inactive psychologists remain visible only by requested filter", async () => {
  const first = await adminPeriods(admin, { limit: 1 }), second = await adminPeriods(admin, { limit: 1, cursor: first.nextCursor! });
  expect(first.nextCursor).toBeTruthy(); expect(second.items[0].id).not.toBe(first.items[0].id);
  const psy = await adminPsychologists(admin, { from: "2030-01-01", to: "2030-01-31", limit: 50, active: "all" });
  const booked = await prisma.psychologistAvailability.count({ where: { psychologistId: psychologist, availabilityDate: { gte: new Date("2030-01-01"), lte: new Date("2030-01-31") }, status: "BOOKED" } });
  expect(psy.items.find(row => row.id === psychologist)?.availability.find(row => row.status === "BOOKED")?.count).toBe(booked);
  expect(psy.items.some(row => row.id === participant || row.id === admin)).toBe(false);
  await prisma.user.update({ where: { id: psychologist }, data: { isActive: false } });
  try {
    expect((await adminPsychologists(admin, { from: "2030-01-01", to: "2030-01-31", limit: 50, active: "true" })).items.some(row => row.id === psychologist)).toBe(false);
    expect((await adminPsychologists(admin, { from: "2030-01-01", to: "2030-01-31", limit: 50, active: "false" })).items.some(row => row.id === psychologist)).toBe(true);
  } finally { await prisma.user.update({ where: { id: psychologist }, data: { isActive: true } }); }
});
it("appointment oversight honors Jakarta boundaries, period scope, stable pages and minimal fields", async () => {
  const assessment = await prisma.assessmentSession.findFirstOrThrow({ where: { participantId: participant, status: "COMPLETED" }, select: { id: true, report: { select: { id: true } } } });
  for (const [index, timestamp] of ["2032-12-31T16:59:59.999Z", "2032-12-31T17:00:00.000Z", "2033-01-01T16:59:59.999Z", "2033-01-01T17:00:00.000Z"].entries()) {
    const start = new Date(timestamp), end = new Date(start.getTime() + 7200000);
    const slot = await prisma.psychologistAvailability.create({ data: { psychologistId: psychologist, availabilityDate: new Date(Date.UTC(2034, 0, index + 1)), sessionType: "MORNING", status: "BOOKED" } });
    await prisma.appointment.create({ data: { participantId: participant, psychologistId: psychologist, assessmentSessionId: assessment.id, reportId: assessment.report!.id, availabilityId: slot.id, scheduledStartAt: start, scheduledEndAt: end,
      consultationSession: { create: { scheduledStartAt: start, scheduledEndAt: end } } } });
  }
  const query = { from: "2033-01-01", to: "2033-01-01", limit: 1, periodId };
  const first = await adminAppointments(admin, query), second = await adminAppointments(admin, { ...query, cursor: first.nextCursor! });
  expect(first.items[0].scheduledStartAt).toBe("2032-12-31T17:00:00.000Z"); expect(second.items[0].scheduledStartAt).toBe("2033-01-01T16:59:59.999Z"); expect(second.nextCursor).toBeNull();
  expect(Object.keys(first.items[0]).sort()).toEqual(["consultationStatus", "psychologistName", "scheduledEndAt", "scheduledStartAt", "status"]);
  expect((await adminOverview(admin, { from: query.from, to: query.to, periodId })).appointments.find(row => row.status === "CONFIRMED")?.count).toBe(2);
  const other = await createInactivePeriod(admin, { ...staged, name: "SYNTHETIC EMPTY FILTER" });
  expect((await adminAppointments(admin, { ...query, periodId: other.id })).items).toEqual([]);
  evidence("WIB inclusive date boundaries stable cursor and operational DTO verified");
});
it("admin role does not grant access to human chat or private report artifacts", async () => {
  const appointment = await prisma.appointment.findFirstOrThrow({ select: { id: true, reportId: true } });
  await expect(listChatMessages({ id: admin, role: "SUPERADMIN" } as unknown as { id: string; role: "PARTICIPANT" }, appointment.id, { limit: 10 })).rejects.toMatchObject({ status: 403 });
  await expect(getReportArtifactForActor(admin, "SUPERADMIN" as Parameters<typeof getReportArtifactForActor>[1], appointment.reportId)).rejects.toMatchObject({ status: 403 });
});
it("read-only monitoring leaves operational rows and external schema catalogs unchanged", async () => {
  const counts = async () => Promise.all([prisma.appointment.count(), prisma.consultationSession.count(), prisma.consultationMessage.count(), prisma.consent.count(), prisma.assessmentSession.count()]);
  const before = await counts();
  await adminOverview(admin, { from: "2030-01-01", to: "2030-01-31" }); await adminAppointments(admin, { from: "2030-01-01", to: "2030-01-31", limit: 50 });
  expect(await counts()).toEqual(before);
  const rows = await prisma.$queryRaw<Array<{ unchanged: boolean }>>`SELECT NOT EXISTS (
    SELECT 1 FROM rehearsal.chatbot_before b FULL JOIN (SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity FROM pg_class c WHERE c.relnamespace='chatbot'::regnamespace) c USING(oid)
    WHERE (c.relname,c.relowner,c.relacl,c.relrowsecurity) IS DISTINCT FROM (b.relname,b.relowner,b.relacl,b.relrowsecurity)
  ) AND NOT EXISTS ((SELECT * FROM rehearsal.auth_triggers_before EXCEPT SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal)
    UNION ALL (SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal EXCEPT SELECT * FROM rehearsal.auth_triggers_before)) AS unchanged`;
  expect(rows[0].unchanged).toBe(true); evidence("monitoring does not mutate operational data or external Auth/chatbot catalogs");
});
