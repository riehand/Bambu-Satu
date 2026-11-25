// Hanya container sintetis baru; tidak menerima URL target dari pemanggil.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.argv.includes("--create-approved-synthetic")) {
  console.log("Persiapan saja. --create-approved-synthetic diperlukan untuk rehearsal lokal baru.");
} else {
  let source = readFileSync(new URL("./phase3-rehearsal.mjs", import.meta.url), "utf8");
  function replaceOnce(anchor, replacement) {
    if (source.split(anchor).length !== 2) throw new Error("Anchor harness berubah; review diperlukan.");
    source = source.replace(anchor, replacement);
  }
  for (const dependency of ["phase3-safety.mjs", "stage2b3-rehearsal-checks.mjs"]) {
    replaceOnce(`"./${dependency}"`, JSON.stringify(new URL(`./${dependency}`, import.meta.url).href));
  }
  source = `import { rehearseSecurity } from ${JSON.stringify(new URL("./stage3e1-security-checks.mjs", import.meta.url).href)};\n` + source;
  // Clone baseline dua migrasi dari database BARU invocation ini, bukan dump hosted.
  const baseline = "    copyMigrations(migrationNames.slice(2));";
  replaceOnce(baseline, `
    stage = "Stage 3E.1 clone baseline sintetis dua migrasi";
    sql("CREATE DATABASE wellbeing_stage3e1_deployer TEMPLATE wellbeing_phase3_rehearsal;");
${baseline}`);
  const anchor = "rehearseC4AndLedger({ sql, migrate, copyMigrations, run, scratch, migrationNames });";
  replaceOnce(anchor, `${anchor}
      stage = "Stage 3A regresi postgres";
      verifyLocalContainer(port, image.Id);
      run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.stage3a.rehearsal.config.ts"]);
      stage = "Stage 3B regresi postgres";
      copyMigrations(["20261121000000_consultation_messages"]);
      migrate(); migrationNames.push("20261121000000_consultation_messages");
      run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.stage3b.rehearsal.config.ts"]);
      stage = "Stage 3C regresi postgres";
      verifyLocalContainer(port, image.Id);
      run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.stage3c.rehearsal.config.ts"]);
      stage = "Stage 3E.1 role dan privilege";
      rehearseSecurity({ sql, run, env, scratch, container, verify: () => verifyLocalContainer(port, image.Id) });`);
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", source, "--", "--create-approved-synthetic", "--stage2b3"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)), env: process.env, stdio: "inherit", windowsHide: true,
  });
  process.exitCode = result.status ?? 1;
}
