import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AppointmentStatus, ConsultationSessionStatus, ConsultationEndedBy, ConsultationEndReason } from "@prisma/client";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), find: vi.fn(), list: vi.fn(), query: vi.fn(), appointment: vi.fn(), session: vi.fn(), expire: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const db = { user: { findFirst: mocks.profile }, appointment: { findFirst: mocks.find, findMany: mocks.list, update: mocks.appointment },
    consultationSession: { update: mocks.session }, $queryRaw: mocks.query };
  return { prisma: { ...db, $transaction: (work: (tx: typeof db) => unknown) => work(db) } };
});
vi.mock("@/lib/appointments/service", () => ({ expireAppointmentConsents: mocks.expire,
  AppointmentError: class extends Error { constructor(public code: string, message: string, public status: number) { super(message); } } }));
import { listConsultations, transitionConsultation } from "@/lib/consultations/service";
import { consultationEligibility, effectiveConsultationStatus, type ConsultationAction } from "@/lib/consultations/policy";

const start = new Date("2030-01-01T02:00:00Z"), end = new Date("2030-01-01T04:00:00Z");
const participant = { id: "participant", role: "PARTICIPANT" as const }, psychologist = { id: "psychologist", role: "PSYCHOLOGIST" as const };
function fixture() { return {
  id: "appointment", participantId: participant.id, psychologistId: psychologist.id, status: "CONFIRMED" as AppointmentStatus,
  scheduledStartAt: start, scheduledEndAt: end, participant: { fullName: "Peserta sintetis" }, psychologist: { fullName: "Psikolog sintetis" },
  consultationSession: { id: "session", appointmentId: "appointment", status: "SCHEDULED" as ConsultationSessionStatus,
    scheduledStartAt: start, scheduledEndAt: end, participantCheckedInAt: null as Date | null, psychologistCheckedInAt: null as Date | null,
    startedAt: null as Date | null, endedAt: null as Date | null, endedBy: null as ConsultationEndedBy | null, endReason: null as ConsultationEndReason | null },
}; }
let row: ReturnType<typeof fixture>;
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(start); row = fixture();
  mocks.profile.mockResolvedValue({ id: participant.id });
  mocks.find.mockImplementation(async ({ where }) => (!where.participantId || where.participantId === row.participantId) && (!where.psychologistId || where.psychologistId === row.psychologistId) ? row : null);
  mocks.list.mockResolvedValue([row]); mocks.query.mockResolvedValue([]);
  mocks.session.mockImplementation(async ({ data }) => Object.assign(row.consultationSession, data));
  mocks.appointment.mockImplementation(async ({ data }) => Object.assign(row, data));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const run = (action: ConsultationAction, actor = psychologist) => transitionConsultation(actor, row.id, action);
async function ready() { await transitionConsultation(participant, row.id, "participant-check-in"); await run("psychologist-check-in"); }

it("participant check-in uses server time and retries retain the earliest timestamp", async () => {
  const first = await transitionConsultation(participant, row.id, "participant-check-in");
  vi.setSystemTime(new Date(start.getTime() + 60000));
  expect((await transitionConsultation(participant, row.id, "participant-check-in")).participantCheckedInAt).toBe(first.participantCheckedInAt);
  expect(first.participantCheckedInAt).toBe(start.toISOString()); expect(mocks.session).toHaveBeenCalledTimes(1);
});
it("psychologist check-in and both-party readiness are persisted without starting or creating consent", async () => {
  await ready(); expect(row.consultationSession.status).toBe("READY"); expect(row.status).toBe("CONFIRMED");
  expect(row.consultationSession.startedAt).toBeNull(); expect(mocks.expire).not.toHaveBeenCalled();
});
it.each([participant, psychologist])("rejects an unassigned $role without leaking the appointment", async actor => {
  await expect(transitionConsultation({ ...actor, id: "other" }, row.id, actor.role === "PARTICIPANT" ? "participant-check-in" : "psychologist-check-in")).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND" });
  expect(mocks.session).not.toHaveBeenCalled();
});
it("rejects inactive or changed authoritative profile", async () => {
  mocks.profile.mockResolvedValue(null); await expect(run("psychologist-check-in")).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it.each(["SUPERADMIN", "INVALID"])("rejects unsupported role %s", async role => {
  await expect(transitionConsultation({ id: "admin", role } as typeof participant, row.id, "start")).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it.each([new Date(start.getTime() - 1), end, new Date(end.getTime() + 1)])("rejects check-in outside the half-open window %s", async now => {
  vi.setSystemTime(now); await expect(run("psychologist-check-in")).rejects.toMatchObject({ status: 409 }); expect(mocks.session).not.toHaveBeenCalled();
});
it("rejects start until both check-ins exist", async () => {
  await expect(run("start")).rejects.toMatchObject({ code: "CHECK_INS_REQUIRED" });
  await run("psychologist-check-in"); await expect(run("start")).rejects.toMatchObject({ code: "CHECK_INS_REQUIRED" });
});
it.each(["psychologist-check-in", "start", "end"] as const)("participant cannot perform %s", async action => {
  await expect(transitionConsultation(participant, row.id, action)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("psychologist cannot perform the participant check-in", async () => {
  await expect(run("participant-check-in")).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("starts both records atomically, rejects repeated start and preserves startedAt", async () => {
  await ready(); const result = await run("start"); expect(result).toMatchObject({ appointmentStatus: "IN_PROGRESS", sessionStatus: "IN_PROGRESS", startedAt: start.toISOString() });
  vi.setSystemTime(new Date(start.getTime() + 60000));
  await expect(run("start")).rejects.toMatchObject({ code: "CONSULTATION_ALREADY_STARTED" });
  expect(row.consultationSession.startedAt).toEqual(start); expect(mocks.expire).not.toHaveBeenCalled();
});
it("completes early and retries retain the end timestamp and a single consent expiry call", async () => {
  await ready(); await run("start"); vi.setSystemTime(new Date(start.getTime() + 60000));
  const result = await run("end"); expect(result).toMatchObject({ appointmentStatus: "COMPLETED", sessionStatus: "COMPLETED", endedBy: "PSYCHOLOGIST", endReason: "PSYCHOLOGIST_COMPLETED" });
  vi.setSystemTime(end); expect((await run("end")).endedAt).toBe(result.endedAt); expect(mocks.expire).toHaveBeenCalledTimes(1);
});
it("rejects ending a session that has not started", async () => { await expect(run("end")).rejects.toMatchObject({ code: "CONSULTATION_NOT_STARTED" }); });
it.each(["CANCELLED", "RESCHEDULED", "COMPLETED", "NO_SHOW"] as AppointmentStatus[])("rejects mutations on terminal appointment %s", async status => {
  row.status = status; await expect(run("psychologist-check-in")).rejects.toMatchObject({ code: "CONSULTATION_TERMINAL" });
});
it.each(["PARTICIPANT_LATE", "PSYCHOLOGIST_LATE"] as ConsultationSessionStatus[])("gates %s pending institutional policy", async status => {
  row.consultationSession.status = status; await expect(run("psychologist-check-in")).rejects.toMatchObject({ code: "CONSULTATION_POLICY_PENDING" });
});
it.each(["link", "window", "status"])("rejects inconsistent %s", async kind => {
  if (kind === "link") row.consultationSession.appointmentId = "another";
  if (kind === "window") row.consultationSession.scheduledEndAt = new Date(end.getTime() + 1);
  if (kind === "status") row.status = "IN_PROGRESS";
  await expect(run("start")).rejects.toMatchObject({ code: "CONSULTATION_INCONSISTENT" });
});
it("production does not activate the unapproved development check-in policy", async () => {
  vi.stubEnv("NODE_ENV", "production"); await expect(run("psychologist-check-in")).rejects.toMatchObject({ code: "CONSULTATION_POLICY_PENDING" });
});
it("GET returns scoped minimal DTOs with effective expiry without mutations or no-show inference", async () => {
  vi.setSystemTime(end); const result = await listConsultations(participant);
  expect(result.items[0]).toMatchObject({ effectiveStatus: "WINDOW_ENDED", sessionStatus: "SCHEDULED", history: true });
  expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ where: { participantId: participant.id } }));
  for (const key of ["reportId", "participantId", "psychologistId", "email", "score"]) expect(result.items[0]).not.toHaveProperty(key);
  expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.expire).not.toHaveBeenCalled(); expect(mocks.appointment).not.toHaveBeenCalled();
});
it("reads authoritative time after waiting on locks, rejecting a request that crosses scheduled end", async () => {
  mocks.query.mockImplementation(async () => { vi.setSystemTime(end); return []; });
  await expect(run("psychologist-check-in")).rejects.toMatchObject({ code: "CONSULTATION_WINDOW_ENDED" });
});
it("pure policy distinguishes persisted READY from an elapsed effective status", () => {
  row.consultationSession.status = "READY"; row.consultationSession.participantCheckedInAt = start; row.consultationSession.psychologistCheckedInAt = start;
  expect(effectiveConsultationStatus(row, end)).toBe("WINDOW_ENDED"); expect(row.consultationSession.status).toBe("READY");
  expect(consultationEligibility(row, "PSYCHOLOGIST", "start", end, true).allowed).toBe(false);
});
