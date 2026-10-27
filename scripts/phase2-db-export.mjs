// Prepared executor. No connection, file creation or export without the explicit mode.
// An option does not confer permission: obtain owner EXPORT ONLY authorization first.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, createReadStream, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import nextEnv from '@next/env';
import { configuredSource, externalDirectory } from './phase2-safety.mjs';
import { capture, consume, encryptStream, cleanEnvironment } from './phase2-encrypted-stream.mjs';
import { safeFailure } from './phase2-db-failure.mjs';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const run = 'D:\\WellBeingHub-Backups\\Supabase-Phase2-20261026-Retry01';
const project = 'bofoowyzlnfhwcstlmgp';
const age = join(repo, '.tmp/age-v1.3.2/age/age.exe');
const bin = join(repo, '.tmp/postgresql17-client-tools/pgsql/bin');
const ca = join(repo, '.tmp/postgresql17-client-tools/supabase-prod-ca-2021.crt');
const mainFile = join(run, 'database.dump.age');
const recoveryFile = join(run, 'recovery.json.age');
const pg = name => join(bin, name + '.exe');
const sha = data => createHash('sha256').update(data).digest('hex');
const progress = { status: 'PREFLIGHT', startedUtc: new Date().toISOString(), processResults: {},
  uploaded: false, restored: false, hostedMigrationApplied: false };
let progressEnabled = false;
function saveProgress() {
  if (progressEnabled) writeFileSync(join(run, 'session.json'), JSON.stringify(progress, null, 2));
}
function report(name) { return result => { progress.processResults[name] = result; saveProgress(); }; }
function stage(name) { progress.status = name; progress.updatedUtc = new Date().toISOString(); saveProgress(); }
async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
function checkTools() {
  if (sha(readFileSync(age)) !== '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0' ||
      sha(readFileSync(ca)) !== '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7') throw new Error('TOOL_OR_CA_CHANGED');
  for (const name of ['pg_dump', 'pg_dumpall', 'pg_restore', 'psql']) {
    const result = spawnSync(pg(name), ['--version'], { encoding: 'utf8', windowsHide: true, env: cleanEnvironment() });
    if (result.status !== 0 || !result.stdout.includes('(PostgreSQL) 17.11')) throw new Error('PG_VERSION_CHANGED');
  }
}
function sourceEnvironment() {
  nextEnv.loadEnvConfig(repo, false, { info() {}, error() {} });
  const db = configuredSource(process.env.DIRECT_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${project}.supabase.co`) throw new Error('SOURCE_CHANGED');
  return { ...cleanEnvironment(), TEMP: run, TMP: run, TMPDIR: run, PSQL_HISTORY: 'NUL',
    PGHOST: db.hostname, PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: decodeURIComponent(db.username),
    PGPASSWORD: decodeURIComponent(db.password), PGSSLMODE: 'verify-full', PGSSLROOTCERT: ca,
    PGCONNECT_TIMEOUT: '15', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=120000' };
}
function audit() {
  const result = spawnSync(process.execPath, [join(repo, 'scripts/phase2-db-backup-audit.mjs'), '--read-only'],
    { cwd: repo, env: cleanEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (result.status !== 0) throw new Error('AUDIT_FAILED');
  const value = JSON.parse(result.stdout);
  if (!value.readOnly || value.database !== 'postgres' || value.project !== project || value.serverVersion !== '17.11' ||
      value.phase2TablePresent || value.storageBuckets !== 0 || value.storageObjects !== 0 || value.vaultSecretCount !== 0 ||
      value.tableReadCoverage.some(row => row.unreadableTables !== 0) || value.migrationHistory.length !== 2 ||
      value.migrationHistory.some(row => !row.applied || !row.matchesLocal) || value.authCustomTriggers.length !== 2 ||
      value.authCustomTriggers.some(row => row.enabled !== 'O')) throw new Error('SOURCE_PREREQUISITES_CHANGED');
  return value;
}
async function sourceCatalog(env) {
  const sql = `BEGIN READ ONLY;
SELECT json_build_object(
 'tables',(SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname,'partitioned',c.relkind='p','rls',c.relrowsecurity,
 'extensionOwned',EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'),
 'extensionConfigData',EXISTS(SELECT 1 FROM pg_extension e WHERE c.oid=ANY(e.extconfig))))
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'),
 'triggers',(SELECT json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname)) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT LIKE 'pg_%' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_trigger'::regclass AND d.objid=t.oid AND d.deptype='e')),
 'policies',(SELECT json_agg(json_build_object('schema',schemaname,'table',tablename,'name',policyname)) FROM pg_policies),
 'databaseMetadata',(SELECT json_build_object('owner',pg_get_userbyid(datdba),'acl',datacl::text) FROM pg_database WHERE datname=current_database()),
 'roles',(SELECT json_agg(rolname ORDER BY rolname) FROM pg_roles WHERE rolname NOT LIKE 'pg_%')
); ROLLBACK;`;
  return JSON.parse((await capture(pg('psql'), ['-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1'],
    { env, input: Buffer.from(sql), maxBytes: 4 * 1024 * 1024, report: report('privateCatalogRead') })).toString('utf8'));
}
async function inspectDump(bytes, verificationEnv, catalog) {
  const toc = (await capture(pg('pg_restore'), ['--list'], { input: bytes, env: verificationEnv,
    report: report('archiveList') })).toString('utf8');
  for (const required of ['TABLE auth users', 'TABLE DATA auth users', 'TABLE auth identities', 'TABLE DATA auth identities',
    'TABLE public users', 'TABLE DATA public users', 'TABLE public _prisma_migrations', 'TABLE DATA public _prisma_migrations',
    'wellbeing_auth_user_created', 'wellbeing_auth_email_changed', 'handle_auth_user_created', 'handle_auth_email_changed',
    'TABLE storage buckets', 'TABLE storage objects', 'EXTENSION - supabase_vault']) {
    if (!toc.includes(required)) throw new Error('REQUIRED_COVERAGE_MISSING');
  }
  const coverage = { tableDefinitionsChecked: 0, tableDataEntriesChecked: 0, triggersChecked: 0, policiesChecked: 0, rowSecurityEntriesChecked: 0,
    extensionOwnedTables: 0, missingRequiredObjects: 0, archiveEntryCounts: {} };
  for (const table of catalog.tables) {
    if (!table.extensionOwned) {
      if (!toc.includes(` TABLE ${table.schema} ${table.name} `)) throw new Error('TABLE_DEFINITION_MISSING');
      coverage.tableDefinitionsChecked++;
      if (table.rls) {
        if (!toc.includes(` ROW SECURITY ${table.schema} ${table.name} `)) throw new Error('REQUIRED_COVERAGE_MISSING');
        coverage.rowSecurityEntriesChecked++;
      }
    } else coverage.extensionOwnedTables++;
    if ((!table.extensionOwned && !table.partitioned) || table.extensionConfigData) {
      if (!toc.includes(` TABLE DATA ${table.schema} ${table.name} `)) throw new Error('TABLE_DATA_MISSING');
      coverage.tableDataEntriesChecked++;
    }
  }
  for (const trigger of catalog.triggers || []) {
    if (!toc.includes(` TRIGGER ${trigger.schema} ${trigger.table} ${trigger.name} `)) throw new Error('TRIGGER_MISSING');
    coverage.triggersChecked++;
  }
  for (const policy of catalog.policies || []) {
    if (!toc.includes(` POLICY ${policy.schema} ${policy.table} ${policy.name} `)) throw new Error('REQUIRED_COVERAGE_MISSING');
    coverage.policiesChecked++;
  }
  for (const kind of ['SCHEMA', 'TABLE', 'TABLE DATA', 'FUNCTION', 'TRIGGER', 'POLICY', 'ACL', 'DEFAULT ACL', 'EXTENSION', 'PUBLICATION']) {
    const pattern = kind === 'TABLE' ? 'TABLE(?! DATA)' : kind;
    coverage.archiveEntryCounts[kind] = toc.split('\n').filter(line => new RegExp(`^\\d+; \\d+ \\d+ ${pattern} `).test(line)).length;
  }
  // Decompress/deparse the entire archive to a drained pipe. No DB or plaintext file.
  await consume(pg('pg_restore'), ['--file=-'], bytes, verificationEnv, report('archiveFullOfflineParse'));
  return { toc, coverage };
}
function destinationCheck(create) {
  const result = spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-File', join(repo, 'scripts/phase2-db-destination.ps1'),
      ...(create ? ['-CreateApprovedDirectory'] : [])], { env: cleanEnvironment(), encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('DESTINATION_CHECK_FAILED');
}
const mode = process.argv.slice(2);
if (mode.length === 0 || (mode.length === 1 && mode[0] === '--plan')) {
  console.log(JSON.stringify({ mode: 'PREPARATION_ONLY', source: `${project}/postgres`, destination: run,
    encryptedFiles: ['database.dump.age', 'recovery.json.age'], exportPerformed: false,
    method: 'Native PG17 custom archive via binary pipe to age; roles/manifest/index in encrypted companion',
    approvalRequired: 'EXPORT ONLY plus non-restoring local verification; see PHASE2-DATABASE-EXPORT-PLAN.md' }, null, 2));
} else {
  let created = false; let env;
  try {
    if (mode.length !== 1 || mode[0] !== '--export-approved') throw new Error('UNSUPPORTED_MODE');
    if (process.platform !== 'win32') throw new Error('WINDOWS_REQUIRED');
    process.report.reportOnFatalError = false;
    process.report.reportOnSignal = false;
    process.report.reportOnUncaughtException = false;
    checkTools(); destinationCheck(false);
    const before = audit();
    env = sourceEnvironment();
    destinationCheck(true); created = true; externalDirectory(run, repo);
    progressEnabled = true;
    stage('READING_PRIVATE_CATALOG');
    const catalog = await sourceCatalog(env);
    const encryptedEnv = { ...cleanEnvironment(), TEMP: run, TMP: run, TMPDIR: run };
    stage('AWAITING_PRIVATE_PASSPHRASE_AND_EXPORT');
    console.log('Enter and confirm your backup passphrase privately in the local age terminal prompt. Do not leave it empty or share it.');
    const dump = await encryptStream({ age, destination: mainFile, encryptionEnv: encryptedEnv,
      reportCipher: report('dumpEncryption'), reportProducer: report('pgDump'),
      producer: { exe: pg('pg_dump'), args: ['-w', '--format=custom', '--compress=6', '--lock-wait-timeout=10000'], env } });
    console.log('Enter the same passphrase privately to authenticate and inspect the encrypted dump in memory.');
    stage('AWAITING_PRIVATE_DUMP_VERIFICATION');
    const plaintext = await capture(age, ['--decrypt', mainFile], { env: encryptedEnv, allowStderr: true, report: report('dumpDecryption') });
    if (sha(plaintext) !== dump.sha256 || plaintext.length !== dump.bytes) throw new Error('DUMP_VERIFY_MISMATCH');
    stage('CHECKING_ARCHIVE_COVERAGE');
    const { toc, coverage } = await inspectDump(plaintext, encryptedEnv, catalog);
    progress.coverage = coverage; saveProgress();
    plaintext.fill(0);
    stage('READING_PASSWORD_FREE_ROLES');
    const roles = await capture(pg('pg_dumpall'), ['-w', '--roles-only', '--no-role-passwords'], { env, maxBytes: 4 * 1024 * 1024, report: report('pgDumpAllRoles') });
    if (/\bPASSWORD\s+'[^']+'/i.test(roles.toString('utf8'))) throw new Error('ROLE_PASSWORD_UNEXPECTED');
    const roleSql = roles.toString('utf8');
    for (const name of catalog.roles) {
      const quoted = '"' + name.replaceAll('"', '""') + '"';
      if (!roleSql.includes(`CREATE ROLE ${name};`) && !roleSql.includes(`CREATE ROLE ${quoted};`)) throw new Error('ROLE_COVERAGE_MISSING');
    }
    coverage.roleDefinitionsChecked = catalog.roles.length;
    const after = audit();
    for (const key of ['schemas', 'extensions', 'authCustomTriggers', 'migrationHistory', 'tableReadCoverage', 'browserMigrationAccess']) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) throw new Error('CATALOG_CHANGED_DURING_EXPORT');
    }
    const now = new Date();
    const recovery = Buffer.from(JSON.stringify({ format: 'wellbeing-postgresql-recovery-v1',
      source: `${project}/postgres`, exportedUtc: now.toISOString(), asiaJakarta: new Date(now.getTime()+25200000).toISOString().replace('Z','+07:00'),
      dump, ciphertextSHA256: await fileHash(mainFile), before, after, sourceCatalog: catalog, coverage, rolesSql: roles.toString('utf8'), archiveIndex: toc,
      roleSnapshotSeparateFromDump: true, coverageDescription: 'Native full database pg_dump; object owners/ACLs retained; default extension treatment. Database-level owner/ACL are in sourceCatalog.databaseMetadata for separate reviewed recreation; no --create restore is implied.',
      exclusions: ['Physical Storage bytes (none at audit)', 'Platform config and secrets', 'Custom role passwords', 'Extension-internal objects supplied by compatible target'],
      restoreChecklist: readFileSync(join(repo, 'docs/PHASE2-DATABASE-EXPORT-PLAN.md'), 'utf8') }));
    roles.fill(0);
    console.log('Encrypt the required recovery companion using the same privately entered passphrase.');
    stage('AWAITING_PRIVATE_COMPANION_ENCRYPTION');
    const metadata = await encryptStream({ age, destination: recoveryFile, buffer: recovery, encryptionEnv: encryptedEnv, reportCipher: report('companionEncryption') });
    recovery.fill(0);
    console.log('Re-enter the passphrase privately to verify the recovery companion.');
    stage('AWAITING_PRIVATE_COMPANION_VERIFICATION');
    const checked = await capture(age, ['--decrypt', recoveryFile], { env: encryptedEnv, allowStderr: true, report: report('companionDecryption') });
    if (sha(checked) !== metadata.sha256 || checked.length !== metadata.bytes) throw new Error('COMPANION_VERIFY_MISMATCH');
    checked.fill(0);
    const evidence = { status: 'EXPORTED_AND_LOCAL_ARCHIVE_VERIFIED_NOT_RESTORED', utc: new Date().toISOString(),
      processResults: progress.processResults, coverage,
      files: await Promise.all([mainFile, recoveryFile].map(async path => ({ name: path.split(/[/\\]/).at(-1), bytes: statSync(path).size, sha256: await fileHash(path) }))),
      plaintextDumpFilesCreated: false, integrity: 'Authenticated age decrypt, plaintext hash and pg_restore offline parse passed',
      uploaded: false, restored: false, hostedMigrationApplied: false };
    writeFileSync(join(run, 'verification.json'), JSON.stringify(evidence, null, 2), { flag: 'wx' });
    stage('EXPORTED_AND_LOCAL_ARCHIVE_VERIFIED_NOT_RESTORED');
    console.log(JSON.stringify(evidence, null, 2));
  } catch (error) {
    progress.failedStage = progress.status;
    progress.failureReason = safeFailure(error);
    stage('STOPPED_UNVERIFIED');
    if (created && !existsSync(join(run, 'INCOMPLETE.json'))) {
      writeFileSync(join(run, 'INCOMPLETE.json'), JSON.stringify({ status: 'INCOMPLETE_NOT_VERIFIED', retained: true }), { flag: 'wx' });
    }
    console.error('Export/verification stopped. Any ciphertext is retained and unverified. No raw diagnostics, rows or credentials logged.');
    console.error(`Stage: ${progress.failedStage}; reason: ${progress.failureReason}. STOP: do not type a passphrase after this message.`);
    process.exitCode = 1;
  } finally { if (env) env.PGPASSWORD = ''; }
}
