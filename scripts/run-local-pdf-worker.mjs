// Reuse the installed TypeScript bundler; no new package or application framework.
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
if (process.env.NODE_ENV !== "test" || !process.env.WELLBEING_PDF_WORKER_FILE) throw new Error("Explicit isolated local worker configuration required");
await mkdir(".tmp/phase4-sprint2", { recursive: true });
const outfile = resolve(".tmp/phase4-sprint2/pdf-worker.cjs");
await build({ entryPoints: ["src/lib/reports/local-worker-server.ts"], outfile, bundle: true, platform: "node", format: "cjs", packages: "external",
  alias: { "@": resolve("src"), "server-only": resolve("tests/server-only.ts") } });
const child = spawn(process.execPath, [outfile], { env: process.env, stdio: "inherit", windowsHide: true });
child.on("exit", code => { process.exitCode = code ?? 1; });
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
