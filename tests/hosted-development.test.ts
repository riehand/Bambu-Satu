import { afterEach, expect, it, vi } from "vitest";
import { developmentPolicyEnabled } from "@/lib/consultations/policy";
import { chatDevelopmentEnabled } from "@/lib/consultations/chat-policy";
import { stagingProject } from "@/lib/dal/staging-config";
afterEach(() => vi.unstubAllEnvs());
it.each(["hosted", "staging"])("does not enable institutional features on %s even in a dev build", mode => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("WELLBEING_RUNTIME", mode);
  vi.stubEnv("WELLBEING_LOCAL_RUNTIME_FILE", "cannot-override-hosted");
  expect(developmentPolicyEnabled()).toBe(false); expect(chatDevelopmentEnabled()).toBe(false);
});
it("ordinary npm dev does not imply institutional approval", () => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("WELLBEING_RUNTIME", undefined);
  vi.stubEnv("WELLBEING_LOCAL_RUNTIME_FILE", undefined);
  expect(developmentPolicyEnabled()).toBe(false); expect(chatDevelopmentEnabled()).toBe(false);
});
it("preserves explicitly isolated optional local workflow", () => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("WELLBEING_RUNTIME", undefined);
  vi.stubEnv("WELLBEING_LOCAL_RUNTIME_FILE", "synthetic-fixture");
  expect(developmentPolicyEnabled()).toBe(true); expect(chatDevelopmentEnabled()).toBe(true);
});
it("uses the same project-bound hosted identity in localhost and Vercel", () => {
  const ref = "abcdefghijklmnopqrst";
  const env = { WELLBEING_RUNTIME: "hosted", WELLBEING_HOSTED_PROJECT_REF: ref, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co` };
  expect(stagingProject(env).audience).toBe(`wellbeing-hosted-${ref}-v1`);
  expect(stagingProject({ ...env, VERCEL_ENV: "preview" })).toEqual(stagingProject(env));
  expect(() => stagingProject({ ...env, NEXT_PUBLIC_SUPABASE_URL: "https://different.supabase.co" })).toThrow();
});
