import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { stagingProject } from "./staging-config";
import { stagingSigner } from "./staging-signer";
import { stagingHttp } from "./staging-http";

function main() {
  const { url, audience } = stagingProject();
  const auth = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(5000) }) },
  });
  const sign = stagingSigner(audience, process.env.WELLBEING_IDENTITY_SIGNING_KEY ?? "", async token => {
    const { data, error } = await auth.auth.getUser(token);
    return error ? null : data.user;
  });
  const server = stagingHttp(process.env.WELLBEING_SIGNER_TOKEN ?? "", async (path, body, response) => {
    if (path !== "/sign") { response.writeHead(404).end(); return; }
    const input = z.object({ payload: z.string(), accessToken: z.string() }).strict().parse(body);
    const mac = await sign(input.payload, input.accessToken);
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ mac }));
  });
  const port = z.coerce.number().int().min(1024).max(65535).parse(process.env.PORT ?? 8081);
  server.listen(port, "127.0.0.1");
  const close = () => server.close();
  process.on("SIGTERM", close); process.on("SIGINT", close);
}
try { main(); } catch { console.error("Staging signer configuration rejected."); process.exitCode = 1; }
