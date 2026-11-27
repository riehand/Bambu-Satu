import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

// One hosted worker process per durable volume. A stale lock requires an operator
// to confirm that the old process has stopped; never silently steal a live lock.
export async function openWorkerSessionStore(path: string, keyHex: string) {
  if (!isAbsolute(path) || !/^[a-f0-9]{64}$/.test(keyHex)) throw new Error("WORKER_SESSION_STORE_REQUIRED");
  const key = Buffer.from(keyHex, "hex");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lock = await open(`${path}.lock`, "wx", 0o600);
  let values: Record<string, string> = {};
  let failed = false;
  let closed = false;
  let writes = Promise.resolve();
  const healthy = () => { if (failed || closed) throw new Error("WORKER_SESSION_STORE_UNAVAILABLE"); };
  try {
    let bytes: Buffer | undefined;
    try { bytes = await readFile(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (bytes) {
      if (bytes.length < 29 || bytes[0] !== 1) throw new Error();
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(1, 13));
      decipher.setAAD(Buffer.from("wellbeing-worker-session-v1"));
      decipher.setAuthTag(bytes.subarray(13, 29));
      values = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString("utf8"));
      if (!values || Array.isArray(values) || typeof values !== "object" || Object.values(values).some(v => typeof v !== "string")) throw new Error();
    }
  } catch {
    await lock.close(); await unlink(`${path}.lock`);
    throw new Error("WORKER_SESSION_STORE_UNAVAILABLE");
  }
  function persist(change: () => void) {
    const write = writes.then(async () => {
      healthy(); change();
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from("wellbeing-worker-session-v1"));
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(values)), cipher.final()]);
      const next = `${path}.${randomUUID()}.next`;
      try {
        const file = await open(next, "wx", 0o600);
        try { await file.writeFile(Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext])); await file.sync(); }
        finally { await file.close(); }
        await rename(next, path);
        if (process.platform !== "win32") {
          const directory = await open(dirname(path), "r");
          try { await directory.sync(); } finally { await directory.close(); }
        }
      } catch {
        failed = true;
        await unlink(next).catch(() => {});
        throw new Error("WORKER_SESSION_STORE_UNAVAILABLE");
      }
    });
    writes = write.catch(() => {});
    return write;
  }
  return {
    assertHealthy: healthy,
    storage: {
      async getItem(name: string) { await writes; healthy(); return values[name] ?? null; },
      async setItem(name: string, value: string) { await persist(() => { values[name] = value; }); },
      async removeItem(name: string) { await persist(() => { delete values[name]; }); },
    },
    async close() {
      await writes; closed = true;
      await lock.close(); await unlink(`${path}.lock`); key.fill(0);
    },
  };
}
