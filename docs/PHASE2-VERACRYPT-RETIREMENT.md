# VeraCrypt retirement and completed cleanup

**RETIRED / CLEANUP COMPLETED — 26 October 2026, 00:15 WIB.** The owner explicitly approved the normal dismount and exact deletion. BitLocker activation remains **CANCELLED BY PROJECT OWNER**. Google Drive encrypted archives are [the selected strategy](PHASE2-GOOGLE-DRIVE-BACKUP.md).

## Actual cleanup results

- Fresh driver inspection confirmed W: mapped to `\Device\VeraCryptVolumeW` and the exact approved backing container below. Filesystem was NTFS. Recursive inventory contained only the empty backup folder and `System Volume Information\WPSettings.dat` (12 bytes); no user, project or backup files were present. The owner's prior no-hidden-volume confirmation remained applicable.
- Normal `VeraCrypt.exe /u W /q /s` completed with exit code **0**. No force flag, reboot scheduling, formatting or system-setting change was used. Windows device mapping and W: path were absent afterward.
- Exact paths, 10 GiB file size, ancestor reparse absence and dedicated-parent inventory were checked before deletion. An exclusive read-only open of the backing file after dismount succeeded, confirming no competing container handle at that check.
- Permanently deleted only `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc`, then its empty dedicated parent `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc`. Parent removal was non-recursive and refused non-empty directories. Both paths are verified absent. This is deletion, not a claim of secure SSD erasure.
- Capstone ACL and unrelated sibling names were unchanged. Before documentation edits, Git status was identical except for the new cleanup evidence. All project work and historical evidence were retained; no ACL restoration or software uninstall occurred.
- Docker's engine was offline during the read-only inspection, so its live resource identity could not be rechecked. No Docker changes were attempted; the retained rehearsal was not restarted or repeated.
- No BitLocker activation, production export/restore, hosted migration, commit or push occurred.

See [timestamped execution evidence](evidence/PHASE2-VERACRYPT-CLEANUP-20261026.json). Next action: owner installs the official 7-Zip GUI, then continue the selected encrypted project archive and private Google Drive verification workflow. The standard installation location still lacked 7-Zip after cleanup; no installation was performed.

## Historical proposal — completed, do not execute again

The following inventory and approval sequence are retained as the pre-cleanup record. Their pending-approval language is historical and superseded by the execution results above; the container and W: mount no longer exist.

## Pre-cleanup inspection

- W: is mounted as `\Device\VeraCryptVolumeW`, verified through the existing read-only VeraCrypt driver interface, and is NTFS.
- Exact backing file: `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc`, **10,737,418,240 bytes** (10 GiB).
- Full recursive inventory completed without errors: `W:\WellBeingHub-Backups` is empty; `W:\System Volume Information` contains only `WPSettings.dat`, **12 bytes**, Windows metadata. Therefore W: is **empty of user/project/backup data**, not literally empty. No credential/project/archive file was found; no file contents were read. The owner previously confirmed a Standard VeraCrypt volume without hidden-volume data.
- The dedicated parent contains only the named container. No other parent-directory file is included in cleanup.
- Current owner/protected ACLs remain hp Modify, SYSTEM and Administrators FullControl on the exact container, dedicated parent and backup folder.
- A visible process executable/command-line reference check found no W: references. No raw command lines were recorded. No installed Handle/Process Explorer tool was found on PATH. This is **not a complete open-handle audit** and does not prove W: is idle. VeraCrypt's mounted driver necessarily depends on the backing file.

See [current inventory and original ACL references](evidence/PHASE2-BACKUP-STRATEGY-CHANGE-20261025.json). A final fresh inventory, same-container mapping check and successful normal dismount are mandatory immediately before any approved deletion. If new files, errors or in-use prompts appear, stop.

## Targets and reversibility

| Target/action | Treatment |
| --- | --- |
| W: mount of the exact container | Normal GUI dismount is reversible if the container is retained; proposed only, not performed |
| Exact `.hc` backing file above | Permanent deletion loses the entire filesystem and any subsequently added contents; final explicit confirmation required |
| Dedicated parent `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc` | Remove only after container deletion and an immediate empty-directory check; no recursive deletion |
| `W:\WellBeingHub-Backups`, NTFS metadata and Windows metadata | Inside the container; no separate removal, formatting or filesystem reversal is needed if the approved container is deleted |
| Restricted ACLs on container/parent | Leave in place while pending. Their objects cease to exist if deleted; no ACL restoration is necessary for that plan |
| Repository backup scripts | Reversible edits to generic preparation; originals preserved as non-executable historical text |
| `phase2-veracrypt.ps1`, storage-correction/readiness helpers and audit docs | Retain for provenance/cleanup review, marked historical in current docs; no script deletion or additional system audit proposed |
| VeraCrypt installation, all Capstone siblings, physical D: and project files | Not cleanup targets; no uninstall, disk format or parent ACL changes |
| Docker rehearsal container/volume | Retain unchanged; not a cleanup target |

Original ACLs are recorded exactly in `AclBefore` of [conversion evidence](evidence/PHASE2-STORAGE-EXECUTION-20261025T122124368Z.json). They contained inherited Authenticated Users Modify and Users read/execute grants. Reverting them would broaden access unnecessarily. **Recommended ACL reversions: none.** If the owner later retains/reuses these objects and specifically requests exact restoration, use that snapshot for only the two original D: objects; do not invent defaults or apply it to Capstone. The new W: backup folder did not have an original pre-creation ACL to restore.

## Approval-required cleanup sequence

1. Obtain final approval naming the backing file and dedicated parent. Refresh exact mount identity and entire W: inventory; confirm no new valuable data. A previous empty inventory is not perpetual approval.
2. Close W: Explorer windows and any application that might use it; inspect Resource Monitor > CPU > Associated Handles for `W:\` / `VeraCryptVolumeW` where available. Do not kill processes blindly or change their settings.
3. In VeraCrypt select **W:** and use normal **Dismount**. If it reports files in use, decline force dismount and stop. Verify this container is no longer mounted at any letter and W: is absent. Do not schedule work on reboot.
4. Recheck exact file identity, dedicated parent, no reparse points and length, then delete only the approved backing file. Remove its dedicated parent only when still empty. Preserve every project/evidence file.

Prepared deletion portion, **NOT AUTHORIZED / NOT EXECUTED**, usable only after the approved fresh checks and successful normal dismount above:

```powershell
$cleanupContainer = 'D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc\WellBeingHub-Backup.hc'
$cleanupParent = 'D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\WellBeingHub-Backup.hc'
if (Test-Path -LiteralPath 'W:\') { throw 'Stop: W: is still visible.' }
$containerItem = Get-Item -LiteralPath $cleanupContainer -Force -ErrorAction Stop
$parentItem = Get-Item -LiteralPath $cleanupParent -Force -ErrorAction Stop
if ($containerItem.FullName -ne $cleanupContainer -or $parentItem.FullName -ne $cleanupParent -or
    $containerItem.PSIsContainer -or $containerItem.Length -ne 10737418240 -or
    (($containerItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or
    (($parentItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
  throw 'Stop: cleanup target changed.'
}
if (@(Get-ChildItem -LiteralPath $cleanupParent -Force -ErrorAction Stop).Count -ne 1) {
  throw 'Stop: unexpected sibling files.'
}
# Prior GUI/driver check must also establish this container is not mounted elsewhere.
Remove-Item -LiteralPath $cleanupContainer -ErrorAction Stop
# Non-recursive API refuses a non-empty directory, including a race/new file.
[IO.Directory]::Delete($cleanupParent, $false)
```

The exact parent/file are outside the repository and inside only the previously identified dedicated directory. No recursive deletion, wildcard removal, ACL changes, formatting or cross-shell operation is proposed. Deletion is irreversible in this plan and is not claimed to securely erase SSD remnants.

**Proposed confirmation:** approve normal dismount of the verified W: volume, then permanent deletion of only the exact `.hc` file and its empty dedicated parent, after a fresh unchanged inventory; stop on any in-use prompt or mismatch. Leave all project work, evidence, current system settings, unrelated folders and Docker resources unchanged. Until that confirmation arrives, leave everything in place.
