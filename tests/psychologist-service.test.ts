import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  psychologistProfile: { findUnique: mocks.findUnique, upsert: mocks.upsert },
  user: { findMany: mocks.findMany, count: mocks.count, findFirst: mocks.findFirst },
} }));
import { getPsychologistById, getPsychologistProfile, listPsychologists, updatePsychologistProfile } from "@/lib/psychologist/service";

const actorId = "00000000-0000-4000-8000-000000000001";
const profile = { professionalTitle: "Psikolog", qualification: null, education: null, shortBio: null, areasOfFocus: ["Stres"], consultationMethod: null, consultationLocation: null, languages: ["Indonesia"] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue(profile);
  mocks.upsert.mockResolvedValue(profile);
  mocks.findMany.mockResolvedValue([{ id: actorId, fullName: "Nama Sintetis", email: "private@example.test", phoneNumber: "private", role: "PSYCHOLOGIST", psychologistProfile: profile }]);
  mocks.count.mockResolvedValue(1);
  mocks.findFirst.mockResolvedValue({ id: actorId, fullName: "Nama Sintetis", email: "private@example.test", psychologistProfile: profile });
});

it("loads and upserts only the session-owned psychologist profile", async () => {
  await getPsychologistProfile(actorId);
  expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: actorId }, select: expect.not.objectContaining({ userId: true }) }));
  await updatePsychologistProfile(actorId, { professionalTitle: "Psikolog" });
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: actorId }, create: { userId: actorId, professionalTitle: "Psikolog" }, update: { professionalTitle: "Psikolog" } }));
});

it("lists only active psychologist roles and returns no account identifiers", async () => {
  const result = await listPsychologists({ page: 1, limit: 20 });
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { role: "PSYCHOLOGIST", isActive: true, psychologistProfile: undefined },
    select: { id: true, fullName: true, psychologistProfile: expect.any(Object) },
    skip: 0,
    take: 20,
  }));
  expect(result.items).toEqual([{ id: actorId, fullName: "Nama Sintetis", ...profile }]);
  expect(JSON.stringify(result)).not.toContain("private@example.test");
  expect(JSON.stringify(result)).not.toContain("phoneNumber");
});

it("applies recipient-facing filters in the database and hides inactive/non-psychologist profiles", async () => {
  await listPsychologists({ page: 2, limit: 10, focus: "Stres", language: "Indonesia" });
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { role: "PSYCHOLOGIST", isActive: true, psychologistProfile: { is: { areasOfFocus: { has: "Stres" }, languages: { has: "Indonesia" } } } },
    skip: 10,
    take: 10,
  }));
  await getPsychologistById(actorId);
  expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: actorId, role: "PSYCHOLOGIST", isActive: true } }));
});
