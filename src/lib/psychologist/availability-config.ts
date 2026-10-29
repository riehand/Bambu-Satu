export const consultationSessions = [
  { type: "MORNING", startTime: "09:00", endTime: "11:00" },
  { type: "AFTERNOON", startTime: "13:00", endTime: "15:00" },
  { type: "EVENING", startTime: "16:00", endTime: "18:00" },
] as const;

export type ConsultationSessionType = (typeof consultationSessions)[number]["type"];

export function consultationSession(type: ConsultationSessionType) {
  return consultationSessions.find((session) => session.type === type)!;
}

export function jakartaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (part: string) => parts.find((entry) => entry.type === part)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function dateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function sessionStartsAt(date: string, type: ConsultationSessionType) {
  // Asia/Jakarta is UTC+07:00; fixed sessions are anchored to this business zone.
  return new Date(`${date}T${consultationSession(type).startTime}:00+07:00`);
}
