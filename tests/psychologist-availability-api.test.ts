import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiRole: vi.fn(),
  listPublicAvailability: vi.fn(),
  listOwnAvailability: vi.fn(),
  setDailyAvailability: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireApiRole: mocks.requireApiRole,
  AuthError: class AuthError extends Error { constructor(public reason: string) { super(reason); } },
}));
vi.mock("@/lib/psychologist/service", () => ({
  listPublicAvailability: mocks.listPublicAvailability,
  listOwnAvailability: mocks.listOwnAvailability,
  setDailyAvailability: mocks.setDailyAvailability,
}));

import { GET as publicGet } from "@/app/api/psychologists/[psychologistId]/availability/route";
import { GET as ownGet } from "@/app/api/psychologist/availability/route";
import { PUT as ownPut } from "@/app/api/psychologist/availability/[date]/route";
import { AuthError } from "@/lib/auth/session";

const origin = "http://localhost:3000";
const actorId = "00000000-0000-4000-8000-000000000001";
const psychologistId = "00000000-0000-4000-8000-000000000002";
const request = (url: string, method = "GET", body?: unknown, requestOrigin = origin) => new Request(`${origin}${url}`, {
  method,
  headers: { origin: requestOrigin, "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const day = { sessions: [
  { sessionType: "MORNING", available: true },
  { sessionType: "AFTERNOON", available: false },
  { sessionType: "EVENING", available: true },
] };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SITE_URL = origin;
  mocks.requireApiRole.mockResolvedValue({ id: actorId });
  mocks.listPublicAvailability.mockResolvedValue([]);
  mocks.listOwnAvailability.mockResolvedValue([]);
  mocks.setDailyAvailability.mockResolvedValue([]);
});

it("restricts availability reads to participants and psychologists, with private responses", async () => {
  const response = await publicGet(request(`/api/psychologists/${psychologistId}/availability?date=2026-11-01`), { params: Promise.resolve({ psychologistId }) });
  expect(response.status).toBe(200);
  expect(mocks.requireApiRole).toHaveBeenCalledWith("PARTICIPANT");
  expect(mocks.listPublicAvailability).toHaveBeenCalledWith(psychologistId, { date: "2026-11-01" });
  expect(response.headers.get("cache-control")).toContain("no-store");

  await ownGet(request("/api/psychologist/availability?date=2026-11-01"));
  expect(mocks.requireApiRole).toHaveBeenLastCalledWith("PSYCHOLOGIST");
  expect(mocks.listOwnAvailability).toHaveBeenCalledWith(actorId, { date: "2026-11-01" });
});

it("rejects malformed IDs, duplicate query parameters and inactive psychologists", async () => {
  const context = (id: string) => ({ params: Promise.resolve({ psychologistId: id }) });
  expect((await publicGet(request("/api/psychologists/bad/availability?date=2026-11-01"), context("bad"))).status).toBe(422);
  expect((await publicGet(request(`/api/psychologists/${psychologistId}/availability?date=2026-11-01&date=2026-11-02`), context(psychologistId))).status).toBe(422);
  mocks.listPublicAvailability.mockResolvedValue(null);
  expect((await publicGet(request(`/api/psychologists/${psychologistId}/availability?date=2026-11-01`), context(psychologistId))).status).toBe(404);
});

it("validates date ranges and rejects unsupported query keys", async () => {
  expect((await ownGet(request("/api/psychologist/availability?from=2026-11-01"))).status).toBe(422);
  expect((await ownGet(request("/api/psychologist/availability?date=2026-11-01&email=private%40example.test"))).status).toBe(422);
  expect((await ownGet(request("/api/psychologist/availability?from=2026-11-01&to=2026-12-20"))).status).toBe(422);
});

it("accepts only same-origin psychologist updates with exactly three distinct fixed sessions", async () => {
  const path = "/api/psychologist/availability/2026-11-01";
  expect((await ownPut(request(path, "PUT", day, "https://outside.test"), { params: Promise.resolve({ date: "2026-11-01" }) })).status).toBe(403);
  expect((await ownPut(request(path, "PUT", { sessions: day.sessions.slice(0, 2) }), { params: Promise.resolve({ date: "2026-11-01" }) })).status).toBe(422);
  const response = await ownPut(request(path, "PUT", day), { params: Promise.resolve({ date: "2026-11-01" }) });
  expect(response.status).toBe(200);
  expect(mocks.requireApiRole).toHaveBeenCalledWith("PSYCHOLOGIST");
  expect(mocks.setDailyAvailability).toHaveBeenCalledWith(actorId, "2026-11-01", day);
});

it("rejects a cross-profile role at the API boundary", async () => {
  mocks.requireApiRole.mockRejectedValue(new AuthError("forbidden"));
  expect((await ownGet(request("/api/psychologist/availability?date=2026-11-01"))).status).toBe(403);
  expect(mocks.listOwnAvailability).not.toHaveBeenCalled();
});
