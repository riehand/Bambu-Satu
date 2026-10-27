// Preparation only: the retired exporter is retained as non-executable audit text.
// Historical plaintext layout: superseded by phase2-db-export.mjs --plan.
// No dotenv/configuration loading, child processes, filesystem writes or DB clients.
import { backupLayout, backupTemporaryEnvironment } from "./phase2-backup-layout.mjs";

const args = process.argv.slice(2);
try {
  if (args.includes("--export-approved")) {
    throw new Error("Production export is not enabled by this preparation tool.");
  }
  const directoryIndex = args.indexOf("--directory");
  const directory = directoryIndex >= 0 ? args[directoryIndex + 1] : undefined;
  const allowed = new Set(["--dry-run", "--directory"]);
  for (let index = 0; index < args.length; index++) {
    if (!allowed.has(args[index])) throw new Error("Unsupported preparation option.");
    if (args[index] === "--directory") {
      if (!directory || args[index + 1]?.startsWith("--")) throw new Error("Destination required.");
      index++;
    }
  }
  console.log("Preparation only. Google Drive encrypted archives selected; no connection, export, encryption or upload performed.");
  if (args.includes("--dry-run")) {
    const layout = directory ? backupLayout(directory, new Date().toISOString().replaceAll(":", "-")) : null;
    console.log(JSON.stringify({
      mode: "ENCRYPTED_ARCHIVE_PLAN_ONLY",
      supersededDatabaseLayout: true,
      currentDatabasePlan: "node scripts/phase2-db-export.mjs --plan (ciphertext-only age outputs)",
      destinationStatus: layout ? "PROPOSED_NOT_VERIFIED" : "OWNER_SELECTION_REQUIRED",
      layout,
      temporaryEnvironment: layout ? backupTemporaryEnvironment(layout.temporaryDirectory) : null,
      encryption: "7z AES-256 with encrypted filenames; owner enters password privately in GUI",
      upload: "Manual Google Drive upload of verified encrypted archive only",
      writesPerformed: false,
      storageReadinessEstablished: false,
      exportEnabled: false,
      residualRisk: "Unencrypted OS paging, dumps and local plaintext staging remain possible; owner review required before production export.",
    }, null, 2));
  }
} catch {
  console.error("Preparation stopped. Export remains disabled; use --dry-run with an optional explicit --directory. No source configuration loaded.");
  process.exitCode = 1;
}
