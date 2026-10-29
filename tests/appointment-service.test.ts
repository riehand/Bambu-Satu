import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(), transaction: vi.fn(), latest: vi.fn(), userFindFirst: vi.fn(), slotUpdate: vi.fn(),
  appointmentCreate: vi.fn(), appointmentFindMany: vi.fn(), appointmentFindFirst: vi.fn(), sessionCreate: vi.fn(),
  consentCreate: vi.fn(), consentFindMany: vi.fn(), consentFindFirst: vi.fn(), consentUpdate: vi.fn(),
  auditCreate: vi.fn(), reportFindFirst: vi.fn(), reportFindUnique: vi.fn(), scoreFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: mocks.queryRaw,
    user: { findFirst: mocks.userFindFirst },
    assessmentSession: { findFirst: mocks.latest },
    psychologistAvailability: { updateMany: mocks.slotUpdate },
    appointment: { create: mocks.appointmentCreate, findMany: mocks.appointmentFindMany, findFirst: mocks.appointmentFindFirst },
    consultationSession: { create: mocks.sessionCreate },
    consent: { create: mocks.consentCreate, findMany: mocks.consentFindMany, findFirst: mocks.consentFindFirst, update: mocks.consentUpdate },
    consentAuditEvent: { create: mocks.auditCreate },
    report: { findFirst: mocks.reportFindFirst, findUnique: mocks.reportFindUnique },
    assessmentScore: { findUnique: mocks.scoreFindUnique },
  };
  return { prisma: { ...tx, $transaction: mocks.transaction } };
});

import { createAppointment, getBookingContext, getReportForActor, grantAppointmentConsent, grantStandaloneConsent, revokeConsent } from "@/lib/appointments/service";

const participantId = "00000000-0000-4000-8000-000000000101";
const psychologistId = "00000000-0000-4000-8000-000000000102";
const assessmentSessionId = "00000000-0000-4000-8000-000000000103";
const reportId = "00000000-0000-4000-8000-000000000104";
const availabilityId = "00000000-0000-4000-8000-000000000105";
const appointmentId = "00000000-0000-4000-8000-000000000106";
const consentId = "00000000-0000-4000-8000-000000000107";
const futureDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const completed = () => ({ id: assessmentSessionId, completedAt: new Date("2026-10-20T00:00:00.000Z"), score: { id: "score" }, report: { id: reportId, assessmentSessionId, status: "GENERATED", filePathOrObjectKey: "private/report.pdf", generatedAt: new Date("2026-10-20T00:01:00.000Z") } });
const slot = (date = futureDate) => ({ id: availabilityId, psychologist_id: psychologistId, availability_date: new Date(`${date}T00:00:00.000Z`), session_type: "MORNING", status: "AVAILABLE" });
const request = (reportConsent = true) => ({ psychologistId, assessmentSessionId, reportId, availabilityId, reportConsent, participantNote: "Discuss coping skills." });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.latest.mockResolvedValue(completed());
  mocks.userFindFirst.mockResolvedValue({ id: psychologistId, fullName: "Synthetic psychologist" });
  mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => strings.join("").includes("psychologist_availability") ? [slot()] : []);
  mocks.slotUpdate.mockResolvedValue({ count: 1 });
  mocks.appointmentCreate.mockResolvedValue({ id: appointmentId, status: "CONFIRMED" });
  mocks.sessionCreate.mockResolvedValue({ id: "session" });
  mocks.appointmentFindFirst.mockResolvedValue({ id: appointmentId, participantId, psychologistId, assessmentSessionId, reportId, status: "CONFIRMED", scheduledEndAt: new Date(Date.now() + 3 * 86400000), consultationSession: { endedAt: null } });
  mocks.consentCreate.mockResolvedValue({ id: consentId, consentType: "APPOINTMENT_REPORT_ACCESS", targetUserId: psychologistId, grantedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
  mocks.consentFindMany.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({});
  mocks.transaction.mockImplementation((work: (tx: unknown) => Promise<unknown>) => work({
    $queryRaw: mocks.queryRaw, user: { findFirst: mocks.userFindFirst }, assessmentSession: { findFirst: mocks.latest },
    psychologistAvailability: { updateMany: mocks.slotUpdate }, appointment: { create: mocks.appointmentCreate, findMany: mocks.appointmentFindMany, findFirst: mocks.appointmentFindFirst },
    consultationSession: { create: mocks.sessionCreate }, consent: { create: mocks.consentCreate, findMany: mocks.consentFindMany, findFirst: mocks.consentFindFirst, update: mocks.consentUpdate },
    consentAuditEvent: { create: mocks.auditCreate }, report: { findFirst: mocks.reportFindFirst, findUnique: mocks.reportFindUnique }, assessmentScore: { findUnique: mocks.scoreFindUnique },
  }));
});

it("creates immediate CONFIRMED booking, session, slot reservation, and appointment-linked consent", async () => {
  const result = await createAppointment(participantId, request());
  expect(result.status).toBe("CONFIRMED");
  expect(mocks.queryRaw).toHaveBeenCalledTimes(3);
  expect(mocks.slotUpdate).toHaveBeenCalledWith({ where: { id: availabilityId, psychologistId, status: "AVAILABLE" }, data: { status: "BOOKED" } });
  expect(mocks.appointmentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ participantId, psychologistId, assessmentSessionId, reportId, availabilityId, status: "CONFIRMED" }) });
  expect(mocks.sessionCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ appointmentId, status: "SCHEDULED" }) });
  expect(mocks.consentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
    participantId, reportId, targetUserId: psychologistId, appointmentId, consentType: "APPOINTMENT_REPORT_ACCESS",
    expiresAt: expect.any(Date), policyVersion: expect.any(String), grantedAt: expect.any(Date),
    scope: { participantId, reportId, psychologistId, appointmentId },
  }) });
  expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ consentId, actorType: "USER", actorUserId: participantId, action: "GRANTED" }) });
});

it("rejects missing affirmative booking consent before opening a transaction", async () => {
  await expect(createAppointment(participantId, request(false))).rejects.toMatchObject({ code: "REPORT_CONSENT_REQUIRED", status: 403 });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("requires the client's report reference to match the server-resolved latest assessment and report", async () => {
  await expect(createAppointment(participantId, { ...request(), assessmentSessionId: "00000000-0000-4000-8000-000000000999" })).rejects.toMatchObject({ code: "ASSESSMENT_REPORT_NOT_LATEST", status: 409 });
  expect(mocks.slotUpdate).not.toHaveBeenCalled();
});

it("refuses PENDING or unusable reports without reserving availability", async () => {
  mocks.latest.mockResolvedValue({ ...completed(), report: { ...completed().report, status: "PENDING", filePathOrObjectKey: null, generatedAt: null } });
  expect(await getBookingContext(participantId)).toMatchObject({ canBook: false, latestAssessment: { reportStatus: "PENDING" } });
  await expect(createAppointment(participantId, request())).rejects.toMatchObject({ code: "REPORT_NOT_GENERATED", status: 409 });
  expect(mocks.slotUpdate).not.toHaveBeenCalled();
});

it("rejects a slot whose fixed Jakarta session has already started", async () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => strings.join("").includes("psychologist_availability") ? [slot(yesterday)] : []);
  await expect(createAppointment(participantId, request())).rejects.toMatchObject({ code: "SLOT_START_PASSED", status: 409 });
  expect(mocks.slotUpdate).not.toHaveBeenCalled();
});

it("creates an independently scoped standalone grant with no appointment or expiry", async () => {
  mocks.reportFindFirst.mockResolvedValue({ id: reportId, assessmentSessionId, status: "GENERATED", filePathOrObjectKey: "private/report.pdf", generatedAt: new Date() });
  mocks.scoreFindUnique.mockResolvedValue({ id: "score" });
  const standalone = { id: "standalone", consentType: "STANDALONE_REPORT_ACCESS", targetUserId: psychologistId, grantedAt: new Date() };
  mocks.consentCreate.mockResolvedValue(standalone);
  const result = await grantStandaloneConsent(participantId, { assessmentSessionId, reportId, psychologistId, consent: true });
  expect(result.appointmentId).toBeNull();
  expect(mocks.consentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ consentType: "STANDALONE_REPORT_ACCESS", appointmentId: null, expiresAt: null }) });
  expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ consentId: "standalone", actorType: "USER", action: "GRANTED" }) });
});

it("creates a new appointment grant for re-consent instead of reactivating a historical row", async () => {
  const result = await grantAppointmentConsent(participantId, appointmentId, true);
  expect(result.consentType).toBe("APPOINTMENT_REPORT_ACCESS");
  expect(mocks.consentCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
    appointmentId, participantId, reportId, targetUserId: psychologistId,
    consentType: "APPOINTMENT_REPORT_ACCESS", expiresAt: expect.any(Date),
  }) });
  expect(mocks.consentUpdate).not.toHaveBeenCalled();
});

it("revokes only the selected grant and audits the action without changing the appointment", async () => {
  mocks.consentFindFirst.mockResolvedValue({ id: consentId, participantId, revokedAt: null, appointmentId });
  mocks.consentUpdate.mockResolvedValue({ id: consentId, revokedAt: new Date() });
  const result = await revokeConsent(participantId, consentId);
  expect(result.consentId).toBe(consentId);
  expect(mocks.consentUpdate).toHaveBeenCalledWith({ where: { id: consentId }, data: { revokedAt: expect.any(Date) } });
  expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ consentId, actorType: "USER", actorUserId: participantId, action: "REVOKED" }) });
  expect(mocks.appointmentCreate).not.toHaveBeenCalled();
  expect(mocks.sessionCreate).not.toHaveBeenCalled();
});

it("records an earlier lifecycle expiry before a later participant revocation", async () => {
  const grantedAt = new Date("1999-01-01T00:00:00Z");
  const scheduledEndAt = new Date("2000-01-01T00:00:00Z");
  mocks.consentFindFirst.mockResolvedValue({
    id: consentId, participantId, appointmentId, consentType: "APPOINTMENT_REPORT_ACCESS",
    grantedAt, expiresAt: scheduledEndAt, expiredAt: null, revokedAt: null,
    appointment: {
      participantId, reportId, psychologistId, status: "CONFIRMED", scheduledStartAt: new Date("1999-01-01T00:00:00Z"),
      scheduledEndAt, cancelledAt: null, completedAt: null,
      consultationSession: { status: "SCHEDULED", endedAt: null, endedBy: null },
    },
  });
  mocks.consentUpdate.mockResolvedValue({ id: consentId });

  await revokeConsent(participantId, consentId);

  expect(mocks.consentUpdate).toHaveBeenCalledWith({ where: { id: consentId }, data: { expiredAt: scheduledEndAt } });
  expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ consentId, actorType: "SYSTEM", actorUserId: null, action: "EXPIRED" }) });
  expect(mocks.consentUpdate).toHaveBeenCalledWith({ where: { id: consentId }, data: { revokedAt: expect.any(Date) } });
  expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ consentId, actorType: "USER", actorUserId: participantId, action: "REVOKED" }) });
});

it("evaluates standalone authorization separately when appointment consent is revoked", async () => {
  mocks.reportFindUnique.mockResolvedValue({ id: reportId, assessmentSessionId, status: "GENERATED", filePathOrObjectKey: "private/report.pdf", generatedAt: new Date(), assessmentSession: {
    participantId, completedAt: new Date(), score: { depressionScore: 8, depressionCategory: "MILD", anxietyScore: 6, anxietyCategory: "MILD", stressScore: 10, stressCategory: "MILD", wemwbsScore: 49 },
  } });
  mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => strings.join("").includes("STANDALONE_REPORT_ACCESS") ? [{ id: "standalone" }] : []);
  mocks.consentFindMany.mockResolvedValue([{ id: "standalone", consentType: "STANDALONE_REPORT_ACCESS", appointmentId: null, expiresAt: null, expiredAt: null, revokedAt: null }]);
  const result = await getReportForActor(psychologistId, "PSYCHOLOGIST", reportId);
  expect(result.id).toBe(reportId);
  expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ consentId: "standalone", actorType: "USER", actorUserId: psychologistId, action: "ACCESSED" }) });
});

it("authorizes an assigned psychologist through an exact active appointment grant", async () => {
  mocks.reportFindUnique.mockResolvedValue({ id: reportId, assessmentSessionId, status: "GENERATED", filePathOrObjectKey: "private/report.pdf", generatedAt: new Date(), assessmentSession: {
    participantId, completedAt: new Date(), score: { depressionScore: 8, depressionCategory: "MILD", anxietyScore: 6, anxietyCategory: "MILD", stressScore: 10, stressCategory: "MILD", wemwbsScore: 49 },
  } });
  mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => strings.join("").includes("APPOINTMENT_REPORT_ACCESS") ? [{ id: "appointment-grant" }] : []);
  mocks.consentFindMany.mockResolvedValue([{ id: "appointment-grant", consentType: "APPOINTMENT_REPORT_ACCESS", appointmentId, expiresAt: new Date(Date.now() + 86400000), expiredAt: null, revokedAt: null, appointment: {
    participantId, reportId, psychologistId, status: "CONFIRMED", scheduledEndAt: new Date(Date.now() + 86400000), consultationSession: { endedAt: null },
  } }]);
  expect((await getReportForActor(psychologistId, "PSYCHOLOGIST", reportId)).id).toBe(reportId);
  expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ consentId: "appointment-grant", actorType: "USER", actorUserId: psychologistId, action: "ACCESSED" }) });
});

it("denies appointment-linked report access at or after its server-enforced scheduled end", async () => {
  mocks.reportFindUnique.mockResolvedValue({ id: reportId, assessmentSessionId, status: "GENERATED", filePathOrObjectKey: "private/report.pdf", generatedAt: new Date(), assessmentSession: {
    participantId, completedAt: new Date(), score: { depressionScore: 8, depressionCategory: "MILD", anxietyScore: 6, anxietyCategory: "MILD", stressScore: 10, stressCategory: "MILD", wemwbsScore: 49 },
  } });
  mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => strings.join("").includes("APPOINTMENT_REPORT_ACCESS") ? [{ id: "expired" }] : []);
  mocks.consentFindMany.mockResolvedValue([{ id: "expired", consentType: "APPOINTMENT_REPORT_ACCESS", appointmentId, grantedAt: new Date("1999-01-01T00:00:00Z"), expiresAt: new Date("2000-01-01T00:00:00Z"), expiredAt: null, revokedAt: null, appointment: {
    participantId, reportId, psychologistId, status: "CONFIRMED", scheduledEndAt: new Date("2000-01-01T00:00:00Z"), consultationSession: { endedAt: null },
  } }]);
  await expect(getReportForActor(psychologistId, "PSYCHOLOGIST", reportId)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED", status: 403 });
  expect(mocks.consentUpdate).toHaveBeenCalledWith({ where: { id: "expired" }, data: { expiredAt: new Date("2000-01-01T00:00:00Z") } });
  expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
    consentId: "expired", actorType: "SYSTEM", actorUserId: null, action: "EXPIRED", occurredAt: expect.any(Date),
  }) });
  expect(mocks.auditCreate).not.toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ACCESSED" }) });
});

it("records psychologist early closure as one USER expiry event and denies access", async () => {
  const endedAt = new Date(Date.now() - 1000);
  mocks.reportFindUnique.mockResolvedValue({ id: reportId, assessmentSessionId, status: "GENERATED", filePathOrObjectKey: "private/report.pdf", generatedAt: new Date(), assessmentSession: {
    participantId, completedAt: new Date(), score: { depressionScore: 8, depressionCategory: "MILD", anxietyScore: 6, anxietyCategory: "MILD", stressScore: 10, stressCategory: "MILD", wemwbsScore: 49 },
  } });
  mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => strings.join("").includes("APPOINTMENT_REPORT_ACCESS") ? [{ id: "early-close" }] : []);
  mocks.consentFindMany.mockResolvedValue([{ id: "early-close", consentType: "APPOINTMENT_REPORT_ACCESS", appointmentId, grantedAt: new Date(Date.now() - 86400000), expiresAt: new Date(Date.now() + 86400000), expiredAt: null, revokedAt: null, appointment: {
    participantId, reportId, psychologistId, status: "COMPLETED", scheduledEndAt: new Date(Date.now() + 86400000), cancelledAt: null, completedAt: endedAt,
    updatedAt: endedAt, consultationSession: { status: "CLOSED", endedAt, endedBy: "PSYCHOLOGIST", updatedAt: endedAt },
  } }]);

  await expect(getReportForActor(psychologistId, "PSYCHOLOGIST", reportId)).rejects.toMatchObject({ code: "REPORT_ACCESS_DENIED", status: 403 });
  expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ consentId: "early-close", actorType: "USER", actorUserId: psychologistId, action: "EXPIRED" }) });
  expect(mocks.auditCreate).not.toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ACCESSED" }) });
});

it("uses a matching standalone grant independently after appointment consent expires", async () => {
  mocks.reportFindUnique.mockResolvedValue({ id: reportId, assessmentSessionId, status: "GENERATED", filePathOrObjectKey: "private/report.pdf", generatedAt: new Date(), assessmentSession: {
    participantId, completedAt: new Date(), score: { depressionScore: 8, depressionCategory: "MILD", anxietyScore: 6, anxietyCategory: "MILD", stressScore: 10, stressCategory: "MILD", wemwbsScore: 49 },
  } });
  mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => strings.join("").includes("APPOINTMENT_REPORT_ACCESS") ? [{ id: "expired" }] : [{ id: "standalone" }]);
  mocks.consentFindMany.mockResolvedValue([
    { id: "expired", consentType: "APPOINTMENT_REPORT_ACCESS", appointmentId, grantedAt: new Date("1999-01-01T00:00:00Z"), expiresAt: new Date("2000-01-01T00:00:00Z"), expiredAt: null, revokedAt: null, appointment: {
      participantId, reportId, psychologistId, status: "CONFIRMED", scheduledEndAt: new Date("2000-01-01T00:00:00Z"),
      consultationSession: { status: "SCHEDULED", endedAt: null },
    } },
    { id: "standalone", consentType: "STANDALONE_REPORT_ACCESS", appointmentId: null, expiresAt: null, expiredAt: null, revokedAt: null },
  ]);

  expect((await getReportForActor(psychologistId, "PSYCHOLOGIST", reportId)).id).toBe(reportId);
  expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ consentId: "expired", action: "EXPIRED", actorType: "SYSTEM" }) });
  expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ consentId: "standalone", action: "ACCESSED", actorType: "USER" }) });
});

it("does not record report access for a PENDING report even if a matching grant exists", async () => {
  mocks.reportFindUnique.mockResolvedValue({ id: reportId, assessmentSessionId, status: "PENDING", filePathOrObjectKey: null, generatedAt: null, assessmentSession: {
    participantId, completedAt: new Date(), score: { depressionScore: 8, depressionCategory: "MILD", anxietyScore: 6, anxietyCategory: "MILD", stressScore: 10, stressCategory: "MILD", wemwbsScore: 49 },
  } });
  mocks.queryRaw.mockImplementation((strings: TemplateStringsArray) => strings.join("").includes("APPOINTMENT_REPORT_ACCESS") ? [{ id: "appointment-grant" }] : []);
  mocks.consentFindMany.mockResolvedValue([{ id: "appointment-grant", consentType: "APPOINTMENT_REPORT_ACCESS", appointmentId, expiresAt: new Date(Date.now() + 86400000), expiredAt: null, revokedAt: null, appointment: {
    participantId, reportId, psychologistId, status: "CONFIRMED", scheduledEndAt: new Date(Date.now() + 86400000), consultationSession: { status: "SCHEDULED", endedAt: null },
  } }]);

  await expect(getReportForActor(psychologistId, "PSYCHOLOGIST", reportId)).rejects.toMatchObject({ code: "REPORT_NOT_GENERATED", status: 409 });
  expect(mocks.auditCreate).not.toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ACCESSED" }) });
});
