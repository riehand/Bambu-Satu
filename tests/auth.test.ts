import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(),
  signOut: vi.fn(), verifyOtp: vi.fn(), resend: vi.fn(), findUnique: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: mocks }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {}, redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));

import { getCurrentProfile, requireApiRole, requirePageRole } from "@/lib/auth/session";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as resend } from "@/app/api/auth/resend/route";
import { GET as confirm } from "@/app/auth/confirm/route";

const origin = "http://localhost:3000";
const input = { fullName: "Test Person", userType: "STUDENT", institutionalId: "12345678", email: "Test@Example.com", phoneNumber: "08123456789", password: "a-secure-password", confirmPassword: "a-secure-password" };
const profile = { id: "verified-user-id", fullName: "Test Person", email: "test@example.com", role: "PARTICIPANT", isActive: true };
function request(path: string, body: unknown, requestOrigin = origin) {
  return new Request(`${origin}/api/auth/${path}`, { method: "POST", headers: { origin: requestOrigin, "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.SITE_URL = origin;
  mocks.getUser.mockResolvedValue({ data: { user: { id: profile.id, email_confirmed_at: "2026-10-23", user_metadata: { role: "SUPERADMIN" } } }, error: null });
  mocks.findUnique.mockResolvedValue(profile);
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.resend.mockResolvedValue({ error: null });
});

describe("verified identity and Prisma authorization", () => {
  it("scopes profile lookup to verified ID and never selects passwords", async () => {
    expect((await getCurrentProfile()).role).toBe("PARTICIPANT");
    const query = mocks.findUnique.mock.calls[0][0];
    expect(query.where).toEqual({ id: profile.id });
    expect(query.select.passwordHash).toBeUndefined();
  });
  it("rejects forged/expired identity before querying Prisma", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("Invalid token") });
    await expect(getCurrentProfile()).rejects.toThrow("unauthenticated");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("rejects an unconfirmed user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: profile.id } }, error: null });
    await expect(getCurrentProfile()).rejects.toThrow("unauthenticated");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it.each(["inactive", "profile"])("rejects %s accounts", async reason => {
    mocks.findUnique.mockResolvedValue(reason === "inactive" ? { ...profile, isActive: false } : null);
    await expect(getCurrentProfile()).rejects.toThrow(reason);
  });
  it("does not trust privileged metadata for backend authorization", async () => {
    await expect(requireApiRole("SUPERADMIN")).rejects.toThrow("forbidden");
  });
  it.each(["PARTICIPANT", "PSYCHOLOGIST", "SUPERADMIN"] as const)("allows only matching %s API role", async role => {
    mocks.findUnique.mockResolvedValue({ ...profile, role });
    expect((await requireApiRole(role)).role).toBe(role);
  });
  it("redirects cross-role pages to the trusted role's dashboard", async () => {
    await expect(requirePageRole("SUPERADMIN")).rejects.toThrow("REDIRECT:/participant/dashboard");
  });
  it("redirects inactive accounts to public login without a loop", async () => {
    mocks.findUnique.mockResolvedValue({ ...profile, isActive: false });
    await expect(requirePageRole("PARTICIPANT")).rejects.toThrow("REDIRECT:/auth/login?reason=inactive");
  });
});

describe("login/logout and origin checks", () => {
  it.each([
    ["PARTICIPANT", "/participant/dashboard"], ["PSYCHOLOGIST", "/psychologist/dashboard"], ["SUPERADMIN", "/admin/dashboard"],
  ])("routes %s from database role", async (role, destination) => {
    mocks.findUnique.mockResolvedValue({ ...profile, role });
    const response = await login(request("login", { ...input, role: "SUPERADMIN", id: "someone-else" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ redirectTo: destination });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "test@example.com", password: input.password });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects invalid login without exposing raw errors", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { status: 400, message: "private internal error" } });
    const response = await login(request("login", input));
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("private internal error");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("clears the new session when the profile is inactive", async () => {
    mocks.findUnique.mockResolvedValue({ ...profile, isActive: false });
    expect((await login(request("login", input))).status).toBe(403);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("fails closed when the database is down", async () => {
    mocks.findUnique.mockRejectedValue(new Error("DB secret"));
    const response = await login(request("login", input));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("DB secret");
    expect(mocks.signOut).toHaveBeenCalled();
  });
  it.each([login, register, logout, resend])("rejects cross-origin mutation", async handler => {
    expect((await handler(request("auth", input, "https://attacker.example"))).status).toBe(403);
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("signs out locally without revoking Nani sessions", async () => {
    expect((await logout(request("logout", {}))).status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("registration and confirmation", () => {
  it.each(["STUDENT", "LECTURER"])("submits %s with only permitted metadata", async userType => {
    mocks.findUnique.mockResolvedValue(null);
    const response = await register(request("register", { ...input, userType, role: "SUPERADMIN", id: "other-id", isActive: false }));
    expect(response.status).toBe(202);
    expect(mocks.signUp.mock.calls[0][0].options.data).toEqual({ full_name: input.fullName, user_type: userType, institutional_id: input.institutionalId, phone_number: input.phoneNumber });
    expect(await response.json()).toMatchObject({ success: true });
  });
  it("rejects password mismatch before any database operation", async () => {
    expect((await register(request("register", { ...input, confirmPassword: "wrong" }))).status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("rejects a duplicate institutional ID", async () => {
    expect((await register(request("register", input))).status).toBe(409);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });
  it("returns the same neutral result for obscured and explicit existing-email signup", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const pending = await (await register(request("register", input))).json();
    mocks.signUp.mockResolvedValue({ data: {}, error: { code: "user_already_exists" } });
    const existing = await (await register(request("register", input))).json();
    expect(existing).toEqual(pending);
  });
  it("does not claim success when profile creation fails", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.signUp.mockResolvedValue({ data: {}, error: { status: 500, message: "trigger failure" } });
    expect((await register(request("register", input))).status).toBe(503);
  });
  it("confirms signup and ignores attacker-supplied redirect", async () => {
    const response = await confirm(new NextRequest(`${origin}/auth/confirm?token_hash=example&type=email&next=https://attacker.example`));
    expect(response.headers.get("location")).toBe(`${origin}/auth/login?notice=confirmed`);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: "example", type: "email" });
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("reports expired confirmation links without leaking tokens", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { code: "otp_expired" } });
    const response = await confirm(new NextRequest(`${origin}/auth/confirm?token_hash=secret&type=email`));
    expect(response.headers.get("location")).toBe(`${origin}/auth/login?reason=confirmation`);
  });
  it("rejects unsupported token types", async () => {
    await confirm(new NextRequest(`${origin}/auth/confirm?token_hash=secret&type=recovery`));
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("resends confirmation with a fixed callback", async () => {
    expect((await resend(request("resend", { email: input.email }))).status).toBe(202);
    expect(mocks.resend).toHaveBeenCalledWith({ type: "signup", email: "test@example.com", options: { emailRedirectTo: `${origin}/auth/confirm` } });
  });
});
