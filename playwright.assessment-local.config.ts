import { defineConfig } from "@playwright/test";

// A separately provisioned real local Next/Auth/database stack is required.
// This never starts a mock Auth server or connects to hosted Supabase.
export default defineConfig({
  testDir: "./tests/local-website", workers: 1, fullyParallel: false,
  timeout: 180000, expect: { timeout: 30000 },
  outputDir: ".tmp/phase4-sprint1/browser-results",
  use: { baseURL: "http://127.0.0.1:55430", headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", screenshot: "only-on-failure" },
});
