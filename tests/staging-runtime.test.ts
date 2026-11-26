import { afterEach, expect, it, vi } from "vitest";
import { stagingDatabase, stagingProject, httpsService } from "@/lib/dal/staging-config";
import { stagingSigner } from "@/lib/dal/staging-signer";
import { createHmac } from "node:crypto";

const ref = "abcdefghijklmnopqrst";
const audience = `wellbeing-staging-${ref}-v1`;
const id = "00000000-0000-4000-8000-000000000001";
const key = "b".repeat(64); // Synthetic test key, never a deployment fixture.
afterEach(() => vi.useRealTimers());
it("pins staging Auth to its approved project and rejects production/local mixing", () => {
  const env = { WELLBEING_RUNTIME: "staging", WELLBEING_STAGING_PROJECT_REF: ref, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co` };
  expect(stagingProject(env).audience).toBe(audience);
  for (const change of [{ VERCEL_ENV: "production" }, { WELLBEING_LOCAL_RUNTIME_FILE: "fixture" }, { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }])
    expect(() => stagingProject({ ...env, ...change })).toThrow("STAGING_TARGET_REQUIRED");
});
it("requires restricted role, project-bound database and certificate validation", () => {
  const url = `postgresql://website_runtime:synthetic@db.${ref}.supabase.co:5432/postgres?sslmode=require&sslaccept=strict`;
  expect(stagingDatabase(url, "website_runtime", ref)).toBe(url);
  expect(stagingDatabase(url.replace(`website_runtime:`, `website_runtime.${ref}:`).replace(`db.${ref}.supabase.co`, "aws-0-region.pooler.supabase.com"), "website_runtime", ref)).toContain("pooler");
  for (const invalid of [url.replace("website_runtime:", "postgres:"), url.replace("strict", "accept_invalid_certs"), url.replace(ref, "differentprojectrefxx"), url.replace("sslmode=require", "sslmode=disable")])
    expect(() => stagingDatabase(invalid, "website_runtime", ref)).toThrow();
});
it("rejects local, credentialed and redirect-capable service origins", () => {
  expect(httpsService("https://signer.example.com").origin).toBe("https://signer.example.com");
  for (const value of ["http://localhost:8081", "https://127.0.0.1", "https://user:pass@example.com", "https://example.com/path", "https://service.internal"])
    expect(() => httpsService(value)).toThrow();
});
function payload(changes = {}) {
  const iat = Math.floor(Date.now() / 1000);
  return JSON.stringify({ aud: audience, sub: id, pid: "123", tx: "456", iat, exp: iat + 30, purpose: "interactive", ...changes });
}
it("signs only after independently verified, confirmed Auth identity matches the transaction claim", async () => {
  const verify = vi.fn().mockResolvedValue({ id, email_confirmed_at: "confirmed" });
  const sign = stagingSigner(audience, key, verify); const claim = payload();
  expect(await sign(claim, "synthetic-access-token")).toBe(createHmac("sha256", Buffer.from(key, "hex")).update(claim).digest("hex"));
  expect(verify).toHaveBeenCalledWith("synthetic-access-token");
});
it.each([null, { id, email_confirmed_at: null }, { id: "other", email_confirmed_at: "confirmed" }])("rejects revoked/unconfirmed/mismatched Auth identity %#", async user => {
  await expect(stagingSigner(audience, key, async () => user)(payload(), "token")).rejects.toThrow();
});
it("rejects test audience, expired or overlong claims, and noninteractive signing", async () => {
  const sign = stagingSigner(audience, key, async () => ({ id, email_confirmed_at: "confirmed" }));
  for (const change of [{ aud: "wellbeing-local-runtime-v1" }, { exp: 1 }, { exp: Math.floor(Date.now() / 1000) + 600 }, { purpose: "report-finalize" }])
    await expect(sign(payload(change), "token")).rejects.toThrow();
});
