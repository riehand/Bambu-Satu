import { consistentLifecycle, type Lifecycle } from "./policy";
import { isolatedConsultationPolicy } from "./local-policy";

export const CHAT_BODY_LIMIT = 2000;
export const CHAT_PAGE_SIZE = 30;
export const CHAT_POLL_MS = 5000;
export function chatDevelopmentEnabled() { return isolatedConsultationPolicy(); }
// Deny post-session reading until the institution approves a read/retention policy.
export function chatOpen(row: Lifecycle, now: Date) {
  return consistentLifecycle(row) && row.status === "IN_PROGRESS" && row.consultationSession?.status === "IN_PROGRESS"
    && row.consultationSession.endedAt === null && now >= row.scheduledStartAt && now < row.scheduledEndAt;
}
