// Reuse the reviewed harness without editing the uncommitted Stage 2B.3 files.
// The insertion is exact/fail-closed and runs only after the full seven migrations.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
if (!process.argv.includes("--create-approved-synthetic")) {
  console.log("Preparation only. Pass --create-approved-synthetic to create a fresh local synthetic PostgreSQL rehearsal.");
} else {
  let source = readFileSync(new URL("./phase3-rehearsal.mjs", import.meta.url), "utf8");
  const anchor = "rehearseC4AndLedger({ sql, migrate, copyMigrations, run, scratch, migrationNames });";
  if (source.split(anchor).length !== 2) throw new Error("Reviewed harness anchor changed; review required before rehearsal.");
  for (const dependency of ["phase3-safety.mjs", "stage2b3-rehearsal-checks.mjs"]) {
    source = source.replace(`"./${dependency}"`, JSON.stringify(new URL(`./${dependency}`, import.meta.url).href));
  }
  source = source.replace(anchor, `${anchor}
      stage = "Stage 3A consultation lifecycle";
      verifyLocalContainer(port, image.Id);
      run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.stage3a.rehearsal.config.ts"]);`);
  // node -e argv[1] is the first flag; the existing harness uses includes().
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source, "--", "--create-approved-synthetic", "--stage2b3"], {
    cwd: root, env: process.env, stdio: "inherit", windowsHide: true,
  });
  process.exitCode = result.status ?? 1;
}
