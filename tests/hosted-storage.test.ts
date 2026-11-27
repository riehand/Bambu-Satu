import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { hostedStorageClient, storageWorkerToken } from "@/lib/reports/hosted-storage";
import { downloadReportObject } from "@/lib/reports/storage";

const ref = "abcdefghijklmnopqrst";
const sub = "00000000-0000-4000-8000-000000000001";
const epoch = 1800000000;
// Synthetic unsigned fixture: no token is sent to Supabase. Provider signature
// verification is intentionally not represented as covered by these unit tests.
function token(patch: Record<string, unknown> = {}) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "ES256" })}.${encode({ sub, role: "wb_report_storage", iss: `https://${ref}.supabase.co/auth/v1`, aud: "authenticated", iat: epoch, exp: epoch + 300, ...patch })}.synthetic`;
}
const config = () => ({ WELLBEING_RUNTIME: "hosted", WELLBEING_HOSTED_PROJECT_REF: ref,
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, WELLBEING_STORAGE_WORKER_SUB: sub,
  WELLBEING_STORAGE_WORKER_JWT: token() });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch * 1000); mocks.createClient.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("accepts only short-lived project-bound worker claims as configuration", () => {
  expect(storageWorkerToken(config())).toBe(token());
});
it.each([
  { role: "service_role" }, { iss: "https://other.supabase.co/auth/v1" },
  { sub: "00000000-0000-4000-8000-000000000002" }, { exp: epoch },
  { exp: epoch + 3601 }, { iat: epoch + 1 }, { nbf: epoch + 60 }, { aud: "other" },
])("rejects incorrect/expired identity %j without constructing a client", patch => {
  expect(() => storageWorkerToken({ ...config(), WELLBEING_STORAGE_WORKER_JWT: token(patch) })).toThrow("SCOPED_STORAGE_TOKEN_REQUIRED");
  expect(mocks.createClient).not.toHaveBeenCalled();
});
it("rejects elevated secrets even when a scoped token is supplied", () => {
  expect(() => storageWorkerToken({ ...config(), SUPABASE_SECRET_KEY: "synthetic" })).toThrow("SCOPED_STORAGE_TOKEN_REQUIRED");
});
it("passes scoped bearer through accessToken and checks expiry again per request", async () => {
  for (const [key, value] of Object.entries(config())) vi.stubEnv(key, value);
  for (const key of ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET"]) vi.stubEnv(key, "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_synthetic");
  hostedStorageClient();
  const [url, key, options] = mocks.createClient.mock.calls[0];
  expect(url).toBe(`https://${ref}.supabase.co`);
  expect(key).toBe("sb_publishable_synthetic");
  await expect(options.accessToken()).resolves.toBe(token());
  vi.setSystemTime((epoch + 301) * 1000);
  await expect(options.accessToken()).rejects.toThrow("SCOPED_STORAGE_TOKEN_REQUIRED");
});
it("does not fall back to service-role when hosted token is absent", async () => {
  for (const [key, value] of Object.entries(config())) vi.stubEnv(key, value);
  vi.stubEnv("WELLBEING_STORAGE_WORKER_JWT", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic");
  await expect(downloadReportObject(sub)).rejects.toMatchObject({ kind: "unavailable" });
  expect(mocks.createClient).not.toHaveBeenCalled();
});
it("rejects remote legacy secret access even when runtime mode is missing", async () => {
  vi.stubEnv("WELLBEING_RUNTIME", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${ref}.supabase.co`);
  vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic");
  await expect(downloadReportObject(sub)).rejects.toMatchObject({ kind: "unavailable" });
  expect(mocks.createClient).not.toHaveBeenCalled();
});
