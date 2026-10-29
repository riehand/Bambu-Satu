import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiRole: vi.fn(), getCurrentProfile: vi.fn(), sameOrigin: vi.fn(),
  createAppointment: vi.fn(), listParticipantAppointments: vi.fn(), getBookingContext: vi.fn(),
  listPsychologistAppointments: vi.fn(), getAppointmentForParty: vi.fn(), getReportForActor: vi.fn(),
  grantStandaloneConsent: vi.fn(), listOwnConsents: vi.fn(), revokeConsent: vi.fn(), grantAppointmentConsent: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireApiRole: mocks.requireApiRole,
  getCurrentProfile: mocks.getCurrentProfile,
  AuthError: class AuthError extends Error { constructor(public reason: string) { super(reason); } },
}));
vi.mock("@/lib/auth/http", () => ({
  privateHeaders: { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Expires: "0" },
  isSameOrigin: mocks.sameOrigin,
}));
vi.mock("@/lib/appointments/service", () => ({
  createAppointment: mocks.createAppointment,
  listParticipantAppointments: mocks.listParticipantAppointments,
  getBookingContext: mocks.getBookingContext,
  listPsychologistAppointments: mocks.listPsychologistAppointments,
  getAppointmentForParty: mocks.getAppointmentForParty,
  getReportForActor: mocks.getReportForActor,
  grantStandaloneConsent: mocks.grantStandaloneConsent,
  listOwnConsents: mocks.listOwnConsents,
  revokeConsent: mocks.revokeConsent,
  grantAppointmentConsent: mocks.grantAppointmentConsent,
  AppointmentError: class AppointmentError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } },
}));

import { GET as bookingContextGet } from "@/app/api/appointments/booking-context/route";
import { GET as participantListGet, POST as createAppointmentPost } from "@/app/api/appointments/route";
import { GET as psychologistListGet } from "@/app/api/psychologist/appointments/route";
import { GET as appointmentGet } from "@/app/api/appointments/[appointmentId]/route";
import { POST as standaloneConsentPost } from "@/app/api/consents/psychologist-report/route";
import { GET as consentListGet } from "@/app/api/consents/route";
import { POST as revokeConsentPost } from "@/app/api/consents/[consentId]/revoke/route";
import { POST as appointmentReconsentPost } from "@/app/api/appointments/[appointmentId]/report-consent/route";
import { GET as reportGet } from "@/app/api/reports/[reportId]/route";

const origin = "https://app.test";
const participantId = "00000000-0000-4000-8000-000000000101";
const psychologistId = "00000000-0000-4000-8000-000000000102";
const appointmentId = "00000000-0000-4000-8000-000000000103";
const reportId = "00000000-0000-4000-8000-000000000104";
const consentId = "00000000-0000-4000-8000-000000000105";
const bookingBody = { psychologistId, assessmentSessionId: appointmentId, reportId, availabilityId: consentId, reportConsent: true };
const req = (path: string, method = "GET", body?: unknown, requestOrigin = origin) => new Request(`${origin}${path}`, {
  method,
  headers: { origin: requestOrigin, "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SITE_URL = origin;
  mocks.sameOrigin.mockImplementation((request: Request) => request.headers.get("origin") === origin);
  mocks.requireApiRole.mockImplementation(async (role: string) => ({ id: role === "PSYCHOLOGIST" ? psychologistId : participantId, role }));
  mocks.getCurrentProfile.mockResolvedValue({ id: participantId, role: "PARTICIPANT" });
  for (const fn of [mocks.createAppointment, mocks.listParticipantAppointments, mocks.getBookingContext, mocks.listPsychologistAppointments,
    mocks.getAppointmentForParty, mocks.getReportForActor, mocks.grantStandaloneConsent, mocks.listOwnConsents, mocks.revokeConsent, mocks.grantAppointmentConsent]) {
    fn.mockResolvedValue({ appointmentId, status: "CONFIRMED" });
  }
});

it("requires a participant role, validates booking payload, and returns private no-store data", async () => {
  const response = await createAppointmentPost(req("/api/appointments", "POST", bookingBody));
  expect(response.status).toBe(201);
  expect(mocks.requireApiRole).toHaveBeenCalledWith("PARTICIPANT");
  expect(mocks.createAppointment).toHaveBeenCalledWith(participantId, bookingBody);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect((await createAppointmentPost(req("/api/appointments", "POST", { ...bookingBody, reportConsent: "true" }))).status).toBe(422);
});

it("rejects cross-origin booking before the service and lists appointments under the participant identity", async () => {
  expect((await createAppointmentPost(req("/api/appointments", "POST", bookingBody, "https://outside.test"))).status).toBe(403);
  expect(mocks.createAppointment).not.toHaveBeenCalled();
  await participantListGet();
  expect(mocks.listParticipantAppointments).toHaveBeenCalledWith(participantId);
  await bookingContextGet();
  expect(mocks.getBookingContext).toHaveBeenCalledWith(participantId);
});

it("keeps the psychologist appointment list and appointment detail object-scoped", async () => {
  await psychologistListGet();
  expect(mocks.requireApiRole).toHaveBeenCalledWith("PSYCHOLOGIST");
  expect(mocks.listPsychologistAppointments).toHaveBeenCalledWith(psychologistId);
  const response = await appointmentGet(req(`/api/appointments/${appointmentId}`), { params: Promise.resolve({ appointmentId }) });
  expect(response.status).toBe(200);
  expect(mocks.getAppointmentForParty).toHaveBeenCalledWith(participantId, "PARTICIPANT", appointmentId);
});

it("requires affirmative standalone and appointment re-consent and scopes revoke to the participant", async () => {
  const standaloneBody = { assessmentSessionId: appointmentId, reportId, psychologistId, consent: true };
  await standaloneConsentPost(req("/api/consents/psychologist-report", "POST", standaloneBody));
  expect(mocks.grantStandaloneConsent).toHaveBeenCalledWith(participantId, standaloneBody);
  await appointmentReconsentPost(req(`/api/appointments/${appointmentId}/report-consent`, "POST", { consent: true }), { params: Promise.resolve({ appointmentId }) });
  expect(mocks.grantAppointmentConsent).toHaveBeenCalledWith(participantId, appointmentId, true);
  await revokeConsentPost(req(`/api/consents/${consentId}/revoke`, "POST"), { params: Promise.resolve({ consentId }) });
  expect(mocks.revokeConsent).toHaveBeenCalledWith(participantId, consentId);
  await consentListGet();
  expect(mocks.listOwnConsents).toHaveBeenCalledWith(participantId);
});

it("uses verified participant or psychologist identity for report access", async () => {
  mocks.getCurrentProfile.mockResolvedValueOnce({ id: psychologistId, role: "PSYCHOLOGIST" });
  const response = await reportGet(req(`/api/reports/${reportId}`), { params: Promise.resolve({ reportId }) });
  expect(response.status).toBe(200);
  expect(mocks.getReportForActor).toHaveBeenCalledWith(psychologistId, "PSYCHOLOGIST", reportId);
  expect(response.headers.get("cache-control")).toContain("no-store");
});
