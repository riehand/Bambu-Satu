import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { win32 } from "node:path";
import { backupLayout, backupTemporaryEnvironment } from "../scripts/phase2-backup-layout.mjs";

describe("encrypted archive preparation without exports or storage claims", () => {
  const stamp = "2026-10-25T10-20-30.000Z";
  it.each(["C:\\PrivateBackupStaging", "D:\\PrivateBackupStaging", "R:\\PrivateBackupStaging"])("plans artifacts under explicit local directory %s", parent => {
    const layout = backupLayout(parent, stamp);
    expect(Object.keys(layout.files)).toEqual(["database.dump", "roles.sql", "archive-index.txt", "manifest.json", "SHA256SUMS.txt", "restore-verification.md"]);
    for (const file of [...Object.values(layout.files), ...Object.values(backupTemporaryEnvironment(layout.temporaryDirectory))] as string[]) {
      const relative = win32.relative(layout.directory, file);
      expect(relative).not.toMatch(/^\.\./);
      expect(win32.isAbsolute(relative)).toBe(false);
    }
    expect(win32.dirname(layout.encryptedArchive)).toBe(parent);
    expect(layout.encryptedArchive).toMatch(/\.7z$/);
  });
  it.each(["relative", "D:relative", "\\\\server\\backup", "D:\\backup:stream", "D:\\..\\backup", "D:\\"])("rejects ambiguous or nonlocal path %s", path => {
    expect(() => backupLayout(path, stamp)).toThrow();
    expect(() => backupTemporaryEnvironment(path)).toThrow();
  });
  it("rejects a timestamp that could escape the run directory", () => {
    expect(() => backupLayout("D:\\PrivateBackupStaging", "..\\outside")).toThrow();
  });
  const secretMarker = "DO_NOT_PRINT_OR_CONNECT";
  function run(args: string[]) {
    return spawnSync(process.execPath, ["scripts/phase2-backup.mjs", ...args], {
      encoding: "utf8", env: { ...process.env, DIRECT_URL: secretMarker,
        PHASE2_BACKUP_DIR: "W:\\RetiredDestination",
        PHASE2_BACKUP_STORAGE_VERIFIED: "encrypted-and-access-reviewed",
        PHASE2_VERACRYPT_CONTAINER: secretMarker },
    });
  }
  it("does not inherit a stale destination or load hosted configuration", () => {
    const result = run(["--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OWNER_SELECTION_REQUIRED");
    expect(result.stdout).not.toContain("RetiredDestination");
    expect(result.stdout + result.stderr).not.toContain(secretMarker);
  });
  it("dry-run reports explicit generic paths without claiming readiness", () => {
    const result = run(["--dry-run", "--directory", "D:\\PrivateBackupStaging"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"writesPerformed": false');
    expect(result.stdout).toContain('"storageReadinessEstablished": false');
    expect(result.stdout).toContain('"exportEnabled": false');
    expect(result.stdout + result.stderr).not.toContain(secretMarker);
  });
  it.each([{ args: ["--export-approved"] }, { args: ["--dry-run", "--export-approved"] }])("old approval switches cannot trigger an export: %j", ({ args }) => {
    const result = run(args);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(secretMarker);
  });
});
