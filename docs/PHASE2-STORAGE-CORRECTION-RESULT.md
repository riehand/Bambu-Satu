# VeraCrypt conversion and scoped ACL execution results

**25 October 2026: approved storage correction completed successfully. Production export remains NOT READY / NOT AUTHORIZED.** Execution ran **19:21:24–19:21:27 WIB** (12:21:24–12:21:27 UTC) after the owner accepted Windows UAC. No formatting, forced dismount, reboot scheduling, container deletion/recreation, Windows memory/encryption changes, hosted connection, migration, commit or push occurred. The completed PostgreSQL rehearsal was not repeated.

## Actual outcomes

| Check / operation | Result |
| --- | --- |
| Initial independent accessibility | W: accessible from the tool session; no reliance on `Get-Volume` |
| Mount identity | Windows mapping `\Device\VeraCryptVolumeW` and VeraCrypt driver list matched the exact approved container before and after operations |
| Backing container | `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc`; retained at the original path and **10,737,418,240-byte** length |
| Initial complete inventory | Only `System Volume Information` and its 12-byte `WPSettings.dat`; no user files. Dedicated container parent contained only the `.hc` |
| Hidden-volume prerequisite | Owner confirmed Standard VeraCrypt Volume, no hidden volume/data; no secrets requested |
| Fresh elevated `chkdsk W:` before conversion | **Exit 0**, no filesystem problems; documented VSS support warning recurred |
| `convert.exe W: /FS:NTFS /V` | **Exit 0**, reported **Conversion complete**; no `/X`, `/NoSecurity`, repair, format or reboot scheduling |
| Fresh read-only `chkdsk W:` after conversion | **Exit 0**, NTFS, no problems, zero bad sectors; VSS support warning persisted |
| Filesystem | **NTFS**, independently verified using `System.IO.DriveInfo` |
| Approved scoped ACL changes | **All three applied and verified**, as listed below |
| Elevated non-sensitive create/write/read/delete probe | **PASS**, probe deleted |
| Ordinary hp non-sensitive create/write/read/delete probe | **PASS**, administrator token false, probe deleted |
| Final backup directory | `W:\WellBeingHub-Backups` exists and is empty after the probes |
| Free space at independent postcheck | **10,696,134,656 bytes = 9.9616 GiB**; exceeds the reviewed **5.1 GiB** budget |
| Backup tooling | pg_dump / pg_dumpall / pg_restore / psql each report **17.11** |
| Backup preparation | Mount/container, NTFS, ACL, outside-Git, no reparse, known sync exclusion and capacity checks pass; `SystemSpillProtectionConfirmed: false`, therefore `ReadyForExport: false` |
| Node dry run | All archive/role/manifest/checksum/checklist and application temporary paths remain on W:; no source configuration loaded or database connection |

The elevated helper supplied only negative responses and then EOF to possible native prompts; no affirmative dismount/reboot response was supplied. Both health checks and conversion completed without needing those actions. The persistent VSS warning is consistent with the provider-support failure previously investigated and is not represented as repaired by NTFS conversion.

The first additional ordinary-account probe was denied inside the restricted tool filesystem sandbox **before file creation**. It stopped there. The same approved probe was then run through the outside-workspace permission path as **non-administrator hp**, where it passed without changing any ACL. This distinguishes the tool restriction from actual hp access failure. No Windows ACL error or failed native conversion occurred.

## Exact ACL scope and result

Only these filesystem objects received explicit ACL changes:

1. `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc` — dedicated parent directory.
2. `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc` — existing container file.
3. `W:\WellBeingHub-Backups` — newly created backup directory.

All three are owned by **hp**, with inheritance disabled/protected DACLs and exactly three Allow entries: **hp Modify**, **SYSTEM FullControl**, **Administrators FullControl**. Directories apply these to their files/subdirectories. No Everyone, Users or Authenticated Users Allow grant remains on these objects. Before/after owner/DACL SDDL is retained for review. The Capstone parent, physical D: layout/root, repository ACLs and unrelated files were not targeted. Conversion necessarily changed encrypted filesystem blocks inside the approved existing container.

## Remaining security and production gates

The encrypted destination's filesystem/access correction **passed**, but complete export readiness has **not** passed:

- Windows pagefile/hibernation/crash-dump storage protection remains unverified. Previous observations placed a pagefile and configured dump paths on C:, with hibernation available. The owner described C: as unencrypted; no new encryption-state assertion is made here. No Windows memory, power, crash or encryption setting was changed.
- Recovery-material custody remains to be confirmed privately; do not place passwords, keyfiles or recovery keys in chat/repo/logs. The wrapper's `-RecoveryKeyCustodyConfirmed` was not asserted.
- Separate explicit approval for production export has **not** been granted. Restoration and hosted migration remain separately gated.

Next safe step: obtain the status-only system-encryption review from an elevated PowerShell terminal, without requesting keys:

```powershell
Get-BitLockerVolume -MountPoint 'C:' |
  Select-Object MountPoint, VolumeStatus, ProtectionStatus,
    EncryptionPercentage, EncryptionMethod | Format-List
```

Then reconcile every configured pagefile/hibernation/dump location with actual encryption protection. If protection is absent, prepare a separate system-protection change for approval; this completed storage authorization does not permit that change. Do not set the system-spill confirmation flag merely because W: is now NTFS.

## Retained evidence and changed files

- [Native execution evidence](evidence/PHASE2-STORAGE-EXECUTION-20261025T122124368Z.json): UTC/WIB timings, native command exit codes/output, mount identity, capacity, scoped before/after ACLs and probe result. No production data or credentials.
- [Independent ordinary-account verification](evidence/PHASE2-STORAGE-POSTCHECK-20261025.json): non-admin probe, ACL summaries and full preparation predicates.
- [Cumulative correction history](evidence/PHASE2-STORAGE-CORRECTION-20261025.json): preserves earlier blocked checks and appends success.
- `scripts/phase2-storage-correction.ps1`: retained exact scoped helper; defaults to preparation only. It refuses an already-NTFS volume in its FAT32 preflight and should not be rerun as a repair tool.
- Current status links updated in the correction plan, storage review, backup/recovery procedure, finalization and handover documents. Application code, migrations, dependencies and tests were unchanged in this execution.

The helper passed PowerShell syntax parsing and its no-action default run before UAC execution. Actual conversion, before/after health checks, both access probes and backup preparation provided the required verification; the previous 230-test baseline and seven real-PostgreSQL test results were not rerun or recharacterized as hosted integration.
