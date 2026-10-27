import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { assertRehearsalEnvironment } from "./scripts/phase2-safety.mjs";
assertRehearsalEnvironment();
export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
  } },
  test: { environment: "node", include: ["tests/rehearsal/*.rehearsal.ts"],
    fileParallelism: false, maxWorkers: 1, testTimeout: 30000, hookTimeout: 30000 },
});
