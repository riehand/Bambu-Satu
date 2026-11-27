// Offline preparation only: no network, credentials, SQL execution or provisioning.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const sharedRef = "bofoowyzlnfhwcstlmgp";
const ref = process.argv[2];
if (process.argv.length !== 3 || !/^[a-z0-9]{20}$/.test(ref ?? "") || ref === sharedRef) {
  throw new Error("Supply a separate staging project ref; shared target is forbidden");
}
const directory = `.tmp/worker-staging-${ref}`;
const artifacts = [];
for (const name of ["storage-role.sql", "worker-auth.sql"]) {
  const source = readFileSync(`deployment/hosted/${name}`, "utf8");
  if (!source.includes(sharedRef) || !source.includes("wellbeing.approved_hosted_ref")) {
    throw new Error("Source guard changed; review required");
  }
  const sql = source.replaceAll(sharedRef, ref)
    .replaceAll("wellbeing.approved_hosted_ref", "wellbeing.approved_staging_ref")
    .replace("BEGIN;", `BEGIN;
DO $staging$ BEGIN
 IF to_regnamespace('chatbot') IS NOT NULL THEN
  RAISE EXCEPTION 'Separate staging required; Flutter schema present';
 END IF;
END $staging$;`);
  artifacts.push({ name, sql, source_sha256: createHash("sha256").update(source).digest("hex"),
    sha256: createHash("sha256").update(sql).digest("hex") });
}
mkdirSync(directory, { recursive: true });
for (const artifact of artifacts) writeFileSync(`${directory}/${artifact.name}`, artifact.sql);
writeFileSync(`${directory}/manifest.json`, JSON.stringify({ project_ref: ref, executed: false,
  requires: "Explicit staging owner approval; existing historical Auth baseline; reviewed private bucket setup",
  artifacts: artifacts.map(({ name, source_sha256, sha256 }) => ({ name, source_sha256, sha256 })) }, null, 2) + "\n");
console.log(`Prepared only: ${directory}. Review hashes and obtain approval before execution.`);
