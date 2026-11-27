import "server-only";
import { stagingSigner } from "./staging-signer";

type Config = { projectRef: string; authUrl: string; publishableKey: string; signingKey: string };

// No database/admin credential. Only the hosted function receives signingKey.
export function createEdgeSignerHandler(config: Config, request: typeof fetch = fetch) {
  if (!/^[a-z0-9]{20}$/.test(config.projectRef)
    || config.authUrl !== `https://${config.projectRef}.supabase.co`
    || !config.publishableKey.startsWith("sb_publishable_")) throw new Error("EDGE_SIGNER_CONFIGURATION_REQUIRED");
  const sign = stagingSigner(`wellbeing-hosted-${config.projectRef}-v1`, config.signingKey, async token => {
    const response = await request(`${config.authUrl}/auth/v1/user`, {
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const user = await response.json();
    return typeof user.id === "string" && typeof user.email_confirmed_at === "string" ? user : null;
  });
  const reply = (status: number, body: object) => Response.json(body, {
    status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
  return async (req: Request) => {
    if (req.method !== "POST") return reply(405, { error: "METHOD_NOT_ALLOWED" });
    const authorization = req.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ") || authorization.length > 8200) return reply(401, { error: "AUTH_REQUIRED" });
    if (!req.headers.get("content-type")?.startsWith("application/json")) return reply(415, { error: "JSON_REQUIRED" });
    const reader = req.body?.getReader();
    if (!reader) return reply(400, { error: "INVALID_REQUEST" });
    try {
      const chunks: Uint8Array[] = []; let length = 0;
      while (true) {
        const next = await reader.read(); if (next.done) break;
        length += next.value.length;
        if (length > 4096) { await reader.cancel(); return reply(413, { error: "REQUEST_TOO_LARGE" }); }
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!body || Object.keys(body).length !== 1 || typeof body.payload !== "string") return reply(400, { error: "INVALID_REQUEST" });
      const mac = await sign(body.payload, authorization.slice(7));
      return reply(200, { mac });
    } catch {
      // Never return/log a token, payload, Auth response or signing key.
      return reply(403, { error: "SIGNING_DENIED" });
    } finally { reader.releaseLock(); }
  };
}
