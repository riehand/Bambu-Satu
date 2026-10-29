import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma, type PsychologistAvailabilityStatus } from "@prisma/client";
import type { psychologistProfilePatchSchema } from "@/lib/validations/psychologist";
import type { AvailabilityDayInput, AvailabilityRange } from "@/lib/validations/availability";
import type { z } from "zod";
import { consultationSessions, dateOnly, jakartaDate, sessionStartsAt } from "./availability-config";
import { PsychologistError } from "./http";

const profileFields = {
  professionalTitle: true,
  qualification: true,
  education: true,
  shortBio: true,
  areasOfFocus: true,
  consultationMethod: true,
  consultationLocation: true,
  languages: true,
} as const;

export type PsychologistProfileInput = z.infer<typeof psychologistProfilePatchSchema>;
export type PsychologistDirectoryQuery = { page: number; limit: number; focus?: string; language?: string };
export type AvailabilityRangeInput = AvailabilityRange;

function dateFilter(range: AvailabilityRangeInput) {
  if (range.date) return dateOnly(range.date);
  return { gte: dateOnly(range.from!), lte: dateOnly(range.to!) };
}

function toAvailabilityItem(slot: {
  id: string;
  availabilityDate: Date;
  sessionType: string;
  status: PsychologistAvailabilityStatus;
}) {
  const session = consultationSessions.find(({ type }) => type === slot.sessionType)!;
  return {
    availabilityId: slot.id,
    date: slot.availabilityDate.toISOString().slice(0, 10),
    sessionType: slot.sessionType,
    startTime: session.startTime,
    endTime: session.endTime,
    status: slot.status,
  };
}

function sortAvailability<T extends { date: string; sessionType: string }>(slots: T[]) {
  const order = new Map<string, number>(consultationSessions.map(({ type }, index) => [type, index]));
  return slots.sort((left, right) => left.date.localeCompare(right.date) || (order.get(left.sessionType) ?? 0) - (order.get(right.sessionType) ?? 0));
}

export async function listPublicAvailability(psychologistId: string, range: AvailabilityRangeInput, now = new Date()) {
  const psychologist = await prisma.user.findFirst({
    where: { id: psychologistId, role: "PSYCHOLOGIST", isActive: true },
    select: { id: true },
  });
  if (!psychologist) return null;
  const slots = await prisma.psychologistAvailability.findMany({
    where: { psychologistId, availabilityDate: dateFilter(range), status: "AVAILABLE" },
    select: { id: true, availabilityDate: true, sessionType: true, status: true },
  });
  return sortAvailability(slots
    .filter((slot) => sessionStartsAt(slot.availabilityDate.toISOString().slice(0, 10), slot.sessionType) > now)
    .map(toAvailabilityItem));
}

export async function listOwnAvailability(psychologistId: string, range: AvailabilityRangeInput) {
  const slots = await prisma.psychologistAvailability.findMany({
    where: { psychologistId, availabilityDate: dateFilter(range) },
    select: { id: true, availabilityDate: true, sessionType: true, status: true },
  });
  return sortAvailability(slots.map(toAvailabilityItem));
}

export async function setDailyAvailability(
  psychologistId: string,
  date: string,
  input: AvailabilityDayInput,
  now = new Date(),
) {
  const today = jakartaDate(now);
  if (date < today) throw new PsychologistError("INVALID_AVAILABILITY_DATE", "Tanggal ketersediaan tidak boleh di masa lalu.", 422);
  if (input.sessions.some(({ sessionType, available }) => available && sessionStartsAt(date, sessionType) <= now)) {
    throw new PsychologistError("SLOT_START_PASSED", "Sesi yang sudah dimulai tidak dapat dibuka.", 409);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<{ id: string; session_type: string; status: string }[]>`
        SELECT id, session_type, status
        FROM public.psychologist_availability
        WHERE psychologist_id = ${psychologistId}::uuid AND availability_date = ${date}::date
        FOR UPDATE
      `;
      for (const session of input.sessions) {
        const current = existing.find((slot) => slot.session_type === session.sessionType);
        const status = session.available ? "AVAILABLE" : "UNAVAILABLE";
        if (current) {
          if (current.status === "BOOKED") {
            if (session.available) throw new PsychologistError("AVAILABILITY_ALREADY_BOOKED", "Sesi yang sudah dipesan tidak dapat dibuka kembali.", 409);
            continue;
          }
          await tx.psychologistAvailability.update({ where: { id: current.id }, data: { status } });
        } else {
          await tx.psychologistAvailability.create({
            data: { psychologistId, availabilityDate: dateOnly(date), sessionType: session.sessionType, status },
          });
        }
      }
    });
  } catch (error) {
    if (error instanceof PsychologistError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PsychologistError("AVAILABILITY_CONFLICT", "Ketersediaan baru saja berubah. Muat ulang lalu coba lagi.", 409);
    }
    throw error;
  }

  return listOwnAvailability(psychologistId, { date });
}

export async function getPsychologistProfile(userId: string) {
  return prisma.psychologistProfile.findUnique({ where: { userId }, select: profileFields });
}

export async function updatePsychologistProfile(userId: string, input: PsychologistProfileInput) {
  return prisma.psychologistProfile.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
    select: profileFields,
  });
}

export async function listPsychologists(query: PsychologistDirectoryQuery) {
  const profileFilter = query.focus || query.language
    ? { is: {
        ...(query.focus ? { areasOfFocus: { has: query.focus } } : {}),
        ...(query.language ? { languages: { has: query.language } } : {}),
      } }
    : undefined;
  const where = { role: "PSYCHOLOGIST" as const, isActive: true, psychologistProfile: profileFilter };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, fullName: true, psychologistProfile: { select: profileFields } },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);
  return {
    items: users.map(({ id, fullName, psychologistProfile }) => ({
      id,
      fullName,
      ...(psychologistProfile ?? { professionalTitle: null, qualification: null, education: null, shortBio: null, areasOfFocus: [], consultationMethod: null, consultationLocation: null, languages: [] }),
    })),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function getPsychologistById(id: string) {
  return prisma.user.findFirst({
    where: { id, role: "PSYCHOLOGIST", isActive: true },
    select: { id: true, fullName: true, psychologistProfile: { select: profileFields } },
  }).then((user) => user && ({
    id: user.id,
    fullName: user.fullName,
    ...(user.psychologistProfile ?? { professionalTitle: null, qualification: null, education: null, shortBio: null, areasOfFocus: [], consultationMethod: null, consultationLocation: null, languages: [] }),
  }));
}
