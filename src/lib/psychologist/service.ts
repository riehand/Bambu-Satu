import "server-only";
import { prisma } from "@/lib/prisma";
import type { psychologistProfilePatchSchema } from "@/lib/validations/psychologist";
import type { z } from "zod";

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
