import "server-only";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { stagingDatabase, stagingProject } from "../dal/staging-config";
import { verifyRestrictedRole } from "../dal/hosted-bootstrap";
import { stagingHttp } from "../dal/staging-http";
import { reportWorker } from "./worker";

async function main() {
  const { ref, url } = stagingProject();
  const key = z.string().regex(/^[a-f0-9]{64}$/).parse(process.env.WELLBEING_PDF_SIGNING_KEY);
  const db = new PrismaClient({ datasources: { db: { url: stagingDatabase(process.env.WELLBEING_WORKER_DATABASE_URL, "wb_pdf_worker", ref) } }, log: [] });
  try {
    await verifyRestrictedRole(db, "wb_pdf_worker");
    const storage = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: bucket, error } = await storage.storage.getBucket("assessment-reports");
    if (error || !bucket || bucket.public) throw new Error("PRIVATE_BUCKET_REQUIRED");
    const worker = reportWorker(db, key, { kid: "staging-v1", issuer: `wellbeing-staging-${ref}-pdf-worker` });
    const server = stagingHttp(process.env.WELLBEING_PDF_WORKER_TOKEN ?? "", async (path, body, response) => {
      if (path === "/generate") {
        const { jobId } = z.object({ jobId: z.string().uuid() }).strict().parse(body);
        const result = await worker.generate(jobId);
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
      } else if (path === "/download") {
        const { ticketId } = z.object({ ticketId: z.string().uuid() }).strict().parse(body);
        const bytes = await worker.download(ticketId);
        response.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": bytes.length }).end(bytes);
      } else response.writeHead(404).end();
    });
    const port = z.coerce.number().int().min(1024).max(65535).parse(process.env.PORT ?? 8082);
    server.listen(port, "127.0.0.1");
    const close = () => server.close(() => { void db.$disconnect(); });
    process.on("SIGTERM", close); process.on("SIGINT", close);
  } catch { await db.$disconnect(); throw new Error("WORKER_START_FAILED"); }
}
void main().catch(() => { console.error("Staging PDF worker configuration rejected."); process.exitCode = 1; });
