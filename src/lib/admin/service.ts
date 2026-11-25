import "server-only";
import { gatewayMode, assertDatabaseActor } from "@/lib/dal/context";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnly, jakartaDate } from "@/lib/psychologist/availability-config";
import { adminId, appointmentCursor, appointmentQuery, overviewQuery, periodCommand, periodQuery, psychologistQuery,
  type AppointmentQuery, type OverviewQuery, type PeriodCommand, type PeriodQuery, type PsychologistQuery } from "@/lib/validations/admin";
import { AdminError } from "./errors";
export function periodCreationEnabled() {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") return false;
  try {
    const target = new URL(process.env.DATABASE_URL ?? "");
    return ["postgres:", "postgresql:"].includes(target.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  } catch { return false; }
}
const periodSelect = { id: true, name: true, startDate: true, endDate: true, assessmentLimit: true, status: true } satisfies Prisma.AcademicPeriodSelect;
type Period = Prisma.AcademicPeriodGetPayload<{ select: typeof periodSelect }>;
const periodDTO = (row: Period) => ({ ...row, startDate: row.startDate.toISOString().slice(0, 10), endDate: row.endDate.toISOString().slice(0, 10) });
function window(query: { from: string; to: string }) {
  return { gte: new Date(`${query.from}T00:00:00+07:00`), lt: new Date(new Date(`${query.to}T00:00:00+07:00`).getTime() + 86400000) };
}
const availabilityWindow = (query: { from: string; to: string }) => ({ gte: dateOnly(query.from), lte: dateOnly(query.to) });
async function operation<T>(actorId: string, work: (tx: Prisma.TransactionClient) => Promise<T>, write = false) {
  adminId.parse(actorId);
  return prisma.$transaction(async tx => {
    if (gatewayMode()) assertDatabaseActor(actorId,"SUPERADMIN");
    await tx.$executeRaw`SET LOCAL statement_timeout = '3s'`;
    await tx.$queryRaw`SELECT id FROM public.users WHERE id=${actorId}::uuid FOR SHARE`;
    const actor = await tx.user.findFirst({ where: { id: actorId, role: "SUPERADMIN", isActive: true }, select: { id: true } });
    if (!actor) throw new AdminError("FORBIDDEN", "Akses administrator aktif diperlukan.", 403);
    return work(tx);
  }, { isolationLevel: write ? Prisma.TransactionIsolationLevel.ReadCommitted : Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 15000 });
}
async function ensurePeriod(tx: Prisma.TransactionClient, id?: string) {
  if (id && !await tx.academicPeriod.findUnique({ where: { id }, select: { id: true } })) throw new AdminError("PERIOD_NOT_FOUND", "Periode tidak ditemukan.", 404);
}
function counts<S extends string>(statuses: readonly S[], groups: { status: S; _count: { _all: number } }[]) {
  return statuses.map(status => ({ status, count: groups.find(row => row.status === status)?._count._all ?? 0 }));
}
const appointmentStatuses = ["CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW", "RESCHEDULED"] as const;
const consultationStatuses = ["SCHEDULED", "READY", "IN_PROGRESS", "PARTICIPANT_LATE", "PSYCHOLOGIST_LATE", "COMPLETED", "CLOSED", "NO_SHOW"] as const;
export async function adminOverview(actorId: string, input: OverviewQuery) {
  if (gatewayMode()) throw new AdminError("ADMIN_UNAVAILABLE", "Dashboard lengkap belum tersedia pada runtime terbatas; gunakan agregat operasional terbatas.",503);
  const query = overviewQuery.parse(input);
  return operation(actorId, async tx => {
    await ensurePeriod(tx, query.periodId);
    const dateRange = window(query);
    const appointmentWhere = { scheduledStartAt: dateRange, ...(query.periodId ? { assessmentSession: { academicPeriodId: query.periodId } } : {}) };
    const activeParticipants = await tx.user.count({ where: { role: "PARTICIPANT", isActive: true } });
    const activePsychologists = await tx.user.count({ where: { role: "PSYCHOLOGIST", isActive: true } });
    const assessmentsStarted = await tx.assessmentSession.count({ where: { academicPeriodId: query.periodId, startedAt: dateRange } });
    const assessmentsCompleted = await tx.assessmentSession.count({ where: { academicPeriodId: query.periodId, status: "COMPLETED", completedAt: dateRange } });
    const appointments = await tx.appointment.groupBy({ by: ["status"], where: appointmentWhere, _count: { _all: true } });
    const consultations = await tx.consultationSession.groupBy({ by: ["status"], where: { appointment: appointmentWhere }, _count: { _all: true } });
    const availability = await tx.psychologistAvailability.groupBy({ by: ["status"], where: { availabilityDate: availabilityWindow(query), psychologist: { role: "PSYCHOLOGIST", isActive: true } }, _count: { _all: true } });
    const active = await tx.academicPeriod.findMany({ where: { status: "ACTIVE" }, select: periodSelect, take: 2 });
    if (active.length > 1) throw new AdminError("PERIOD_CONFLICT", "Konfigurasi periode aktif perlu ditinjau.", 503);
    return { activeParticipants, activePsychologists, assessmentsStarted, assessmentsCompleted,
      appointments: counts(appointmentStatuses, appointments), consultations: counts(consultationStatuses, consultations),
      availability: counts(["AVAILABLE", "BOOKED", "UNAVAILABLE"] as const, availability), activePeriod: active[0] ? periodDTO(active[0]) : null,
      clinicalIndicatorsEnabled: false as const, scope: query };
  });
}
export async function adminPeriods(actorId: string, input: PeriodQuery) {
  const query = periodQuery.parse(input);
  return operation(actorId, async tx => {
    const rows = await tx.academicPeriod.findMany({ where: { status: query.status, ...(query.cursor ? { id: { gt: query.cursor } } : {}) }, orderBy: { id: "asc" }, take: query.limit + 1, select: periodSelect });
    const page = rows.slice(0, query.limit);
    const active = await tx.academicPeriod.findMany({ where: { status: "ACTIVE" }, take: 2, select: periodSelect });
    if (active.length > 1) throw new AdminError("PERIOD_CONFLICT", "Konfigurasi periode aktif perlu ditinjau.", 503);
    return { items: page.map(periodDTO), nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
      activePeriod: active[0] ? periodDTO(active[0]) : null, canCreate: periodCreationEnabled() };
  });
}
export async function adminPeriod(actorId: string, periodId: string) {
  adminId.parse(periodId);
  return operation(actorId, async tx => {
    const row = await tx.academicPeriod.findUnique({ where: { id: periodId }, select: periodSelect });
    if (!row) throw new AdminError("PERIOD_NOT_FOUND", "Periode tidak ditemukan.", 404);
    return periodDTO(row);
  });
}
export async function createInactivePeriod(actorId: string, input: PeriodCommand) {
  const command = periodCommand.parse(input);
  return operation(actorId, async tx => {
    if (!periodCreationEnabled()) throw new AdminError("PERIOD_POLICY_PENDING", "Pembuatan periode hanya tersedia untuk pengujian lokal. Aktivasi dan perubahan kuota menunggu kebijakan institusi.", 403);
    // Serialize every period writer, including direct SQL, without changing historical records.
    // This lock remains compatible with the assessment service's period FOR SHARE reads.
    await tx.$executeRaw`LOCK TABLE public.academic_periods IN SHARE ROW EXCLUSIVE MODE`;
    const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (command.startDate <= jakartaDate(now)) throw new AdminError("PERIOD_NOT_FUTURE", "Periode persiapan harus dimulai setelah hari ini (WIB).", 422);
    const startDate = dateOnly(command.startDate), endDate = dateOnly(command.endDate);
    if (await tx.academicPeriod.findFirst({ where: { status: "ACTIVE", startDate: { lte: endDate }, endDate: { gte: startDate } }, select: { id: true } })) {
      throw new AdminError("PERIOD_OVERLAP", "Rentang bertumpang tindih dengan periode aktif.");
    }
    if (await tx.academicPeriod.findFirst({ where: { name: command.name, startDate, endDate }, select: { id: true } })) throw new AdminError("PERIOD_DUPLICATE", "Periode persiapan yang sama sudah tercatat. Muat ulang daftar.");
    return periodDTO(await tx.academicPeriod.create({ data: { ...command, startDate, endDate, status: "INACTIVE" }, select: periodSelect }));
  }, true);
}
export async function adminPsychologists(actorId: string, input: PsychologistQuery) {
  if(gatewayMode())throw new AdminError("ADMIN_UNAVAILABLE","Proyeksi operasional ini belum tersedia pada runtime terbatas.",503);
  const query = psychologistQuery.parse(input);
  return operation(actorId, async tx => {
    const rows = await tx.user.findMany({ where: { role: "PSYCHOLOGIST", ...(query.active !== "all" ? { isActive: query.active === "true" } : {}), ...(query.cursor ? { id: { gt: query.cursor } } : {}) },
      orderBy: { id: "asc" }, take: query.limit + 1, select: { id: true, fullName: true, isActive: true,
        psychologistProfile: { select: { professionalTitle: true, qualification: true, areasOfFocus: true, languages: true, consultationMethod: true } } } });
    const page = rows.slice(0, query.limit);
    const slots = page.length ? await tx.psychologistAvailability.groupBy({ by: ["psychologistId", "status"], where: { psychologistId: { in: page.map(row => row.id) }, availabilityDate: availabilityWindow(query) }, _count: { _all: true } }) : [];
    return { items: page.map(row => ({ id: row.id, name: row.fullName, active: row.isActive, profile: row.psychologistProfile,
      availability: counts(["AVAILABLE", "BOOKED", "UNAVAILABLE"] as const, slots.filter(slot => slot.psychologistId === row.id)) })), nextCursor: rows.length > query.limit ? page.at(-1)!.id : null };
  });
}
export async function adminAppointments(actorId: string, input: AppointmentQuery) {
  if(gatewayMode())throw new AdminError("ADMIN_UNAVAILABLE","Proyeksi operasional ini belum tersedia pada runtime terbatas.",503);
  const query = appointmentQuery.parse(input);
  let cursor: { id: string; at: string } | undefined;
  if (query.cursor) {
    try { cursor = appointmentCursor.parse(JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"))); }
    catch { throw new AdminError("INVALID_CURSOR", "Cursor tidak valid.", 422); }
  }
  return operation(actorId, async tx => {
    await ensurePeriod(tx, query.periodId);
    const rows = await tx.appointment.findMany({ where: { scheduledStartAt: window(query), status: query.status,
      ...(query.periodId ? { assessmentSession: { academicPeriodId: query.periodId } } : {}),
      ...(cursor ? { OR: [{ scheduledStartAt: { gt: new Date(cursor.at) } }, { scheduledStartAt: new Date(cursor.at), id: { gt: cursor.id } }] } : {}) },
      orderBy: [{ scheduledStartAt: "asc" }, { id: "asc" }], take: query.limit + 1,
      select: { id: true, status: true, scheduledStartAt: true, scheduledEndAt: true, psychologist: { select: { fullName: true } }, consultationSession: { select: { status: true } } } });
    const page = rows.slice(0, query.limit), last = page.at(-1);
    // Internal appointment ID is used only for pagination, never included in row DTOs.
    return { items: page.map(row => ({ status: row.status, scheduledStartAt: row.scheduledStartAt.toISOString(), scheduledEndAt: row.scheduledEndAt.toISOString(), psychologistName: row.psychologist.fullName, consultationStatus: row.consultationSession?.status ?? null })),
      nextCursor: rows.length > query.limit && last ? Buffer.from(JSON.stringify({ id: last.id, at: last.scheduledStartAt.toISOString() })).toString("base64url") : null };
  });
}
export type Overview = Awaited<ReturnType<typeof adminOverview>>;
export type PeriodPage = Awaited<ReturnType<typeof adminPeriods>>;
export type PeriodDetail = Awaited<ReturnType<typeof adminPeriod>>;
export type PsychologistPage = Awaited<ReturnType<typeof adminPsychologists>>;
export type AppointmentPage = Awaited<ReturnType<typeof adminAppointments>>;

/** Isolated least-privilege integration; no production route calls this entrypoint. */
export async function adminRestrictedOverview(actorId: string, input: OverviewQuery) {
  const query = overviewQuery.parse(input);
  if (query.periodId) throw new AdminError("FILTER_NOT_SUPPORTED", "Agregat terbatas belum mendukung filter periode.", 422);
  return operation(actorId, async tx => {
    const [row] = await tx.$queryRaw<Array<{ counts: {
      activeParticipants: number; activePsychologists: number; assessmentsStarted: number;
      assessmentsCompleted: number; appointments: number; clinicalIndicatorsEnabled: false;
    } }>>`SELECT wb_guard.operational_counts(${query.from}::date, ${query.to}::date) AS counts`;
    return row.counts;
  });
}
