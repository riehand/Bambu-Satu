import "server-only";
import { createClient } from "@supabase/supabase-js";
import { stagingProject } from "../dal/staging-config";
import { storageWorkerToken } from "./hosted-storage";
import { openWorkerSessionStore } from "./worker-session-store";

export async function openWorkerAuthSession() {
  const { ref, url } = stagingProject();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key?.startsWith("sb_publishable_") || process.env.WELLBEING_STORAGE_WORKER_JWT
    || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_JWT_SECRET) {
    throw new Error("MANAGED_WORKER_SESSION_REQUIRED");
  }
  const store = await openWorkerSessionStore(process.env.WELLBEING_WORKER_SESSION_PATH ?? "", process.env.WELLBEING_WORKER_SESSION_KEY ?? "");
  const auth = createClient(url, key, {
    auth: { storage: store.storage, storageKey: `wb-worker-${ref}`, persistSession: true,
      autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) }) },
  });
  let pending: Promise<string> | undefined;
  let stopped = false;
  async function obtain() {
    store.assertHealthy();
    if (stopped) throw new Error("WORKER_SESSION_UNAVAILABLE");
    let { data, error } = await auth.auth.getSession();
    if (error) throw new Error("WORKER_SESSION_UNAVAILABLE");
    if (!data.session && process.env.WELLBEING_WORKER_SESSION_BOOTSTRAP === "1") {
      const email = process.env.WELLBEING_WORKER_BOOTSTRAP_EMAIL;
      const password = process.env.WELLBEING_WORKER_BOOTSTRAP_PASSWORD;
      if (!email || !password) throw new Error("WORKER_BOOTSTRAP_REQUIRED");
      const signed = await auth.auth.signInWithPassword({ email, password });
      data = signed.data; error = signed.error;
      // Bootstrap is consumed once; never silently reauthenticate on refresh failure.
      delete process.env.WELLBEING_WORKER_SESSION_BOOTSTRAP;
      delete process.env.WELLBEING_WORKER_BOOTSTRAP_EMAIL;
      delete process.env.WELLBEING_WORKER_BOOTSTRAP_PASSWORD;
    }
    if (error || !data.session) throw new Error("WORKER_SESSION_UNAVAILABLE");
    if ((data.session.expires_at ?? 0) <= Math.floor(Date.now() / 1000) + 90) {
      const refreshed = await auth.auth.refreshSession();
      data = refreshed.data; error = refreshed.error;
    }
    if (error || !data.session) throw new Error("WORKER_SESSION_UNAVAILABLE");
    store.assertHealthy(); // SDK must persist the rotated refresh token before use.
    return storageWorkerToken({ ...process.env, WELLBEING_STORAGE_WORKER_JWT: data.session.access_token });
  }
  function accessToken() {
    if (!pending) pending = obtain().catch(() => { throw new Error("WORKER_SESSION_UNAVAILABLE"); }).finally(() => { pending = undefined; });
    return pending;
  }
  try { await accessToken(); }
  catch { await store.close(); throw new Error("WORKER_SESSION_START_FAILED"); }
  // A single refresh path avoids races between a timer and Storage requests.
  const timer = setInterval(() => { void accessToken().catch(() => {}); }, 30_000);
  timer.unref();
  return {
    accessToken,
    async close() {
      stopped = true; clearInterval(timer);
      await pending?.catch(() => {}); await store.close();
    },
  };
}
