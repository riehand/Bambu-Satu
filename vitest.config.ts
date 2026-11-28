import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
  } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      all: true,
      include: [
        "src/lib/{auth,assessment,reports,appointments,psychologist,consultations,admin}/**/*.ts",
        "src/app/api/{auth,assessment,reports,appointments,consents,psychologist,psychologists,consultations,admin}/**/route.ts",
        "src/app/auth/confirm/route.ts",
      ],
      reporter: ["text", "html", "json", "json-summary"],
    },
  },
});
