import { z } from "zod";

const id = z.string().uuid();

export const createAppointmentSchema = z.object({
  psychologistId: id,
  assessmentSessionId: id,
  reportId: id,
  availabilityId: id,
  reportConsent: z.boolean(),
  participantNote: z.string().max(500).optional(),
}).strict();

export const standaloneConsentSchema = z.object({
  assessmentSessionId: id,
  reportId: id,
  psychologistId: id,
  consent: z.boolean(),
}).strict();

export const affirmativeConsentSchema = z.object({ consent: z.boolean() }).strict();
export const appointmentIdSchema = id;
export const reportIdSchema = id;
export const consentIdSchema = id;

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type StandaloneConsentInput = z.infer<typeof standaloneConsentSchema>;
