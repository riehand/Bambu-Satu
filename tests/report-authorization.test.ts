import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  report: vi.fn(), appointments: vi.fn(), appointment: vi.fn(), grants: vi.fn(), query: vi.fn(),
  update: vi.fn(), audit: vi.fn(), profile: vi.fn(), artifact: vi.fn(),
}));
vi.mock("@/lib/prisma", () => {
  const db = {
    report: { findUnique: mocks.report }, appointment: { findMany: mocks.appointments, findFirst: mocks.appointment },
    consent: { findMany: mocks.grants, update: mocks.update }, consentAuditEvent: { create: mocks.audit }, $queryRaw: mocks.query,
  };
  return { prisma: { ...db, $transaction: (work: (tx: typeof db) => unknown) => work(db) } };
});
vi.mock("@/lib/auth/session", () => ({
  getCurrentProfile: mocks.profile,
  AuthError: class AuthError extends Error { constructor(readonly reason: string) { super(reason); } },
}));
vi.mock("@/lib/reports/service", () => ({
  getValidatedReportArtifact: mocks.artifact,
  ReportError: class ReportError extends Error { constructor(readonly code: string, readonly status: number) { super(code); } },
}));

import { getReportArtifactForActor, listPsychologistAppointments } from "@/lib/appointments/service";
import { GET } from "@/app/api/reports/[reportId]/download/route";
import { ReportError } from "@/lib/reports/service";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const participantId = id(1), psychologistId = id(2), assessmentSessionId = id(3), reportId = id(4), appointmentId = id(5);
const now = new Date("2030-01-01T02:00:00Z"), end = new Date("2030-01-01T04:00:00Z");
const report = () => ({
  id: reportId, assessmentSessionId, status: "GENERATED", filePathOrObjectKey: `reports/${reportId}.pdf`, generatedAt: now,
  assessmentSession: { participantId, status: "COMPLETED", completedAt: now,
    score: { id: id(9), depressionScore: 8, depressionCategory: "NORMAL", anxietyScore: 4, anxietyCategory: "NORMAL", stressScore: 10, stressCategory: "NORMAL", wemwbsScore: 49 } },
});
const appointment = () => ({
  id: appointmentId, participantId, psychologistId, assessmentSessionId, reportId, status: "CONFIRMED",
  scheduledStartAt: now, scheduledEndAt: end, participantNote: null,
  participant: { fullName: "Peserta sintetis", userType: "STUDENT" },
  assessmentSession: report().assessmentSession, report: report(), availability: { sessionType: "MORNING" },
  cancelledAt: null as Date | null, completedAt: null as Date | null, updatedAt: now,
  consultationSession: { status: "SCHEDULED", endedAt: null as Date | null, endedBy: null, updatedAt: now },
});
const grant = () => ({
  id: id(6), participantId, targetUserId: psychologistId, assessmentSessionId, reportId, appointmentId: appointmentId as string | null,
  consentType: "APPOINTMENT_REPORT_ACCESS", grantedAt: new Date("2029-12-30T00:00:00Z"),
  expiresAt: end as Date | null, revokedAt: null as Date | null, expiredAt: null as Date | null,
  appointment: appointment() as ReturnType<typeof appointment> | null,
});
let grants: ReturnType<typeof grant>[];
let row: ReturnType<typeof appointment>;
const download = () => GET(new Request(`https://app.test/api/reports/${reportId}/download?appointmentId=${appointmentId}`), { params: Promise.resolve({ reportId }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  row = appointment();
  grants = [grant()];
  mocks.report.mockImplementation(async () => row.report);
  mocks.appointments.mockImplementation(async () => [row]);
  mocks.appointment.mockResolvedValue({ id: appointmentId });
  // Deliberately return all rows, including invalid ones, to exercise explicit scope guards.
  mocks.query.mockImplementation(async () => grants.map(({ id }) => ({ id })));
  mocks.grants.mockImplementation(async () => grants);
  mocks.profile.mockResolvedValue({ id: psychologistId, role: "PSYCHOLOGIST" });
  mocks.artifact.mockResolvedValue(new TextEncoder().encode("%PDF-1.7\nsynthetic\n%%EOF"));
});
afterEach(() => vi.useRealTimers());

it("discovers the assigned report with a minimal DTO, no scores, storage keys, or access audit", async () => {
  const [item] = await listPsychologistAppointments(psychologistId);
  expect(item.reportAccess).toEqual({ status: "AVAILABLE", reportId, consentType: "APPOINTMENT_REPORT_ACCESS" });
  expect(Object.keys(item).sort()).toEqual(["appointmentId", "status", "scheduledStartAt", "scheduledEndAt", "participantNote", "participant", "assessmentDate", "sessionType", "consultationSession", "reportAccess"].sort());
  const json = JSON.stringify(item);
  for (const forbidden of ["depressionScore", "wemwbs", "filePathOrObjectKey", "reports/", "participantId", "consentId"]) expect(json).not.toContain(forbidden);
  expect(mocks.appointments).toHaveBeenCalledWith(expect.objectContaining({ where: { psychologistId } }));
  expect(mocks.audit).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("downloads through the real consent service and checks exact appointment scope twice", async () => {
  const response = await download();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain(`hasil-asesmen-${reportId}.pdf`);
  expect(mocks.appointment).toHaveBeenCalledTimes(2);
  expect(mocks.appointment).toHaveBeenCalledWith({ where: { id: appointmentId, participantId, psychologistId, assessmentSessionId, reportId }, select: { id: true } });
  expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({ action: "ACCESSED", consentId: id(6) }) });
});

it.each(["missing", "revoked", "expired", "persisted expiry", "wrong psychologist", "wrong participant", "wrong report", "wrong assessment", "wrong appointment", "wrong appointment participant", "wrong appointment report", "wrong appointment psychologist", "wrong appointment assessment", "ended", "cancelled", "closed"])("denies %s consent in discovery and at download", async (scenario) => {
  const current = grants[0];
  if (scenario === "missing") grants = [];
  if (scenario === "revoked") current.revokedAt = now;
  if (scenario === "expired") current.expiresAt = now;
  if (scenario === "persisted expiry") current.expiredAt = now;
  if (scenario === "wrong psychologist") current.targetUserId = id(99);
  if (scenario === "wrong participant") current.participantId = id(99);
  if (scenario === "wrong report") current.reportId = id(99);
  if (scenario === "wrong assessment") current.assessmentSessionId = id(99);
  if (scenario === "wrong appointment") current.appointmentId = id(99);
  if (scenario === "wrong appointment participant") current.appointment!.participantId = id(99);
  if (scenario === "wrong appointment report") current.appointment!.reportId = id(99);
  if (scenario === "wrong appointment psychologist") current.appointment!.psychologistId = id(99);
  if (scenario === "wrong appointment assessment") current.appointment!.assessmentSessionId = id(99);
  if (scenario === "ended") current.appointment!.consultationSession.endedAt = now;
  if (scenario === "cancelled") { current.appointment!.status = "CANCELLED"; current.appointment!.cancelledAt = now; }
  if (scenario === "closed") current.appointment!.consultationSession.status = "CLOSED";
  const [item] = await listPsychologistAppointments(psychologistId);
  expect(item.reportAccess).not.toHaveProperty("reportId");
  expect(item.reportAccess.status).toBe(["expired", "persisted expiry", "ended", "cancelled", "closed"].includes(scenario) ? "CONSENT_EXPIRED" : "CONSENT_UNAVAILABLE");
  const response = await download();
  expect(response.status).toBe(403);
  expect(mocks.artifact).not.toHaveBeenCalled();
  expect(await response.text()).not.toContain(participantId);
  expect(mocks.audit).not.toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ACCESSED" }) });
});

it("permits an independent standalone grant after appointment expiry without reviving that appointment grant", async () => {
  grants[0].expiresAt = now;
  grants.push({ ...grant(), id: id(7), consentType: "STANDALONE_REPORT_ACCESS", appointmentId: null, appointment: null, expiresAt: null });
  expect((await listPsychologistAppointments(psychologistId))[0].reportAccess).toEqual({ status: "AVAILABLE", reportId, consentType: "STANDALONE_REPORT_ACCESS" });
  expect((await download()).status).toBe(200);
  expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ACCESSED", consentId: id(7) }) });
  grants[1].revokedAt = now;
  expect((await download()).status).toBe(403);
});

it("does not interpret an expired standalone row as an appointment grant or a valid standalone contract", async () => {
  grants = [{ ...grant(), consentType: "STANDALONE_REPORT_ACCESS", appointmentId: null, appointment: null, expiresAt: now }];
  expect((await download()).status).toBe(403);
});

it.each(["PENDING", "mismatched report", "incomplete assessment"])("shows report unavailable for authorized %s metadata", async (scenario) => {
  if (scenario === "PENDING") row.report.status = "PENDING";
  if (scenario === "mismatched report") row.report.assessmentSessionId = id(99);
  if (scenario === "incomplete assessment") row.assessmentSession.status = "IN_PROGRESS";
  expect((await listPsychologistAppointments(psychologistId))[0].reportAccess).toEqual({ status: "REPORT_UNAVAILABLE" });
});

it("denies an unrelated appointment even with standalone consent for the report", async () => {
  grants = [{ ...grant(), consentType: "STANDALONE_REPORT_ACCESS", appointmentId: null, appointment: null, expiresAt: null }];
  mocks.appointment.mockResolvedValue(null);
  expect((await download()).status).toBe(403);
  expect(mocks.artifact).not.toHaveBeenCalled();
});

it.each(["revocation", "expiry", "closure"])("rechecks %s after Storage returns instead of trusting the list or first check", async (scenario) => {
  expect((await listPsychologistAppointments(psychologistId))[0].reportAccess.status).toBe("AVAILABLE");
  mocks.artifact.mockImplementation(async () => {
    if (scenario === "revocation") grants[0].revokedAt = now;
    if (scenario === "expiry") vi.setSystemTime(end);
    if (scenario === "closure") grants[0].appointment!.consultationSession.endedAt = now;
    return new TextEncoder().encode("%PDF-1.7\n%%EOF");
  });
  const response = await download();
  expect(response.status).toBe(403);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(mocks.audit).not.toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ACCESSED" }) });
});

it("returns a safe missing-artifact error and does not record successful access", async () => {
  mocks.artifact.mockRejectedValue(new ReportError("REPORT_ARTIFACT_UNAVAILABLE", 503));
  const response = await download();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("reports/");
  expect(mocks.audit).not.toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ACCESSED" }) });
});

it("rejects unauthorized roles and a different participant before Storage", async () => {
  mocks.profile.mockResolvedValue({ id: psychologistId, role: "SUPER_ADMIN" });
  expect((await download()).status).toBe(403);
  await expect(getReportArtifactForActor(id(99), "PARTICIPANT", reportId)).rejects.toMatchObject({ status: 404 });
  expect(mocks.artifact).not.toHaveBeenCalled();
});
