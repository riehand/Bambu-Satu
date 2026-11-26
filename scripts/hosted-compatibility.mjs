// Explicit read-only metadata audit. Never called by application startup.
import nextEnv from '@next/env';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
nextEnv.loadEnvConfig(process.cwd(), true);
const evidence = { status: 'BLOCKED', target: 'configured project', writes: false };
let db;
try {
  const auth = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const url = new URL(process.env.DATABASE_URL ?? '');
  const ref = auth.hostname.endsWith('.supabase.co') ? auth.hostname.split('.')[0] : null;
  if (auth.protocol !== 'https:' || !ref || url.protocol !== 'postgresql:' || !(
    url.hostname === `db.${ref}.supabase.co` ||
    (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username).endsWith(`.${ref}`))
  )) throw new Error('PROJECT_TARGET_MISMATCH');
  evidence.configuration = {
    databaseMatchesAuthProject: true,
    databaseRole: decodeURIComponent(url.username).split('.')[0],
    localPrototypeConfigured: Boolean(process.env.WELLBEING_LOCAL_RUNTIME_FILE),
    workerEndpointConfigured: Boolean(process.env.WELLBEING_PDF_WORKER_URL),
    publicAuthKeyConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  };
  const authResponse = await fetch(new URL('/auth/v1/settings', auth), {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
    signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  evidence.authSettingsHttpStatus = authResponse.status;
  if (authResponse.ok) {
    const settings = await authResponse.json();
    evidence.auth = { emailEnabled: settings.external?.email, signupDisabled: settings.disable_signup, emailAutoconfirm: settings.mailer_autoconfirm };
  }
  url.searchParams.set('connect_timeout', '10');
  url.searchParams.set('pool_timeout', '10');
  url.searchParams.set('connection_limit', '1');
  const { PrismaClient } = await import('@prisma/client');
  db = new PrismaClient({ log: [], datasources: { db: { url: url.href } } });
  evidence.database = await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '10000ms'`;
    const [mode] = await tx.$queryRaw`SELECT current_setting('transaction_read_only') AS read_only`;
    if (mode.read_only !== 'on') throw new Error('READ_ONLY_REQUIRED');
    const role = await tx.$queryRaw`SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname=session_user`;
    const tables = await tx.$queryRaw`SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,pg_get_userbyid(c.relowner) AS owner
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname IN ('users','academic_periods','assessment_question_sets','questions','assessment_sessions','assessment_answers','assessment_scores','reports','psychologist_profiles','psychologist_availability','appointments','consents','consent_audit_events','consultation_sessions','consultation_messages') ORDER BY c.relname`;
    const policies = await tx.$queryRaw`SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('users','academic_periods','assessment_question_sets','questions','assessment_sessions','assessment_answers','assessment_scores','reports','psychologist_profiles','psychologist_availability','appointments','consents','consent_audit_events','consultation_sessions','consultation_messages') ORDER BY tablename,policyname`;
    const roles = await tx.$queryRaw`SELECT rolname,rolcanlogin,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles
      WHERE rolname IN ('website_runtime','wb_display_projection','wb_score_gateway','wb_booking','wb_consent','wb_pdf_worker','wb_pdf_reader','wb_pdf_finalizer','wb_pdf_access') ORDER BY rolname`;
    const gateways = await tx.$queryRaw`SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS args,p.prosecdef AS security_definer,pg_get_userbyid(p.proowner) AS owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('wb_guard','wb_pdf') ORDER BY n.nspname,p.proname`;
    const [objects] = await tx.$queryRaw`SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS migrations,to_regclass('storage.buckets') IS NOT NULL AS buckets,to_regclass('auth.users') IS NOT NULL AS auth`;
    const migrations = objects.migrations ? await tx.$queryRaw`SELECT migration_name,checksum,finished_at IS NOT NULL AS applied,rolled_back_at IS NOT NULL AS rolled_back FROM public._prisma_migrations ORDER BY migration_name` : [];
    const buckets = objects.buckets ? await tx.$queryRaw`SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='assessment-reports'` : [];
    const namespaceInventory = await tx.$queryRaw`SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','chatbot') AND c.relkind IN ('r','p') ORDER BY n.nspname,c.relname`;
    const profileColumns = await tx.$queryRaw`SELECT a.attname AS name,has_column_privilege('authenticated',c.oid,a.attnum,'SELECT') AS authenticated_select
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='users' AND a.attname IN ('id','full_name','email','phone_number','institutional_id','user_type','role','is_active') AND NOT a.attisdropped ORDER BY a.attname`;
    const authTriggers = await tx.$queryRaw`SELECT t.tgname,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='auth' AND c.relname='users' AND t.tgname LIKE 'wellbeing_%' AND NOT t.tgisinternal ORDER BY t.tgname`;
    return { readOnly: true, role, tables, policies, roles, gateways, objects, migrations, buckets, namespaceInventory, profileColumns, authTriggers };
  }, { timeout: 25000, maxWait: 10000 });
  const disk = [];
  for (const name of await readdir('prisma/migrations')) {
    if (name === 'migration_lock.toml') continue;
    const bytes = await readFile(`prisma/migrations/${name}/migration.sql`);
    const applied = evidence.database.migrations.find(m => m.migration_name === name && m.applied && !m.rolled_back);
    disk.push({ name, hostedApplied: Boolean(applied), checksumMatches: applied ? applied.checksum === createHash('sha256').update(bytes).digest('hex') : null });
  }
  evidence.repositoryMigrations = disk;
  evidence.status = 'INSPECTED';
} catch (error) {
  // Never print Prisma messages, connection URLs, tokens, or customer records.
  evidence.error = ['PROJECT_TARGET_MISMATCH','READ_ONLY_REQUIRED'].includes(error.message) ? error.message : error.code ?? error.name;
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
  await mkdir('.tmp/environment-consolidation', { recursive: true });
  await writeFile('.tmp/environment-consolidation/hosted-compatibility.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
}
