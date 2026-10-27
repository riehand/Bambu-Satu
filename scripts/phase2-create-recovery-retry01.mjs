// Local metadata only. Never imports an env loader or invokes database clients.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, statSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { capture, encryptStream } from './phase2-encrypted-stream.mjs';
import { buildRecoveryMetadata, dumpSHA256, parseRecordedJson } from './phase2-recovery-metadata.mjs';
import { ageDiagnosticCategory } from './phase2-db-archive-inspection.mjs';
import { safeFailure } from './phase2-db-failure.mjs';
const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const run = 'D:\\WellBeingHub-Backups\\Supabase-Phase2-20261026-Retry01';
const dumpFile = join(run, 'database.dump.age'), output = join(run, 'recovery.json.age');
const record = join(repo, 'docs/evidence/PHASE2-DATABASE-RETRY01-COMPANION-20261027.json');
const age = join(repo, '.tmp/age-v1.3.2/age/age.exe');
const hash = data => createHash('sha256').update(data).digest('hex').toUpperCase();
const load = filename => parseRecordedJson(readFileSync(join(repo, 'docs/evidence', filename), 'utf8'));
function checkDump() {
  if (realpathSync(dumpFile).toLowerCase() !== dumpFile.toLowerCase() || statSync(dumpFile).size !== 379522 || hash(readFileSync(dumpFile)) !== dumpSHA256) throw new Error('DUMP_VERIFY_MISMATCH');
  return { filename: 'database.dump.age', bytes: 379522, sha256: dumpSHA256, unchanged: true };
}
if (process.argv.length !== 3 || process.argv[2] !== '--create-approved') {
  console.log(JSON.stringify({ mode: 'PLAN_ONLY', productionConnection: false, encryptedOutput: output, companionCreated: false }));
} else {
  const status = { status: 'LOCAL_PREFLIGHT', startedUtc: new Date().toISOString(), processResults: {}, productionConnection: false,
    newDatabaseExport: false, plaintextRecoveryFileCreated: false, restored: false, uploaded: false };
  let registered = false; let metadata; let verified;
  const save = () => { if(registered) writeFileSync(record, JSON.stringify(status, null, 2)); };
  const report = name => value => { status.processResults[name] = value; save(); };
  const stage = value => { status.status = value; status.updatedUtc = new Date().toISOString(); save(); };
  try {
    writeFileSync(record, JSON.stringify(status, null, 2), { flag: 'wx' }); registered = true;
    process.report.reportOnFatalError = false; process.report.reportOnSignal = false; process.report.reportOnUncaughtException = false;
    if (existsSync(output)) throw Object.assign(new Error('OUTPUT_ALREADY_EXISTS'), { code: 'EEXIST' });
    const safety = await capture(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoProfile', '-NonInteractive', '-File', join(repo, 'scripts/phase2-recovery-destination.ps1')], { report: report('destinationCheck') });
    if (JSON.parse(safety.toString('utf8')).safe !== true) throw new Error('DESTINATION_CHECK_FAILED');
    status.dumpBefore = checkDump();
    if (hash(readFileSync(age)) !== '2821A4ED191DA07372ACD302E5F6FEAE7A7985E285E1417765EBE74025AF45F0') throw new Error('TOOL_OR_CA_CHANGED');
    const value = buildRecoveryMetadata(load('PHASE2-DATABASE-RETRY01-VERIFY01-20261027.json'), load('PHASE2-DATABASE-BACKUP-PREFLIGHT-20261026.json'));
    metadata = Buffer.from(JSON.stringify(value));
    const expectedPlainHash = hash(metadata);
    stage('AWAITING_PRIVATE_COMPANION_ENCRYPTION');
    console.log('RECOVERY COMPANION ONLY. No database connection or export.');
    console.log('At age Enter/Confirm passphrase prompts, enter the EXISTING Retry01 encryption passphrase, nonempty. Do not choose a new one.');
    console.log('Input must stay hidden. Never use the earlier compromised passphrase. Never type at PS or after STOP.');
    await encryptStream({ age, destination: output, buffer: metadata, reportCipher: report('ageEncryption') });
    metadata.fill(0);
    stage('AWAITING_PRIVATE_COMPANION_VERIFICATION');
    console.log('At age Enter passphrase: use the same Retry01 passphrase to authenticate the companion in memory.');
    verified = await capture(age, ['--decrypt', output], { allowStderr: true, maxBytes: 4 * 1024 * 1024, classifyStderr: ageDiagnosticCategory, report: report('ageDecryption') });
    if (hash(verified) !== expectedPlainHash) throw new Error('COMPANION_VERIFY_MISMATCH');
    const parsed = JSON.parse(verified.toString('utf8'));
    if (JSON.stringify(parsed) !== JSON.stringify(value) || parsed.dump.sha256 !== dumpSHA256 || parsed.dump.bytes !== 379522 || parsed.roles.definitionsCaptured !== false || parsed.databaseOwnershipAndGrants.owner !== null) throw new Error('COMPANION_VERIFY_MISMATCH');
    verified.fill(0);
    status.dumpAfter = checkDump();
    status.companion = { path: output, bytes: statSync(output).size, sha256: hash(readFileSync(output)) };
    status.authenticatedDecryptionPassed = true; status.structureAndDumpReferencePassed = true;
    status.coverage = { roleReconstructionGuidance: true, exactRoleDefinitionsCaptured: false, exactDatabaseOwnerAndGrantsCaptured: false,
      permissionsNotes: true, versionsAndExtensionDependencies: true, verifiedDumpReference: true, archiveCoverageAndLimitations: true, isolatedRestoreInstructions: true, managedPlatformRecreationNotes: true };
    status.readyForManualUploadWithDocumentedDependencies = true; status.workflowExitCode = 0;
    stage('COMPANION_LOCALLY_VERIFIED_PACKAGE_READY_FOR_MANUAL_UPLOAD_NOT_RESTORED');
    console.log('PASS: companion encrypted, authenticated and structure/reference verified. Dump unchanged. No restore or upload.');
  } catch (error) {
    status.failedStage = status.status; status.failureReason = safeFailure(error); status.workflowExitCode = 1;
    stage('STOPPED_UNVERIFIED_NO_RETRY'); console.error(`STOP: ${status.failureReason}. Any output retained unverified. Do not type another passphrase.`);
    process.exitCode = 1;
  } finally { metadata?.fill(0); verified?.fill(0); status.finishedUtc = new Date().toISOString(); save(); }
}
