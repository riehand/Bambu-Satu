// Read-only inventory: prints counts/history only, never connection URLs or PII.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
// Prisma 5 can load .env as an import side effect. Import only AFTER Next has
// applied .env.local precedence, and explicitly pin the resolved runtime URL.
const databaseUrl = process.env.DATABASE_URL;
let prisma;
try {
  const database = new URL(databaseUrl);
  const auth = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const localHosts = ["localhost", "127.0.0.1", "[::1]"];
  const localTarget = localHosts.includes(auth.hostname) && localHosts.includes(database.hostname);
  const projectRef = auth.hostname.endsWith(".supabase.co") ? auth.hostname.split(".")[0] : null;
  const hostedTarget = projectRef && (
    database.hostname === `db.${projectRef}.supabase.co` ||
    (database.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(database.username).endsWith(`.${projectRef}`))
  );
  if (!localTarget && !hostedTarget) {
    console.error("Audit refused: DATABASE_URL does not identify the configured Supabase project. Check local environment precedence.");
    process.exitCode = 1;
  } else {
  console.log("Audit target:", localTarget ? "local Supabase" : database.hostname.endsWith(".pooler.supabase.com") ? "configured Supabase pooler" : "configured Supabase direct database");
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient({ log: [], datasources: { db: { url: databaseUrl } } });
  const inventory = await prisma.$queryRaw`
    SELECT count(*)::int AS profiles,
      count(password_hash)::int AS legacy_passwords,
      count(*) FILTER (WHERE NOT is_active)::int AS inactive
    FROM public.users`;
  const migrations = await prisma.$queryRaw`
    SELECT migration_name, finished_at IS NOT NULL AS applied,
      rolled_back_at IS NOT NULL AS rolled_back
    FROM public._prisma_migrations ORDER BY started_at`;
  const [authSchema] = await prisma.$queryRaw`SELECT to_regclass('auth.users') IS NOT NULL AS present`;
  const duplicates = await prisma.$queryRaw`
    SELECT count(*)::int AS duplicate_email_groups FROM (
      SELECT lower(btrim(email)) FROM public.users GROUP BY lower(btrim(email)) HAVING count(*) > 1
    ) d`;
  console.log(JSON.stringify({ inventory, migrations, auth: authSchema, duplicates }, null, 2));
  if (authSchema.present) {
    console.log(await prisma.$queryRaw`
      SELECT count(*)::int AS unmatched_profiles FROM public.users p
      LEFT JOIN auth.users a ON a.id = p.id
      WHERE a.id IS NULL OR lower(btrim(a.email)) IS DISTINCT FROM lower(btrim(p.email))`);
    console.log(await prisma.$queryRaw`
      SELECT count(*)::int AS identities_without_profiles FROM auth.users a
      LEFT JOIN public.users p ON p.id = a.id WHERE p.id IS NULL`);
  }
  }
} catch (error) {
  console.error("Read-only audit failed. Check connectivity and configuration locally. Code:", error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
}
