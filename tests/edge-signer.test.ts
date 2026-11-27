import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createEdgeSignerHandler } from "@/lib/dal/edge-signer-handler";
const ref = "abcdefghijklmnopqrst";
const sub = "00000000-0000-4000-8000-000000000001";
const epoch = 1800000000;
const key = "a".repeat(64);
const payload = (patch = {}) => JSON.stringify({ aud: `wellbeing-hosted-${ref}-v1`, sub, pid: "12", tx: "34", iat: epoch, exp: epoch + 30, purpose: "interactive", ...patch });
const req = (value: string) => new Request("https://example.invalid", { method: "POST", headers: { Authorization: "Bearer synthetic", "Content-Type": "application/json" }, body: JSON.stringify({ payload: value }) });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(epoch * 1000); });
afterEach(() => vi.useRealTimers());
function setup(confirmed = true) {
  const auth = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: sub, email_confirmed_at: confirmed ? "2026-01-01" : null }));
  return { auth, handle: createEdgeSignerHandler({ projectRef: ref, authUrl: `https://${ref}.supabase.co`, publishableKey: "sb_publishable_fixture", signingKey: key }, auth) };
}
it("uses verified hosted identity and preserves exact transaction-bound HMAC", async () => {
  const { auth, handle } = setup(); const value = payload();
  const response = await handle(req(value));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ mac: createHmac("sha256", Buffer.from(key, "hex")).update(value).digest("hex") });
  expect(auth).toHaveBeenCalledWith(`https://${ref}.supabase.co/auth/v1/user`, expect.objectContaining({ redirect: "error", headers: { apikey: "sb_publishable_fixture", Authorization: "Bearer synthetic" } }));
});
it.each([{ sub: "00000000-0000-4000-8000-000000000002" }, { purpose: "worker" }, { exp: epoch - 1 }, { aud: "other" }])("rejects spoofed or expired claims %j", async patch => {
  expect((await setup().handle(req(payload(patch)))).status).toBe(403);
});
it("rejects absent credentials, unconfirmed users and oversized input", async () => {
  const { handle, auth } = setup();
  expect((await handle(new Request("https://example.invalid", { method: "POST" }))).status).toBe(401);
  expect(auth).not.toHaveBeenCalled();
  expect((await setup(false).handle(req(payload()))).status).toBe(403);
  expect((await handle(req("x".repeat(5000)))).status).toBe(413);
});
it("does not expose upstream errors or sign when Auth rejects the token", async () => {
  const { handle, auth } = setup(); auth.mockResolvedValue(Response.json({ error: "private upstream" }, { status: 401 }));
  const response = await handle(req(payload())); expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "SIGNING_DENIED" });
});
