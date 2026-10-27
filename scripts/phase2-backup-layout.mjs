import { win32 } from "node:path";

// Pure planning only. An absolute path is not evidence of protected storage.
function localDirectory(value) {
  if (typeof value !== "string" || !/^[A-Za-z]:\\/.test(value) ||
      /[<>:"|?*\x00-\x1f]/.test(value.slice(2)) || value.includes("/")) {
    throw new Error("An explicit absolute local Windows directory is required.");
  }
  const parts = value.slice(3).split("\\").filter(Boolean);
  if (!parts.length || parts.some(part => part === "." || part === ".." || /[ .]$/.test(part))) {
    throw new Error("Use a dedicated directory without traversal or ambiguous segments.");
  }
  return win32.normalize(value);
}

export function backupLayout(parent, stamp) {
  const normalized = localDirectory(parent);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z$/.test(stamp)) {
    throw new Error("Invalid backup timestamp.");
  }
  const directory = win32.join(normalized, `wellbeing-${stamp}`);
  return {
    directory,
    temporaryDirectory: win32.join(directory, "tmp"),
    files: Object.fromEntries(["database.dump", "roles.sql", "archive-index.txt", "manifest.json", "SHA256SUMS.txt", "restore-verification.md"]
      .map(name => [name, win32.join(directory, name)])),
    encryptedArchive: win32.join(normalized, `wellbeing-database-${stamp}.7z`),
  };
}

export function backupTemporaryEnvironment(directory) {
  const normalized = localDirectory(directory);
  return { TEMP: normalized, TMP: normalized, TMPDIR: normalized,
    PSQL_HISTORY: win32.join(normalized, "psql-history-disabled") };
}
