import "server-only";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { reportWorker } from "./worker";

async function main() {
  if (process.env.NODE_ENV !== "test" || !process.env.WELLBEING_PDF_WORKER_FILE) throw new Error("LOCAL_WORKER_ONLY");
  const config = z.object({ databaseUrl: z.string(), storageUrl: z.string(), storageKey: z.string().min(20),
    signingKey: z.string().regex(/^[a-f0-9]{64}$/), token: z.string().regex(/^[a-f0-9]{64}$/),
    port: z.number().int().min(1024).max(65535), databasePort: z.string() }).strict()
    .parse(JSON.parse(await readFile(process.env.WELLBEING_PDF_WORKER_FILE, "utf8")));
  const dbUrl = new URL(config.databaseUrl), storageUrl = new URL(config.storageUrl);
  if (dbUrl.protocol !== "postgresql:" || dbUrl.hostname !== "127.0.0.1" || dbUrl.username !== "wb_pdf_worker"
    || dbUrl.pathname !== "/wellbeing_phase3_rehearsal" || dbUrl.port !== config.databasePort
    || storageUrl.protocol !== "http:" || storageUrl.hostname !== "127.0.0.1" || storageUrl.username || storageUrl.password) throw new Error("LOCAL_WORKER_ONLY");
  const db = new PrismaClient({ datasources: { db: { url: config.databaseUrl } }, log: [] });
  const [role] = await db.$queryRaw<Array<{ safe: boolean }>>`SELECT session_user='wb_pdf_worker' AND NOT(rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb) AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid AND relnamespace='public'::regnamespace) AND NOT EXISTS(SELECT 1 FROM pg_roles t WHERE t.oid<>r.oid AND pg_has_role(r.oid,t.oid,'SET')) AS safe FROM pg_roles r WHERE rolname=session_user`;
  if (!role?.safe) throw new Error("UNSAFE_WORKER");
  const storage = createClient(config.storageUrl, config.storageKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: bucket, error } = await storage.storage.getBucket("assessment-reports");
  if (error || !bucket || bucket.public) throw new Error("PRIVATE_BUCKET_REQUIRED");
  process.env.NEXT_PUBLIC_SUPABASE_URL = config.storageUrl;
  process.env.SUPABASE_SECRET_KEY = config.storageKey;
  const worker = reportWorker(db, config.signingKey);
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const token = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (request.method !== "POST" || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(config.token))) {
      response.writeHead(403).end(); return;
    }
    try {
      let body = "";
      for await (const chunk of request) { body += chunk; if (body.length > 1024) throw new Error("INVALID_REQUEST"); }
      if (request.url === "/generate") {
        const { jobId } = z.object({ jobId: z.string().uuid() }).strict().parse(JSON.parse(body));
        const result = await worker.generate(jobId);
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
      } else if (request.url === "/download") {
        const { ticketId } = z.object({ ticketId: z.string().uuid() }).strict().parse(JSON.parse(body));
        const bytes = await worker.download(ticketId);
        response.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": bytes.length }).end(bytes);
      } else response.writeHead(404).end();
    } catch {
      // Never expose SQL, signatures, identifiers, credentials, or PDF input in logs/errors.
      response.writeHead(503, { "Retry-After": "10" }).end();
    }
  });
  server.requestTimeout = 45000;
  server.headersTimeout = 10000;
  server.listen(config.port, "127.0.0.1", () => console.log("Local PDF worker ready on loopback; private bucket verified."));
  const close = () => server.close(() => { void db.$disconnect().finally(() => process.exit(0)); });
  process.on("SIGTERM", close); process.on("SIGINT", close);
}
void main().catch(() => { console.error("Local PDF worker failed to start; no fallback."); process.exitCode = 1; });
