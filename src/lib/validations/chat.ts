import { z } from "zod";
import { CHAT_BODY_LIMIT, CHAT_PAGE_SIZE } from "@/lib/consultations/chat-policy";
export const chatCommand = z.object({
  clientMessageId: z.string().uuid(),
  body: z.string().max(CHAT_BODY_LIMIT).trim().min(1).refine(value => !value.includes("\0")),
}).strict();
export const chatQuery = z.object({
  before: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/).optional(),
  after: z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(CHAT_PAGE_SIZE),
}).strict().refine(value => !(value.before && value.after));
export const chatCursor = z.object({ appointmentId: z.string().uuid(), id: z.string().uuid(), at: z.string().datetime({ precision: 3 }) }).strict();
export type ChatCommand = z.infer<typeof chatCommand>;
export type ChatQuery = z.infer<typeof chatQuery>;
