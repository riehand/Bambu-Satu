# Backup storage review — 25 October 2026

> **SUPERSEDED BY OWNER DECISION:** BitLocker activation is **CANCELLED BY PROJECT OWNER**; VeraCrypt backup workflow is **RETIRED / CLEANUP COMPLETED**. Do not execute the activation/conversion instructions below. Findings are retained as historical evidence. Use the [selected Google Drive encrypted-archive workflow](PHASE2-GOOGLE-DRIVE-BACKUP.md) and [completed cleanup evidence](PHASE2-VERACRYPT-RETIREMENT.md). No system-encryption preparation remains an active requirement.

**Latest security review (20:06 WIB):** storage filesystem and ACL verification **PASSED**; Windows memory-spill protection **PENDING**; recovery-material custody **PENDING OWNER CONFIRMATION**; production export and hosted migration **NOT AUTHORIZED**; restore verification **PENDING**. Elevated read-only checks now verify TPM 2.0 ready, Secure Boot and WinRE enabled, and C:/D: both decrypted with protection off. The [C:-only activation plan](PHASE2-BITLOCKER-ACTIVATION-PLAN.md) records inspected policy/partition findings, the EFI size advisory and the separate approval boundary. No encryption change, storage correction or PostgreSQL rehearsal was performed. Earlier unavailable-mount/FAT32 statements below are historical, not current prerequisites.

## Latest result: NTFS and scoped ACL correction passed

**19:21 WIB execution:** approved W: conversion and three-object ACL correction completed successfully. W: is now NTFS, the same VeraCrypt backing file is retained, protected ACLs allow only hp Modify and SYSTEM/Administrators FullControl, `W:\WellBeingHub-Backups` exists, and ordinary hp write/read/delete verification passed. Free space is approximately **9.96 GiB**, above the 5.1 GiB budget. [Execution report](PHASE2-STORAGE-CORRECTION-RESULT.md) and [independent postcheck](evidence/PHASE2-STORAGE-POSTCHECK-20261025.json) supersede earlier FAT32/ACL/missing-mount findings below. **Export remains NOT READY:** Windows memory-spill protection and recovery custody are unconfirmed; production-export authorization is separate and absent. No hosted operation occurred.

## Current decision: VeraCrypt W: — NOT READY FOR EXPORT

**Current authorized attempt stopped:** explicit conversion/ACL approval and standard-volume/no-hidden-data confirmation were received. However W: was unavailable in the tool session and failed mount identity/inventory preflight. No conversion or ACL mutation was attempted. Restore availability of the same intended W: mount, then revalidate prerequisites under the existing approval. Earlier FAT32, ACL and Windows memory-spill findings remain unresolved, not newly corrected. See [execution status](PHASE2-STORAGE-CORRECTION-PLAN.md).

**Subsequent owner CHKDSK result:** elevated FAT32 verification completed cleanly; reported capacity matches live checks. Local VSS 12293 events for W: at 14:38:26 WIB identify a snapshot-support query failure, consistent with VeraCrypt's documented VSS limitation, not evidence of FAT corruption. Mount and complete inventory remain unchanged. Conversion/ACL changes have not run: explicit operation approval and owner confirmation that no hidden-volume data exists are still required. Formatting is excluded. See the [latest correction-plan follow-up](PHASE2-STORAGE-CORRECTION-PLAN.md) and [appended evidence](evidence/PHASE2-STORAGE-CORRECTION-20261025.json).

**Latest read-only follow-up (25 October, approximately 14:19 WIB):** mount identity reconfirmed; complete recursive inventory found only `System Volume Information\WPSettings.dat` (12 bytes), with zero access errors and no user files. The owner now prefers preserving the existing container through in-place conversion. See the [concrete correction and ACL approval plan](PHASE2-STORAGE-CORRECTION-PLAN.md): recommend Windows `convert.exe W: /FS:NTFS /V` conditionally on an elevated clean health check. `chkdsk W:` and C: BitLocker status remain administrator-blocked. No conversion, formatting, ACL or system change occurred. This supersedes the earlier preference for creating a replacement container below.

Follow-up inspection at approximately **2026-10-25 06:51 UTC / 13:51 Asia/Jakarta**. This section supersedes the C: destination decision below. No hosted connection, production export, restore, migration, ACL/storage modification or real PostgreSQL test rerun occurred. No VeraCrypt password, keyfile contents or encryption keys were requested/read. The existing container and mounted volume were preserved.

### Verified mount and storage

| Check | Actual evidence |
| --- | --- |
| W: accessibility | `Test-Path` true, filesystem metadata and root listing readable. Owner separately reported successful write/read/delete of a non-sensitive test file; no write probe was repeated |
| Windows device mapping | `QueryDosDevice('W:')` returned `\Device\VeraCryptVolumeW` |
| VeraCrypt driver evidence | Read-only driver-version and mounted-volume-list queries, interface `0x0126`, independently bind W: to the container path below. No mount/dismount/password-cache/key operations |
| Container | `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc`; actual local file is **10,737,418,240 bytes (10 GiB)**. The repeated `.hc` component is the observed directory/file path, not a typo |
| VeraCrypt installation | Application 1.26.29, valid IDRIX SARL Authenticode signature. Installed `veracrypt.sys` has valid Microsoft Windows Hardware Compatibility Publisher signature |
| Filesystem inside W: | **FAT32**, not NTFS |
| W: capacity | Total 10,716,168,192 bytes; available **10,716,155,904 bytes = 9.9802 GiB** |
| Proposed destination | `W:\WellBeingHub-Backups`; absent, not created |
| W: access control | Reported owner Everyone, Everyone Allow rights `-1`, inheritance not protected. FAT32 cannot enforce the required NTFS DACLs |
| Container file ACL | Owner hp; inherited Administrators/SYSTEM FullControl, **Authenticated Users Modify**, **BUILTIN\Users ReadAndExecute** |
| Container parent ACL | Inherited broad Authenticated Users/Users entries too. File and parent both need restriction; ciphertext is encrypted, but broad access permits copying and/or tampering/deletion |
| Git/reparse checks | Container is outside the project repository, no `.git` in its ancestor chain, no reparse points in its path. W: destination is outside the repository |
| Known cloud roots | Only `C:\Users\hp\OneDrive` detected through environment/account settings and HKCU/HKLM registered sync roots; both paths are outside it |
| Owner-specific confirmation | Owner confirmed this intended container on ordinary local D: storage and no OneDrive, Google Drive, Dropbox or other cloud synchronization for its folder |
| Encryption at rest | VeraCrypt-backed mount **verified**; this does not prove account restrictions while mounted or protection of Windows memory spills |

Driver interface references: [VeraCrypt 1.26.29 API](https://github.com/veracrypt/VeraCrypt/blob/VeraCrypt_1.26.29/src/Common/Apidrvr.h), [driver implementation](https://github.com/veracrypt/VeraCrypt/blob/VeraCrypt_1.26.29/src/Driver/Ntdriver.c). FAT32 lacks ACL support and has an approximately 4 GiB single-file limit, unsuitable for this unrestricted custom-archive workflow: [Microsoft filesystem comparison](https://learn.microsoft.com/en-us/windows/win32/fileio/filesystem-functionality-comparison).

### Capacity and plaintext-file boundaries

The owner supplied a hosted database-size measurement of **11,335,347 bytes (10.81 MiB)** taken **25 October 2026 at 13:49:58 WIB / 06:49:58 UTC**. This is owner-provided evidence; no new hosted query was made. Under the existing planning heuristic `required free GiB = 2 × source GiB + 5`, the requirement is **5.0212 GiB**, rounded up to a **5.1 GiB** budget. Available 9.9802 GiB therefore **passes capacity planning for one export** using this measurement. This is not an exact dump-size guarantee; refresh sizing if the source grows or execution is delayed, and budget additional retained copies/restoration separately. FAT32's ACL failure still blocks export even though the current source is small.

The exporter now rejects C:, D:, UNC paths and drive-relative paths as output/temp destinations. It validates W: against the expected VeraCrypt file and NTFS before loading hosted configuration, before each database-client operation and before artifact writes. A missing, mismatched or unsupported mount stops the workflow; there is no fallback destination.

All explicit artifacts are inside `W:\WellBeingHub-Backups\wellbeing-<UTC>\`: `database.dump`, `roles.sql`, `archive-index.txt`, `manifest.json`, `SHA256SUMS.txt`, `restore-verification.md`. Application scratch variables `TEMP`, `TMP`, `TMPDIR`, plus the client working directory and private history path, point inside that run directory. The `tmp` directory is retained, not cleaned automatically. Native diagnostics are captured without printing/persisting data; child processes receive connection parameters through their environment. Node diagnostic reports are disabled for the export process. Preflight compilation can create ordinary code-only temporary files; it has no database contents.

**The stronger claim that Windows can never write sensitive memory outside W: remains unverified.** Read-only registry inspection found an existing `C:\pagefile.sys`, automatic pagefile configuration `?:\pagefile.sys`, small crash dumps configured under C:, and `powercfg /a` reports Hibernate available. C: BitLocker protection remains unknown from the preceding administrator-denied check. VeraCrypt explicitly cannot prevent Windows paging/hibernation from writing decrypted memory elsewhere. Verify system-volume/pagefile/crash/hibernation protection before export, or have the owner approve and implement an appropriate alternative host configuration. No paging, power, crash-dump or encryption setting was changed. [VeraCrypt paging guidance](https://veracrypt.io/en/Paging%20File.html), [hibernation guidance](https://veracrypt.io/en/Hibernation%20File.html).

### Remaining owner actions — no automatic storage modification

1. **Completed:** owner confirmed the intended container and local, unsynchronized storage. Preserve that exclusion for W: backup contents and the backing file.
2. **Completed:** source size/timestamp supplied; reviewed single-export free-space budget is 5.1 GiB.
3. Approve a concrete **NTFS** storage correction before any conversion/reformat/replacement. Prefer a new NTFS VeraCrypt container, retaining this existing one. In VeraCrypt: **Create Volume → Create an encrypted file container → Standard VeraCrypt volume**, choose a new local path outside Git/sync, set a size justified by the database estimate, enter credentials privately, and select **NTFS** at Volume Format. Never overwrite the existing container. Mount the approved replacement as W: only after reviewing the change; rerun identity verification with its exact new path. Conversion/reformat of the current container is also a storage change requiring explicit approval and is not performed here. [VeraCrypt beginner tutorial](https://veracrypt.io/en/Beginner%27s%20Tutorial.html).
4. After approval, restrict the container file and its dedicated parent through **Properties → Security → Advanced**: disable inheritance, retain/add hp, SYSTEM and Administrators, and remove broad Users/Authenticated Users grants. Do not alter the broader Capstone directory. On the NTFS-mounted W:, create `WellBeingHub-Backups` and apply the same restricted ACL with inheritance disabled. Verify hp in **Effective Access**. Folder/file owner may edit the DACL; Windows may require elevation. No permission operation was executed by this task.
5. Have an administrator run the status-only C: BitLocker commands retained below; verify all configured pagefile/crash/hibernation storage is encrypted, or separately approve a reviewed alternative. Do not share recovery keys or VeraCrypt credentials. Set the new `-SystemSpillProtectionConfirmed` flag only after this review actually passes.

### Preparation commands and validation

These commands only inspect/plan; they do not create a backup directory or contact Supabase:

```powershell
.\scripts\phase2-backup.ps1 `
  -BackupDirectory 'W:\WellBeingHub-Backups' `
  -VeraCryptContainer 'D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc' `
  -SyncExclusionConfirmed -RequiredFreeGiB 5.1
node scripts/phase2-backup.mjs --dry-run
```

Actual updated wrapper result: detected VeraCrypt, expected container matched, **capacity and owner sync confirmation passed**; FAT32, container/parent ACL restriction false, destination absent and system-spill protection unconfirmed; **ReadyForExport false**. The runtime export mount check separately rejected FAT32 without any database connection. Four PostgreSQL clients remain 17.11 and all four hashes match the retained manifest. PowerShell/Node syntax and focused lint passed; **19 focused tests passed** (10 existing safety tests + nine new output/temp/dry-run boundary tests). The prior 230-test baseline remains untouched; the full suite and seven real PostgreSQL tests were not rerun. Dry runs are not a production export or restoration test. [Sanitized preparation evidence](evidence/PHASE2-VERACRYPT-STORAGE-20261025.json).

Files changed in this follow-up: `scripts/phase2-backup.ps1`, `scripts/phase2-backup.mjs`, new `scripts/phase2-veracrypt.ps1` and `scripts/phase2-backup-layout.mjs`, new `tests/phase2-backup-layout.test.ts`, this review, `docs/PHASE2-BACKUP-RECOVERY.md`, `docs/PHASE2-FINALIZATION.md`, `docs/PHASE2-HANDOVER.md`, and the sanitized JSON evidence linked above. No application code, migration, credential or hosted setting changed; no commit/push.

### Proposed future export authorization — only after readiness passes

> Authorize one read-only PostgreSQL 17.11 logical backup of Supabase project `bofoowyzlnfhwcstlmgp`, database `postgres`, using the ignored configured DIRECT_URL on direct/Session port 5432 cross-checked against NEXT_PUBLIC_SUPABASE_URL. Destination: `W:\WellBeingHub-Backups\wellbeing-<UTC-timestamp>\`, on the verified, approved NTFS VeraCrypt container. Current inspected backing file: `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc`; if replaced, amend this packet to the exact replacement path before approval. Permit creation/restriction of the per-run directory, server-version query, full readable schema/data custom archive, role definitions/memberships without role passwords, private archive index, UTC/Jakarta manifest, checksums and restore checklist. Include Auth users/identities/session material, custom Auth triggers/functions, public profiles, Prisma migration history, owners/grants/RLS and readable managed schemas. Keep all explicit exports and application scratch files on W: with verified ACL, capacity, sync exclusion, recovery custody and host memory-spill protection. No data/credentials in terminal logs, uploads, restoration, hosted mutations or Phase 2 application. Stop on failed prerequisites, incomplete scope or warnings; retain partial files protected.

Exports exclude Storage object bytes and external configuration/secrets; role metadata and database data are separate snapshots. Supabase permissions may block complete coverage. Export approval is **not requested for immediate execution** while storage is unready. Compatible isolated Supabase restore verification and the existing hosted deployment approvals remain later gates. Chatbot remains the companion application name.

## Historical C: review — superseded destination

The following is retained evidence from the preceding inspection. Its C: export proposal and old wrapper behavior are superseded; use the W: preparation commands above and current [backup recovery procedure](PHASE2-BACKUP-RECOVERY.md).

**NOT READY. No production connection/export, real-data copy, restoration, encryption change, ACL change or destination creation was performed.** The completed 230-test baseline and seven PostgreSQL integration tests remain prior evidence; the rehearsal was not repeated or changed. Chatbot remains the companion application name.

Inspection recorded around **2026-10-25 06:23 UTC / 13:23 Asia/Jakarta**. This report supersedes only the storage/tooling readiness section of the earlier local rehearsal report.

## Observed results

| Check | Result |
| --- | --- |
| Proposed directory | `C:\Users\hp\WellBeingHub-Backups`; **does not exist** |
| Windows edition | Professional |
| Filesystem | C: is NTFS; total 511,036,092,416 bytes |
| Available space | 135,763,521,536 bytes at final preparation check, approximately **126.44 GiB**; changes with use |
| BitLocker | **Unknown**. `Get-BitLockerVolume` unavailable and `manage-bde -status C:` explicitly denied administrator access, including outside the tool sandbox |
| Encryption at rest | **Not verified**, not a finding that BitLocker is disabled |
| EFS | Existing parent `C:\Users\hp` has no Encrypted attribute; nonexistent destination cannot be checked. This says nothing about BitLocker protection |
| Parent ownership/inheritance | SYSTEM owns parent; parent ACL inheritance disabled; all four observed ACEs are explicit |
| Parent inheritable Allow ACEs | hp, SYSTEM and BUILTIN\Administrators: FullControl, ContainerInherit + ObjectInherit |
| Other parent ACE | One application-capability SID: Traverse/ExecuteFile + Synchronize, **no inheritance**. No file-read grant follows from this ACE |
| Broad access | No Everyone, BUILTIN\Users or Authenticated Users read Allow entry in observed parent ACL |
| Destination effective permissions | **Unverified because directory is absent**. Parent ACL is evidence only, not a destination effective-access test |
| Reparse points | None in the existing parent path |
| Git location | Outside `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\Bambu-Satu` |
| Detected cloud sync | Outside `C:\Users\hp\OneDrive`, the only root found through OneDrive environment/account settings and HKCU/HKLM Explorer SyncRootManager UserSyncRoots |
| Other sync/backup software | Not proven absent. Owner must review any unregistered third-party sync/backup configuration before export |
| Capacity adequacy | **Unknown** until source-size estimate, retention and required reserve are reviewed; free bytes alone do not establish sufficient capacity |

No ACL, encryption, cloud setting or recovery key was modified/read. The wrapper conservatively counts the non-inheriting parent capability ACE as an additional allow entry; this is not a claim that future backup files are readable by that principal.

## Administrator read-only verification

Open **Start → Windows PowerShell → Run as administrator**, approve Windows UAC, then run these status-only commands. Do not use `-protectors -get` or print a recovery key.

```powershell
Get-BitLockerVolume -MountPoint 'C:' |
  Select-Object MountPoint, VolumeStatus, ProtectionStatus,
    EncryptionPercentage, EncryptionMethod, LockStatus |
  Format-List
manage-bde -status C:
Get-Volume -DriveLetter C |
  Select-Object DriveLetter, FileSystem, HealthStatus, Size, SizeRemaining
```

Required BitLocker result: `VolumeStatus: FullyEncrypted`, `ProtectionStatus: On`, `EncryptionPercentage: 100`, a real encryption method. Suspended protection or an incomplete/unknown state fails readiness. Return only these non-secret status fields. These commands do not enable, disable or suspend encryption. [Microsoft status documentation](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/operations-guide?tabs=powershell).

## Corrections, only after separate owner approval

1. **If C: passes encryption checks:** keep the proposed path. If it does not, prefer an existing owner-controlled, fully encrypted NTFS volume with sufficient space. An NTFS external drive protected with **BitLocker To Go** is a built-in alternative; select its actual drive letter and re-review the destination before authorizing any export. Do not format a drive containing existing data.
2. **If encryption must be enabled:** on this Professional edition, an administrator opens Start → **Manage BitLocker**, selects C: or the chosen data drive, then **Turn on BitLocker** and follows the wizard. Choose the applicable unlock method and store recovery material in separately controlled storage, never in this repo, chat or backup directory. Wait for encryption to finish and rerun the status-only checks. Enabling encryption and any required restart remain owner actions, not authorized operations performed by this task. [Microsoft Windows 11 instructions](https://support.microsoft.com/en-us/windows/security/encryption/bitlocker-drive-encryption).
3. **Create/restrict the folder only after approval:** signed in as hp, create `C:\Users\hp\WellBeingHub-Backups` in Explorer. Open Properties → Security → Advanced. Confirm owner hp (or an approved administrator/SYSTEM), choose **Disable inheritance → Convert inherited permissions into explicit permissions**. Keep only hp, SYSTEM and BUILTIN\Administrators Full control, applying to **This folder, subfolders and files**; remove any other grant on this new empty directory. Do not change the profile parent. The folder owner can normally edit its DACL; elevation is required if Windows denies that operation.
4. Reopen Security → Advanced → **Effective Access**, select hp and verify read/write/create/delete permissions. Inspect Permission entries to ensure no broad group grants. Confirm the actual operator is hp; do not run the exporter as a different administrator account, which would select that account for the per-run ACL. If using EFS instead of BitLocker, review EFS certificate/private-key recovery separately; an encrypted attribute alone is not a recovery plan. BitLocker is preferred here.
5. Review OneDrive and every installed sync/backup application's selected folders. Explicitly exclude the backup directory from unapproved uploads. Record confirmation without revealing account credentials. Registered-root checks alone cannot prove exclusion from all software.
6. Establish a source-size estimate from existing owner-held dashboard information, without querying/exporting the database in this task. As a planning reserve, allow at least twice the estimated uncompressed database size plus 5 GiB for one export; add retained copies and other volume use. This is a conservative planning heuristic, not a compression-size guarantee. Record the chosen required free GiB and recheck immediately before export. A later restore needs its own capacity budget.

After preparation, rerun the wrapper in **inspection mode** with the reviewed capacity and sync confirmation. Replace the placeholder; this command still does not connect or export:

```powershell
.\scripts\phase2-backup.ps1 -SyncExclusionConfirmed `
  -RequiredFreeGiB <reviewed-required-free-GiB>
```

The BitLocker query needs elevation under the same intended hp account. No manual bypass for an unknown encryption result was introduced.

## Tooling and prepared artifacts

`pg_dump`, `pg_dumpall`, `pg_restore` and `psql` each report **PostgreSQL 17.11**. All four executable SHA-256 hashes were rechecked against `.tmp/postgresql17-client-tools/manifest.json` and matched. Tools remain in `.tmp/postgresql17-client-tools/pgsql/bin`. The prior official EDB archive provenance/hash remains in the retained [rehearsal evidence](evidence/PHASE2-POSTGRES-20261025.json); no new download or installation occurred.

Prepared exporter outputs:

- `database.dump`: full readable database custom archive, retaining owners, grants and RLS definitions.
- `roles.sql`: role definitions/memberships via `--roles-only --no-role-passwords`; fail closed on unsupported permissions, with no silent scope reduction.
- `archive-index.txt`: private archive listing; checks for Auth users/identities, public profiles, Prisma migration history and both custom Auth triggers/functions.
- `manifest.json`: full UTC and Asia/Jakarta (+07:00) start/end timestamps, exact client versions, server version, sizes/hashes, exclusions and all three **local reference** migration hashes. These hashes do not assert hosted application of Phase 2.
- `SHA256SUMS.txt`: SHA-256 for archive, roles, index, restore checklist and manifest. Local checksums detect alteration/corruption; they are not an independent signature.
- `restore-verification.md`: a copy of the reviewed recovery procedure/checklist beside the archive. Custom Auth trigger behavior, profile UUID links, `_prisma_migrations` names/checksums, platform ownership and extensions require a separately approved compatible Supabase restore test. The synthetic rehearsal is not a recovery target.

The wrapper now requires an existing NTFS directory outside Git, allowed owner, inheritance disabled, only intended-user/SYSTEM/Administrators Allow entries, no reparse points, verified encryption, no detected sync root, owner confirmation about other sync, and a positive reviewed capacity budget within current free space. Unknown checks fail closed. It does not create a directory or modify ACLs in inspection mode.

Future export keeps connection credentials in ignored configuration and the child-process environment, never command arguments or committed files. Database output/error contents and backup contents are not printed or logged; partial artifacts stay in the protected directory. Do not enable shell tracing/transcription or upload these artifacts. Secrets, recovery keys and data rows are absent from this report.

Validation this task: PowerShell parse passed; Node syntax passed; inspection mode returned `ToolsReady: true`, `ReadyForExport: false`; **10 existing safety tests passed**. Initial sandbox test startup hit esbuild `spawn EPERM`; the permitted outside-sandbox local run passed. No full baseline or real-PostgreSQL rehearsal rerun was needed. Export/restore execution remains untested against production by design.

## Exact future export authorization packet — not granted

Once storage checks pass, request this separate approval with the final capacity value and destination confirmed:

> Authorize one logical production backup of the existing Supabase project `bofoowyzlnfhwcstlmgp` (`bofoowyzlnfhwcstlmgp.supabase.co`), database `postgres`, using its ignored `DIRECT_URL` on direct/Session port 5432 cross-checked against `NEXT_PUBLIC_SUPABASE_URL`. Save only under `C:\Users\hp\WellBeingHub-Backups\wellbeing-<UTC-timestamp>\` after the encryption, ACL, sync, capacity and recovery-key-custody checks pass. Allow creation/restriction of that per-run child directory, read-only server version validation, PostgreSQL 17.11 full schema/data export, role definitions/memberships without role passwords, local archive listing, checksums, manifest and restore checklist. Scope includes Auth users/identities/session material, public profiles, all readable schemas/data, custom Auth triggers/functions, owners/ACLs/RLS and Prisma migration history. Keep all files encrypted and access-restricted locally; no contents or credentials in logs, no external upload, no restoration, no hosted mutation or Phase 2 application. Stop on warnings, inaccessible scope or failed prerequisites and retain partial files protected.

The project identifier above came only from local public configuration; **no hosted connection** was made. Reconfirm the same project before execution. A changed destination/project requires a revised approval packet. Storage object bytes, role passwords, dashboard/provider/JWT/SMTP/Edge secrets and external services are outside this logical export. Managed-schema permissions may prevent a complete archive; a failure requires review, not exclusion without approval. Archive and role metadata use separate snapshots; coordinate schema/role changes with Chatbot. Read load and possible egress usage are part of the proposed operation.

**Immediate next step:** owner runs the elevated read-only commands above and supplies only the status fields. If encryption passes, obtain approval to create/restrict the proposed empty directory and complete the sync/capacity review. Export authorization comes after these checks. A separately authorized compatible Supabase restoration/verification and the existing hosted deployment approvals remain later Phase 2 blockers.

Files changed in this task: `scripts/phase2-backup.ps1`, `scripts/phase2-backup.mjs`, `docs/PHASE2-BACKUP-RECOVERY.md`, and this report. No application/schema/migration/test edits, commits or pushes.

