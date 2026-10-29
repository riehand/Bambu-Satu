import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"./tests/browser",fullyParallel:false,workers:1,timeout:30000,
  use:{baseURL:"http://127.0.0.1:4173",headless:true,channel:process.env.PLAYWRIGHT_CHANNEL??"chrome",screenshot:"only-on-failure"},
  webServer:{command:`"${process.execPath}" node_modules/vite/bin/vite.js --config tests/visual/vite.config.ts`,url:"http://127.0.0.1:4173",reuseExistingServer:process.env.PHASE3_BROWSER_SERVER_READY==="1",timeout:30000},
});
