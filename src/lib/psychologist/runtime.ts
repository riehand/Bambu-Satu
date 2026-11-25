import "server-only";
import { databaseTransaction } from "@/lib/dal/context";
import type { AvailabilityRangeInput, PsychologistDirectoryQuery } from "./service";
import { consultationSessions } from "./availability-config";

type PublicProfile = { id: string; fullName: string; professionalTitle: string | null; qualification: string | null; education: string | null; shortBio: string | null; areasOfFocus: string[]; consultationMethod: string | null; consultationLocation: string | null; languages: string[] };
export async function runtimeDirectory(query: PsychologistDirectoryQuery, target?: string) {
  return databaseTransaction(async tx => {
    const [row] = await tx.$queryRaw<Array<{ data: { items: PublicProfile[]; page: number; limit: number; total: number } }>>`
      SELECT wb_guard.psychologist_directory(${target ?? null}::uuid,${query.focus ?? null},${query.language ?? null},${query.page}::integer,${query.limit}::integer) AS data`;
    return row.data;
  });
}
export async function runtimePublicSlots(psychologistId: string, range: AvailabilityRangeInput) {
  return databaseTransaction(async tx => {
    const [row] = await tx.$queryRaw<Array<{ data: null | Array<{ id: string; date: string; sessionType: string; status: "AVAILABLE" }> }>>`
      SELECT wb_guard.public_slots(${psychologistId}::uuid,${range.date ?? range.from}::date,${range.date ?? range.to}::date) AS data`;
    return row.data?.map(slot => {
      const session = consultationSessions.find(item => item.type === slot.sessionType)!;
      return { availabilityId: slot.id, date: slot.date, sessionType: slot.sessionType, status: slot.status, startTime: session.startTime, endTime: session.endTime };
    }).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)) ?? null;
  });
}
