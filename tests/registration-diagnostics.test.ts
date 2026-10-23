import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), createClient: vi.fn(), signUp: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { POST } from "@/app/api/auth/register/route";
import { getSiteUrl } from "@/lib/auth/http";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { logRegistrationFailure } from "@/lib/auth/registration-diagnostics";

const input = {
  fullName: "Test Participant", email: "test@example.test", institutionalId: "123456789",
  phoneNumber: "08123456789", userType: "STUDENT", password: "test-password-only", confirmPassword: "test-password-only",
};
function request(body: unknown = input, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
function diagnostic() {
  return vi.mocked(console.error).mock.calls.at(-1)?.[1];
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_TEST_ONLY");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.findUnique.mockResolvedValue(null);
  mocks.createClient.mockImplementation(async () => {
    getSupabaseConfig();
    return { auth: { signUp: mocks.signUp } };
  });
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("reproduces the reported 503 when SITE_URL is missing, before validation or Prisma", async () => {
  vi.stubEnv("SITE_URL", "");
  expect(() => getSiteUrl()).toThrow("SITE_URL is missing");
  const response = await POST(new Request("http://localhost:3000/api/auth/register", {
    method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: "{}",
  }));
  expect(response.status).toBe(503);
  expect((await response.json()).error.message).toBe("Layanan pendaftaran sedang tidak tersedia. Silakan coba lagi nanti.");
  expect(mocks.findUnique).not.toHaveBeenCalled();
  expect(mocks.createClient).not.toHaveBeenCalled();
  expect(diagnostic()).toMatchObject({ stage: "SITE_URL_RESOLUTION", errorName: "ConfigurationError", errorCode: "SITE_URL_MISSING", configurationPresent: { siteUrl: false }, prismaFailure: null });
});

it.each(["malformed-DO_NOT_LOG", "http://untrusted.example.test"])("diagnoses invalid SITE_URL without reflecting it %#", async value => {
  vi.stubEnv("SITE_URL", value);
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(diagnostic()).toMatchObject({ stage: "SITE_URL_RESOLUTION", errorCode: "SITE_URL_INVALID" });
  expect(JSON.stringify(vi.mocked(console.error).mock.calls).includes(value)).toBe(false);
  expect(mocks.findUnique).not.toHaveBeenCalled();
});

it.each([
  ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL_MISSING"],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_KEY_MISSING"],
])("diagnoses missing %s", async (key, code) => {
  vi.stubEnv(key, "");
  expect((await POST(request())).status).toBe(503);
  expect(diagnostic()).toMatchObject({ stage: "SUPABASE_CLIENT_INITIALIZATION", errorCode: code });
  expect(mocks.signUp).not.toHaveBeenCalled();
});

it("identifies client initialization failure", async () => {
  mocks.createClient.mockRejectedValue(new TypeError("private URL and key"));
  expect((await POST(request())).status).toBe(503);
  expect(diagnostic()).toMatchObject({ stage: "SUPABASE_CLIENT_INITIALIZATION", errorName: "TypeError" });
  expect(mocks.signUp).not.toHaveBeenCalled();
});

it("diagnoses the verified runtime credential failure safely", async () => {
  mocks.findUnique.mockRejectedValue(Object.assign(new Error("password authentication failed; DO_NOT_LOG_CONNECTION_STRING"), { name: "PrismaClientInitializationError" }));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(diagnostic()).toMatchObject({ stage: "PRISMA_PREFLIGHT", prismaFailure: "initialization", prismaReason: "DATABASE_AUTHENTICATION_REJECTED" });
  expect((await response.text()).includes("DO_NOT_LOG")).toBe(false);
  expect(JSON.stringify(vi.mocked(console.error).mock.calls).includes("DO_NOT_LOG")).toBe(false);
  expect(mocks.signUp).not.toHaveBeenCalled();
});

it.each(["P2021", "P2022"])("diagnoses Prisma schema mismatch %s", async code => {
  mocks.findUnique.mockRejectedValue(Object.assign(new Error("missing table/column"), { name: "PrismaClientKnownRequestError", code }));
  expect((await POST(request())).status).toBe(503);
  expect(diagnostic()).toMatchObject({ stage: "PRISMA_PREFLIGHT", errorCode: code, prismaFailure: "query", prismaReason: "DATABASE_SCHEMA_MISMATCH" });
});

it("diagnoses Prisma client validation errors", async () => {
  mocks.findUnique.mockRejectedValue(Object.assign(new Error("outdated client"), { name: "PrismaClientValidationError" }));
  expect((await POST(request())).status).toBe(503);
  expect(diagnostic()).toMatchObject({ stage: "PRISMA_PREFLIGHT", errorName: "PrismaClientValidationError" });
});

it.each([
  ["weak_password", 422, 400], ["email_address_invalid", 400, 400],
  ["over_email_send_rate_limit", 429, 429], ["unexpected_failure", 500, 503],
])("maps Supabase %s safely", async (code, status, expected) => {
  mocks.signUp.mockResolvedValue({ data: {}, error: { name: "AuthApiError", code, status, message: "private details" } });
  const response = await POST(request());
  expect(response.status).toBe(expected);
  expect(diagnostic()).toMatchObject({ stage: "SUPABASE_SIGNUP", errorCode: code, status });
  expect((await response.text()).includes("private details")).toBe(false);
});

it("diagnoses thrown network failures during signup", async () => {
  mocks.signUp.mockRejectedValue(Object.assign(new Error("private endpoint"), { code: "ECONNRESET" }));
  expect((await POST(request())).status).toBe(503);
  expect(diagnostic()).toMatchObject({ stage: "SUPABASE_SIGNUP", errorCode: "ECONNRESET" });
});

it.each(["STUDENT", "LECTURER"])("reaches Supabase signup for %s after configuration is corrected", async userType => {
  expect((await POST(request({ ...input, userType, role: "SUPERADMIN" }))).status).toBe(202);
  expect(mocks.signUp.mock.calls[0][0]).toMatchObject({ options: {
    emailRedirectTo: "http://localhost:3000/auth/confirm",
    data: { full_name: input.fullName, institutional_id: input.institutionalId, phone_number: input.phoneNumber, user_type: userType },
  } });
  expect(mocks.signUp.mock.calls[0][0].options.data.role).toBeUndefined();
  expect(console.error).not.toHaveBeenCalled();
});

it.each([
  { phoneNumber: "invalid" }, { institutionalId: "bad!" }, { userType: "SUPERADMIN" },
  { password: "short", confirmPassword: "short" }, { confirmPassword: "different" },
])("rejects invalid fields before dependencies %#", async invalid => {
  expect((await POST(request({ ...input, ...invalid }))).status).toBe(400);
  expect(mocks.findUnique).not.toHaveBeenCalled();
  expect(mocks.signUp).not.toHaveBeenCalled();
});

it("keeps institutional-ID conflicts separate from dependency failures", async () => {
  mocks.findUnique.mockResolvedValue({ id: "existing-id" });
  expect((await POST(request())).status).toBe(409);
  expect(mocks.signUp).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
});

it("does not return success for an unexpected response shape", async () => {
  mocks.signUp.mockResolvedValue({ data: null, error: null });
  expect((await POST(request())).status).toBe(500);
  expect(diagnostic()).toMatchObject({ stage: "RESPONSE_GENERATION" });
});

it("logs only allowlisted fields even when error names and codes contain secrets", () => {
  const secret = "DO_NOT_LOG_PASSWORD_TOKEN_EMAIL_PHONE";
  vi.stubEnv("DATABASE_URL", secret);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", secret);
  logRegistrationFailure("SUPABASE_SIGNUP", { name: secret, code: secret, status: secret, message: secret, stack: secret, cause: { token: secret }, body: secret });
  expect(diagnostic()).toMatchObject({ errorName: "UnknownError", errorCode: "UNKNOWN", configurationPresent: { databaseUrl: true, supabasePublishableKey: true } });
  expect(JSON.stringify(vi.mocked(console.error).mock.calls).includes(secret)).toBe(false);
});
