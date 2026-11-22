import { z } from "zod";
export const consultationParams = z.object({
  appointmentId: z.string().uuid(),
  action: z.enum(["participant-check-in", "psychologist-check-in", "start", "end"]),
}).strict();
export const consultationCommand = z.object({}).strict();
