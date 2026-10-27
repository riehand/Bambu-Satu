// Synthetic encryption, offline-parser rejection, and metadata inspection only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { capture, consume, encryptStream, cleanEnvironment } from '../scripts/phase2-encrypted-stream.mjs';
import { inspectArchiveToc, ageDiagnosticCategory } from '../scripts/phase2-db-archive-inspection.mjs';
const age = join(process.cwd(), '.tmp/age-v1.3.2/age/age.exe');
const keygen = join(process.cwd(), '.tmp/age-v1.3.2/age/age-keygen.exe');
const restore = join(process.cwd(), '.tmp/postgresql17-client-tools/pgsql/bin/pg_restore.exe');
const dir = mkdtempSync(join(process.cwd(), '.tmp/verify-only-synthetic-'));
const identity = await capture(keygen, [], { allowStderr: true });
const recipient = (await capture(keygen, ['-y', '-'], { input: identity })).toString().trim();
const original = randomBytes(1024 * 1024 + 7);
const file = join(dir, 'synthetic.age');
await encryptStream({ age, args: ['--recipient', recipient], destination: file, buffer: original });
const digest = value => createHash('sha256').update(value).digest('hex');

test('synthetic ciphertext decrypts byte-for-byte through reviewed capture with sanitized diagnostics', async () => {
  const before = digest(readFileSync(file)); const results = [];
  const decoded = await capture(age, ['--decrypt', '-i', '-', file], { input: identity, allowStderr: true, classifyStderr: ageDiagnosticCategory, report: result => results.push(result) });
  assert.deepEqual(decoded, original); decoded.fill(0);
  assert.equal(results[0].exitCode, 0); assert.equal(digest(readFileSync(file)), before);
});
test('tampered synthetic ciphertext fails once and only a fixed diagnostic category leaves memory', async () => {
  const bytes = readFileSync(file); bytes[bytes.length - 1] ^= 1;
  const bad = join(dir, 'tampered.age'); writeFileSync(bad, bytes, { flag: 'wx' });
  const results = [];
  await assert.rejects(capture(age, ['--decrypt', '-i', '-', bad], { input: identity, allowStderr: true, classifyStderr: ageDiagnosticCategory, report: result => results.push(result) }));
  assert.equal(results.length, 1); assert.equal(results[0].exitCode, 1);
  assert.match(results[0].diagnosticCategory, /^[A-Z_]+$/);
  assert.equal(ageDiagnosticCategory('arbitrary synthetic-private-message'), 'AGE_FAILURE_UNCLASSIFIED_RAW_TEXT_SUPPRESSED');
  assert.equal(ageDiagnosticCategory('failed to decrypt and authenticate file key'), 'FILE_KEY_AUTHENTICATION_FAILED_CAUSE_UNDETERMINED');
});
test('TOC coverage separates definitions, data, policies and grants without printing member names', () => {
  const result = inspectArchiveToc('1; 0 1 TABLE public users synthetic_owner\n2; 0 2 TABLE DATA public users synthetic_owner\n3; 0 3 POLICY public users users_read_own_active_profile synthetic_owner\n4; 0 4 ACL public TABLE users synthetic_owner\n');
  assert.equal(result.counts.TABLE, 1); assert.equal(result.counts['TABLE DATA'], 1);
  assert.equal(result.checks.profilePolicy, true); assert.equal(result.checks.profilePrivileges, true);
  assert.ok(result.missingRequiredChecks.includes('authUsersData'));
  assert.equal(JSON.stringify(result).includes('synthetic_owner'), false);
});
test('offline pg_restore rejects synthetic non-archive input without any database connection', async () => {
  const results = [];
  await assert.rejects(consume(restore, ['--file=-'], Buffer.from('synthetic invalid archive'), cleanEnvironment(), result => results.push(result)));
  assert.equal(results[0].exitCode, 1);
});
test('verification default only plans despite hostile inherited database variables', () => {
  const result = spawnSync(process.execPath, ['scripts/phase2-db-verify-retry01.mjs'], { encoding: 'utf8', env: { ...cleanEnvironment(), DATABASE_URL: 'DO_NOT_USE_OR_PRINT' } });
  assert.equal(result.status, 0); assert.equal(JSON.parse(result.stdout).decryptPerformed, false);
  assert.equal(result.stdout.includes('DO_NOT_USE_OR_PRINT'), false);
});
