import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findFirst: mocks.findFirst },
  psychologistAvailability: { findMany: mocks.findMany },
  $transaction: mocks.transaction,
} }));

import { listOwnAvailability, listPublicAvailability, setDailyAvailability } from "@/lib/psychologist/service";

const psychologistId = "00000000-0000-4000-8000-000000000001";
const date = "2026-11-01";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findFirst.mockResolvedValue({ id: psychologistId });
  mocks.findMany.mockResolvedValue([]);
  mocks.queryRaw.mockResolvedValue([]);
  mocks.update.mockResolvedValue({});
  mocks.create.mockResolvedValue({});
  mocks.transaction.mockImplementation((work) => work({
    $queryRaw: mocks.queryRaw,
    psychologistAvailability: { update: mocks.update, create: mocks.create },
  }));
});

it("lists only future available fixed sessions for active psychologists", async () => {
  mocks.findMany.mockResolvedValue([
    { id: "1", availabilityDate: new Date(`${date}T00:00:00.000Z`), sessionType: "MORNING", status: "AVAILABLE" },
    { id: "2", availabilityDate: new Date(`${date}T00:00:00.000Z`), sessionType: "EVENING", status: "AVAILABLE" },
  ]);
  const slots = await listPublicAvailability(psychologistId, { date }, new Date("2026-11-01T08:00:00.000Z"));
  expect(mocks.findFirst).toHaveBeenCalledWith({ where: { id: psychologistId, role: "PSYCHOLOGIST", isActive: true }, select: { id: true } });
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { psychologistId, availabilityDate: new Date(`${date}T00:00:00.000Z`), status: "AVAILABLE" } }));
  expect(slots).toEqual([{ availabilityId: "2", date, sessionType: "EVENING", startTime: "16:00", endTime: "18:00", status: "AVAILABLE" }]);
});

it("does not query availability for missing or inactive psychologists", async () => {
  mocks.findFirst.mockResolvedValue(null);
  expect(await listPublicAvailability(psychologistId, { date })).toBeNull();
  expect(mocks.findMany).not.toHaveBeenCalled();
});

it("rejects past dates and sessions whose start time has passed", async () => {
  await expect(setDailyAvailability(psychologistId, "2026-10-31", {
    sessions: [
      { sessionType: "MORNING", available: false },
      { sessionType: "AFTERNOON", available: false },
      { sessionType: "EVENING", available: false },
    ],
  }, new Date("2026-11-01T00:00:00.000Z"))).rejects.toMatchObject({ code: "INVALID_AVAILABILITY_DATE", status: 422 });

  await expect(setDailyAvailability(psychologistId, date, {
    sessions: [
      { sessionType: "MORNING", available: true },
      { sessionType: "AFTERNOON", available: false },
      { sessionType: "EVENING", available: false },
    ],
  }, new Date("2026-11-01T08:00:00.000Z"))).rejects.toMatchObject({ code: "SLOT_START_PASSED", status: 409 });
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("keeps booked sessions booked while allowing changes to other fixed sessions", async () => {
  mocks.queryRaw.mockResolvedValue([{ id: "booked", session_type: "MORNING", status: "BOOKED" }]);
  mocks.findMany.mockResolvedValue([]);
  await setDailyAvailability(psychologistId, date, {
    sessions: [
      { sessionType: "MORNING", available: false },
      { sessionType: "AFTERNOON", available: true },
      { sessionType: "EVENING", available: false },
    ],
  }, new Date("2026-10-30T00:00:00.000Z"));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sessionType: "AFTERNOON", status: "AVAILABLE" }) }));
});

it("rejects attempts to reopen a booked session", async () => {
  mocks.queryRaw.mockResolvedValue([{ id: "booked", session_type: "MORNING", status: "BOOKED" }]);
  await expect(setDailyAvailability(psychologistId, date, {
    sessions: [
      { sessionType: "MORNING", available: true },
      { sessionType: "AFTERNOON", available: false },
      { sessionType: "EVENING", available: false },
    ],
  }, new Date("2026-10-30T00:00:00.000Z"))).rejects.toMatchObject({ code: "AVAILABILITY_ALREADY_BOOKED", status: 409 });
  expect(mocks.create).not.toHaveBeenCalled();
});

it("lists an owner's availability with the fixed Jakarta session labels", async () => {
  mocks.findMany.mockResolvedValue([{ id: "1", availabilityDate: new Date(`${date}T00:00:00.000Z`), sessionType: "MORNING", status: "AVAILABLE" }]);
  expect(await listOwnAvailability(psychologistId, { date })).toEqual([
    { availabilityId: "1", date, sessionType: "MORNING", startTime: "09:00", endTime: "11:00", status: "AVAILABLE" },
  ]);
});
