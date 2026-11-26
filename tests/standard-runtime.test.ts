import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }) }));
vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), connection: async () => {} }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {}, redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
import { getCurrentProfile, requireApiRole, requirePageRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { gatewayMode } from "@/lib/dal/context";
import { loadAssessmentData } from "@/lib/assessment/page-data";

const profile = { id: "verified-id", fullName: "Synthetic", email: "synthetic@example.test", phoneNumber: null, institutionalId: "synthetic", userType: "STUDENT", role: "PARTICIPANT", isActive: true };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("WELLBEING_LOCAL_RUNTIME_FILE", undefined);
  vi.stubEnv("DATABASE_URL", "postgresql://postgres:synthetic@owner.example.invalid/postgres");
  mocks.getUser.mockResolvedValue({ data: { user: { id: profile.id, email_confirmed_at: "2026-01-01", user_metadata: { role: "SUPERADMIN" } } }, error: null });
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  mocks.maybeSingle.mockResolvedValue({ data: profile, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it("standard development uses the verified user's session RLS profile, without installing the local signer", async () => {
  expect(await getCurrentProfile()).toEqual(profile);
  expect(gatewayMode()).toBe(false);
  expect(mocks.from).toHaveBeenCalledWith("users");
  expect(mocks.eq).toHaveBeenCalledWith("id", profile.id);
  expect(mocks.select).toHaveBeenCalledWith("id,fullName:full_name,email,phoneNumber:phone_number,institutionalId:institutional_id,userType:user_type,role,isActive:is_active");
});
it("rejects unauthenticated identity before looking up a profile", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(getCurrentProfile()).rejects.toThrow("unauthenticated");
  expect(mocks.from).not.toHaveBeenCalled();
});
it.each(["missing", "inactive", "different-owner", "invalid-role", "rls-error"])("fails closed for %s with no Prisma fallback", async situation => {
  mocks.maybeSingle.mockResolvedValue({ data: situation === "missing" ? null : { ...profile,
    ...(situation === "inactive" ? { isActive: false } : {}),
    ...(situation === "different-owner" ? { id: "other" } : {}),
    ...(situation === "invalid-role" ? { role: "OWNER" } : {}) }, error: situation === "rls-error" ? { message: "private detail" } : null });
  await expect(getCurrentProfile()).rejects.toThrow();
  expect(gatewayMode()).toBe(false);
});
it.each(["PARTICIPANT", "PSYCHOLOGIST", "SUPERADMIN"] as const)("shares role authorization for %s", async role => {
  mocks.maybeSingle.mockResolvedValue({ data: { ...profile, role }, error: null });
  expect((await requireApiRole(role)).role).toBe(role);
  expect((await requirePageRole(role)).role).toBe(role);
});
it("does not trust metadata role or permit cross-role navigation", async () => {
  await expect(requireApiRole("SUPERADMIN")).rejects.toThrow("forbidden");
  await expect(requirePageRole("PSYCHOLOGIST")).rejects.toThrow("REDIRECT:/participant/dashboard");
});
it("blocks the actual application Prisma proxy before using configured owner credentials", () => {
  expect(() => prisma.user.count()).toThrow("RESTRICTED_RUNTIME_REQUIRED");
  expect(() => prisma.$queryRaw`SELECT 1`).toThrow("RESTRICTED_RUNTIME_REQUIRED");
  expect(() => prisma.$transaction(async () => undefined)).toThrow("RESTRICTED_RUNTIME_REQUIRED");
});
it("assessment loader reports missing runtime honestly instead of reading from another database", async () => {
  expect(await loadAssessmentData(() => prisma.assessmentSession.findMany())).toEqual({ data: null, error: "Layanan asesmen belum dikonfigurasi untuk lingkungan ini. Hubungi pengelola." });
});
