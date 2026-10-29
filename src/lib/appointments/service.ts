import "server-only";
import { AppointmentStatus, ConsentAuditActorType, ConsentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sessionStartsAt, type ConsultationSessionType } from "@/lib/psychologist/availability-config";
import type { CreateAppointmentInput, StandaloneConsentInput } from "@/lib/validations/appointment";

type DB = Prisma.TransactionClient;
export const REPORT_CONSENT_POLICY_VERSION = "report-sharing-v1";

export class AppointmentError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) {
    super(message);
  }
}

const reportScoreSelect = {
  depressionScore: true, depressionCategory: true,
  anxietyScore: true, anxietyCategory: true,
  stressScore: true, stressCategory: true,
  wemwbsScore: true,
} satisfies Prisma.AssessmentScoreSelect;

function isGeneratedReport(report: { status: string; filePathOrObjectKey: string | null; generatedAt: Date | null } | null | undefined) {
  return report?.status === "GENERATED" && Boolean(report.filePathOrObjectKey?.trim()) && report.generatedAt !== null;
}

function consentScope(participantId: string, reportId: string, psychologistId: string, appointmentId: string | null): Prisma.InputJsonValue {
  return { participantId, reportId, psychologistId, appointmentId };
}

async function createConsent(
  tx: DB,
  input: { participantId: string; assessmentSessionId: string; reportId: string; psychologistId: string; appointmentId: string | null; expiresAt: Date | null; grantedAt: Date },
) {
  const consent = await tx.consent.create({ data: {
    participantId: input.participantId,
    assessmentSessionId: input.assessmentSessionId,
    reportId: input.reportId,
    targetUserId: input.psychologistId,
    appointmentId: input.appointmentId,
    consentType: input.appointmentId ? ConsentType.APPOINTMENT_REPORT_ACCESS : ConsentType.STANDALONE_REPORT_ACCESS,
    purpose: input.appointmentId ? "Share the selected assessment report with the assigned psychologist for this consultation." : "Share the selected assessment report with the selected psychologist independently of an appointment.",
    scope: consentScope(input.participantId, input.reportId, input.psychologistId, input.appointmentId),
    policyVersion: REPORT_CONSENT_POLICY_VERSION,
    grantedAt: input.grantedAt,
    expiresAt: input.expiresAt,
  } });
  await tx.consentAuditEvent.create({ data: {
    consentId: consent.id, actorType: ConsentAuditActorType.USER, actorUserId: input.participantId,
    action: "GRANTED", occurredAt: input.grantedAt,
  } });
  return consent;
}

async function latestCompletedReport(db: DB | typeof prisma, participantId: string) {
  return db.assessmentSession.findFirst({
    where: { participantId, status: "COMPLETED" },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      completedAt: true,
      score: { select: { id: true } },
      report: { select: { id: true, assessmentSessionId: true, status: true, filePathOrObjectKey: true, generatedAt: true } },
    },
  });
}

export async function getBookingContext(participantId: string) {
  const latest = await latestCompletedReport(prisma, participantId);
  if (!latest || !latest.completedAt || !latest.score || !latest.report) return { latestAssessment: null, canBook: false };
  return {
    latestAssessment: {
      assessmentSessionId: latest.id,
      completedAt: latest.completedAt.toISOString(),
      reportId: latest.report.id,
      reportStatus: latest.report.status,
    },
    canBook: latest.report.assessmentSessionId === latest.id && isGeneratedReport(latest.report),
  };
}

export async function createAppointment(participantId: string, input: CreateAppointmentInput) {
  if (input.reportConsent !== true) throw new AppointmentError("REPORT_CONSENT_REQUIRED", "Persetujuan berbagi laporan diperlukan untuk pemesanan.", 403);
  try {
    return await prisma.$transaction(async (tx) => {
      // Match Phase 2's participant lock so a newer assessment cannot race the latest-report check.
      await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${participantId}::uuid FOR UPDATE`;
      const latest = await latestCompletedReport(tx, participantId);
      if (!latest || !latest.completedAt || !latest.score || !latest.report) {
        throw new AppointmentError("ASSESSMENT_REQUIRED", "Asesmen terbaru yang selesai belum tersedia.", 409);
      }
      if (latest.id !== input.assessmentSessionId || latest.report.id !== input.reportId || latest.report.assessmentSessionId !== latest.id) {
        throw new AppointmentError("ASSESSMENT_REPORT_NOT_LATEST", "Gunakan laporan dari asesmen terbaru Anda.", 409);
      }
      if (!isGeneratedReport(latest.report)) {
        throw new AppointmentError("REPORT_NOT_GENERATED", "Laporan terbaru belum siap untuk pemesanan.", 409);
      }

      await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${input.psychologistId}::uuid AND role = 'PSYCHOLOGIST' AND is_active FOR SHARE`;
      const psychologist = await tx.user.findFirst({
        where: { id: input.psychologistId, role: "PSYCHOLOGIST", isActive: true },
        select: { id: true, fullName: true },
      });
      if (!psychologist) throw new AppointmentError("PSYCHOLOGIST_NOT_FOUND", "Psikolog tidak tersedia.", 404);

      const slots = await tx.$queryRaw<Array<{
        id: string; psychologist_id: string; availability_date: Date; session_type: ConsultationSessionType; status: string;
      }>>`SELECT id, psychologist_id, availability_date, session_type, status
          FROM public.psychologist_availability
          WHERE id = ${input.availabilityId}::uuid
          FOR UPDATE`;
      const slot = slots[0];
      if (!slot || slot.psychologist_id !== psychologist.id) throw new AppointmentError("SLOT_NOT_AVAILABLE", "Sesi ini tidak tersedia.", 409);
      if (slot.status !== "AVAILABLE") throw new AppointmentError("SLOT_ALREADY_BOOKED", "Sesi ini baru saja dipesan atau ditutup.", 409);

      const date = slot.availability_date.toISOString().slice(0, 10);
      const startAt = sessionStartsAt(date, slot.session_type);
      const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);
      const now = new Date();
      if (startAt <= now) throw new AppointmentError("SLOT_START_PASSED", "Waktu mulai sesi telah lewat.", 409);

      const reserved = await tx.psychologistAvailability.updateMany({
        where: { id: slot.id, psychologistId: psychologist.id, status: "AVAILABLE" },
        data: { status: "BOOKED" },
      });
      if (reserved.count !== 1) throw new AppointmentError("SLOT_ALREADY_BOOKED", "Sesi ini baru saja dipesan.", 409);

      const appointment = await tx.appointment.create({ data: {
        participantId,
        psychologistId: psychologist.id,
        assessmentSessionId: latest.id,
        reportId: latest.report.id,
        availabilityId: slot.id,
        participantNote: input.participantNote || null,
        status: AppointmentStatus.CONFIRMED,
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
        bookedAt: now,
      } });
      const consultationSession = await tx.consultationSession.create({ data: {
        appointmentId: appointment.id,
        status: "SCHEDULED",
        scheduledStartAt: startAt,
        scheduledEndAt: endAt,
      } });
      const consent = await createConsent(tx, {
        participantId,
        assessmentSessionId: latest.id,
        reportId: latest.report.id,
        psychologistId: psychologist.id,
        appointmentId: appointment.id,
        expiresAt: endAt,
        grantedAt: now,
      });
      return {
        appointmentId: appointment.id,
        status: appointment.status,
        consentId: consent.id,
        consultationSessionId: consultationSession.id,
        psychologist: { id: psychologist.id, fullName: psychologist.fullName },
        date,
        sessionType: slot.session_type,
        scheduledStartAt: startAt.toISOString(),
        scheduledEndAt: endAt.toISOString(),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
  } catch (error) {
    if (error instanceof AppointmentError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppointmentError("SLOT_ALREADY_BOOKED", "Sesi ini baru saja dipesan.", 409);
    }
    throw error;
  }
}

export async function listParticipantAppointments(participantId: string) {
  const appointments = await prisma.appointment.findMany({
    where: { participantId },
    orderBy: [{ scheduledStartAt: "desc" }, { id: "desc" }],
    select: {
      id: true, status: true, scheduledStartAt: true, scheduledEndAt: true, bookedAt: true,
      participantNote: true, reportId: true,
      psychologist: { select: { id: true, fullName: true } },
      availability: { select: { sessionType: true } },
      consultationSession: { select: { status: true, endedAt: true } },
    },
  });
  return appointments.map((item) => ({
    appointmentId: item.id, status: item.status, scheduledStartAt: item.scheduledStartAt.toISOString(),
    scheduledEndAt: item.scheduledEndAt.toISOString(), bookedAt: item.bookedAt.toISOString(),
    participantNote: item.participantNote, reportId: item.reportId,
    psychologist: item.psychologist, sessionType: item.availability.sessionType,
    consultationSession: item.consultationSession,
    canReconsent: (item.status === AppointmentStatus.CONFIRMED || item.status === AppointmentStatus.IN_PROGRESS)
      && item.consultationSession?.endedAt === null && new Date() < item.scheduledEndAt,
  }));
}

export async function listPsychologistAppointments(psychologistId: string) {
  const appointments = await prisma.appointment.findMany({
    where: { psychologistId },
    orderBy: [{ scheduledStartAt: "asc" }, { id: "asc" }],
    select: {
      id: true, status: true, scheduledStartAt: true, scheduledEndAt: true, participantNote: true,
      participant: { select: { fullName: true, userType: true } },
      assessmentSession: { select: { completedAt: true } },
      availability: { select: { sessionType: true } },
      consultationSession: { select: { status: true, participantCheckedInAt: true, psychologistCheckedInAt: true, endedAt: true } },
    },
  });
  return appointments.map((item) => ({
    appointmentId: item.id, status: item.status, scheduledStartAt: item.scheduledStartAt.toISOString(),
    scheduledEndAt: item.scheduledEndAt.toISOString(), participantNote: item.participantNote,
    participant: item.participant, assessmentDate: item.assessmentSession.completedAt?.toISOString() ?? null,
    sessionType: item.availability.sessionType, consultationSession: item.consultationSession,
  }));
}

export async function getAppointmentForParty(actorId: string, role: "PARTICIPANT" | "PSYCHOLOGIST", appointmentId: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, ...(role === "PARTICIPANT" ? { participantId: actorId } : { psychologistId: actorId }) },
    select: {
      id: true, participantId: true, psychologistId: true, status: true, scheduledStartAt: true, scheduledEndAt: true,
      participantNote: true, reportId: true, assessmentSessionId: true,
      participant: { select: { fullName: true, userType: true } },
      psychologist: { select: { id: true, fullName: true } },
      availability: { select: { sessionType: true } },
      consultationSession: { select: { id: true, status: true, participantCheckedInAt: true, psychologistCheckedInAt: true, startedAt: true, endedAt: true, endedBy: true, endReason: true } },
    },
  });
  if (!appointment) throw new AppointmentError("APPOINTMENT_NOT_FOUND", "Janji konsultasi tidak ditemukan.", 404);
  return {
    appointmentId: appointment.id, status: appointment.status,
    scheduledStartAt: appointment.scheduledStartAt.toISOString(), scheduledEndAt: appointment.scheduledEndAt.toISOString(),
    participantNote: appointment.participantNote,
    ...(role === "PARTICIPANT" ? { reportId: appointment.reportId, assessmentSessionId: appointment.assessmentSessionId } : {}),
    participant: appointment.participant, psychologist: appointment.psychologist, sessionType: appointment.availability.sessionType,
    consultationSession: appointment.consultationSession,
  };
}

export async function grantStandaloneConsent(participantId: string, input: StandaloneConsentInput) {
  if (input.consent !== true) throw new AppointmentError("CONSENT_REQUIRED", "Persetujuan berbagi laporan diperlukan.", 403);
  try {
    return await prisma.$transaction(async (tx) => {
      const report = await tx.report.findFirst({
        where: { id: input.reportId, assessmentSessionId: input.assessmentSessionId, assessmentSession: { participantId, status: "COMPLETED" } },
        select: { id: true, assessmentSessionId: true, status: true, filePathOrObjectKey: true, generatedAt: true },
      });
      if (!report) throw new AppointmentError("REPORT_NOT_FOUND", "Laporan tidak ditemukan.", 404);
      if (!isGeneratedReport(report)) throw new AppointmentError("REPORT_NOT_GENERATED", "Laporan belum siap untuk dibagikan.", 409);
      await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${input.psychologistId}::uuid AND role = 'PSYCHOLOGIST' AND is_active FOR SHARE`;
      const psychologist = await tx.user.findFirst({ where: { id: input.psychologistId, role: "PSYCHOLOGIST", isActive: true }, select: { id: true } });
      if (!psychologist) throw new AppointmentError("PSYCHOLOGIST_NOT_FOUND", "Psikolog tidak tersedia.", 404);
      const score = await tx.assessmentScore.findUnique({ where: { assessmentSessionId: report.assessmentSessionId }, select: { id: true } });
      if (!score) throw new AppointmentError("ASSESSMENT_REQUIRED", "Hasil asesmen belum lengkap.", 409);
      const now = new Date();
      const consent = await createConsent(tx, {
        participantId, assessmentSessionId: report.assessmentSessionId, reportId: report.id,
        psychologistId: psychologist.id, appointmentId: null, expiresAt: null, grantedAt: now,
      });
      return { consentId: consent.id, consentType: consent.consentType, targetUserId: consent.targetUserId, appointmentId: null, grantedAt: consent.grantedAt.toISOString() };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
  } catch (error) {
    if (error instanceof AppointmentError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppointmentError("CONSENT_ALREADY_ACTIVE", "Persetujuan untuk laporan ini sudah aktif.", 409);
    }
    throw error;
  }
}

export async function grantAppointmentConsent(participantId: string, appointmentId: string, affirmative: boolean) {
  if (!affirmative) throw new AppointmentError("CONSENT_REQUIRED", "Persetujuan berbagi laporan diperlukan.", 403);
  let outcome: { ok: true; data: { consentId: string; consentType: ConsentType; appointmentId: string; grantedAt: string; expiresAt: string | null } }
    | { ok: false; error: AppointmentError };
  try {
    outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.appointments WHERE id = ${appointmentId}::uuid AND participant_id = ${participantId}::uuid FOR UPDATE`;
      const appointment = await tx.appointment.findFirst({
        where: { id: appointmentId, participantId },
        include: { consultationSession: true },
      });
      if (!appointment) return { ok: false as const, error: new AppointmentError("APPOINTMENT_NOT_FOUND", "Janji konsultasi tidak ditemukan.", 404) };

      const activeRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM public.consents
        WHERE appointment_id = ${appointmentId}::uuid
          AND consent_type = 'APPOINTMENT_REPORT_ACCESS'
          AND revoked_at IS NULL AND expired_at IS NULL
        ORDER BY id FOR UPDATE`;
      const activeGrants = await tx.consent.findMany({
        where: { id: { in: activeRows.map(({ id }) => id) } },
        include: { appointment: { include: { consultationSession: true } } },
      });
      const now = new Date();
      for (const grant of activeGrants) await persistConsentExpiry(tx, grant, now);
      if ((appointment.status !== AppointmentStatus.CONFIRMED && appointment.status !== AppointmentStatus.IN_PROGRESS)
        || !appointment.consultationSession || appointment.consultationSession.endedAt !== null
        || now >= appointment.scheduledEndAt) {
        return { ok: false as const, error: new AppointmentError("APPOINTMENT_CONSENT_EXPIRED", "Persetujuan baru tidak dapat diberikan untuk sesi yang telah berakhir.", 409) };
      }
      const consent = await createConsent(tx, {
        participantId, assessmentSessionId: appointment.assessmentSessionId, reportId: appointment.reportId,
        psychologistId: appointment.psychologistId, appointmentId: appointment.id,
        expiresAt: appointment.scheduledEndAt, grantedAt: now,
      });
      return { ok: true as const, data: { consentId: consent.id, consentType: consent.consentType, appointmentId: appointment.id, grantedAt: consent.grantedAt.toISOString(), expiresAt: consent.expiresAt?.toISOString() ?? null } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
  } catch (error) {
    if (error instanceof AppointmentError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppointmentError("CONSENT_ALREADY_ACTIVE", "Persetujuan untuk janji ini sudah aktif.", 409);
    }
    throw error;
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.data;
}

type ConsentWithAppointment = Prisma.ConsentGetPayload<{
  include: { appointment: { include: { consultationSession: true } } };
}>;

function consentExpiry(consent: ConsentWithAppointment, now: Date) {
  if (consent.consentType !== ConsentType.APPOINTMENT_REPORT_ACCESS || consent.revokedAt || consent.expiredAt || !consent.appointment) return null;
  const appointment = consent.appointment;
  const candidates: Array<{ at: Date; actorType: ConsentAuditActorType; actorUserId: string | null }> = [];
  const add = (at: Date | null | undefined, actorType: ConsentAuditActorType = ConsentAuditActorType.SYSTEM, actorUserId: string | null = null) => {
    if (at && at >= consent.grantedAt && at <= now) candidates.push({ at, actorType, actorUserId });
  };
  const completedByPsychologist = appointment.consultationSession?.endedBy === "PSYCHOLOGIST";
  const completionActor = completedByPsychologist ? ConsentAuditActorType.USER : ConsentAuditActorType.SYSTEM;
  const completionActorId = completedByPsychologist ? appointment.psychologistId : null;

  add(consent.expiresAt);
  // Keep the persisted appointment boundary authoritative if a schedule is
  // corrected later; consent expiry must never outlive the consultation.
  add(appointment.scheduledEndAt);
  add(appointment.cancelledAt);
  add(appointment.completedAt, completionActor, completionActorId);
  if (appointment.status === AppointmentStatus.CANCELLED && !appointment.cancelledAt) add(appointment.updatedAt);
  if (appointment.status === AppointmentStatus.COMPLETED && !appointment.completedAt) add(appointment.updatedAt, completionActor, completionActorId);
  if (appointment.status === AppointmentStatus.RESCHEDULED) add(appointment.updatedAt);
  if (appointment.status === AppointmentStatus.NO_SHOW) {
    add(appointment.consultationSession?.endedAt ?? appointment.consultationSession?.updatedAt ?? appointment.updatedAt,
      appointment.consultationSession?.endedBy === "PSYCHOLOGIST" ? ConsentAuditActorType.USER : ConsentAuditActorType.SYSTEM,
      appointment.consultationSession?.endedBy === "PSYCHOLOGIST" ? appointment.psychologistId : null);
  }
  if (appointment.consultationSession?.endedAt) {
    const actorIsPsychologist = appointment.consultationSession.endedBy === "PSYCHOLOGIST";
    add(appointment.consultationSession.endedAt,
      actorIsPsychologist ? ConsentAuditActorType.USER : ConsentAuditActorType.SYSTEM,
      actorIsPsychologist ? appointment.psychologistId : null);
  } else if (["COMPLETED", "CLOSED", "NO_SHOW"].includes(appointment.consultationSession?.status ?? "")) {
    add(appointment.consultationSession?.updatedAt ?? appointment.updatedAt,
      appointment.consultationSession?.endedBy === "PSYCHOLOGIST" ? ConsentAuditActorType.USER : ConsentAuditActorType.SYSTEM,
      appointment.consultationSession?.endedBy === "PSYCHOLOGIST" ? appointment.psychologistId : null);
  }

  return candidates.sort((left, right) => left.at.getTime() - right.at.getTime())[0] ?? null;
}

async function persistConsentExpiry(tx: DB, consent: ConsentWithAppointment, now: Date) {
  const expiry = consentExpiry(consent, now);
  if (!expiry) return null;
  await tx.consent.update({ where: { id: consent.id }, data: { expiredAt: expiry.at } });
  await tx.consentAuditEvent.create({ data: {
    consentId: consent.id, actorType: expiry.actorType, actorUserId: expiry.actorUserId,
    action: "EXPIRED", occurredAt: now,
  } });
  return expiry.at;
}

export async function listOwnConsents(participantId: string) {
  const consents = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.consents
      WHERE participant_id = ${participantId}::uuid
        AND consent_type = 'APPOINTMENT_REPORT_ACCESS'
        AND revoked_at IS NULL AND expired_at IS NULL
      ORDER BY id FOR UPDATE`;
    const lockedIds = new Set(locked.map(({ id }) => id));
    const rows = await tx.consent.findMany({
      where: { participantId }, orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
      include: { appointment: { include: { consultationSession: true } } },
    });
    const now = new Date();
    for (const consent of rows) {
      if (!lockedIds.has(consent.id)) continue;
      const expiredAt = await persistConsentExpiry(tx, consent, now);
      if (expiredAt) consent.expiredAt = expiredAt;
    }
    return rows;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
  const now = new Date();
  return consents.map((item) => ({
    consentId: item.id, reportId: item.reportId, assessmentSessionId: item.assessmentSessionId,
    targetUserId: item.targetUserId, appointmentId: item.appointmentId, consentType: item.consentType,
    purpose: item.purpose, policyVersion: item.policyVersion, grantedAt: item.grantedAt.toISOString(),
    expiresAt: item.expiresAt?.toISOString() ?? null, expiredAt: item.expiredAt?.toISOString() ?? null,
    revokedAt: item.revokedAt?.toISOString() ?? null,
    active: !item.revokedAt && !item.expiredAt && (!item.expiresAt || now < item.expiresAt)
      && (!item.appointmentId || (item.appointment !== null
        && (item.appointment.status === AppointmentStatus.CONFIRMED || item.appointment.status === AppointmentStatus.IN_PROGRESS)
        && item.appointment.consultationSession?.endedAt === null && now < item.appointment.scheduledEndAt)),
  }));
}

export async function revokeConsent(participantId: string, consentId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM public.consents WHERE id = ${consentId}::uuid AND participant_id = ${participantId}::uuid FOR UPDATE`;
    const consent = await tx.consent.findFirst({
      where: { id: consentId, participantId },
      include: { appointment: { include: { consultationSession: true } } },
    });
    if (!consent) throw new AppointmentError("CONSENT_NOT_FOUND", "Persetujuan tidak ditemukan.", 404);
    if (consent.revokedAt) return { consentId, revokedAt: consent.revokedAt.toISOString() };
    const now = new Date();
    // If the participant acts after another lifecycle boundary, persist the
    // earlier expiry before recording their separate revocation event.
    await persistConsentExpiry(tx, consent, now);
    await tx.consent.update({ where: { id: consent.id }, data: { revokedAt: now } });
    await tx.consentAuditEvent.create({ data: {
      consentId, actorType: ConsentAuditActorType.USER, actorUserId: participantId,
      action: "REVOKED", occurredAt: now,
    } });
    // Revocation changes only this grant. Appointment and consultation states are intentionally untouched.
    return { consentId, revokedAt: now.toISOString() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
}

type ReportRow = Prisma.ReportGetPayload<{
  select: {
    id: true; assessmentSessionId: true; status: true; filePathOrObjectKey: true; generatedAt: true;
    assessmentSession: { select: { participantId: true; completedAt: true; score: { select: typeof reportScoreSelect } } };
  };
}>;

async function authorizePsychologistReport(actorId: string, report: ReportRow) {
  const authorized = await prisma.$transaction(async (tx) => {
    const appointmentRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.consents
      WHERE participant_id = ${report.assessmentSession.participantId}::uuid
        AND report_id = ${report.id}::uuid AND target_user_id = ${actorId}::uuid
        AND consent_type = 'APPOINTMENT_REPORT_ACCESS'
        AND appointment_id IS NOT NULL AND revoked_at IS NULL AND expired_at IS NULL
      FOR UPDATE`;
    const standaloneRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM public.consents
      WHERE participant_id = ${report.assessmentSession.participantId}::uuid
        AND report_id = ${report.id}::uuid AND target_user_id = ${actorId}::uuid
        AND consent_type = 'STANDALONE_REPORT_ACCESS'
        AND appointment_id IS NULL AND revoked_at IS NULL AND expired_at IS NULL
      FOR UPDATE`;
    const grants = await tx.consent.findMany({
      where: { id: { in: [...appointmentRows, ...standaloneRows].map(({ id }) => id) } },
      include: { appointment: { include: { consultationSession: true } } },
    });
    // Capture time after acquiring grant locks so waiting on a concurrent revoke cannot
    // let an in-flight read cross the scheduled-end boundary using a stale timestamp.
    const serverNow = new Date();
    const expiredIds = new Set<string>();
    for (const grant of grants) {
      if (grant.consentType !== ConsentType.APPOINTMENT_REPORT_ACCESS) continue;
      if (await persistConsentExpiry(tx, grant, serverNow)) expiredIds.add(grant.id);
    }
    const appointmentGrant = grants.find((grant) => grant.consentType === ConsentType.APPOINTMENT_REPORT_ACCESS
      && !expiredIds.has(grant.id)
      && grant.appointmentId !== null
      && grant.expiresAt !== null
      && serverNow < grant.expiresAt
      && grant.appointment?.participantId === report.assessmentSession.participantId
      && grant.appointment.reportId === report.id
      && grant.appointment.psychologistId === actorId
      && (grant.appointment.status === AppointmentStatus.CONFIRMED || grant.appointment.status === AppointmentStatus.IN_PROGRESS)
      && grant.appointment.consultationSession?.endedAt === null
      && serverNow < grant.appointment.scheduledEndAt);
    const standaloneGrant = grants.find((grant) => grant.consentType === ConsentType.STANDALONE_REPORT_ACCESS
      && grant.appointmentId === null && grant.expiresAt === null);
    const selectedGrant = appointmentGrant ?? standaloneGrant;
    if (!selectedGrant) return false;
    if (isGeneratedReport(report)) await tx.consentAuditEvent.create({ data: {
      consentId: selectedGrant.id, actorType: ConsentAuditActorType.USER,
      actorUserId: actorId, action: "ACCESSED", occurredAt: serverNow,
    } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
  if (!authorized) throw new AppointmentError("REPORT_ACCESS_DENIED", "Akses ke laporan ini tidak diizinkan.", 403);
}

export async function getReportForActor(actorId: string, role: "PARTICIPANT" | "PSYCHOLOGIST", reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      id: true, assessmentSessionId: true, status: true, filePathOrObjectKey: true, generatedAt: true,
      assessmentSession: { select: { participantId: true, completedAt: true, score: { select: reportScoreSelect } } },
    },
  });
  if (!report || !report.assessmentSession.completedAt || !report.assessmentSession.score) {
    throw new AppointmentError("REPORT_NOT_FOUND", "Laporan tidak ditemukan.", 404);
  }
  if (role === "PARTICIPANT") {
    if (report.assessmentSession.participantId !== actorId) throw new AppointmentError("REPORT_NOT_FOUND", "Laporan tidak ditemukan.", 404);
  } else {
    await authorizePsychologistReport(actorId, report);
  }
  if (!isGeneratedReport(report)) throw new AppointmentError("REPORT_NOT_GENERATED", "Laporan belum siap.", 409);
  const scores = report.assessmentSession.score;
  return {
    id: report.id,
    assessmentSessionId: report.assessmentSessionId,
    assessmentDate: report.assessmentSession.completedAt.toISOString(),
    generatedAt: report.generatedAt?.toISOString() ?? null,
    scores: {
      depression: { score: scores.depressionScore, category: scores.depressionCategory },
      anxiety: { score: scores.anxietyScore, category: scores.anxietyCategory },
      stress: { score: scores.stressScore, category: scores.stressCategory },
      wemwbs: { score: scores.wemwbsScore },
    },
    disclaimer: "Hasil ini bukan diagnosis klinis.",
  };
}
