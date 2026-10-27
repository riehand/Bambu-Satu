// Local synthetic data ONLY. No database tools, environment loader or network.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { capture, encryptStream } from './phase2-encrypted-stream.mjs';
import { safeFailure } from './phase2-db-failure.mjs';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const age = join(repo, '.tmp/age-v1.3.2/age/age.exe');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dir = mkdtempSync(join(repo, '.tmp/age-private-prompt-check-'));
const evidence = { scope: 'LOCAL_SYNTHETIC_ONLY', databaseConnection: false,
  startedUtc: new Date().toISOString(), status: 'AWAITING_SYNTHETIC_PRIVATE_PROMPT', processResults: {} };
const save = () => writeFileSync(join(dir, 'status.json'), JSON.stringify(evidence, null, 2));
const report = name => result => { evidence.processResults[name] = result; save(); };
save();
try {
  if (hash(readFileSync(age)) !== '2821a4ed191da07372acd302e5f6feae7a7985e285e1417765ebe74025af45f0') throw new Error('TOOL_OR_CA_CHANGED');
  console.log('LOCAL SYNTHETIC PROMPT CHECK. No database connection or export.');
  console.log('Choose a disposable NONEMPTY test passphrase. Do not use the compromised or future database passphrase.');
  console.log('Type ONLY when age displays Enter passphrase or Confirm passphrase. Input must not echo.');
  console.log('If the prompt is absent, input echoes, or STOP appears: do not type; close this window.');
  const data = Buffer.alloc(65539, 0x59);
  const file = join(dir, 'synthetic.age');
  const result = await encryptStream({ age, destination: file, buffer: data, reportCipher: report('encryption') });
  evidence.status = 'AWAITING_SYNTHETIC_DECRYPT_PROMPT'; save();
  console.log('Enter the same disposable test passphrase ONLY at the age decryption prompt.');
  const decrypted = await capture(age, ['--decrypt', file], { allowStderr: true, report: report('decryption') });
  if (result.sha256 !== hash(data) || hash(decrypted) !== hash(data) || decrypted.length !== data.length) throw new Error('SYNTHETIC_VERIFY_MISMATCH');
  decrypted.fill(0); data.fill(0);
  evidence.status = 'SYNTHETIC_PRIVATE_PROMPT_AND_BINARY_ROUND_TRIP_PASSED';
  console.log('PASS: synthetic encryption and authenticated in-memory decryption matched. No database operation occurred.');
} catch (error) {
  evidence.failedStage = evidence.status; evidence.status = 'STOPPED_SYNTHETIC_CHECK';
  evidence.failureReason = safeFailure(error); process.exitCode = 1;
  console.error(`STOP: ${evidence.failureReason}. Do not type any passphrase now.`);
} finally { evidence.finishedUtc = new Date().toISOString(); save(); }
