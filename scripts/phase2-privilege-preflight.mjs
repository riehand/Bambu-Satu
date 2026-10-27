// Catalog-only review; no row values, credentials or arbitrary error messages.
import nextEnv from "@next/env";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { configuredSource } from "./phase2-safety.mjs";
nextEnv.loadEnvConfig(process.cwd());
let prisma;
try {
  configuredSource(process.env.DATABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient({ log: [], datasources: { db: { url: process.env.DATABASE_URL } } });
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const version = await tx.$queryRaw`SELECT current_setting('server_version_num') AS server_version_num`;
    const extensions = await tx.$queryRaw`SELECT e.extname, e.extversion, n.nspname AS schema
      FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY e.extname`;
    const schemas = await tx.$queryRaw`SELECT nspname AS schema, pg_get_userbyid(nspowner) AS owner
      FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname`;
    const history = await tx.$queryRaw`SELECT migration_name,checksum,
      finished_at IS NOT NULL AND rolled_back_at IS NULL AS applied FROM public._prisma_migrations ORDER BY migration_name`;
    const migrationChecksums = history.map(row => {
      // Never use arbitrary database text as a filesystem path.
      const names = ['20261021144827_init_users', '20261023000000_supabase_auth', '20261023010000_phase2_assessment'];
      const path = names.includes(row.migration_name) ? `prisma/migrations/${row.migration_name}/migration.sql` : null;
      return { migration: names.includes(row.migration_name) ? row.migration_name : 'UNRECOGNIZED_MIGRATION', applied: row.applied,
        matchesLocal: !!path && existsSync(path) && createHash('sha256').update(readFileSync(path)).digest('hex') === row.checksum };
    });
    const roles = await tx.$queryRaw`SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolinherit
      FROM pg_roles WHERE rolname IN (current_user, 'anon', 'authenticated', 'service_role') ORDER BY rolname`;
    const migrationAccess = await tx.$queryRaw`SELECT r.rolname,
      has_table_privilege(r.oid, 'public._prisma_migrations', 'SELECT') AS can_read,
      has_table_privilege(r.oid, 'public._prisma_migrations', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS can_mutate,
      has_any_column_privilege(r.oid, 'public._prisma_migrations', 'SELECT,INSERT,UPDATE,REFERENCES') AS any_column_access
      FROM pg_roles r WHERE r.rolname IN (current_user, 'anon', 'authenticated', 'service_role') ORDER BY r.rolname`;
    const memberships = await tx.$queryRaw`SELECT member.rolname AS member, parent.rolname AS inherited_role
      FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid
      WHERE member.rolname IN (current_user, 'anon', 'authenticated', 'service_role') ORDER BY 1,2`;
    const assessmentAccess = await tx.$queryRaw`SELECT r.rolname, c.relname, c.relrowsecurity AS rls,
      pg_get_userbyid(c.relowner) AS owner,
      has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS any_table_access,
      has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') AS any_column_access
      FROM pg_roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE r.rolname IN ('anon','authenticated','service_role',current_user) AND n.nspname='public'
      AND c.relname IN ('academic_periods','assessment_question_sets','questions','assessment_sessions','assessment_answers','assessment_scores','reports')
      ORDER BY 1,2`;
    const defaults = await tx.$queryRaw`SELECT pg_get_userbyid(d.defaclrole) AS creator,
      COALESCE(n.nspname,'ALL_SCHEMAS') AS schema, d.defaclobjtype::text AS object_type, d.defaclacl::text AS acl
      FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 1,2,3`;
    return { version, extensions, schemas, migrationChecksums, roles, migrationAccess, memberships, assessmentAccess, defaults };
  }, { timeout: 15000 });
  console.log(JSON.stringify({ readOnly: true, ...result }, null, 2));
} catch {
  console.error("Privilege review failed; inspect configuration/connectivity privately. No raw diagnostics displayed.");
  process.exitCode = 1;
} finally { await prisma?.$disconnect(); }
