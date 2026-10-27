// Explicit read-only metadata audit. Never dump data or print connection/error text.
import nextEnv from '@next/env';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { configuredSource } from './phase2-safety.mjs';

if (!process.argv.includes('--read-only')) {
  console.log('Preparation only; pass --read-only for the authorized aggregate/catalog audit.');
} else {
  try {
    nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
    const db = configuredSource(process.env.DIRECT_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== 'bofoowyzlnfhwcstlmgp.supabase.co') throw 0;
    const publicRoots = join(process.cwd(), '.tmp/postgresql17-client-tools/supabase-prod-ca-2021.crt');
    const rootCertificate = existsSync(publicRoots) ? publicRoots : 'system';
    const env = {
      SystemRoot: process.env.SystemRoot, PATH: process.env.PATH,
      PGHOST: db.hostname, PGPORT: db.port || '5432', PGDATABASE: 'postgres',
      PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password),
      PGSSLMODE: 'verify-full', PGSSLROOTCERT: rootCertificate, PGCONNECT_TIMEOUT: '15',
      PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=20000',
      PSQL_HISTORY: 'NUL',
    };
    const sql = `BEGIN READ ONLY;
SELECT json_build_object(
 'readOnly',current_setting('transaction_read_only')='on',
 'database',current_database(),'serverVersion',current_setting('server_version'),
 'databaseBytes',pg_database_size(current_database()),
 'poolerBackendReportsTls',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),
 'storageBuckets',(SELECT count(*) FROM storage.buckets),
 'storageObjects',(SELECT count(*) FROM storage.objects),
 'storageRls',(SELECT bool_and(relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relname IN ('buckets','objects')),
 'vaultSecretCount',(SELECT count(*) FROM vault.secrets),
 'schemas',(SELECT json_agg(nspname ORDER BY nspname) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'),
 'extensions',(SELECT json_agg(json_build_object('name',extname,'version',extversion) ORDER BY extname) FROM pg_extension),
 'authCustomTriggers',(SELECT json_agg(json_build_object('name',t.tgname,'enabled',t.tgenabled,'functionSchema',pn.nspname,'definitionSHA256',encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex'))) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace WHERE n.nspname='auth' AND NOT t.tgisinternal AND t.tgname IN ('wellbeing_auth_user_created','wellbeing_auth_email_changed')),
 'customManagedTriggerCount',(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('auth','storage') AND NOT t.tgisinternal),
 'managedPolicyCount',(SELECT count(*) FROM pg_policies WHERE schemaname IN ('auth','storage')),
 'migrationHistory',(SELECT json_agg(json_build_object('name',migration_name,'checksum',checksum,'applied',finished_at IS NOT NULL AND rolled_back_at IS NULL)) FROM public._prisma_migrations),
 'supabaseMigrationHistoryPresent',to_regclass('supabase_migrations.schema_migrations') IS NOT NULL,
 'phase2TablePresent',to_regclass('public.assessment_sessions') IS NOT NULL,
 'migrationHistoryRls',(SELECT relrowsecurity FROM pg_class WHERE oid='public._prisma_migrations'::regclass),
 'tableReadCoverage',(SELECT json_agg(json_build_object('schema',schema,'tables',tables,'unreadableTables',unreadable)) FROM (SELECT n.nspname AS schema,count(*) AS tables,count(*) FILTER(WHERE NOT has_table_privilege(current_user,c.oid,'SELECT')) AS unreadable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' GROUP BY n.nspname ORDER BY n.nspname) q),
 'browserMigrationAccess',(SELECT json_agg(json_build_object('role',rolname,'read',has_table_privilege(oid,'public._prisma_migrations','SELECT'),'write',has_table_privilege(oid,'public._prisma_migrations','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'columnAccess',has_any_column_privilege(oid,'public._prisma_migrations','SELECT,INSERT,UPDATE,REFERENCES'))) FROM pg_roles WHERE rolname IN ('anon','authenticated')),
 'connectionRole',(SELECT json_build_object('superuser',rolsuper,'bypassRls',rolbypassrls,'createRole',rolcreaterole) FROM pg_roles WHERE rolname=current_user),
 'nonBuiltinRoleCount',(SELECT count(*) FROM pg_roles WHERE rolname NOT LIKE 'pg_%')
);
ROLLBACK;`;
    const result = spawnSync(join(process.cwd(), '.tmp/postgresql17-client-tools/pgsql/bin/psql.exe'),
      ['-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1'],
      { env, input: sql, encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024 });
    if (result.status !== 0 || result.stderr.trim()) {
      const message = String(result.stderr || '');
      console.log(JSON.stringify({ status: 'READ_ONLY_AUDIT_FAILED', certificateVerifiedConnectionEstablished: false,
        diagnostic: { spawnError: result.error?.code || null, exitCode: result.status,
          certificate: /certificate|root certificate|SSL error/i.test(message), dns: /translate host|resolve/i.test(message),
          certificateVerifyFailed: /certificate verify failed/i.test(message), rootLoadFailed: /could not (read|load).*certificate|no certificate or crl found/i.test(message),
          hostnameMismatch: /does not match host|hostname mismatch/i.test(message),
          authentication: /password authentication|authentication failed/i.test(message),
          permissions: /permission denied/i.test(message), missingObject: /does not exist/i.test(message),
          connection: /connection|timeout/i.test(message) },
        reason: 'Connection, TLS or catalog query failed; raw diagnostics suppressed. No export or fallback attempted.' }));
      process.exitCode = 1;
    } else {
      const audit = JSON.parse(result.stdout.trim());
      const allowed = ['20261021144827_init_users', '20261023000000_supabase_auth', '20261023010000_phase2_assessment'];
      audit.migrationHistory = audit.migrationHistory.map(row => ({
        name: allowed.includes(row.name) ? row.name : 'UNRECOGNIZED', applied: row.applied,
        matchesLocal: allowed.includes(row.name) && createHash('sha256').update(readFileSync(`prisma/migrations/${row.name}/migration.sql`)).digest('hex') === row.checksum,
      }));
      console.log(JSON.stringify({ status: 'READ_ONLY_AUDIT_PASSED', checkedUtc: new Date().toISOString(),
        project: 'bofoowyzlnfhwcstlmgp', connection: db.hostname.endsWith('.pooler.supabase.com') ? 'SESSION_POOLER_5432' : 'DIRECT_5432',
        sslmode: 'verify-full', sslrootcert: rootCertificate === 'system' ? 'system' : 'OFFICIAL_SUPABASE_PUBLIC_CA', ...audit }, null, 2));
    }
  } catch {
    console.error('Read-only audit stopped; no credentials, row values or raw diagnostics logged.');
    process.exitCode = 1;
  }
}
