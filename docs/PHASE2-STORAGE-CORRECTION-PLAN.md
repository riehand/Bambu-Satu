# VeraCrypt storage correction approval plan

> **SUPERSEDED BY OWNER DECISION:** BitLocker activation is **CANCELLED BY PROJECT OWNER**; VeraCrypt backup workflow is **RETIRED / CLEANUP COMPLETED**. Do not execute the activation/conversion instructions below. Findings are retained as historical evidence. Use the [selected Google Drive encrypted-archive workflow](PHASE2-GOOGLE-DRIVE-BACKUP.md) and [completed cleanup evidence](PHASE2-VERACRYPT-RETIREMENT.md). No system-encryption preparation remains an active requirement.

## Current result: approved correction completed

**25 October 2026, 19:21 WIB:** W: was independently accessible, its identity/inventory matched, and fresh elevated CHKDSK passed. The approved in-place conversion **succeeded (exit 0)**, post-conversion NTFS CHKDSK passed, all three exact scoped ACL changes passed verification, and both elevated and ordinary hp write/read/delete probes passed. The container was retained; no format, forced dismount or reboot scheduling occurred. See [actual execution result and evidence](PHASE2-STORAGE-CORRECTION-RESULT.md). Export remains blocked by unverified Windows memory-spill protection, unconfirmed recovery custody and missing separate production-export authorization. All earlier stopped/approval-pending sections below are historical.

## Current execution status: approved, stopped because W: is unavailable

The owner explicitly approved the reviewed conversion, exact three-object ACL corrections and non-sensitive verification, and confirmed a **Standard VeraCrypt Volume with no hidden volume/data**. Those authorization and hidden-volume prerequisites are now satisfied; older requests for them below are historical.

The first authorized preflight failed: the Windows/VeraCrypt identity helper reported **Drive is not mapped to VeraCrypt**, and recursive inventory reported **W: does not exist in the tool session**. Filesystem/capacity were unavailable. This establishes loss of visibility of the required mount in this session, not its cause or global state in another Windows session.

Per the owner's stop-on-changed-prerequisites restriction, **conversion was not invoked**. No ACL changed, no folder was created, no write/delete test ran, no UAC conversion process was launched, and no formatting, Windows setting change, hosted connection, commit or push occurred. Earlier clean owner-reported CHKDSK evidence is retained but cannot validate an unavailable current target.

**Next action:** owner mounts the same intended container as W: in VeraCrypt and confirms it is available again. No passwords or keys should be shared. The existing limited approval remains recorded; recheck exact mount identity, filesystem, complete inventory and health prerequisites before attempting conversion. Do not request duplicate approval merely because the mount must be restored. Windows elevation and the separate memory-spill/export gates remain applicable. [Timestamped stopped-preflight evidence](evidence/PHASE2-STORAGE-CORRECTION-20261025.json).

## Latest follow-up: clean CHKDSK, conversion still not executed

The owner reports completing elevated `chkdsk W:` on 25 October 2026: FAT32 file/folder verification completed, with **no problems found / no further action required**. Reported total **10,465,008 KB** and available **10,464,996 KB** match the independently reread live byte counts when multiplied by 1,024. Record this as **owner-reported successful elevated verification**, not an agent-executed test. The earlier administrator-denied attempt below remains historical evidence.

The mounted device and exact backing path were rechecked and match the intended container. A fresh recursive inventory again completed without access errors and found only `System Volume Information\WPSettings.dat` (12 bytes), with no user files. W: remains FAT32 and the backup directory remains absent.

**Shadow Copy Provider warning evaluated:** local Application/VSS events **12293**, record IDs **143936 and 143937**, occurred at **14:38:26 WIB / 07:38:26 UTC** and explicitly name W:. The first reports `IVssSnapshotProvider::IsVolumeSupported()` failing with **0x8000ffff**; the second reports the corresponding provider-support query failure. Their volume/timing are consistent with the reported warning, though the exact link to the owner's CHKDSK process is inferred. The generic error description does not establish damaged filesystem data.

VeraCrypt documents that VSS is unsupported for non-system-encryption volumes such as this file container. These events concern snapshot capability and do **not**, by themselves, invalidate a completed clean filesystem check or establish a material obstacle to direct, offline-locked FAT32-to-NTFS conversion. No VSS snapshot/rollback capability is assumed, and NTFS conversion should not be claimed to fix this driver-level limitation. No VSS service/provider repair or reconfiguration is proposed. Stop on any subsequent actual lock, filesystem, I/O or conversion error. [VeraCrypt VSS limitation](https://veracrypt.io/en/Issues%20and%20Limitations.html).

**Remaining prerequisite:** neither an empty outer filesystem, its free-space count nor a normal-looking mount can prove absence of a hidden volume. VeraCrypt deliberately makes an unmounted hidden volume indistinguishable from random free space. The owner must confirm that no hidden volume/data exists in this container before filesystem writes; no password, keyfile or hidden-volume contents are needed. [VeraCrypt hidden-volume design](https://veracrypt.io/en/Hidden%20Volume.html).

The latest instruction requires confirming explicit approval before proceeding; no unambiguous approval of the conversion plus the three-object ACL plan is recorded. Together with the missing hidden-volume confirmation, this keeps conversion, ACL changes and the subsequent write probe **unexecuted**. Formatting is now explicitly excluded entirely from this continuation; the older fallback discussion below is historical, not an authorized option. Windows memory settings, encryption, hosted services and production data remain untouched.

**Exact next owner response needed:**

> I confirm this intended VeraCrypt container has no hidden volume or hidden-volume data. I explicitly approve the reviewed `convert.exe W: /FS:NTFS /V` conversion of only the revalidated W: filesystem, preserving the existing container identity while its encrypted filesystem blocks change. After successful conversion, I approve the reviewed protected ACLs (hp Modify; SYSTEM and Administrators FullControl) on only the backing file `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc`, its dedicated parent `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc`, and the newly created `W:\WellBeingHub-Backups` folder, plus a non-sensitive write/read/delete probe in that folder. Stop on changed inventory/mount, errors or lock failure. No formatting, forced dismount, reboot scheduling, unrelated permissions, Windows encryption/memory changes, hosted changes or production export/restore is authorized.

If the owner cannot make the hidden-volume declaration, stop and resolve the container's creation/use history privately; do not try to prove absence by scanning or requesting secrets. Elevated Windows execution will still be necessary. [Updated evidence, including preserved earlier inspection and appended follow-up](evidence/PHASE2-STORAGE-CORRECTION-20261025.json).

25 October 2026, approximately **14:19 WIB / 07:19 UTC**. **Preparation only; NOT READY FOR EXPORT.** No conversion, formatting, ACL change, directory creation, encryption change, Windows setting change or hosted connection was performed. No passwords, recovery keys, file contents or database rows were read. Completed project work and the retained PostgreSQL rehearsal were preserved; no commit/push or rehearsal rerun.

[Timestamped read-only mount/inventory evidence](evidence/PHASE2-STORAGE-CORRECTION-20261025.json) is retained. All three prepared PowerShell blocks were syntax-parsed only; none was executed. This follow-up changes only this plan, the storage review/finalization links and that sanitized JSON evidence; application and backup execution code are unchanged.

## Reverified target and complete visible filesystem inventory

- Mounted drive: **W:**; Windows device target `\Device\VeraCryptVolumeW`.
- VeraCrypt read-only driver mount list, interface `0x0126`, names the same owner-confirmed backing file: `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc`.
- Backing file size: **10,737,418,240 bytes**. Its dedicated parent contains only that one file.
- W: filesystem: **FAT32**, blank volume label, total **10,716,168,192 bytes**, free **10,716,155,904 bytes (9.9802 GiB)**.
- A recursive `Get-ChildItem -Force` inventory completed with **zero inaccessible locations**. It found exactly:

| Entry | Type | Size |
| --- | --- | --- |
| `W:\System Volume Information` | Hidden/system directory | — |
| `W:\System Volume Information\WPSettings.dat` | Windows metadata file | **12 bytes** |

**There are no user files in the mounted filesystem; it is not literally empty.** No file contents were opened. This inventory does not establish anything about an unmounted hidden VeraCrypt volume. Before conversion, the owner must confirm this container has no hidden-volume data to preserve; do not infer that from the file listing.

The backup directory `W:\WellBeingHub-Backups` is absent. The last owner-confirmed source size is **11,335,347 bytes**, measured 25 October at **13:49:58 WIB**. The reviewed 5.1 GiB free-space budget still fits, subject to rechecking after conversion.

## Preferred correction: conditional in-place conversion

**Recommend Windows `convert.exe W: /FS:NTFS /V`, after a successful elevated read-only health check and fresh mount identity/inventory verification.** The installed `C:\Windows\System32\convert.exe` (10.0.26100.7623) was queried with `/?` only; its help confirms this syntax. This is the FAT-to-NTFS executable, not DiskPart's unrelated disk-layout conversion commands.

Microsoft documents conversion that preserves files and directories and has no reverse NTFS-to-FAT conversion. VeraCrypt documents mounted volumes as standard disk devices that support filesystem tools. Applying Windows conversion to this mounted device is therefore the preferred supported approach by inference from those two sources; successful execution on this specific volume has **not** been demonstrated. [Microsoft filesystem conversion](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2012-r2-and-2012/cc730863(v=ws.11)), [VeraCrypt filesystem tools](https://veracrypt.io/en/FAQ.html).

The exact operation affects **the filesystem exposed as W:**. VeraCrypt will write the changed filesystem blocks as ciphertext into the existing `.hc` file. The container file remains the same file at the same path and size, with its encryption identity/credentials preserved in the intended successful operation; its bytes cannot remain unchanged. No physical D: partition formatting, container recreation, password change or direct formatting of the `.hc` file is proposed.

Risks: power loss, corruption or an unexpected mount change can damage the filesystem; conversion is one-way with this utility; open handles may prevent a lock; default converted ACLs still require review. Use stable power, keep the container mounted, close W: Explorer windows and applications, and run from a working directory outside W:. An exact rollback copy would require a separately reviewed copy of the dismounted encrypted container; none was created, and no rollback copy is implied by this plan. Only Windows metadata is currently present.

### Remaining read-only administrator checks

The tool process has **no Windows administrator token**, including outside its sandbox. `chkdsk W:` was denied; this is an OS privilege limitation, not a finding of corruption. BitLocker status queries were also denied; no keys were requested. Open **Windows PowerShell → Run as administrator**, under the intended hp account, and execute:

```powershell
# Run from the project directory; inspection helper only.
. .\scripts\phase2-veracrypt.ps1
Get-Phase2VeraCryptMount -Drive 'W:' | Format-List
Get-ChildItem -LiteralPath 'W:\' -Force -Recurse |
  Select-Object FullName, PSIsContainer, Length
chkdsk W:
Get-BitLockerVolume -MountPoint 'C:' |
  Select-Object MountPoint, VolumeStatus, ProtectionStatus,
    EncryptionPercentage, EncryptionMethod | Format-List
manage-bde -status C:
```

`chkdsk W:` has no repair/force switches. Stop if the mount is different, any location cannot be enumerated, new user files appear, the volume is read-only/hidden-volume-protected, or health errors are reported. A VeraCrypt Volume Properties check and owner confirmation about hidden-volume use are required before a write; never request credentials in chat.

### Conversion command — NOT AUTHORIZED OR EXECUTED

Only after explicit approval and the above checks pass, use an elevated terminal:

```powershell
& "$env:SystemRoot\System32\convert.exe" 'W:' '/FS:NTFS' '/V'
```

Do not add `/NoSecurity` (broad access) or `/X` (forced dismount). If asked to force a dismount or schedule conversion at reboot, decline and stop: this file-backed W: mount may not exist at boot. Do not initiate repairs, reboot scheduling, remounts or formatting as an automatic fallback. Record a nonzero exit or warning and reassess. Administrator execution may need to be performed manually because this agent's token is not elevated.

### Formatting fallback — requires a separate approval

If a clean, correctly mounted W: is incompatible with in-place conversion, propose **quick-format of the mounted W: filesystem only**, after a fresh complete inventory and specific destructive-operation approval. VeraCrypt documents that formatting the mounted virtual filesystem retains encryption but erases its contents. The observed `WPSettings.dat` would be lost/recreated; any newly added files would also be lost. The existing `.hc` remains the backing container, with ciphertext changed through VeraCrypt.

The prospective command is `format.com W: /FS:NTFS /Q /V:WBH_BACKUP`, executed interactively only after confirming the mapped target and expected capacity. It is **not part of the conversion approval request below**. Do not select a physical disk in DiskPart/Disk Management, pass D: to a formatter, overwrite the `.hc`, recreate the container or force dismount. [VeraCrypt formatting guidance](https://veracrypt.io/en/FAQ.html).

## Prepared least-privilege ACL adjustment

Current file grants are inherited: Administrators and SYSTEM FullControl; Authenticated Users Modify; Users ReadAndExecute. Its dedicated parent has corresponding broad inheritable entries. Protecting only the file does not resolve its broadly writable immediate parent or the existing backup guard's parent check.

The proposed change is restricted to exactly these objects:

| Exact object | Proposed ACL |
| --- | --- |
| `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc` (dedicated directory) | Owner hp; protected DACL; hp Modify, SYSTEM FullControl, Administrators FullControl; folder/subfolder/file inheritance flags |
| `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc` (file) | Owner hp; protected DACL; hp Modify, SYSTEM FullControl, Administrators FullControl |
| `W:\WellBeingHub-Backups` (new directory, after NTFS succeeds) | Owner hp; protected DACL; hp Modify, SYSTEM FullControl, Administrators FullControl; folder/subfolder/file inheritance flags |

No Everyone, Users or Authenticated Users Allow grants remain on these objects. hp Modify permits backup read/write/create/delete without an explicit FullControl data-access grant; as owner, hp retains Windows owner rights. Necessary administrators/SYSTEM retain recovery access. The future exporter deliberately creates each private run directory with its existing operator/SYSTEM ACL.

**Do not apply ACLs to the Capstone directory, physical D: root, W: root, System Volume Information, the repository or unrelated files.** No recursive `icacls /T`, reset or blanket grant is proposed. The dedicated parent is included explicitly because it contains only the approved container and is currently writable by broad groups. This does not claim isolation from administrators or every possible ancestor-level rename/delete operation.

Before applying, capture each existing target's owner/DACL SDDL into local preparation evidence for recovery, confirm the actual hp SID, reject reparse paths, and stop if the dedicated parent has gained unrelated entries. After a successful NTFS conversion, create only the approved new backup folder. Preserve existing data; set each exact target's DACL individually. Existing open handles can retain previously granted access, so close other applications and verify effective access before future export.

Prepared ACL construction (review material only; **not executed**):

```powershell
# Only after explicit ACL authorization, NTFS/mount checks and ACL snapshots.
$hpSid = ([Security.Principal.NTAccount]'DESKTOP-0JBKJEC\hp').Translate(
  [Security.Principal.SecurityIdentifier])
$systemSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$adminsSid = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
function New-BackupObjectAcl([bool]$IsDirectory) {
  $acl = if ($IsDirectory) {
    [Security.AccessControl.DirectorySecurity]::new()
  } else { [Security.AccessControl.FileSecurity]::new() }
  $acl.SetOwner($hpSid)
  $acl.SetAccessRuleProtection($true, $false)
  $inherit = if ($IsDirectory) {
    [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
  } else { [Security.AccessControl.InheritanceFlags]::None }
  foreach ($entry in @(
    @($hpSid, 'Modify'), @($systemSid, 'FullControl'),
    @($adminsSid, 'FullControl'))) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
      $entry[0], [Security.AccessControl.FileSystemRights]$entry[1],
      $inherit, [Security.AccessControl.PropagationFlags]::None,
      [Security.AccessControl.AccessControlType]::Allow))
  }
  return $acl
}
# Apply only to the three exact objects listed above, using Set-Acl -LiteralPath.
# Folder creation and Set-Acl are intentionally not executed in this task.
```

## Windows memory-spill findings and options

| Read-only check | Observed state |
| --- | --- |
| Pagefile configuration | Automatic `?:\pagefile.sys`; existing `C:\pagefile.sys` |
| Pagefile clearing | `ClearPageFileAtShutdown = 0` |
| Power capabilities | S3 sleep and Hibernate available; Fast Startup disabled by policy; hybrid sleep unavailable |
| Kernel crash policy | `CrashDumpEnabled = 3` (small dump); `MinidumpDir = C:\WINDOWS\Minidump`; configured `DumpFile = C:\WINDOWS\MEMORY.DMP`; no dedicated dump file value |
| User-mode local dump policy | HKLM LocalDumps key exists with three application overrides; no global DumpType/DumpFolder value observed. HKCU LocalDumps key absent. No dump contents were opened; this does not certify all application dump behavior |
| C: encryption | Owner describes C: as unencrypted. Tool verification remains **unknown/access denied**, not an independent finding of encryption off |

If C: is unencrypted, database-client buffers or decrypted file data can be paged to C: or saved with hibernation. Small kernel dumps contain less information than full memory dumps and are not evidence that entire database buffers are being dumped, but they are not a general guarantee against sensitive diagnostic material. Clearing a pagefile at shutdown alone does not protect it during use or after an abrupt power loss. Keeping explicit output/TEMP paths on W: and dismounting W: do not erase previously paged data. [VeraCrypt paging](https://veracrypt.io/en/Paging%20File.html), [hibernation](https://veracrypt.io/en/Hibernation%20File.html), [Microsoft dump types](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/varieties-of-kernel-mode-dump-files).

**Preferred option:** verify C:'s state first; if unprotected, separately approve BitLocker system-drive protection on this Windows Professional installation. An administrator uses Start → **Manage BitLocker → C: → Turn on BitLocker**, privately secures recovery material outside this repo/chat/backup folder, follows the wizard and waits for completed protection. Verify Protection On, FullyEncrypted, 100%, and confirm every paging/dump destination is on an encrypted volume. Do not stack encryption systems or change an already encrypted system without reviewing its current configuration. [Microsoft instructions](https://support.microsoft.com/en-us/windows/security/encryption/bitlocker-drive-encryption).

**Alternative:** use a separately approved machine with verified full-disk encryption and protected memory-spill storage. This requires a new destination/environment review before any production connection.

**Less desirable, separate system-policy change:** an administrator can assess disabling hibernation and crash dumps, and disabling paging or restricting it to a suitable persistently available encrypted system volume. This has memory-pressure, diagnostic and restart consequences and requires a complete review before claiming safety. Do not move a system pagefile to this manually mounted W: container. No command changing these settings is proposed for immediate execution; no system change is included in the storage approval below.

## Final verification checklist after separately approved correction

1. Re-read the VeraCrypt mount list and Windows device mapping: W: must still reference the exact approved file; verify standard writable mount/no hidden data at risk.
2. Confirm W: NTFS, clean filesystem and expected approximately 10 GiB capacity; retain conversion output and the final inventory. Recalculate available space against the 5.1 GiB budget.
3. Confirm the existing backing file still exists at the original path and size, remains outside Git/sync/reparse paths, and no unrelated container-parent entry changed.
4. Verify protected DACLs and hp ownership on exactly the three approved objects; only hp/SYSTEM/Administrators allowed. Check hp Effective Access for backup read/write/create/delete. Confirm mounted backup folder exists and no broad read grant remains.
5. Complete independent C:/pagefile/hibernation/crash protection review and recovery-material custody. Do not assert `-SystemSpillProtectionConfirmed` before that review passes.
6. Run `scripts/phase2-backup.ps1` in preparation mode with the exact container path, W: folder, owner-confirmed sync exclusion and `-RequiredFreeGiB 5.1`; verify PostgreSQL 17.11 clients and all storage predicates. Run `node scripts/phase2-backup.mjs --dry-run` and confirm every artifact/application scratch path stays inside the W: run directory. Do not use `-ExportApproved`.
7. Optional non-sensitive folder write/read/delete probe only if separately included in approval; do not use a database export as a storage test. No real PostgreSQL concurrency rerun is needed.
8. Only after every gate passes, request separate source-specific production-export approval. Storage correction approval never authorizes export, restore or a hosted migration.

## Exact next approval request

> Approve an in-place FAT32-to-NTFS conversion of **only the verified mounted W: filesystem**, backed by `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc`, using Windows `convert.exe W: /FS:NTFS /V`. Execution is conditional on a successful elevated read-only filesystem check, unchanged mount/inventory and confirmation that no hidden-volume data is at risk. The only currently listed file is Windows metadata `System Volume Information\WPSettings.dat` (12 bytes). Preserve the existing container file/encryption identity; acknowledge that encrypted filesystem blocks within it will change and interruption may cause corruption. Also approve recording existing ACLs and applying the listed hp Modify / SYSTEM and Administrators FullControl protected ACLs **only** to that `.hc` file, its dedicated parent `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc`, and the newly created `W:\WellBeingHub-Backups` directory after conversion succeeds. Permit a non-sensitive write/read/delete probe confined to the new backup directory. Stop on any failed prerequisite, unexpected file, lock/conversion error or permission failure. Do not force dismount, schedule reboot conversion, format anything, alter Capstone/unrelated ACLs, change Windows encryption/memory settings, export/restore production data, apply hosted changes, commit or push.

This is a request for new authorization, required by the owner's explicit prohibition on conversion/ACL changes without approval. It is not a claim that approval has already been granted. Windows administrator execution remains necessary; the agent's current token cannot supply it. Formatting and system-drive encryption would each need their own separately reviewed authorization if later necessary.

