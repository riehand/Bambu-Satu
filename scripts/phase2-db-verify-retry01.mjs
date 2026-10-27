// One approved local-only verification. No env loader, pg_dump, psql, DB or network.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { capture, consume, cleanEnvironment } from './phase2-encrypted-stream.mjs';
import { safeFailure } from './phase2-db-failure.mjs';
import { ageDiagnosticCategory, inspectArchiveToc } from './phase2-db-archive-inspection.mjs';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const file = 'D:\\WellBeingHub-Backups\\Supabase-Phase2-20261026-Retry01\\database.dump.age';
const expectedHash = '4F77589A80907C7F64B97353CFF55BCD1BC30D9FF8CA9FCBEE93DBD80214CEA5';
const evidencePath = join(repo, 'docs/evidence/PHASE2-DATABASE-RETRY01-VERIFY01-20261027.json');
const age = join(repo, '.tmp/age-v1.3.2/age/age.exe');
const restore = join(repo, '.tmp/postgresql17-client-tools/pgsql/bin/pg_restore.exe');
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
function checkInput() {
  const item = lstatSync(file);
  if (!item.isFile() || item.isSymbolicLink() || realpathSync(file).toLowerCase() !== file.toLowerCase() || item.size !== 379522 || hash(readFileSync(file)) !== expectedHash) throw new Error('DUMP_VERIFY_MISMATCH');
  return { path: file, bytes: item.size, sha256: expectedHash, unchanged: true };
}
if (process.argv.length !== 3 || process.argv[2] !== '--verify-approved') {
  console.log(JSON.stringify({ mode: 'PLAN_ONLY', productionConnection: false, file, decryptPerformed: false }));
} else {
  const evidence = { status: 'LOCAL_PREFLIGHT', startedUtc: new Date().toISOString(), processResults: {},
    productionConnection: false, exportPerformed: false, restored: false, uploaded: false,
    recoveryCompanionCreated: false, plaintextDumpFilesCreated: false };
  let created = false; let plaintext; let schema;
  const save = () => { if (created) writeFileSync(evidencePath, JSON.stringify(evidence, null, 2)); };
  const report = name => result => { evidence.processResults[name] = result; save(); };
  const stage = name => { evidence.status = name; evidence.updatedUtc = new Date().toISOString(); save(); };
  try {
    // Exclusive record prevents inadvertently consuming a second verification attempt.
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), { flag: 'wx' }); created = true;
    process.report.reportOnFatalError = false; process.report.reportOnSignal = false; process.report.reportOnUncaughtException = false;
    evidence.input = checkInput(); save();
    if (hash(readFileSync(age)) !== '2821A4ED191DA07372ACD302E5F6FEAE7A7985E285E1417765EBE74025AF45F0') throw new Error('TOOL_OR_CA_CHANGED');
    const version = (await capture(restore, ['--version'])).toString('utf8');
    if (!version.includes('(PostgreSQL) 17.11')) throw new Error('PG_VERSION_CHANGED');
    stage('AWAITING_ONE_PRIVATE_RETRY01_DECRYPTION');
    console.log('LOCAL VERIFICATION ONLY. No database connection or export.');
    console.log('At age Enter passphrase: enter the SAME passphrase used to encrypt Retry01. Do not choose a new one.');
    console.log('Never use the earlier compromised passphrase. Input must stay hidden. Do not type after STOP or at PS.');
    plaintext = await capture(age, ['--decrypt', file], { allowStderr: true, classifyStderr: ageDiagnosticCategory, report: report('ageDecryption') });
    evidence.authenticatedDecryptionPassed = true;
    if (plaintext.subarray(0, 5).toString('ascii') !== 'PGDMP') throw new Error('DUMP_VERIFY_MISMATCH');
    evidence.postgresqlCustomMagicPassed = true;
    stage('INSPECTING_ARCHIVE_IN_MEMORY');
    const toc = await capture(restore, ['--list'], { input: plaintext, maxBytes: 16 * 1024 * 1024, report: report('archiveList') });
    evidence.coverage = inspectArchiveToc(toc.toString('utf8')); toc.fill(0); save();
    stage('PARSING_COMPLETE_ARCHIVE_WITHOUT_RESTORING');
    await consume(restore, ['--file=-'], plaintext, cleanEnvironment(), report('fullArchiveParse'));
    evidence.fullArchiveReadable = true; save();
    schema = await capture(restore, ['--schema-only', '--file=-'], { input: plaintext, maxBytes: 16 * 1024 * 1024, report: report('schemaParse') });
    const sql = schema.toString('utf8');
    evidence.schemaSummary = {
      ownerStatements: (sql.match(/\bOWNER TO\b/g) || []).length,
      grantStatements: (sql.match(/^GRANT /gm) || []).length,
      revokeStatements: (sql.match(/^REVOKE /gm) || []).length,
      policyStatements: (sql.match(/^CREATE POLICY /gm) || []).length,
      profileRlsEnabled: /ALTER TABLE public\.users ENABLE ROW LEVEL SECURITY;/.test(sql),
      profilePolicyPresent: /CREATE POLICY users_read_own_active_profile ON public\.users\b/.test(sql),
    };
    schema.fill(0); plaintext.fill(0);
    evidence.inputAfterVerification = checkInput();
    if (evidence.coverage.missingRequiredChecks.length || !evidence.schemaSummary.profileRlsEnabled || !evidence.schemaSummary.profilePolicyPresent || !evidence.schemaSummary.ownerStatements || !evidence.schemaSummary.grantStatements) throw new Error('REQUIRED_COVERAGE_MISSING');
    evidence.locallyVerified = true; evidence.workflowExitCode = 0;
    evidence.limitations = ['No fresh/live catalog comparison', 'Prisma history data entry present; row/checksum comparison not performed', 'Role definitions and database-level ownership/grants require recovery companion', 'Managed extension/service dependencies and actual restoration untested'];
    stage('LOCALLY_VERIFIED_NOT_RESTORED_PACKAGE_INCOMPLETE');
    console.log('PASS: authenticated decryption and full offline PostgreSQL parsing passed. Dump locally verified; no restore.');
  } catch (error) {
    evidence.failedStage = evidence.status; evidence.failureReason = safeFailure(error);
    evidence.locallyVerified = false; evidence.workflowExitCode = 1; stage('STOPPED_NO_AUTOMATIC_RETRY');
    console.error(`STOP: ${evidence.failureReason}. No further attempt. Do not type another passphrase.`);
    process.exitCode = 1;
  } finally { plaintext?.fill(0); schema?.fill(0); evidence.finishedUtc = new Date().toISOString(); save(); }
}
