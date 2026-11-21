// Add Stage 3B after the unchanged Stage 2B.3 and Stage 3A rehearsals.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
if (!process.argv.includes("--create-approved-synthetic")) {
  console.log("Preparation only. Pass --create-approved-synthetic for a fresh isolated local PostgreSQL database.");
} else {
  let source = readFileSync(new URL("./phase3-rehearsal.mjs", import.meta.url), "utf8");
  const anchor = "rehearseC4AndLedger({ sql, migrate, copyMigrations, run, scratch, migrationNames });";
  if (source.split(anchor).length !== 2) throw new Error("Reviewed harness anchor changed; review required.");
  for (const dependency of ["phase3-safety.mjs", "stage2b3-rehearsal-checks.mjs"]) {
    source = source.replace(`"./${dependency}"`, JSON.stringify(new URL(`./${dependency}`, import.meta.url).href));
  }
  source = source.replace(anchor, `${anchor}
      stage = "Stage 3A lifecycle regression";
      verifyLocalContainer(port, image.Id);
      run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.stage3a.rehearsal.config.ts"]);
      stage = "Stage 3B additive migration";
      copyMigrations(["20261121000000_consultation_messages"]);
      migrate();
      migrationNames.push("20261121000000_consultation_messages");
      run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "status", "--schema", join(scratch, "schema.prisma")]);
      stage = "Stage 3B human chat authorization and concurrency";
      verifyLocalContainer(port, image.Id);
      run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.stage3b.rehearsal.config.ts"]);`);
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source, "--", "--create-approved-synthetic", "--stage2b3"], {
    cwd: root, env: process.env, stdio: "inherit", windowsHide: true,
  });
  process.exitCode = result.status ?? 1;
}
