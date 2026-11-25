import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ active: false, getUser: vi.fn(), lookup: vi.fn(), verify: vi.fn() }));
vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), connection: async () => {} }));
vi.mock("@/lib/dal/context", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/dal/context")>();
  return { ...actual, gatewayMode: () => true, hasDatabaseRequest: () => state.active,
    withVerifiedDatabaseRequest: state.verify };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: state.getUser } }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: state.lookup } } }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => {
  if (error instanceof Error && error.message.startsWith("NEXT_")) throw error;
}, redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
import { DalError } from "@/lib/dal/context";
import { getCurrentProfile, requirePageRole, withApplicationDatabase } from "@/lib/auth/session";
import { loadAssessmentData } from "@/lib/assessment/page-data";
const profile = { id: "verified-participant", role: "PARTICIPANT", isActive: true };
beforeEach(() => {
  vi.resetAllMocks(); state.active = false;
  state.getUser.mockResolvedValue({ data: { user: { id: profile.id, email_confirmed_at: "2026-01-01" } }, error: null });
  state.verify.mockImplementation(async (auth, work) => {
    const { data, error } = await auth.getUser();
    if (error || !data.user?.email_confirmed_at) throw new DalError("AUTH_REQUIRED");
    state.active = true;
    try { return await work(); } finally { state.active = false; }
  });
  state.lookup.mockImplementation(async () => {
    expect(state.active).toBe(true);
    return profile;
  });
});
it("login/profile entrypoint supplies a verified boundary without depending on an API wrapper", async () => {
  expect(await getCurrentProfile()).toEqual(profile);
  expect(state.lookup).toHaveBeenCalledWith(expect.objectContaining({ where: { id: profile.id } }));
  expect(state.verify).toHaveBeenCalledOnce();
  expect(state.active).toBe(false);
});
it("profile inside an existing request reuses the boundary", async () => {
  expect(await withApplicationDatabase(getCurrentProfile)).toEqual(profile);
  expect(state.verify).toHaveBeenCalledOnce();
});
it("a separately evaluated page loader scopes all its database reads", async () => {
  await requirePageRole("PARTICIPANT");
  const loaded = await loadAssessmentData(async () => {
    expect(state.active).toBe(true);
    return { saved: 35, score: 42 };
  });
  expect(loaded).toEqual({ data: { saved: 35, score: 42 }, error: null });
  expect(state.verify).toHaveBeenCalledTimes(2);
});
it("expired identity stops the page loader before reading data", async () => {
  state.getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
  const read = vi.fn();
  expect((await loadAssessmentData(read)).data).toBeNull();
  expect(read).not.toHaveBeenCalled();
  expect(state.lookup).not.toHaveBeenCalled();
  await expect(requirePageRole("PARTICIPANT")).rejects.toThrow("NEXT_REDIRECT:/auth/login?reason=unauthenticated");
});
it("loader preserves redirects and does not turn them into data errors", async () => {
  await expect(loadAssessmentData(async () => { throw new Error("NEXT_REDIRECT:/results"); })).rejects.toThrow("NEXT_REDIRECT:/results");
  expect(state.active).toBe(false);
});
it("unavailable database fails closed with no raw error disclosure", async () => {
  state.verify.mockRejectedValue(new DalError("DATABASE_UNAVAILABLE"));
  const read = vi.fn();
  expect(await loadAssessmentData(read)).toMatchObject({ data: null, error: expect.any(String) });
  expect(read).not.toHaveBeenCalled();
  await expect(getCurrentProfile()).rejects.toThrow("DATABASE_UNAVAILABLE");
  expect(state.lookup).not.toHaveBeenCalled();
});
