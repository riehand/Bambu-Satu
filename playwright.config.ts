import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"./tests/browser",fullyParallel:false,workers:1,timeout:30000,
  use:{baseURL:"http://127.0.0.1:4173",headless:true,channel:process.env.PLAYWRIGHT_CHANNEL??"chrome",screenshot:"only-on-failure"},
  webServer:{command:"npx vite --config tests/visual/vite.config.ts",url:"http://127.0.0.1:4173",reuseExistingServer:false,timeout:30000},
});
