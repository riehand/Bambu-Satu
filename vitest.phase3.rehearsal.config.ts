import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { assertPhase3RehearsalEnvironment } from "./scripts/phase3-safety.mjs";

assertPhase3RehearsalEnvironment();

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
  } },
  test: {
    environment: "node",
    include: ["tests/rehearsal/phase3.rehearsal.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
