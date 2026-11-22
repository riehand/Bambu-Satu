import { z } from "zod";
const day = 86400000;
export const adminDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Tanggal tidak valid.");
const dates = { from: adminDate, to: adminDate };
const boundedRange = (value: { from: string; to: string }) => {
  const days = (Date.parse(value.to) - Date.parse(value.from)) / day;
  return days >= 0 && days < 93;
};
const paging = { limit: z.coerce.number().int().min(1).max(50).default(10), cursor: z.string().uuid().optional() };
export const overviewQuery = z.object({ ...dates, periodId: z.string().uuid().optional() }).strict().refine(boundedRange, "Rentang maksimal 93 hari.");
export const psychologistQuery = z.object({ ...dates, ...paging, active: z.enum(["all", "true", "false"]).default("all") }).strict().refine(boundedRange, "Rentang maksimal 93 hari.");
export const periodQuery = z.object({ ...paging, status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).strict();
export const appointmentQuery = z.object({ ...dates, limit: paging.limit,
  cursor: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/).optional(),
  periodId: z.string().uuid().optional(), status: z.enum(["CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW", "RESCHEDULED"]).optional(),
}).strict().refine(boundedRange, "Rentang maksimal 93 hari.");
export const periodCommand = z.object({ name: z.string().trim().min(1).max(120), startDate: adminDate, endDate: adminDate,
  assessmentLimit: z.number().int().min(0).max(2147483647),
}).strict().refine(value => value.startDate <= value.endDate, "Tanggal akhir mendahului tanggal mulai.");
export const adminId = z.string().uuid();
export const appointmentCursor = z.object({ id: adminId, at: z.string().datetime({ precision: 3 }) }).strict();
export type OverviewQuery = z.infer<typeof overviewQuery>;
export type PsychologistQuery = z.infer<typeof psychologistQuery>;
export type PeriodQuery = z.infer<typeof periodQuery>;
export type AppointmentQuery = z.infer<typeof appointmentQuery>;
export type PeriodCommand = z.infer<typeof periodCommand>;
