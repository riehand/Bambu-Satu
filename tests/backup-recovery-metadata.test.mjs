import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { buildRecoveryMetadata, dumpSHA256, parseRecordedJson } from '../scripts/phase2-recovery-metadata.mjs';
import { capture, encryptStream } from '../scripts/phase2-encrypted-stream.mjs';
const verified = parseRecordedJson(readFileSync('docs/evidence/PHASE2-DATABASE-RETRY01-VERIFY01-20261027.json', 'utf8'));
const audit = parseRecordedJson(readFileSync('docs/evidence/PHASE2-DATABASE-BACKUP-PREFLIGHT-20261026.json', 'utf8'));
test('historical Windows UTF-8 BOM records are read without rewriting their evidence', () => {
  assert.deepEqual(parseRecordedJson('\uFEFF{"synthetic":true}'), { synthetic: true });
});
test('allowlisted metadata binds the dump and explicitly preserves missing-role and grant limitations', () => {
  const value = buildRecoveryMetadata({ ...verified, unexpectedPrivateField: 'synthetic-not-for-output' }, { ...audit, unexpectedPrivateField: 'synthetic-not-for-output' });
  assert.equal(value.dump.sha256, dumpSHA256); assert.equal(value.dump.bytes, 379522);
  assert.equal(value.roles.definitionsCaptured, false); assert.equal(value.databaseOwnershipAndGrants.owner, null);
  assert.equal(JSON.stringify(value).includes('synthetic-not-for-output'), false);
  assert.equal(Object.keys(value.archiveVerification.requiredObjectChecks).length, 20);
  assert.equal(value.dependencies.extensions.length, 5);
});
test('mismatched dump identity or incomplete verification cannot be packaged as verified', () => {
  assert.throws(() => buildRecoveryMetadata({ ...verified, input: { ...verified.input, sha256: 'INVALID' } }, audit));
  assert.throws(() => buildRecoveryMetadata({ ...verified, locallyVerified: false }, audit));
});
test('synthetic JSON encrypts and authenticates through binary memory pipes without plaintext files', async () => {
  const age = join(process.cwd(), '.tmp/age-v1.3.2/age/age.exe');
  const keygen = join(process.cwd(), '.tmp/age-v1.3.2/age/age-keygen.exe');
  const dir = mkdtempSync(join(process.cwd(), '.tmp/recovery-synthetic-'));
  const identity = await capture(keygen, [], { allowStderr: true });
  const recipient = (await capture(keygen, ['-y', '-'], { input: identity })).toString().trim();
  const original = Buffer.from(JSON.stringify({ format: 'synthetic-only', numbers: [0, 255, 65539], note: 'dummy metadata' }));
  const output = join(dir, 'synthetic.age');
  await encryptStream({ age, args: ['--recipient', recipient], destination: output, buffer: original });
  const decoded = await capture(age, ['--decrypt', '-i', '-', output], { input: identity });
  assert.deepEqual(decoded, original); assert.deepEqual(JSON.parse(decoded), JSON.parse(original));
  decoded.fill(0); identity.fill(0);
});
