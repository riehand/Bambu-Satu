// Binary-only pipes: no PowerShell text pipeline, plaintext files or raw diagnostics.
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const LIMIT = 128 * 1024 * 1024;
export function cleanEnvironment() {
  return { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH,
    TEMP: process.env.TEMP, TMP: process.env.TMP };
}

function track(child, { allowStderr = false, timeout = 15 * 60 * 1000, report = () => {}, classifyStderr } = {}) {
  let stderrBytes = 0;
  let failureReason;
  let privateDiagnostic = '';
  let diagnosticCategory;
  const status = exitCode => ({ exitCode, stderrBytes, ...(failureReason ? { failureReason } : {}), ...(diagnosticCategory ? { diagnosticCategory } : {}) });
  child.stderr?.on('data', chunk => {
    stderrBytes += chunk.length;
    if (classifyStderr && privateDiagnostic.length < 8192) privateDiagnostic += chunk.toString('utf8').slice(0, 8192 - privateDiagnostic.length);
  });
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      failureReason = 'PROCESS_TIMEOUT'; report(status(null));
      child.kill(); reject(new Error(failureReason));
    }, timeout);
    child.once('error', () => {
      clearTimeout(timer); failureReason = 'PROCESS_START_FAILED'; report(status(null));
      reject(new Error(failureReason));
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (classifyStderr && code !== 0) diagnosticCategory = classifyStderr(privateDiagnostic);
      privateDiagnostic = '';
      if (!failureReason && (code !== 0 || (!allowStderr && stderrBytes !== 0))) failureReason = 'PROCESS_FAILED_OR_WARNED';
      report(status(code));
      if (code !== 0 || (!allowStderr && stderrBytes !== 0)) reject(new Error('PROCESS_FAILED_OR_WARNED'));
      else resolve({ code, stderrBytes });
    });
  });
  // Attach immediately even if the caller is still draining stdout.
  result.catch(() => {});
  return result;
}

export async function capture(exe, args, { env = cleanEnvironment(), input, maxBytes = LIMIT, allowStderr = false, report, classifyStderr } = {}) {
  const child = spawn(exe, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: false });
  const finished = track(child, { allowStderr, report, classifyStderr });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  const chunks = []; let bytes = 0;
  try {
    for await (const chunk of child.stdout) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new Error('MEMORY_LIMIT_EXCEEDED');
      chunks.push(chunk);
    }
    await finished;
    const result = Buffer.concat(chunks);
    for (const chunk of chunks) chunk.fill(0);
    return result;
  } catch (error) { child.kill(); for (const chunk of chunks) chunk.fill(0); throw error; }
}

export async function consume(exe, args, input, env = cleanEnvironment(), report) {
  const child = spawn(exe, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const finished = track(child, { report });
  child.stdout.on('data', () => {}); // Deparsed SQL is consumed in memory, never printed/written.
  const sending = pipeline(Readable.from([input]), child.stdin);
  try { await Promise.all([finished, sending]); }
  catch (error) { child.kill(); throw error; }
}

export async function encryptStream({ age, args = ['--passphrase'], destination, producer, buffer,
  encryptionEnv = cleanEnvironment(), reportCipher, reportProducer, timeout }) {
  // wx prevents truncation of any existing ciphertext. Partial failures are retained.
  const output = createWriteStream(destination, { flags: 'wx' });
  await new Promise((resolve, reject) => { output.once('open', resolve); output.once('error', reject); });
  const cipher = spawn(age, args, { env: encryptionEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: false });
  const cipherDone = track(cipher, { allowStderr: true, report: reportCipher, timeout });
  cipher.stdin.on('error', () => {});
  const hash = createHash('sha256'); let bytes = 0; let source;
  const digest = new Transform({ transform(chunk, _encoding, done) {
    bytes += chunk.length;
    if (bytes > LIMIT) return done(new Error('MEMORY_LIMIT_EXCEEDED'));
    hash.update(chunk); done(null, chunk);
  } });
  // The header is emitted only after interactive key setup. No producer starts if
  // the console/password step fails; encryption never inherits DB credentials.
  const ready = new Promise((resolve, reject) => {
    cipher.stdout.once('data', resolve);
    cipherDone.then(() => reject(new Error('NO_ENCRYPTION_HEADER')), reject);
  });
  const writing = pipeline(cipher.stdout, output);
  writing.catch(() => {});
  try {
    await ready;
    let producing;
    if (producer) {
      source = spawn(producer.exe, producer.args, { env: producer.env,
        stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      const sourceDone = track(source, { report: reportProducer });
      producing = Promise.all([pipeline(source.stdout, digest, cipher.stdin), sourceDone]);
    } else producing = pipeline(Readable.from([buffer]), digest, cipher.stdin);
    await Promise.all([producing, cipherDone, writing]);
    return { bytes, sha256: hash.digest('hex') };
  } catch (error) {
    source?.kill(); cipher.kill(); output.destroy();
    throw error;
  }
}
