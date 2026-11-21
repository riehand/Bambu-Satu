import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AppointmentStatus, ConsultationSessionStatus } from "@prisma/client";
const mocks = vi.hoisted(() => ({ profile: vi.fn(), appointment: vi.fn(), query: vi.fn(), list: vi.fn(), existing: vi.fn(), create: vi.fn(), committed: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const db = { $queryRaw: mocks.query, user: { findFirst: mocks.profile }, appointment: { findFirst: mocks.appointment }, consultationMessage: { findFirst: mocks.committed, findMany: mocks.list, findUnique: mocks.existing, create: mocks.create } };
  return { prisma: { ...db, $transaction: (work: (tx: typeof db) => unknown) => { mocks.transaction(); return work(db); } } };
});
import { listChatMessages, sendChatMessage } from "@/lib/consultations/chat-service";
import { chatCommand, chatQuery } from "@/lib/validations/chat";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const p = { id: id(1), role: "PARTICIPANT" as const }, psy = { id: id(2), role: "PSYCHOLOGIST" as const };
const start = new Date("2030-01-01T02:00:00Z"), end = new Date("2030-01-01T04:00:00Z");
const command = { body: "Pesan sintetis", clientMessageId: id(10) };
function fixture() { return {
  id: id(3), participantId: p.id, psychologistId: psy.id, status: "IN_PROGRESS" as AppointmentStatus,
  scheduledStartAt: start, scheduledEndAt: end, participant: { role: "PARTICIPANT", isActive: true }, psychologist: { role: "PSYCHOLOGIST", isActive: true },
  consultationSession: { id: id(4), appointmentId: id(3), status: "IN_PROGRESS" as ConsultationSessionStatus,
    scheduledStartAt: start, scheduledEndAt: end, participantCheckedInAt: start, psychologistCheckedInAt: start, startedAt: start, endedAt: null as Date | null },
}; }
const message = (n = 20) => ({ id: id(n), senderId: p.id, body: command.body, clientMessageId: command.clientMessageId, createdAt: new Date(start.getTime() + n) });
let row: ReturnType<typeof fixture>;
beforeEach(() => {
  vi.resetAllMocks(); row = fixture(); mocks.profile.mockResolvedValue({ id: p.id });
  mocks.appointment.mockImplementation(async ({ where }) => (!where.participantId || where.participantId === p.id) && (!where.psychologistId || where.psychologistId === psy.id) ? row : null);
  mocks.query.mockResolvedValue([{ now: new Date(start.getTime() + 60000) }]); mocks.list.mockResolvedValue([]); mocks.existing.mockResolvedValue(null); mocks.create.mockResolvedValue(message());
  mocks.committed.mockResolvedValue({ id: message().id });
});
afterEach(() => vi.unstubAllEnvs());
it("never acknowledges a transaction resolved by Prisma without a committed row", async () => {
  mocks.committed.mockResolvedValue(null);
  await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "CHAT_SEND_FAILED" });
  expect(mocks.committed).toHaveBeenCalledWith({ where: { id: message().id, senderId: p.id, clientMessageId: command.clientMessageId, consultationSession: { appointmentId: row.id } }, select: { id: true } });
});
it.each([p, psy])("accepts assigned $role with authoritative sender and no report fields", async actor => {
  const result = await sendChatMessage(actor, row.id, command);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: { consultationSessionId: id(4), senderId: actor.id, ...command } }));
  expect(result.replayed).toBe(false); expect(result.message).not.toHaveProperty("senderId"); expect(result.message).not.toHaveProperty("reportId");
});
it.each([p, psy])("denies another $role for reads and writes", async actor => {
  const wrong = { ...actor, id: id(99) };
  await expect(listChatMessages(wrong, row.id, { limit: 30 })).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND" });
  await expect(sendChatMessage(wrong, row.id, command)).rejects.toMatchObject({ code: "APPOINTMENT_NOT_FOUND" }); expect(mocks.create).not.toHaveBeenCalled();
});
it.each(["SUPERADMIN", "INVALID"])("rejects role %s before accessing data", async role => {
  await expect(sendChatMessage({ id: id(9), role } as typeof p, row.id, command)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rechecks active actor profile", async () => { mocks.profile.mockResolvedValue(null); await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "FORBIDDEN" }); });
it.each(["participant", "psychologist"] as const)("verifies %s identity and active role", async who => {
  row[who].isActive = false; await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "FORBIDDEN" });
  row[who].isActive = true; row[who].role = "SUPERADMIN"; await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it.each(["COMPLETED", "CANCELLED", "NO_SHOW", "RESCHEDULED", "CONFIRMED"] as AppointmentStatus[])("blocks read/send for appointment %s", async status => {
  row.status = status;
  await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "CHAT_CLOSED" });
  await expect(listChatMessages(p, row.id, { limit: 30 })).rejects.toMatchObject({ code: "CHAT_CLOSED" });
});
it.each(["COMPLETED", "CLOSED", "NO_SHOW", "SCHEDULED", "READY"] as ConsultationSessionStatus[])("blocks session %s", async status => {
  row.consultationSession.status = status; await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "CHAT_CLOSED" });
});
it("rejects inconsistent link/window and ended session", async () => {
  row.consultationSession.appointmentId = id(99); await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "CHAT_CLOSED" });
  row = fixture(); row.consultationSession.scheduledEndAt = new Date(end.getTime() + 1); await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "CHAT_CLOSED" });
  row = fixture(); row.consultationSession.endedAt = start; await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "CHAT_CLOSED" });
});
it.each([new Date(start.getTime() - 1), end])("rejects outside window using DB time %s", async now => {
  mocks.query.mockResolvedValue([{ now }]); await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "CHAT_CLOSED" });
});
it("rechecks time after a pending read before returning messages", async () => {
  mocks.list.mockImplementation(async () => { mocks.query.mockResolvedValue([{ now: end }]); return [message()]; });
  await expect(listChatMessages(p, row.id, { limit: 30 })).rejects.toMatchObject({ code: "CHAT_CLOSED" });
});
it("replays same normalized payload without a second INSERT", async () => {
  mocks.existing.mockResolvedValue(message()); const result = await sendChatMessage(p, row.id, { ...command, body: ` ${command.body} ` });
  expect(result.replayed).toBe(true); expect(mocks.create).not.toHaveBeenCalled();
});
it("rejects same idempotency key with different text", async () => {
  mocks.existing.mockResolvedValue(message()); await expect(sendChatMessage(p, row.id, { ...command, body: "Different" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("denies even a replay once the session has expired", async () => {
  mocks.existing.mockResolvedValue(message()); mocks.query.mockResolvedValue([{ now: end }]);
  await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "CHAT_CLOSED" });
});
it("production refuses reads and writes before a transaction", async () => {
  vi.stubEnv("NODE_ENV", "production"); await expect(listChatMessages(p, row.id, { limit: 30 })).rejects.toMatchObject({ code: "CHAT_POLICY_PENDING" });
  await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "CHAT_POLICY_PENDING" }); expect(mocks.transaction).not.toHaveBeenCalled();
});
it("returns stable chronological pages with session-scoped before/after cursors", async () => {
  mocks.list.mockResolvedValue([message(23), message(22), message(21)]);
  const page = await listChatMessages(p, row.id, { limit: 2 }); expect(page.items.map(m => m.id)).toEqual([id(22), id(23)]);
  expect(page.nextCursor).toBeTruthy();
  await listChatMessages(p, row.id, { limit: 2, before: page.nextCursor! });
  expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ where: { consultationSessionId: id(4), OR: [{ createdAt: { lt: message(22).createdAt } }, { createdAt: message(22).createdAt, id: { lt: id(22) } }] } }));
  await listChatMessages(p, row.id, { limit: 2, after: page.latestCursor! });
  expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }));
  await expect(listChatMessages(p, id(99), { limit: 2, before: page.nextCursor! })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
});
it("rejects malformed cursor and returns safe database errors", async () => {
  await expect(listChatMessages(p, row.id, { limit: 2, before: "invalid" })).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  mocks.create.mockRejectedValue(new Error("private-body-and-connection-detail"));
  await expect(sendChatMessage(p, row.id, command)).rejects.toMatchObject({ code: "CHAT_SEND_FAILED" });
  await expect(sendChatMessage(p, row.id, command)).rejects.not.toThrow(/private-body/);
});
it.each(["", " \n\t", "a".repeat(2001), "has\0nul"])("strictly rejects invalid message %#", body => { expect(chatCommand.safeParse({ ...command, body }).success).toBe(false); });
it("accepts plain text including literal markup without HTML processing", () => { expect(chatCommand.parse({ ...command, body: "<script>synthetic</script>" }).body).toBe("<script>synthetic</script>"); });
it.each([{ limit: 0 }, { limit: 51 }, { before: "x", after: "y" }, { senderId: id(1) }])("rejects invalid query %#", query => { expect(chatQuery.safeParse(query).success).toBe(false); });
