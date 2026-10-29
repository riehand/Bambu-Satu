import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const serverUrl = "http://127.0.0.1:4173/";
let server;
let testRunner;
let interrupted = false;

function waitForClose(child) {
  return new Promise((resolve) => {
    child.once("error", () => resolve(1));
    child.once("close", (code) => resolve(code ?? 1));
  });
}

function stop(child) {
  if (child && child.exitCode === null && child.signalCode === null) child.kill();
}

const interrupt = () => {
  interrupted = true;
  stop(testRunner);
};
process.on("SIGINT", interrupt);

try {
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--config", "tests/visual/vite.config.ts"], {
    stdio: "inherit", windowsHide: true,
  });
  const serverExit = waitForClose(server);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) break;
    try {
      const response = await fetch(serverUrl);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The fixture server is still starting.
    }
    await delay(250);
  }
  if (!ready) throw new Error(`The local browser fixture server did not become ready at ${serverUrl}.`);

  testRunner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
    stdio: "inherit", windowsHide: true,
    env: { ...process.env, PHASE3_BROWSER_SERVER_READY: "1" },
  });
  process.exitCode = await waitForClose(testRunner);
  if (interrupted) process.exitCode = 130;

  stop(server);
  await serverExit;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Browser test setup failed.");
  process.exitCode = 1;
} finally {
  stop(testRunner);
  stop(server);
  process.off("SIGINT", interrupt);
}
