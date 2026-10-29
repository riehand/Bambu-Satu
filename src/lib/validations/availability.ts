import { z } from "zod";
import { consultationSessions, type ConsultationSessionType } from "@/lib/psychologist/availability-config";

export const availabilityDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Tanggal tidak valid.");

const sessionTypeSchema = z.enum(consultationSessions.map(({ type }) => type) as [ConsultationSessionType, ...ConsultationSessionType[]]);

export const availabilityRangeSchema = z.object({
  date: availabilityDateSchema.optional(),
  from: availabilityDateSchema.optional(),
  to: availabilityDateSchema.optional(),
}).strict().superRefine((value, context) => {
  const hasRange = value.from !== undefined || value.to !== undefined;
  if ((value.date !== undefined && hasRange) || (value.date === undefined && !(value.from && value.to))) {
    context.addIssue({ code: "custom", message: "Tentukan satu tanggal atau rentang tanggal lengkap." });
    return;
  }
  if (value.from && value.to && (value.from > value.to || Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`) > 30 * 86400000)) {
    context.addIssue({ code: "custom", message: "Rentang tanggal maksimal 31 hari." });
  }
});

export const availabilityDaySchema = z.object({
  sessions: z.array(z.object({ sessionType: sessionTypeSchema, available: z.boolean() }).strict()).length(3),
}).strict().superRefine((value, context) => {
  if (new Set(value.sessions.map((session) => session.sessionType)).size !== consultationSessions.length) {
    context.addIssue({ code: "custom", message: "Setiap sesi harus dicantumkan satu kali." });
  }
});

export type AvailabilityRange = z.infer<typeof availabilityRangeSchema>;
export type AvailabilityDayInput = z.infer<typeof availabilityDaySchema>;
