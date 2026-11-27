import "server-only";
import { createClient } from "@supabase/supabase-js";
import { stagingProject } from "../dal/staging-config";

let managedToken: (() => Promise<string>) | undefined;
export function configureHostedStorageTokens(provider: () => Promise<string>) {
  if (managedToken) throw new Error("STORAGE_TOKEN_PROVIDER_ALREADY_SET");
  managedToken = provider;
  return () => { if (managedToken === provider) managedToken = undefined; };
}

// Configuration checks only. Supabase verifies the signature on every request.
// The worker must never receive a project JWT signing key or service-role secret.
export function storageWorkerToken(env: Record<string, string | undefined> = process.env, now = Date.now()) {
  const { url } = stagingProject(env);
  try {
    if (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_JWT_SECRET) throw new Error();
    const token = env.WELLBEING_STORAGE_WORKER_JWT ?? "";
    if (token.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error();
    const [head, body] = token.split(".");
    const header = JSON.parse(Buffer.from(head, "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const epoch = Math.floor(now / 1000);
    if (!["HS256", "RS256", "ES256"].includes(header.alg)
      || claims.role !== "wb_report_storage" || claims.iss !== `${url}/auth/v1`
      || claims.aud !== "authenticated" || claims.sub !== env.WELLBEING_STORAGE_WORKER_SUB
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claims.sub ?? "")
      || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)
      || claims.iat > epoch || claims.exp <= epoch + 15
      || claims.exp - claims.iat <= 0 || claims.exp - claims.iat > 3600
      || (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > epoch))) throw new Error();
    return token;
  } catch { throw new Error("SCOPED_STORAGE_TOKEN_REQUIRED"); }
}

export function hostedStorageClient() {
  const { url } = stagingProject();
  if (!managedToken) storageWorkerToken();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Intentionally reject legacy JWT API keys here, including service_role keys.
  if (!key?.startsWith("sb_publishable_")) throw new Error("STORAGE_PUBLISHABLE_KEY_REQUIRED");
  return createClient(url, key, {
    accessToken: async () => managedToken ? managedToken() : storageWorkerToken(),
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, {
      ...init, redirect: "error", signal: AbortSignal.timeout(15_000),
    }) },
  });
}
