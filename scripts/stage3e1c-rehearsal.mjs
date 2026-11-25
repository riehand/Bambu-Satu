// Reuse harness yang sudah direview tanpa mengubah berkas Stage 3E.1.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
if (!process.argv.includes("--create-approved-synthetic")) {
  console.log("Persiapan saja; --create-approved-synthetic diperlukan untuk container lokal baru.");
} else {
  let source = readFileSync(new URL("./stage3e1-rehearsal.mjs",import.meta.url),"utf8");
  for (const [original,replacement] of [
    ['new URL("./phase3-rehearsal.mjs", import.meta.url)',JSON.stringify(fileURLToPath(new URL("./phase3-rehearsal.mjs",import.meta.url)))],
    ['new URL(`./${dependency}`, import.meta.url).href','new URL(dependency,'+JSON.stringify(new URL("./",import.meta.url).href)+').href'],
    ['new URL("./stage3e1-security-checks.mjs", import.meta.url).href',JSON.stringify(new URL("./stage3e1c-checks.mjs",import.meta.url).href)],
    ['fileURLToPath(new URL("../", import.meta.url))',JSON.stringify(fileURLToPath(new URL("../",import.meta.url)))],
  ]) {
    if(source.split(original).length!==2) throw new Error("Anchor Stage3E.1 berubah; review diperlukan");
    source=source.replace(original,replacement);
  }
  const result=spawnSync(process.execPath,["--input-type=module","-e",source,"--","--create-approved-synthetic"],{
    cwd:fileURLToPath(new URL("../",import.meta.url)),env:process.env,stdio:"inherit",windowsHide:true,
  });
  process.exitCode=result.status??1;
}
