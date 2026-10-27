# Final pre-BitLocker preparation - owner checklist

> **SUPERSEDED BY OWNER DECISION:** BitLocker activation is **CANCELLED BY PROJECT OWNER**; VeraCrypt backup workflow is **RETIRED / CLEANUP COMPLETED**. Do not execute the activation/conversion instructions below. Findings are retained as historical evidence. Use the [selected Google Drive encrypted-archive workflow](PHASE2-GOOGLE-DRIVE-BACKUP.md) and [completed cleanup evidence](PHASE2-VERACRYPT-RETIREMENT.md). No system-encryption preparation remains an active requirement.

25 October 2026. **Preparation only: no project copy, encryption activation or production export was performed.** The encrypted external backup destination has not been selected or verified. The existing VeraCrypt container is unchanged. All actions marked **MANUAL** below need the owner; the GUI activation section additionally requires separate explicit approval.

## Completed inspection

At the initial inspection the branch was `riehand_branch`, HEAD `9f9c136e59979dc92dc3bf2860f82782557a5ca9`, with **349 tracked paths, 24 modified tracked files, zero staged changes and 37 untracked files**. The two new preparation artifacts (this checklist and the inventory JSON) add two untracked files. Counts are a snapshot, not a reason to discard later work. [Exact filename/status inventory](evidence/PHASE2-PROJECT-BACKUP-INVENTORY-20261025.json) contains no file contents or credentials.

| Restore category | Actual inventory / required handling |
| --- | --- |
| Modified tracked work | README and six docs; Phase 2 SQL migration; assessment smoke script; API/service/validation/UI files; API/database/service/browser/preflight/visual tests. Preserve working copies exactly, including the unapplied migration |
| Untracked work | 15 handover/security/recovery/finalization documents, seven evidence JSON files, ten preparation/rehearsal/backup scripts, four tests and the rehearsal Vitest config at initial inspection; also include this new checklist and inventory |
| Project essentials | Entire `src`, `public`, `prisma`, `tests`, `scripts`, `docs`, package manifests/lockfile, TypeScript/Next/ESLint/Playwright/Vitest configuration, `AGENTS.md`, `.gitignore`, `skills-lock.json` and `.agents` |
| Git state | Include hidden `.git`: history, index, refs, reflogs, local configuration and hooks. It is an ordinary local directory; no objects alternates file or `.gitmodules` was found. Protect it because local configuration/history may contain sensitive material; remote URLs were not printed |
| Ignored secret configuration | `.env` and `.env.local` exist. Preserve only inside verified encrypted external storage with restricted access. Their contents were not opened by this task. `.env.example` does not replace actual local configuration |
| Ignored retained tools/evidence | Preserve **all `.tmp`**: PG17 client archive/tools, synthetic rehearsal directory, audit helpers, baseline schema and local preparation evidence. Do not dismiss it as disposable cache. Preserve `test-results` for existing visual/test evidence |
| Rebuildable files | `.next` and `node_modules` can be omitted from a development-restoration backup if explicitly recorded. Preserve `package-lock.json`; regenerate exact locked dependencies later. Small ignored `next-env.d.ts` and `tsconfig.tsbuildinfo` may be copied but are rebuildable |
| Editor skill junctions | 20 junctions in `.claude/skills` and `.windsurf/skills` were verified to target corresponding `.agents/skills` directories inside this checkout. Copy their contents as ordinary directories in the backup; do not retain absolute links to the original D: checkout. Two additional junctions are inside omitted `.next` cache |
| Outside this folder | Node/Git installation, global editor settings/extensions, browser binaries and Docker engine/images/volumes are not inside this project copy. No local or user `.npmrc` was found. Do not blindly copy user profiles, Credential Manager data, SSH keys or global secrets. Owner separately inventories anything else necessary |

The physical metadata inventory, without following junctions, counted **27,297 files / 1,577,015,143 bytes (about 1.47 GiB)**. Omitting only root `.next` and root `node_modules` leaves **470,202,718 bytes (about 448 MiB)** before duplicated skill contents and these new documents. Plan at least **2 GiB free** for one such backup plus an independent verification copy and overhead; remeasure immediately before copying. This excludes personal C: files and Docker volumes. No backup-size or success claim is based on the hosted database size.

## MANUAL 1 - choose and verify independent encrypted storage

- [ ] Select a physically separate external SSD/USB, already protected by BitLocker To Go or an approved encrypted volume. An external VeraCrypt container must itself reside on that external device. **Existing W: on internal D: is not the independent pre-encryption backup destination.** Do not modify or copy the existing container under this task.
- [ ] Verify the actual external device/drive identity, encryption enabled and fully complete, protection active, and ability to unlock it independently. For BitLocker, an elevated `Get-BitLockerVolume -MountPoint '<external-letter>:'` with selected status fields must show 100% and protection On. Do not infer encryption from a padlock icon or a folder name. Creating/encrypting new media is a separate operation, not performed here.
- [ ] Use NTFS and a dedicated folder outside Git and cloud sync. Inspect Properties > Security > Advanced: access restricted to the intended account plus necessary SYSTEM/Administrators, with no broad Users/Everyone access. Arrange any needed ACL correction explicitly before copying secrets. No external ACLs were changed here.
- [ ] Verify enough space, no reparse redirect in the destination, and a working non-sensitive read/write/delete probe. Confirm no automated cloud backup or sync includes the destination. Keep the external unlock material independently available.
- [ ] Verify important personal/development files on C: have a separate recoverable backup too; this Bambu-Satu copy covers only the project tree.

Only proceed once these checks pass. No secret file should be copied to ordinary C:/D: staging, a ZIP on Desktop, an unencrypted USB or a public/cloud folder. Normal copying still processes existing local configuration through this Windows session; it is not a claim that the current unencrypted OS has zero memory-spill exposure or that production export is now safe.

## MANUAL 2 - create the project backup

1. Save files and close development servers/watchers and any Git operation normally. Do not commit, reset, clean, stash or push to simplify the backup. Keep the source unchanged until verification completes; copy these final preparation documents too.
2. On the verified external volume create a new restricted timestamped run folder, with `project` and `verification` subfolders. Do not overwrite an earlier backup. Store logs/manifests only in `verification` on that encrypted volume.
3. Record current branch, HEAD, `git status --porcelain=v1 --untracked-files=all`, tracked/untracked/ignored filename lists, tool versions and the cache exclusions there. Do not record environment values, `git remote -v`, credential helpers' output, recovery material or raw diffs containing secrets.
4. Copy every file including hidden `.git`, ignored `.env`/`.env.local`, `.tmp` and evidence, excluding only root `.next` and root `node_modules`. Use a filesystem copy rather than `git clone`, `git archive` or a diff alone: those omit part of the current local state.
5. Materialize `.agents/skills` at the two editor alias locations in the backup. This preserves tracked skill file contents without dependencies on the source drive. No source link is changed. If any new/unexpected junction or symlink appears, pause and review its target before copying; do not traverse it blindly.

Optional copy template, **manual only after destination verification**. Replace the placeholder with the newly created encrypted external run folder; it intentionally does not supply a real drive letter. Run from ordinary owner PowerShell, without transcription. This template excludes source ACLs so files inherit the destination's already verified restrictions.

```powershell
$projectSource = 'D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\Bambu-Satu'
$backupRun = '<verified-encrypted-external-run-folder>'
$backupProject = Join-Path $backupRun 'project'
$backupVerification = Join-Path $backupRun 'verification'
# Both destination folders must already exist, be empty, and be protected.
$copyLog = Join-Path $backupVerification 'copy.log'
robocopy.exe $projectSource $backupProject /E /COPY:DAT /DCOPY:DAT /XJ `
  /XD (Join-Path $projectSource '.next') (Join-Path $projectSource 'node_modules') `
  /R:1 /W:1 /NP /NFL /NDL /LOG:$copyLog
$copyExit = $LASTEXITCODE
# Stop and review any result except 0 or 1 for this fresh-destination procedure.
if ($copyExit -notin @(0,1)) { throw 'Copy requires review; see protected log.' }
foreach ($editorFolder in @('.claude','.windsurf')) {
  $aliasSource = Join-Path $projectSource '.agents\skills'
  $aliasDestination = Join-Path $backupProject ($editorFolder+'\skills')
  $aliasLog = Join-Path $backupVerification ($editorFolder.TrimStart('.')+'-skills.log')
  robocopy.exe $aliasSource $aliasDestination /E /COPY:DAT /DCOPY:DAT /XJ `
    /R:1 /W:1 /NP /NFL /NDL /LOG:$aliasLog
  if ($LASTEXITCODE -notin @(0,1)) { throw 'Skill copy requires review; see protected log.' }
}
```

`/E` includes empty directories; `/XJ` avoids copying through junctions, whose reviewed skill contents are then copied explicitly. Codes 8 or above indicate failures; lower nonzero codes can still indicate differences. This procedure conservatively reviews any code except 0/1 and requires the verification below regardless. There is no `/MIR`, `/PURGE`, `/MOVE` or source deletion. [Microsoft Robocopy reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/robocopy).

This is a **complete development-restoration set with declared rebuildable-cache exclusions**, not a Windows system image or a copy of the retained Docker database volume. The synthetic PostgreSQL environment must remain intact; do not delete it or export any database for this preparation.

## MANUAL 3 - verify independently before calling the backup complete

- [ ] Generate a SHA-256 manifest of **every included file**, using relative path, length and SHA-256 only. Keep it inside encrypted `verification`, not in Git or chat. Enumerate hidden files, including `.git` and environment files. `Get-FileHash -LiteralPath <file> -Algorithm SHA256` hashes bytes without printing file contents. Do not open secret files in an editor for verification.
- [ ] Source enumeration must exclude the same two root caches. Treat the 20 reviewed source skill aliases as logical paths with the corresponding canonical `.agents/skills` contents. Check for unexpected links; do not simply skip tracked aliases and call that complete. Backup aliases should be ordinary directories. Preserve empty-directory inventory separately if needed.
- [ ] Compare **relative-path sets, byte lengths and SHA-256 values** between source and backup; require zero missing/extra/mismatched files in `project`. Do not count the separate `verification` directory as project data. Check that the source manifest before and after the copy agrees; if the source changed, repeat into a fresh destination after stopping writers. Counts alone and Robocopy timestamps are insufficient evidence.
- [ ] Safely eject/lock and reconnect/unlock the external storage. Recompute the backup hashes and compare with the saved manifest. This tests persistent readability and unlock custody, rather than only the immediately available copy.
- [ ] On a trusted second device, open only non-sensitive README/source/migration/test files and verify hashes without relying on access to the original D: drive. Alternatively create an independent `restore-check` directory on encrypted external storage and compare it against the manifest; this validates a file restore but is weaker evidence of access from a different computer. Keep all restored environment files protected.
- [ ] In the verification copy, confirm Git resolves its top-level path to that copy, HEAD and branch match, and the modified/untracked status matches the recorded source snapshot. Do not commit, reset or run cleanup. Materialized skill folders should not cause missing tracked files. Do not run hooks, install packages, launch the application, connect to Supabase, run Prisma migrations or repeat tests as part of file verification.
- [ ] Record only verification time, backup device alias, counts and PASS/FAIL in the project. Keep per-file hashes of secret configuration and full logs on the encrypted external storage. A mismatch or unreadable file means **backup not verified**.

For a later development rebuild, use the saved lockfile and the established Node/Prisma versions; dependency installation/client generation is a separate reviewed restore step. Avoid automatically loading production configuration in the verification copy. Installed package caches are deliberately omitted, so this checklist does not claim an offline executable development environment has been restored.

## MANUAL 4 - recovery custody before activation

- [ ] Select custody for the **future** C: BitLocker recovery material outside this laptop, with an independent second copy. No new BitLocker recovery key was generated in this preparation; verify the storage/access plan now, then verify the actual key privately during approved setup.
- [ ] Use physically secured offline removable media or another explicitly approved independent store. If encrypted, its unlock material must be available without C:, D:, W: or this laptop's sign-in. Keep it separate from the laptop and do not leave it connected.
- [ ] If choosing a password manager or Microsoft/organization account, approve that provider and verify access/MFA/account recovery from another trusted device. Do not accept cloud escrow implicitly.
- [ ] During approved setup, save directly to that chosen destination and privately check the saved material and device association. Do not place any key in screenshots, clipboard-sync workflows, terminal output, this repository or chat. Do not deliberately trigger a recovery boot as a test.
- [ ] Confirm VeraCrypt password/PIM/keyfile custody independently as described in the [security review](PHASE2-BACKUP-SECURITY-REVIEW.md). BitLocker recovery material does not unlock VeraCrypt. Report only confirmed/pending, never the secret or its storage details.

## MANUAL 5 - EFI and GUI activation boundary

Existing evidence remains: 100 MiB FAT32 EFI partition, about 61 MiB free. Microsoft recommends a larger system partition; this is an advisory, not a demonstrated failure. **No resizing, formatting, partition-tool workaround, TPM reset or firmware change is permitted.** Keep Windows' normal system check and stop if setup requires a layout or policy change. [Microsoft requirements](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/).

Before requesting activation approval, confirm the project/personal-file backup is independently verified, recovery custody is arranged, AC power/battery are ready and a maintenance window is available. Save work and plan normal shutdown of applications/Docker workloads and normal W: dismount before restart, preserving all resources. None of these shutdown/dismount actions was performed here.

**Only after separate explicit C:-only activation approval:**

1. Open **Start > Manage BitLocker > Operating system drive C: > Turn on BitLocker**. Do not choose D:, W: or broad automatic Device Encryption.
2. Use the supported TPM-based workflow. Privately save and verify recovery material using the approved custody plan before continuing. Stop on unexpected policy/escrow requirements.
3. Select **Encrypt entire drive** and **New encryption mode** for this used Windows 11 OS volume. Keep **Run BitLocker system check** selected. Do not skip checks or change policy to force an algorithm.
4. Restart at the planned time and let encryption finish on reliable power. Do not change pagefile, hibernation, crash dumps, Secure Boot or TPM. Stop and report non-secret error text if the setup check fails.

The [activation plan](PHASE2-BITLOCKER-ACTIVATION-PLAN.md) retains the exact conditional approval wording and operational risks: recovery lockout, maintenance interruption and encryption I/O. [Microsoft GUI workflow](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/operations-guide).

## MANUAL 6 - post-activation acceptance, not executed now

```powershell
# Elevated PowerShell; selected status only, no recovery key retrieval.
Get-BitLockerVolume -MountPoint 'C:' |
  Select-Object MountPoint,VolumeStatus,EncryptionPercentage,ProtectionStatus,EncryptionMethod |
  Format-List
```

- [ ] Require **FullyEncrypted, 100%, Protection On**, non-None method and normal boot. Suspended/waiting-for-activation is not a pass.
- [ ] Check WinRE still enabled and actual pagefile/hibernation/dump paths remain on protected storage. C:-only encryption leaves D: decrypted; new D: spill paths need separate review.
- [ ] Open the existing Bambu-Satu folder on D:. Compare HEAD, dirty/untracked filename status and preserved important-file hashes with the pre-restart snapshot. Open only non-sensitive files; do not rerun tests or migrations for this check.
- [ ] Remount the **same** VeraCrypt backing container normally as W: using private credentials; no recreation, conversion or formatting. Verify exact mount identity, NTFS, existing restricted ACLs and expected capacity with the existing preparation tooling. Use only a uniquely named non-sensitive read/write/delete probe if verification is authorized; never overwrite existing files.
- [ ] Recheck the encrypted external backup is accessible and recovery custody remains independent. Do not delete that backup after the first successful boot.
- [ ] Update memory-spill protection only when the evidence passes. Production export, restore and hosted migration still require their separate approvals.

## Remaining blockers and current status

**MANUAL actions outstanding:** select/verify independent encrypted external storage; create and independently verify project and important-file backups; confirm private VeraCrypt/recovery custody; confirm power/timing; provide explicit C:-only activation authorization. Actual Windows setup acceptance of the small EFI partition is a later conditional checkpoint, not something to bypass now.

Storage filesystem/ACL verification remains **PASSED**. Windows memory-spill protection remains **PENDING**, because C: is still decrypted. Recovery custody is **PENDING OWNER CONFIRMATION**. BitLocker activation, production export and hosted migration are **NOT AUTHORIZED**; restore verification remains **PENDING**. No completed Phase 2 tests or PostgreSQL migration/concurrency rehearsals were repeated.

Changes from this preparation: this checklist and metadata-only inventory; links in the existing activation plan and finalization report. No secret contents, application code, migrations, backup execution scripts or system settings were changed.

