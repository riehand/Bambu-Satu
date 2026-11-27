import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), signInWithPassword: vi.fn(), close: vi.fn(), assertHealthy: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: mocks }) }));
vi.mock("@/lib/reports/worker-session-store", () => ({ openWorkerSessionStore: async () => ({ storage: {}, close: mocks.close, assertHealthy: mocks.assertHealthy }) }));
import { openWorkerAuthSession } from "@/lib/reports/worker-auth-session";
const epoch = 1800000000;
const ref = "abcdefghijklmnopqrst";
const sub = "00000000-0000-4000-8000-000000000001";
function session(seconds = 900) {
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return { expires_at: epoch + seconds, access_token: `${encode({ alg: "ES256" })}.${encode({ sub, role: "wb_report_storage", iss: `https://${ref}.supabase.co/auth/v1`, aud: "authenticated", iat: epoch, exp: epoch + seconds })}.synthetic` };
}
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(epoch * 1000);
  for (const [key, value] of Object.entries({ WELLBEING_RUNTIME: "hosted", WELLBEING_HOSTED_PROJECT_REF: ref, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic", WELLBEING_STORAGE_WORKER_SUB: sub })) vi.stubEnv(key, value);
  for (const key of ["WELLBEING_STORAGE_WORKER_JWT", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET", "WELLBEING_WORKER_SESSION_BOOTSTRAP"]) vi.stubEnv(key, "");
  mocks.getSession.mockResolvedValue({ data: { session: session() }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it("refreshes near expiry once for concurrent requests and stops on close", async () => {
  const worker = await openWorkerAuthSession();
  mocks.getSession.mockResolvedValue({ data: { session: session(60) }, error: null });
  mocks.refreshSession.mockResolvedValue({ data: { session: session() }, error: null });
  await Promise.all([worker.accessToken(), worker.accessToken(), worker.accessToken()]);
  expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
  await worker.close();
  await expect(worker.accessToken()).rejects.toThrow("WORKER_SESSION_UNAVAILABLE");
  expect(vi.getTimerCount()).toBe(0);
});
it("fails closed on refresh failure without password fallback", async () => {
  const worker = await openWorkerAuthSession();
  mocks.getSession.mockResolvedValue({ data: { session: session(60) }, error: null });
  mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error("synthetic") });
  await expect(worker.accessToken()).rejects.toThrow("WORKER_SESSION_UNAVAILABLE");
  expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  await worker.close();
});
it("consumes explicit bootstrap once and rejects failed persistence", async () => {
  vi.stubEnv("WELLBEING_WORKER_SESSION_BOOTSTRAP", "1");
  vi.stubEnv("WELLBEING_WORKER_BOOTSTRAP_EMAIL", "machine@example.invalid");
  vi.stubEnv("WELLBEING_WORKER_BOOTSTRAP_PASSWORD", "synthetic");
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.signInWithPassword.mockResolvedValue({ data: { session: session() }, error: null });
  const worker = await openWorkerAuthSession();
  expect(process.env.WELLBEING_WORKER_BOOTSTRAP_PASSWORD).toBeUndefined();
  await expect(worker.accessToken()).rejects.toThrow();
  expect(mocks.signInWithPassword).toHaveBeenCalledTimes(1);
  mocks.assertHealthy.mockImplementation(() => { throw new Error("store failed"); });
  await expect(worker.accessToken()).rejects.toThrow("WORKER_SESSION_UNAVAILABLE");
  await worker.close();
});
