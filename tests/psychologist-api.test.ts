import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiRole: vi.fn(),
  getPsychologistProfile: vi.fn(),
  updatePsychologistProfile: vi.fn(),
  listPsychologists: vi.fn(),
  getPsychologistById: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  requireApiRole: mocks.requireApiRole,
  AuthError: class AuthError extends Error { constructor(public reason: string) { super(reason); } },
}));
vi.mock("@/lib/psychologist/service", () => ({
  getPsychologistProfile: mocks.getPsychologistProfile,
  updatePsychologistProfile: mocks.updatePsychologistProfile,
  listPsychologists: mocks.listPsychologists,
  getPsychologistById: mocks.getPsychologistById,
}));

import { GET as profileGet, PATCH as profilePatch } from "@/app/api/psychologist/profile/route";
import { GET as directoryGet } from "@/app/api/psychologists/route";
import { GET as detailGet } from "@/app/api/psychologists/[psychologistId]/route";
import { AuthError } from "@/lib/auth/session";

const origin = "http://localhost:3000";
const actorId = "00000000-0000-4000-8000-000000000001";
const psychologistId = "00000000-0000-4000-8000-000000000002";
const request = (url: string, method = "GET", body?: unknown, requestOrigin = origin, contentType = "application/json") => new Request(`${origin}${url}`, {
  method,
  headers: { origin: requestOrigin, "content-type": contentType },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const json = (body: unknown) => new Request(`${origin}/api/psychologist/profile`, { method: "PATCH", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SITE_URL = origin;
  mocks.requireApiRole.mockResolvedValue({ id: actorId });
  mocks.getPsychologistProfile.mockResolvedValue(null);
  mocks.updatePsychologistProfile.mockImplementation(async (_id, value) => value);
  mocks.listPsychologists.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
  mocks.getPsychologistById.mockResolvedValue({ id: psychologistId, fullName: "Psikolog Sintetis" });
});

it("restricts profile and directory endpoints to their intended roles and derives the profile owner from the session", async () => {
  await profileGet();
  expect(mocks.requireApiRole).toHaveBeenNthCalledWith(1, "PSYCHOLOGIST");
  expect(mocks.getPsychologistProfile).toHaveBeenCalledWith(actorId);
  await directoryGet(request("/api/psychologists"));
  expect(mocks.requireApiRole).toHaveBeenNthCalledWith(2, "PARTICIPANT");
});

it("accepts only explicit professional profile fields and rejects forged ownership fields", async () => {
  const valid = { professionalTitle: "Psikolog", shortBio: "Mendampingi dengan empati.", areasOfFocus: ["Stres akademik"] };
  const response = await profilePatch(json(valid));
  expect(response.status).toBe(200);
  expect(mocks.updatePsychologistProfile).toHaveBeenCalledWith(actorId, valid);

  const forged = await profilePatch(json({ ...valid, userId: psychologistId, role: "SUPERADMIN" }));
  expect(forged.status).toBe(422);
  expect(mocks.updatePsychologistProfile).toHaveBeenCalledTimes(1);
  const empty = await profilePatch(json({}));
  expect(empty.status).toBe(422);
});

it("requires same-origin JSON on profile mutations and keeps responses private", async () => {
  expect((await profilePatch(request("/api/psychologist/profile", "PATCH", {}, "https://outside.test"))).status).toBe(403);
  expect((await profilePatch(request("/api/psychologist/profile", "PATCH", {}, origin, "text/plain"))).status).toBe(415);
  const response = await profileGet();
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("validates directory filters and returns pagination metadata", async () => {
  mocks.listPsychologists.mockResolvedValue({ items: [{ id: psychologistId, fullName: "Psikolog Sintetis" }], page: 2, limit: 10, total: 11 });
  const response = await directoryGet(request("/api/psychologists?page=2&limit=10&focus=stres&language=id"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true, meta: { page: 2, limit: 10, total: 11 } });
  expect(mocks.listPsychologists).toHaveBeenCalledWith({ page: 2, limit: 10, focus: "stres", language: "id" });
  expect((await directoryGet(request("/api/psychologists?page=0"))).status).toBe(422);
  expect((await directoryGet(request("/api/psychologists?page=2&page=3"))).status).toBe(422);
  expect((await directoryGet(request("/api/psychologists?email=private@example.test"))).status).toBe(422);
});

it("validates detail IDs, hides missing profiles and does not disclose backend errors", async () => {
  const context = (id: string) => ({ params: Promise.resolve({ psychologistId: id }) });
  expect((await detailGet(request("/api/psychologists/x"), context("not-a-uuid"))).status).toBe(422);
  mocks.getPsychologistById.mockResolvedValue(null);
  expect((await detailGet(request("/api/psychologists/x"), context(psychologistId))).status).toBe(404);
  mocks.getPsychologistById.mockRejectedValue(new Error("database password leaked"));
  const unavailable = await detailGet(request("/api/psychologists/x"), context(psychologistId));
  expect(unavailable.status).toBe(503);
  expect(await unavailable.text()).not.toContain("password");
});

it("maps unverified sessions to 401 and denies inactive or wrong-role sessions", async () => {
  mocks.requireApiRole.mockRejectedValueOnce(new AuthError("unauthenticated"));
  expect((await profileGet()).status).toBe(401);
  mocks.requireApiRole.mockRejectedValueOnce(new AuthError("forbidden"));
  expect((await directoryGet(request("/api/psychologists"))).status).toBe(403);
});
