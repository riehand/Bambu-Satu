import { expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openWorkerSessionStore } from "@/lib/reports/worker-session-store";

it("encrypts rotated sessions, survives restart and rejects concurrent writers/tampering", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wb-session-test-"));
  const path = join(directory, "session.bin");
  const key = "a".repeat(64);
  try {
    const first = await openWorkerSessionStore(path, key);
    await expect(openWorkerSessionStore(path, key)).rejects.toThrow();
    await first.storage.setItem("session", "synthetic-refresh-one");
    await first.storage.setItem("session", "synthetic-refresh-two");
    expect((await readFile(path)).includes(Buffer.from("synthetic-refresh"))).toBe(false);
    await first.close();
    const second = await openWorkerSessionStore(path, key);
    expect(await second.storage.getItem("session")).toBe("synthetic-refresh-two");
    await second.storage.removeItem("session");
    expect(await second.storage.getItem("session")).toBeNull();
    await second.close();
    const bytes = await readFile(path); bytes[15] ^= 1; await writeFile(path, bytes);
    await expect(openWorkerSessionStore(path, key)).rejects.toThrow("WORKER_SESSION_STORE_UNAVAILABLE");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
