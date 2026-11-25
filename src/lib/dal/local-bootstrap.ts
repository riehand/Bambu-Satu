import "server-only";
export async function installLocalBrowserRuntime() {
  if (!process.env.WELLBEING_LOCAL_RUNTIME_FILE || (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "development")) throw new Error("LOCAL_DAL_ONLY");
  const { readFile } = await import("node:fs/promises");
  const { createHmac } = await import("node:crypto");
  const { z } = await import("zod");
  const { installLocalRuntime } = await import("@/lib/dal/context");
  const config = z.object({
    url: z.string(), marker: z.string().regex(/^[a-f0-9]{32}$/),
    signingKey: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict().parse(JSON.parse(await readFile(process.env.WELLBEING_LOCAL_RUNTIME_FILE, "utf8")));
  const auth = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (auth.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(auth.hostname)) {
    throw new Error("LOCAL_AUTH_ONLY");
  }
  // Installation verifies the runtime login is neither an owner nor a bypass role.
  // Throwing aborts server startup; a failed installation never serves legacy queries.
  await installLocalRuntime(config.url, config.marker, async payload =>
    createHmac("sha256", Buffer.from(config.signingKey, "hex")).update(payload).digest("hex"));
}
