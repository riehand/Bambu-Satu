import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).transform((value) => value || null).nullable().optional();
const tagList = z.array(z.string().trim().min(1).max(50)).max(20).transform((values) => [...new Set(values)]).optional();

export const psychologistProfilePatchSchema = z.object({
  professionalTitle: nullableText(120),
  qualification: nullableText(160),
  education: nullableText(800),
  shortBio: nullableText(800),
  areasOfFocus: tagList,
  consultationMethod: nullableText(120),
  consultationLocation: nullableText(180),
  languages: tagList,
}).strict().refine((value) => Object.keys(value).length > 0);

const pageValue = z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).optional();
const limitValue = z.string().regex(/^[1-9]\d{0,2}$/).transform(Number).optional();

export const psychologistDirectoryQuerySchema = z.object({
  page: pageValue,
  limit: limitValue,
  focus: z.string().trim().min(1).max(50).optional(),
  language: z.string().trim().min(1).max(50).optional(),
}).strict().transform((query) => ({
  page: query.page ?? 1,
  limit: Math.min(query.limit ?? 20, 50),
  focus: query.focus,
  language: query.language,
}));

export const psychologistIdSchema = z.string().uuid();
