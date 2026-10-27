// Synthetic transport tests only. No hosted configuration or database connection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { encryptStream, capture, cleanEnvironment } from '../scripts/phase2-encrypted-stream.mjs';
import { safeFailure } from '../scripts/phase2-db-failure.mjs';

const age = join(process.cwd(), '.tmp/age-v1.3.2/age/age.exe');
const keygen = join(process.cwd(), '.tmp/age-v1.3.2/age/age-keygen.exe');
const dir = mkdtempSync(join(process.cwd(), '.tmp/backup-stream-synthetic-'));
const identity = await capture(keygen, [], { allowStderr: true }); // Synthetic key stays in RAM.
const recipient = (await capture(keygen, ['-y', '-'], { input: identity })).toString().trim();
const data = randomBytes(2 * 1024 * 1024 + 7);
const sum = bytes => createHash('sha256').update(bytes).digest('hex');
let encrypted;

test('binary stream round trip and plaintext digest agree without plaintext disk staging', async () => {
  encrypted = join(dir, 'synthetic.bin.age');
  const result = await encryptStream({ age, args: ['--recipient', recipient], destination: encrypted, buffer: data });
  assert.equal(result.sha256, sum(data)); assert.equal(result.bytes, data.length);
  const restored = await capture(age, ['--decrypt', '-i', '-', encrypted], { input: identity });
  assert.deepEqual(restored, data);
  const file = readFileSync(encrypted);
  assert.ok(file.subarray(0, 40).toString().startsWith('age-encryption.org/v1'));
  assert.equal(file.includes(data.subarray(0, 256)), false);
});

test('existing ciphertext cannot be overwritten', async () => {
  const before = sum(readFileSync(encrypted));
  await assert.rejects(encryptStream({ age, args: ['--recipient', recipient], destination: encrypted, buffer: data }));
  assert.equal(sum(readFileSync(encrypted)), before);
});

test('successful child stdout is encrypted byte-for-byte through native binary pipes', async () => {
  const expected = Buffer.alloc(1024 * 1024 + 3, 0xa7);
  const path = join(dir, 'synthetic-producer.age');
  const result = await encryptStream({ age, args: ['--recipient', recipient], destination: path,
    producer: { exe: process.execPath, args: ['-e', 'process.stdout.write(Buffer.alloc(1024*1024+3,0xa7))'], env: cleanEnvironment() } });
  assert.equal(result.sha256, sum(expected));
  assert.deepEqual(await capture(age, ['--decrypt', '-i', '-', path], { input: identity }), expected);
});

test('tampered ciphertext fails authenticated decryption', async () => {
  const bytes = readFileSync(encrypted); bytes[bytes.length - 1] ^= 1;
  const path = join(dir, 'synthetic-tampered.age'); writeFileSync(path, bytes, { flag: 'wx' });
  await assert.rejects(capture(age, ['--decrypt', '-i', '-', path], { input: identity }));
});

test('producer failure cannot be mistaken for a successful encrypted backup', async () => {
  await assert.rejects(encryptStream({ age, args: ['--recipient', recipient], destination: join(dir, 'failed-producer.age'),
    producer: { exe: process.execPath, args: ['-e', 'process.stdout.write("synthetic");process.exit(9)'], env: cleanEnvironment() } }));
});

test('encryption failure prevents production from starting', async () => {
  const marker = join(dir, 'PRODUCER_MUST_NOT_START');
  await assert.rejects(encryptStream({ age, args: ['--recipient', 'invalid'], destination: join(dir, 'failed-encryption.age'),
    producer: { exe: process.execPath, args: ['-e', 'require("node:fs").writeFileSync(process.argv[1],"unexpected")', marker], env: cleanEnvironment() } }));
  assert.throws(() => readFileSync(marker));
});

test('default export executor is preparation only even with a hostile inherited URL', () => {
  const result = spawnSync(process.execPath, ['scripts/phase2-db-export.mjs', '--plan'], {
    encoding: 'utf8', env: { ...process.env, DIRECT_URL: 'DO_NOT_PRINT_OR_CONNECT' },
  });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).exportPerformed, false);
  assert.equal(result.stdout.includes('DO_NOT_PRINT_OR_CONNECT'), false);
});

test('header timeout is explicitly reported and never starts the producer', async () => {
  const marker = join(dir, 'TIMEOUT_PRODUCER_MUST_NOT_START');
  const results = [];
  await assert.rejects(encryptStream({ age: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'],
    destination: join(dir, 'timeout.age'), timeout: 150, reportCipher: result => results.push(result),
    producer: { exe: process.execPath, args: ['-e', 'require("node:fs").writeFileSync(process.argv[1],"unexpected")', marker], env: cleanEnvironment() }
  }), { message: 'PROCESS_TIMEOUT' });
  assert.ok(results.some(result => result.failureReason === 'PROCESS_TIMEOUT'));
  assert.throws(() => readFileSync(marker));
  assert.equal(readFileSync(join(dir, 'timeout.age')).length, 0);
});

test('failure classification never returns arbitrary diagnostic or environment text', () => {
  assert.equal(safeFailure(new Error('synthetic-private-diagnostic')), 'UNCLASSIFIED_FAILURE_REQUIRES_LOCAL_REVIEW');
  assert.equal(safeFailure(Object.assign(new Error('synthetic-private-diagnostic'), { code: 'EPIPE' })), 'BINARY_PIPE_FAILED');
  assert.equal(safeFailure(new Error('PROCESS_TIMEOUT')), 'PROCESS_TIMEOUT');
});
