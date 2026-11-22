import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), raw: vi.fn(), execute: vi.fn(), users: vi.fn(), userCount: vi.fn(), period: vi.fn(), periods: vi.fn(), periodFirst: vi.fn(), create: vi.fn(), assessments: vi.fn(), appointments: vi.fn(), appointmentGroups: vi.fn(), consultations: vi.fn(), slots: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => {
  const db = { $executeRaw: mocks.execute, $queryRaw: mocks.raw, user: { findFirst: mocks.actor, findMany: mocks.users, count: mocks.userCount },
    academicPeriod: { findMany: mocks.periods, findUnique: mocks.period, findFirst: mocks.periodFirst, create: mocks.create }, assessmentSession: { count: mocks.assessments },
    appointment: { findMany: mocks.appointments, groupBy: mocks.appointmentGroups }, consultationSession: { groupBy: mocks.consultations }, psychologistAvailability: { groupBy: mocks.slots } };
  return { prisma: { $transaction: (work: (tx: typeof db) => unknown, options: unknown) => { mocks.transaction(options); return work(db); } } };
});
import { adminAppointments, adminOverview, adminPeriod, adminPeriods, adminPsychologists, createInactivePeriod } from "@/lib/admin/service";
import { adminDate, appointmentQuery, overviewQuery, periodCommand, periodQuery, psychologistQuery } from "@/lib/validations/admin";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const range = { from: "2030-01-01", to: "2030-01-31" };
const staged = { name: "Periode sintetis", startDate: "2031-01-01", endDate: "2031-06-30", assessmentLimit: 3 };
const period = { id: id(2), name: staged.name, startDate: new Date(staged.startDate), endDate: new Date(staged.endDate), status: "INACTIVE", assessmentLimit: 3 };
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://synthetic:synthetic@127.0.0.1:55432/synthetic");
  vi.resetAllMocks(); mocks.actor.mockResolvedValue({ id: id(1) }); mocks.raw.mockResolvedValue([{ now: new Date("2030-01-01T17:00:00Z") }]);
  mocks.userCount.mockResolvedValue(0); mocks.assessments.mockResolvedValue(0); mocks.periods.mockResolvedValue([]); mocks.period.mockResolvedValue(period); mocks.periodFirst.mockResolvedValue(null); mocks.create.mockResolvedValue(period);
  mocks.users.mockResolvedValue([]); mocks.appointments.mockResolvedValue([]); mocks.appointmentGroups.mockResolvedValue([]); mocks.consultations.mockResolvedValue([]); mocks.slots.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
it.each(["overview", "periods", "detail", "psychologists", "appointments", "create"])("rechecks active trusted SUPERADMIN for %s", async name => {
  mocks.actor.mockResolvedValue(null);
  const work = { overview: () => adminOverview(id(1), range), periods: () => adminPeriods(id(1), { limit: 10 }), detail: () => adminPeriod(id(1), id(2)), psychologists: () => adminPsychologists(id(1), { ...range, limit: 10, active: "all" }), appointments: () => adminAppointments(id(1), { ...range, limit: 10 }), create: () => createInactivePeriod(id(1), staged) };
  await expect(work[name as keyof typeof work]()).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  expect(mocks.actor).toHaveBeenCalledWith({ where: { id: id(1), role: "SUPERADMIN", isActive: true }, select: { id: true } });
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.users).not.toHaveBeenCalled();
});
it("zero overview fills operational statuses with zeros and never enables clinical statistics", async () => {
  const result = await adminOverview(id(1), range);
  expect(result).toMatchObject({ activeParticipants: 0, activePsychologists: 0, assessmentsStarted: 0, assessmentsCompleted: 0, activePeriod: null, clinicalIndicatorsEnabled: false });
  expect(result.appointments).toHaveLength(6); expect(result.consultations).toHaveLength(8); expect(result.appointments.every(row => row.count === 0)).toBe(true);
});
it("aggregates counts with separate temporal semantics and period relationships", async () => {
  mocks.userCount.mockResolvedValueOnce(12).mockResolvedValueOnce(2); mocks.assessments.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
  mocks.appointmentGroups.mockResolvedValue([{ status: "CONFIRMED", _count: { _all: 4 } }]);
  mocks.consultations.mockResolvedValue([{ status: "IN_PROGRESS", _count: { _all: 1 } }]);
  const result = await adminOverview(id(1), { ...range, periodId: id(2) });
  expect(result).toMatchObject({ activeParticipants: 12, activePsychologists: 2, assessmentsStarted: 5, assessmentsCompleted: 3 });
  expect(result.appointments.find(row => row.status === "CONFIRMED")?.count).toBe(4);
  const dates = { gte: new Date("2029-12-31T17:00:00Z"), lt: new Date("2030-01-31T17:00:00Z") };
  expect(mocks.assessments).toHaveBeenCalledWith({ where: { academicPeriodId: id(2), startedAt: dates } });
  expect(mocks.assessments).toHaveBeenCalledWith({ where: { academicPeriodId: id(2), status: "COMPLETED", completedAt: dates } });
  expect(mocks.appointmentGroups.mock.calls[0][0].where).toEqual({ scheduledStartAt: dates, assessmentSession: { academicPeriodId: id(2) } });
  expect(mocks.transaction).toHaveBeenCalledWith(expect.objectContaining({ isolationLevel: "RepeatableRead", timeout: 15000 }));
});
it("fails closed for missing or conflicting periods", async () => {
  mocks.period.mockResolvedValue(null); await expect(adminOverview(id(1), { ...range, periodId: id(2) })).rejects.toMatchObject({ code: "PERIOD_NOT_FOUND" });
  await expect(adminPeriod(id(1), id(2))).rejects.toMatchObject({ status: 404 });
  mocks.periods.mockResolvedValue([period, period]); await expect(adminOverview(id(1), range)).rejects.toMatchObject({ code: "PERIOD_CONFLICT" });
});
it("lists only bounded operational period fields and paginates by stable UUID", async () => {
  mocks.periods.mockResolvedValueOnce([period, { ...period, id: id(3) }]).mockResolvedValueOnce([]);
  const page = await adminPeriods(id(1), { limit: 1, cursor: id(0), status: "INACTIVE" });
  expect(page.items).toHaveLength(1); expect(page.nextCursor).toBe(id(2));
  expect(mocks.periods.mock.calls[0][0]).toMatchObject({ take: 2, orderBy: { id: "asc" }, where: { status: "INACTIVE", id: { gt: id(0) } } });
  expect(page.items[0].startDate).toBe("2031-01-01");
});
it("creates only INACTIVE future preparation with lock before overlap and duplicate checks", async () => {
  await createInactivePeriod(id(1), staged);
  expect(mocks.execute.mock.calls.map(call => String(call[0])).join(" ")).toContain("LOCK TABLE public.academic_periods IN SHARE ROW EXCLUSIVE MODE");
  expect(mocks.create.mock.calls[0][0].data).toEqual({ ...staged, startDate: new Date(staged.startDate), endDate: new Date(staged.endDate), status: "INACTIVE" });
  expect(mocks.periodFirst.mock.calls[0][0].where).toEqual({ status: "ACTIVE", startDate: { lte: new Date(staged.endDate) }, endDate: { gte: new Date(staged.startDate) } });
});
it.each(["2029-12-31", "2030-01-01", "2030-01-02"])("rejects historical/today %s against Jakarta DB clock", async startDate => {
  await expect(createInactivePeriod(id(1), { ...staged, startDate })).rejects.toMatchObject({ code: "PERIOD_NOT_FUTURE" }); expect(mocks.create).not.toHaveBeenCalled();
});
it("accepts the next Jakarta calendar day including a one-day period", async () => {
  await expect(createInactivePeriod(id(1), { ...staged, startDate: "2030-01-03", endDate: "2030-01-03", assessmentLimit: 0 })).resolves.toBeDefined();
});
it("rejects overlapping active periods and duplicate preparation without writes", async () => {
  mocks.periodFirst.mockResolvedValueOnce({ id: id(3) }); await expect(createInactivePeriod(id(1), staged)).rejects.toMatchObject({ code: "PERIOD_OVERLAP" });
  mocks.periodFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: id(3) }); await expect(createInactivePeriod(id(1), staged)).rejects.toMatchObject({ code: "PERIOD_DUPLICATE" }); expect(mocks.create).not.toHaveBeenCalled();
});
it("production permits operational reads but blocks all period creation", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect((await adminPeriods(id(1), { limit: 10 })).canCreate).toBe(false);
  await expect(createInactivePeriod(id(1), staged)).rejects.toMatchObject({ code: "PERIOD_POLICY_PENDING" }); expect(mocks.create).not.toHaveBeenCalled();
});
it.each(["postgresql://synthetic:synthetic@db.example.test/synthetic", "", "invalid", "https://localhost"])("development cannot create periods on a nonlocal or invalid DB target %#", async target => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("DATABASE_URL", target);
  expect((await adminPeriods(id(1), { limit: 10 })).canCreate).toBe(false);
  await expect(createInactivePeriod(id(1), staged)).rejects.toMatchObject({ code: "PERIOD_POLICY_PENDING" }); expect(mocks.create).not.toHaveBeenCalled();
});
it("psychologist page scopes role/activity and slots to that page without contact information", async () => {
  mocks.users.mockResolvedValue([{ id: id(4), fullName: "Psikolog sintetis", isActive: false, psychologistProfile: null }, { id: id(5), fullName: "Berikutnya", isActive: true, psychologistProfile: null }]);
  mocks.slots.mockResolvedValue([{ psychologistId: id(4), status: "BOOKED", _count: { _all: 2 } }]);
  const result = await adminPsychologists(id(1), { ...range, limit: 1, active: "false", cursor: id(3) });
  expect(mocks.users.mock.calls[0][0].where).toEqual({ role: "PSYCHOLOGIST", isActive: false, id: { gt: id(3) } });
  expect(mocks.slots.mock.calls[0][0].where.psychologistId).toEqual({ in: [id(4)] });
  expect(result.items[0]).toMatchObject({ active: false, profile: null }); expect(result.nextCursor).toBe(id(4));
  expect(JSON.stringify(mocks.users.mock.calls[0][0].select)).not.toMatch(/email|phone|institutional|participant/);
});
it("appointment oversight never selects or returns participant identifiers, notes, reports or clinical relations", async () => {
  const row = { id: id(10), status: "CONFIRMED", scheduledStartAt: new Date("2030-01-01T02:00:00Z"), scheduledEndAt: new Date("2030-01-01T04:00:00Z"), psychologist: { fullName: "Psikolog" }, consultationSession: { status: "SCHEDULED" } };
  mocks.appointments.mockResolvedValue([row, { ...row, id: id(11) }]);
  const page = await adminAppointments(id(1), { ...range, limit: 1, periodId: id(2), status: "CONFIRMED" });
  expect(Object.keys(page.items[0]).sort()).toEqual(["consultationStatus", "psychologistName", "scheduledEndAt", "scheduledStartAt", "status"]);
  expect(JSON.stringify(mocks.appointments.mock.calls[0][0].select)).not.toMatch(/participant|report|consent|body|score|answer|assessment/);
  await adminAppointments(id(1), { ...range, limit: 1, cursor: page.nextCursor! });
  expect(mocks.appointments.mock.calls[1][0].where.OR[1]).toEqual({ scheduledStartAt: row.scheduledStartAt, id: { gt: id(10) } });
});
it("rejects malformed appointment cursors", async () => { await expect(adminAppointments(id(1), { ...range, limit: 10, cursor: "invalid" })).rejects.toMatchObject({ code: "INVALID_CURSOR" }); });
it.each(["2030-02-29", "2030-13-01", "2030-01-32", "30-01-01", "garbage"])("rejects impossible date %s", value => expect(adminDate.safeParse(value).success).toBe(false));
it("validates leap-day and inclusive 93-day range", () => {
  expect(adminDate.parse("2032-02-29")).toBe("2032-02-29");
  expect(overviewQuery.safeParse({ from: "2030-01-01", to: "2030-04-03" }).success).toBe(true);
  expect(overviewQuery.safeParse({ from: "2030-01-01", to: "2030-04-04" }).success).toBe(false);
});
it.each([{ assessmentLimit: -1 }, { assessmentLimit: 1.5 }, { assessmentLimit: 2147483648 }, { endDate: "2030-01-01" }, { name: "  " }, { status: "ACTIVE" }, { id: id(4) }, { role: "SUPERADMIN" }])("rejects invalid/forged creation %#", changes => expect(periodCommand.safeParse({ ...staged, ...changes }).success).toBe(false));
it.each([{ ...range, from: "2030-02-01" }, { ...range, periodId: "bad" }, { ...range, participantId: id(1) }, { ...range, clinical: true }])("rejects unsupported/granular overview query %#", query => expect(overviewQuery.safeParse(query).success).toBe(false));
it("validates page bounds and whitelisted psychologist/appointment filters", () => {
  expect(periodQuery.safeParse({ limit: 51 }).success).toBe(false); expect(periodQuery.safeParse({ page: 999 }).success).toBe(false);
  expect(psychologistQuery.safeParse({ ...range, role: "SUPERADMIN" }).success).toBe(false); expect(appointmentQuery.safeParse({ ...range, status: "HACKED" }).success).toBe(false);
});
