// Real PostgreSQL only. Every profile, assessment and report artifact here is synthetic.
import { afterAll, beforeAll, expect, it } from "vitest";
import { ConsentAuditActorType, ConsentType, Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertPhase3RehearsalEnvironment } from "../../scripts/phase3-safety.mjs";
import { prisma } from "@/lib/prisma";
import { saveAnswers, startAssessmentSession, submitAssessment } from "@/lib/assessment/service";
import {
  createAppointment, getAppointmentForParty, getBookingContext, getReportForActor,
  grantAppointmentConsent, grantStandaloneConsent, revokeConsent,
} from "@/lib/appointments/service";
import { setDailyAvailability } from "@/lib/psychologist/service";
import { sessionStartsAt } from "@/lib/psychologist/availability-config";
import { syntheticQuestionSet, fixtureId } from "../fixtures/assessment";

assertPhase3RehearsalEnvironment();

const migrationNames = [
  "20261021144827_init_users", "20261023000000_supabase_auth", "20261023010000_phase2_assessment",
  "20261028000000_psychologist_profiles", "20261029000000_psychologist_availability",
  "20261029000001_appointments_report_consent",
];
const participants = {
  pending: fixtureId(9701), booking: fixtureId(9702), contenderA: fixtureId(9703), contenderB: fixtureId(9704),
  earlyClose: fixtureId(9705), scheduledEnd: fixtureId(9706), cancellation: fixtureId(9707), noShow: fixtureId(9708), rollback: fixtureId(9709),
  standaloneOnly: fixtureId(9715),
};
const psychologistId = fixtureId(9710);
const otherPsychologistId = fixtureId(9711);
const periodId = fixtureId(9712);
const questionSetId = fixtureId(9713);
const fixture = syntheticQuestionSet();
const assessmentByParticipant = new Map<string, { assessmentSessionId: string; reportId: string }>();
const applicationObserver = new PrismaClient({ log: [] });
const activityObserver = new PrismaClient({ log: [] });
const dates = {
  booking: "2030-01-01", earlyClose: "2030-01-02", scheduledEnd: "2030-01-03", concurrency: "2030-01-04",
  cancellation: "2030-01-05", noShow: "2030-01-06", pending: "2030-01-07", rollback: "2030-01-08",
};

function record(check: string, details: Record<string, unknown>) {
  appendFileSync(join(process.env.PHASE3_EVIDENCE_DIR!, "checks.jsonl"), JSON.stringify({ check, ...details }) + "\n");
}

async function createAuthParticipant(id: string, index: number) {
  const institutionalId = `TEST09${String(index).padStart(3, "0")}`;
  const metadata = JSON.stringify({
    full_name: `Synthetic participant ${index}`, phone_number: "08000000000",
    institutional_id: institutionalId, user_type: "STUDENT", role: "SUPERADMIN",
  });
  await prisma.$executeRaw`INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (${id}::uuid,${`participant-${index}@example.test`},${metadata}::jsonb)`;
  expect(await prisma.user.findUnique({ where: { id } })).toMatchObject({ id, role: "PARTICIPANT", isActive: true });
}

async function completeSyntheticAssessment(participantId: string) {
  const started = await startAssessmentSession(participantId, true);
  const answers = fixture.questions.map(question => ({ questionId: question.id, answerValue: question.instrument === "DASS21" ? 1 : 3 }));
  await saveAnswers(started.assessmentSessionId, participantId, { expectedRevision: 0, answers });
  const completed = await submitAssessment(started.assessmentSessionId, participantId, { expectedRevision: 1 });
  expect(completed.status).toBe("COMPLETED");
  expect(await prisma.report.findUnique({ where: { assessmentSessionId: completed.assessmentSessionId } })).toMatchObject({ status: "PENDING", filePathOrObjectKey: null, generatedAt: null });
  return { assessmentSessionId: completed.assessmentSessionId, reportId: completed.reportId };
}

async function syntheticGeneratedArtifact(assessmentSessionId: string) {
  // Deliberately synthetic fixture only; application code never sets GENERATED.
  await prisma.report.update({ where: { assessmentSessionId }, data: {
    status: "GENERATED", filePathOrObjectKey: `synthetic-fixtures/${assessmentSessionId}/private-report.pdf`, generatedAt: new Date(),
  } });
}

async function availabilityId(date: string) {
  const slot = await prisma.psychologistAvailability.findUnique({
    where: { psychologist_date_session: { psychologistId, availabilityDate: new Date(`${date}T00:00:00.000Z`), sessionType: "MORNING" } },
    select: { id: true, status: true },
  });
  if (!slot) throw new Error(`Missing synthetic availability for ${date}`);
  return slot;
}

function bookingInput(participantId: string, date: string, reportConsent = true) {
  const assessment = assessmentByParticipant.get(participantId)!;
  return availabilityId(date).then(slot => ({
    psychologistId, assessmentSessionId: assessment.assessmentSessionId, reportId: assessment.reportId,
    availabilityId: slot.id, reportConsent,
  }));
}

async function book(participantId: string, date: string, reportConsent = true) {
  return createAppointment(participantId, await bookingInput(participantId, date, reportConsent));
}

async function setTestAvailability(date: string) {
  await setDailyAvailability(psychologistId, date, { sessions: [
    { sessionType: "MORNING", available: true },
    { sessionType: "AFTERNOON", available: false },
    { sessionType: "EVENING", available: false },
  ] });
}

async function setWaitUntilOpen() {
  let release!: () => void;
  let acquired!: (pid: number) => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const locked = new Promise<number>(resolve => { acquired = resolve; });
  return { gate, release, locked, acquired };
}

beforeAll(async () => {
  const [identity] = await prisma.$queryRaw<Array<{ token: string; version: string }>>`
    SELECT token, current_setting('server_version_num') AS version FROM rehearsal.identity`;
  expect(identity.token).toBe(process.env.PHASE3_REHEARSAL_TOKEN);
  expect(identity.version).toMatch(/^17\d{4}$/);
  const [target] = await prisma.$queryRaw<Array<{ database: string; port: number; pid: number }>>`
    SELECT current_database() AS database, inet_server_port() AS port, pg_backend_pid() AS pid`;
  expect(target).toMatchObject({ database: "wellbeing_phase3_rehearsal", port: 5432 });
  record("connected_isolated_target", { ...target, postgresVersionNumber: identity.version, markerMatched: true });

  const migrations = await prisma.$queryRaw<Array<{ migration_name: string; checksum: string; applied: boolean }>>`
    SELECT migration_name, checksum, finished_at IS NOT NULL AND rolled_back_at IS NULL AS applied
    FROM _prisma_migrations ORDER BY migration_name`;
  expect(migrations.map(({ migration_name }) => migration_name)).toEqual(migrationNames);
  for (const item of migrations) {
    expect(item.applied).toBe(true);
    expect(item.checksum).toBe(createHash("sha256").update(readFileSync(`prisma/migrations/${item.migration_name}/migration.sql`)).digest("hex"));
  }
  const profileDiff = await prisma.$queryRaw`(SELECT * FROM rehearsal.profile_before EXCEPT SELECT * FROM public.users) UNION ALL (SELECT * FROM public.users EXCEPT SELECT * FROM rehearsal.profile_before)`;
  const triggerDiff = await prisma.$queryRaw`(SELECT * FROM rehearsal.auth_triggers_before EXCEPT SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal)`;
  expect(profileDiff).toEqual([]);
  expect(triggerDiff).toEqual([]);
  record("migration_and_auth_baseline", { appliedMigrations: migrations.length, checksumsMatched: true, baselineProfilesPreserved: true, authTriggersPreserved: true });

  for (const [index, participantId] of Object.values(participants).entries()) await createAuthParticipant(participantId, index + 10);
  for (const [index, id] of [psychologistId, otherPsychologistId].entries()) {
    await createAuthParticipant(id, index + 30);
    await prisma.user.update({ where: { id }, data: { role: "PSYCHOLOGIST", userType: null, institutionalId: null } });
  }

  const { questions, ...rawSet } = fixture;
  const set = { ...rawSet, id: questionSetId, dassOptions: rawSet.dassOptions as Prisma.InputJsonValue, wemwbsOptions: rawSet.wemwbsOptions as Prisma.InputJsonValue };
  await prisma.assessmentQuestionSet.create({ data: { ...set, isPublished: false } });
  await prisma.question.createMany({ data: questions.map(question => ({ ...question, questionSetId })) });
  await prisma.assessmentQuestionSet.update({ where: { id: questionSetId }, data: { isPublished: true } });
  await prisma.academicPeriod.create({ data: {
    id: periodId, name: "SYNTHETIC PHASE 3 ONLY", startDate: new Date("2026-01-01"), endDate: new Date("2030-12-31"), status: "ACTIVE",
  } });

  for (const participantId of Object.values(participants)) {
    const assessment = await completeSyntheticAssessment(participantId);
    assessmentByParticipant.set(participantId, assessment);
    if (participantId !== participants.pending) await syntheticGeneratedArtifact(assessment.assessmentSessionId);
  }
  for (const date of Object.values(dates)) await setTestAvailability(date);
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), applicationObserver.$disconnect(), activityObserver.$disconnect()]);
});

it("rejects PENDING reports without reserving a slot or fabricating GENERATED", async () => {
  const participantId = participants.pending;
  const context = await getBookingContext(participantId);
  expect(context).toMatchObject({ canBook: false, latestAssessment: { reportStatus: "PENDING" } });
  await expect(book(participantId, dates.pending)).rejects.toMatchObject({ code: "REPORT_NOT_GENERATED", status: 409 });
  const slot = await availabilityId(dates.pending);
  expect(slot.status).toBe("AVAILABLE");
  expect(await prisma.appointment.count({ where: { participantId } })).toBe(0);
  expect(await prisma.report.findUnique({ where: { assessmentSessionId: assessmentByParticipant.get(participantId)!.assessmentSessionId } })).toMatchObject({ status: "PENDING", filePathOrObjectKey: null, generatedAt: null });
  record("pending_report_booking_gate", { rejected: true, slotStillAvailable: true, appGeneratedStatusWrites: false });
});

it("books atomically with fresh consent, enforces object scope, and handles revoke/re-consent independently", async () => {
  const participantId = participants.booking;
  const assessment = assessmentByParticipant.get(participantId)!;
  const booking = await book(participantId, dates.booking);
  expect(booking.status).toBe("CONFIRMED");
  const appointment = await prisma.appointment.findUnique({ where: { id: booking.appointmentId }, include: { consultationSession: true, consents: { include: { auditEvents: true } }, availability: true } });
  expect(appointment).toMatchObject({ status: "CONFIRMED", availability: { status: "BOOKED" }, consultationSession: { status: "SCHEDULED", endedAt: null } });
  expect(appointment?.consents).toHaveLength(1);
  const originalGrant = appointment!.consents[0];
  expect(originalGrant).toMatchObject({
    participantId, reportId: assessment.reportId, targetUserId: psychologistId,
    appointmentId: booking.appointmentId, consentType: "APPOINTMENT_REPORT_ACCESS",
    scope: { participantId, reportId: assessment.reportId, psychologistId, appointmentId: booking.appointmentId },
    policyVersion: expect.any(String), purpose: expect.any(String),
  });
  expect(originalGrant.auditEvents.map(event => [event.action, event.actorType, event.actorUserId])).toEqual([["GRANTED", "USER", participantId]]);
  expect((await getReportForActor(psychologistId, "PSYCHOLOGIST", assessment.reportId)).id).toBe(assessment.reportId);
  await expect(getReportForActor(otherPsychologistId, "PSYCHOLOGIST", assessment.reportId)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED", status: 403 });
  await expect(getReportForActor(participants.pending, "PARTICIPANT", assessment.reportId)).rejects.toMatchObject({ code: "REPORT_NOT_FOUND", status: 404 });
  expect((await getReportForActor(participantId, "PARTICIPANT", assessment.reportId)).id).toBe(assessment.reportId);
  await expect(getAppointmentForParty(participants.contenderA, "PARTICIPANT", booking.appointmentId)).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND", status: 404 });
  await expect(getAppointmentForParty(otherPsychologistId, "PSYCHOLOGIST", booking.appointmentId)).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND", status: 404 });

  await revokeConsent(participantId, originalGrant.id);
  await expect(getReportForActor(psychologistId, "PSYCHOLOGIST", assessment.reportId)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED", status: 403 });
  expect(await prisma.appointment.findUnique({ where: { id: booking.appointmentId }, include: { consultationSession: true } })).toMatchObject({
    status: "CONFIRMED", consultationSession: { status: "SCHEDULED", endedAt: null },
  });
  const replacementGrant = await grantAppointmentConsent(participantId, booking.appointmentId, true);
  expect(replacementGrant.consentId).not.toBe(originalGrant.id);
  expect((await prisma.consent.findUnique({ where: { id: originalGrant.id } }))?.revokedAt).not.toBeNull();
  expect((await getReportForActor(psychologistId, "PSYCHOLOGIST", assessment.reportId)).id).toBe(assessment.reportId);
  await revokeConsent(participantId, replacementGrant.consentId);
  await expect(getReportForActor(psychologistId, "PSYCHOLOGIST", assessment.reportId)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED", status: 403 });

  const standalone = await grantStandaloneConsent(participantId, {
    assessmentSessionId: assessment.assessmentSessionId, reportId: assessment.reportId, psychologistId, consent: true,
  });
  expect(standalone).toMatchObject({ consentType: "STANDALONE_REPORT_ACCESS", appointmentId: null });
  expect((await getReportForActor(psychologistId, "PSYCHOLOGIST", assessment.reportId)).id).toBe(assessment.reportId);
  await revokeConsent(participantId, standalone.consentId);
  await expect(getReportForActor(psychologistId, "PSYCHOLOGIST", assessment.reportId)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED", status: 403 });
  record("booking_consent_authorization", { immediateConfirmed: true, exactObjectScope: true, revokeDoesNotCloseOrCancel: true, reconsentIsNewGrant: true, standaloneEvaluatedSeparately: true });
});

it("does not let a pre-existing standalone grant satisfy fresh booking consent", async () => {
  const participantId = participants.standaloneOnly;
  const assessment = assessmentByParticipant.get(participantId)!;
  const standalone = await grantStandaloneConsent(participantId, {
    assessmentSessionId: assessment.assessmentSessionId, reportId: assessment.reportId, psychologistId, consent: true,
  });
  expect(standalone.appointmentId).toBeNull();
  await expect(book(participantId, dates.noShow, false)).rejects.toMatchObject({ code: "REPORT_CONSENT_REQUIRED", status: 403 });
  expect(await prisma.appointment.count({ where: { participantId } })).toBe(0);
  record("standalone_does_not_satisfy_booking", { standaloneExists: true, missingFreshConsentRejected: true, appointmentCreated: false });
});

it("proves concurrent booking contenders wait on independent PostgreSQL connections", async () => {
  const slot = await availabilityId(dates.concurrency);
  const wait = await setWaitUntilOpen();
  let holderPid = 0;
  const holder = applicationObserver.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM public.psychologist_availability WHERE id=${slot.id}::uuid FOR UPDATE`;
    const [backend] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    holderPid = backend.pid;
    wait.acquired(holderPid);
    await wait.gate;
  }, { timeout: 30000 });
  await wait.locked;
  const contenderRuns = Promise.allSettled([
    book(participants.contenderA, dates.concurrency),
    book(participants.contenderB, dates.concurrency),
  ]);
  let waitingPids: number[] = [];
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      const rows = await activityObserver.$queryRaw<Array<{ pid: number }>>`
        SELECT pid FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock' AND pid <> ${holderPid}
          AND query ILIKE '%psychologist_availability%'
        ORDER BY pid`;
      waitingPids = [...new Set(rows.map(({ pid }) => pid))];
      if (waitingPids.length >= 2) break;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  } finally {
    wait.release();
    await holder;
  }
  const results = await contenderRuns;
  expect(waitingPids.length).toBeGreaterThanOrEqual(2);
  expect(new Set(waitingPids).size).toBeGreaterThanOrEqual(2);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "SLOT_ALREADY_BOOKED", status: 409 });
  expect(await prisma.appointment.count({ where: { availabilityId: slot.id, status: "CONFIRMED" } })).toBe(1);
  expect(await prisma.consent.count({ where: { appointment: { availabilityId: slot.id }, consentType: "APPOINTMENT_REPORT_ACCESS" } })).toBe(1);
  record("independent_connection_slot_race", { blockerPid: holderPid, waitingBackendPids: waitingPids, uniqueWaitingConnections: waitingPids.length, confirmedAppointments: 1, linkedConsents: 1 });
});

it("records each expiry once for scheduled end, psychologist early close, cancellation, and terminal no-show", async () => {
  const cases = [
    { participantId: participants.earlyClose, date: dates.earlyClose, reason: "early_close" },
    { participantId: participants.cancellation, date: dates.cancellation, reason: "cancellation" },
    { participantId: participants.noShow, date: dates.noShow, reason: "terminal_no_show" },
  ];
  const grants: Array<{ participantId: string; reportId: string; appointmentId: string; consentId: string; grantedAt: Date; reason: string }> = [];

  // Use an explicitly historical synthetic row to exercise scheduled-end expiry
  // without waiting through the production two-hour session window.
  const historyInstant = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(historyInstant);
  const historyDate = `${parts.find(part => part.type === "year")!.value}-${parts.find(part => part.type === "month")!.value}-${parts.find(part => part.type === "day")!.value}`;
  const scheduledStart = sessionStartsAt(historyDate, "MORNING");
  const scheduledEnd = new Date(scheduledStart.getTime() + 2 * 60 * 60 * 1000);
  const historicalGrantedAt = new Date(scheduledStart.getTime() - 30 * 60 * 1000);
  const historicalSlot = await prisma.psychologistAvailability.create({ data: {
    psychologistId, availabilityDate: new Date(`${historyDate}T00:00:00.000Z`), sessionType: "MORNING", status: "BOOKED",
  } });
  const historicalAppointment = await prisma.appointment.create({ data: {
    participantId: participants.scheduledEnd, psychologistId,
    assessmentSessionId: assessmentByParticipant.get(participants.scheduledEnd)!.assessmentSessionId,
    reportId: assessmentByParticipant.get(participants.scheduledEnd)!.reportId,
    availabilityId: historicalSlot.id, status: "CONFIRMED", scheduledStartAt: scheduledStart,
    scheduledEndAt: scheduledEnd, bookedAt: historicalGrantedAt, createdAt: historicalGrantedAt, updatedAt: historicalGrantedAt,
  } });
  await prisma.consultationSession.create({ data: {
    appointmentId: historicalAppointment.id, status: "SCHEDULED", scheduledStartAt: scheduledStart, scheduledEndAt: scheduledEnd,
  } });
  const historicalConsent = await prisma.consent.create({ data: {
    participantId: participants.scheduledEnd,
    assessmentSessionId: assessmentByParticipant.get(participants.scheduledEnd)!.assessmentSessionId,
    reportId: assessmentByParticipant.get(participants.scheduledEnd)!.reportId,
    targetUserId: psychologistId, appointmentId: historicalAppointment.id,
    consentType: ConsentType.APPOINTMENT_REPORT_ACCESS,
    purpose: "Synthetic historical fixture for scheduled-end expiry verification.",
    scope: { participantId: participants.scheduledEnd, reportId: assessmentByParticipant.get(participants.scheduledEnd)!.reportId, psychologistId, appointmentId: historicalAppointment.id },
    policyVersion: "report-sharing-v1", grantedAt: historicalGrantedAt, expiresAt: scheduledEnd, createdAt: historicalGrantedAt,
  } });
  await prisma.consentAuditEvent.create({ data: {
    consentId: historicalConsent.id, actorType: ConsentAuditActorType.USER,
    actorUserId: participants.scheduledEnd, action: "GRANTED", occurredAt: historicalGrantedAt,
  } });
  grants.push({
    participantId: participants.scheduledEnd, reportId: assessmentByParticipant.get(participants.scheduledEnd)!.reportId,
    appointmentId: historicalAppointment.id, consentId: historicalConsent.id, grantedAt: historicalGrantedAt, reason: "scheduled_end",
  });

  for (const item of cases) {
    const booking = await book(item.participantId, item.date);
    const consentRow = await prisma.consent.findFirst({ where: { appointmentId: booking.appointmentId, consentType: "APPOINTMENT_REPORT_ACCESS" } });
    grants.push({ participantId: item.participantId, reportId: assessmentByParticipant.get(item.participantId)!.reportId, appointmentId: booking.appointmentId, consentId: consentRow!.id, grantedAt: consentRow!.grantedAt, reason: item.reason });
  }

  const early = grants.find(item => item.reason === "early_close")!;
  const earlyAt = new Date();
  await prisma.appointment.update({ where: { id: early.appointmentId }, data: { status: "COMPLETED", completedAt: earlyAt, scheduledStartAt: new Date(earlyAt.getTime() - 30 * 60 * 1000), scheduledEndAt: new Date(earlyAt.getTime() + 90 * 60 * 1000) } });
  await prisma.consultationSession.update({ where: { appointmentId: early.appointmentId }, data: {
    status: "CLOSED", scheduledStartAt: new Date(earlyAt.getTime() - 30 * 60 * 1000), scheduledEndAt: new Date(earlyAt.getTime() + 90 * 60 * 1000),
    endedAt: earlyAt, endedBy: "PSYCHOLOGIST", endReason: "PSYCHOLOGIST_COMPLETED",
  } });

  const cancelled = grants.find(item => item.reason === "cancellation")!;
  const cancelledAt = new Date();
  await prisma.appointment.update({ where: { id: cancelled.appointmentId }, data: { status: "CANCELLED", cancelledAt } });

  const noShow = grants.find(item => item.reason === "terminal_no_show")!;
  const noShowAt = new Date();
  await prisma.appointment.update({ where: { id: noShow.appointmentId }, data: { status: "NO_SHOW" } });
  await prisma.consultationSession.update({ where: { appointmentId: noShow.appointmentId }, data: {
    status: "NO_SHOW", endedAt: noShowAt, endedBy: "SYSTEM", endReason: "PSYCHOLOGIST_NO_SHOW",
  } });

  const scheduled = grants.find(item => item.reason === "scheduled_end")!;
  await expect(grantAppointmentConsent(scheduled.participantId, scheduled.appointmentId, true))
    .rejects.toMatchObject({ code: "APPOINTMENT_CONSENT_EXPIRED", status: 409 });
  await revokeConsent(cancelled.participantId, cancelled.consentId);

  for (const item of grants) {
    await expect(getReportForActor(psychologistId, "PSYCHOLOGIST", item.reportId)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED", status: 403 });
    const row = await prisma.consent.findUnique({ where: { id: item.consentId } });
    expect(row?.expiredAt).not.toBeNull();
    const events = await prisma.consentAuditEvent.findMany({ where: { consentId: item.consentId, action: "EXPIRED" } });
    expect(events).toHaveLength(1);
    if (item.reason === "early_close") expect(events[0]).toMatchObject({ actorType: "USER", actorUserId: psychologistId });
    else expect(events[0]).toMatchObject({ actorType: "SYSTEM", actorUserId: null });
    await expect(getReportForActor(psychologistId, "PSYCHOLOGIST", item.reportId)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED", status: 403 });
    expect(await prisma.consentAuditEvent.count({ where: { consentId: item.consentId, action: "EXPIRED" } })).toBe(1);
    if (item.reason === "cancellation") expect(await prisma.consentAuditEvent.count({ where: { consentId: item.consentId, action: "REVOKED" } })).toBe(1);
  }
  expect((await prisma.consent.findUnique({ where: { id: grants.find(item => item.reason === "scheduled_end")!.consentId } }))?.expiredAt).toEqual(scheduledEnd);
  expect((await prisma.consent.findUnique({ where: { id: early.consentId } }))?.expiredAt).toEqual(earlyAt);
  expect((await prisma.consent.findUnique({ where: { id: cancelled.consentId } }))?.expiredAt).toEqual(cancelledAt);
  expect((await prisma.consent.findUnique({ where: { id: noShow.consentId } }))?.expiredAt).toEqual(noShowAt);
  record("appointment_consent_expiry", { cases: grants.map(({ reason }) => reason), accessDenied: true, oneAuditPerGrant: true, systemActorExplicit: true, reconsentAndRevocationMaterializePriorExpiry: true });
});

it("rolls slot, appointment, consultation, consent, and audit back together on a real PostgreSQL failure", async () => {
  const participantId = participants.rollback;
  const assessment = assessmentByParticipant.get(participantId)!;
  const slot = await availabilityId(dates.rollback);
  await prisma.$executeRawUnsafe(`CREATE FUNCTION rehearsal.reject_phase3_consent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC CONSENT FAILURE'; END $$`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER rehearsal_reject_phase3_consent BEFORE INSERT ON public.consents FOR EACH ROW EXECUTE FUNCTION rehearsal.reject_phase3_consent()`);
  try {
    await expect(book(participantId, dates.rollback)).rejects.toThrow();
  } finally {
    await prisma.$executeRawUnsafe("DROP TRIGGER rehearsal_reject_phase3_consent ON public.consents");
    await prisma.$executeRawUnsafe("DROP FUNCTION rehearsal.reject_phase3_consent()");
  }
  expect((await prisma.psychologistAvailability.findUnique({ where: { id: slot.id } }))?.status).toBe("AVAILABLE");
  expect(await prisma.appointment.count({ where: { participantId } })).toBe(0);
  expect(await prisma.consultationSession.count({ where: { appointment: { participantId } } })).toBe(0);
  expect(await prisma.consent.count({ where: { participantId, reportId: assessment.reportId } })).toBe(0);
  expect(await prisma.consentAuditEvent.count({ where: { consent: { participantId, reportId: assessment.reportId } } })).toBe(0);
  record("booking_transaction_rollback", { slotAvailable: true, appointments: 0, sessions: 0, consents: 0, auditEvents: 0 });
});
