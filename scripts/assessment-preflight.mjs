// Read-only readiness review. Never prints connection strings or participant data.
import nextEnv from "@next/env";
import { readFileSync } from "node:fs";
nextEnv.loadEnvConfig(process.cwd());
const databaseUrl = process.env.DATABASE_URL;
let prisma;
try {
  const database = new URL(databaseUrl);
  const auth = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const local = ["localhost", "127.0.0.1", "[::1]"];
  const project = auth.hostname.endsWith(".supabase.co") ? auth.hostname.split(".")[0] : null;
  if (!((local.includes(auth.hostname) && local.includes(database.hostname)) ||
    (project && (database.hostname === `db.${project}.supabase.co` ||
      (database.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(database.username).endsWith(`.${project}`))))))
    throw new Error("Target mismatch");
  const { PrismaClient, Prisma } = await import("@prisma/client");
  prisma = new PrismaClient({ log: [], datasources: { db: { url: databaseUrl } } });
  const migrationName = "20261023010000_phase2_assessment";
  const sql = readFileSync(`prisma/migrations/${migrationName}/migration.sql`, "utf8");
  const relations = [...sql.matchAll(/CREATE (?:TABLE|(?:UNIQUE )?INDEX) "?([a-z_]+)"?/g)].map(match => match[1]);
  relations.push(...[...sql.matchAll(/CONSTRAINT "([^"]+)" PRIMARY KEY/g)].map(match => match[1]));
  const enums = [...sql.matchAll(/CREATE TYPE "([^"]+)"/g)].map(match => match[1]);
  const functions = [...sql.matchAll(/CREATE FUNCTION public\.([a-z0-9_]+)/g)].map(match => match[1]);
  const review = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const existingRelations = await tx.$queryRaw`
      SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN (${Prisma.join(relations)}) ORDER BY c.relname`;
    const existingEnums = await tx.$queryRaw`
      SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typname IN (${Prisma.join(enums)}) ORDER BY t.typname`;
    const existingFunctions = await tx.$queryRaw`
      SELECT p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (${Prisma.join(functions)}) ORDER BY p.proname`;
    const migrations = await tx.$queryRaw`
      SELECT migration_name, finished_at IS NOT NULL AND rolled_back_at IS NULL AS applied
      FROM public._prisma_migrations WHERE migration_name = ${migrationName}`;
    const [role] = await tx.$queryRaw`
      SELECT rolsuper OR rolbypassrls AS backend_bypasses_rls FROM pg_roles WHERE rolname=current_user`;
    return { migrations, existingRelations, existingEnums, existingFunctions, ...role };
  }, { timeout: 15000 });
  console.log(JSON.stringify({ readOnly: true, ...review }, null, 2));
  console.log("No schema or data changed. An empty collision list does not authorize migration.");
} catch {
  console.error("Read-only assessment review failed. Check configuration and connectivity locally; no secrets are displayed.");
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
}
