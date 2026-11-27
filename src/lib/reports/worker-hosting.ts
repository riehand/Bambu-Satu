import "server-only";

// Render's HTTPS ingress must reach the container interface. All requests still
// pass stagingHttp's bearer-token check; no public download/health bypass.
export function workerListenHost(env: Record<string, string | undefined> = process.env) {
  if (!env.WELLBEING_WORKER_HOSTING) return "127.0.0.1";
  if (env.WELLBEING_WORKER_HOSTING === "render" && env.RENDER === "true"
    && env.WELLBEING_RUNTIME === "hosted") return "0.0.0.0";
  throw new Error("WORKER_HOSTING_CONFIGURATION_REQUIRED");
}
