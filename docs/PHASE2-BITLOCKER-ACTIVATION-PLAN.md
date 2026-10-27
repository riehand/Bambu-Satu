# C: BitLocker readiness and conditional activation plan

> **SUPERSEDED BY OWNER DECISION:** BitLocker activation is **CANCELLED BY PROJECT OWNER**; VeraCrypt backup workflow is **RETIRED / CLEANUP COMPLETED**. Do not execute the activation/conversion instructions below. Findings are retained as historical evidence. Use the [selected Google Drive encrypted-archive workflow](PHASE2-GOOGLE-DRIVE-BACKUP.md) and [completed cleanup evidence](PHASE2-VERACRYPT-RETIREMENT.md). No system-encryption preparation remains an active requirement.

**Final preparation follow-up:** the [practical pre-BitLocker checklist](PHASE2-PRE-BITLOCKER-CHECKLIST.md) inventories the dirty Git tree, required ignored configuration/tools, secure external copy procedure, skill-junction handling, independent verification and owner-only recovery/GUI steps. The external backup has not been created or verified. This does not authorize activation.

25 October 2026. **Windows 11 Pro and the principal hardware prerequisites support BitLocker on C:. No definitive activation blocker was found by the read-only audit. Activation remains conditional and NOT AUTHORIZED.** Important-file backup, private recovery custody and maintenance readiness need owner confirmation; Windows setup must still accept the existing partition layout. No encryption, partition, firmware, TPM, memory-setting or hosted database change was performed.

## Evidence and interpretation

The owner supplied elevated TPM, Secure Boot and WinRE results and an earlier C: status. These were recorded as owner-provided evidence, then independently corroborated by a successful UAC-elevated **read-only** audit at **20:06:24-20:06:27 WIB / 13:06:24-13:06:27 UTC**. The C: and D: queries were separate. Initial unelevated attempts failed with access denied; none was treated as evidence of encryption state. [Actual administrator evidence](evidence/PHASE2-BITLOCKER-ADMIN-20261025.json).

| Check | Actual result | Interpretation |
| --- | --- | --- |
| Windows | Prior registry evidence: Professional, 25H2, build 26200.9711 | Edition supports manual BitLocker |
| TPM | Present, ready, enabled, activated; not locked out; specification 2.0 | TPM-based activation prerequisites supported |
| Secure Boot | Firmware query True | Enabled; no BIOS/UEFI change required by this plan |
| WinRE | Enabled, `reagentc /info` successful, disk 1 partition 4 | Recovery environment configured; not a performed recovery test |
| **C:** | **FullyDecrypted; 0%; Protection Off; method None; Unlocked** | C: is presently unprotected |
| **D:** | **FullyDecrypted; 0%; Protection Off; method None; Unlocked** | Independently verified, not inferred from C: or missing output |
| C: OS disk | Disk 1, GPT; C: NTFS; approximately 126.04 GiB free | OS filesystem and basic layout are suitable |
| EFI system partition | Disk 1 partition 1, separate FAT32, 100 MiB partition; filesystem reports 96 MiB total and approximately 61.34 MiB free | Required separate UEFI boot filesystem exists; size advisory below |
| Recovery partition | Disk 1 partition 4, NTFS, about 906 MiB partition | Remains separate and untouched |
| D: data disk | Disk 0, GPT, NTFS, approximately 146.70 GiB free in earlier same-session inspection | Separate physical SSD from C:; no D: encryption or layout change proposed |
| Disk health | Both disks and physical SSDs report Healthy | Coarse Windows health status, not a full media/filesystem scan or failure guarantee |
| Active pagefile | Only returned entry `C:\pagefile.sys`, 15,360 MiB allocation | C: encryption would cover this active spill location at rest; retain current settings |
| Relevant Group Policy | `HKLM\SOFTWARE\Policies\Microsoft\FVE` absent | No settings in this inspected location; not a guarantee against future/other management policy |
| Relevant MDM policy | `HKLM\SOFTWARE\Microsoft\PolicyManager\current\device\BitLocker` absent | No settings in this inspected location |
| Automatic Device Encryption | `PreventDeviceEncryption=1` | Automatic provisioning is prevented; this is not evidence manual BitLocker is prohibited. Leave it unchanged |
| Services | BDESVC stopped, Manual; ShellHWDetection running, Automatic | BitLocker service is not disabled; no service setting change required by the evidence |
| Reboot indicators | CBS, Windows Update and pending file-rename indicators all false | No pending restart found in these three checks; owner must still review Windows Update before maintenance |

Microsoft lists Pro support, TPM/UEFI requirements, NTFS OS storage and a separate FAT32 system partition. Its overview recommends roughly 350 MB for the system partition and 250 MB free after activation. **This laptop's 100 MiB EFI partition is below that recommendation.** This is not proof it cannot support BitLocker, and no setup eligibility test was performed. Keep the normal setup/system check and stop if it rejects the layout or requests repartitioning; do not run BdeHdCfg, DiskPart, resize, format, assign an EFI drive letter or alter boot files under the proposed C:-only authorization. [Microsoft requirements](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/).

The inspected policy locations showed no conflicting startup method or mandatory escrow configuration. If setup later reports organization policy or mandatory account escrow, pause and review it; do not remove policies or select an unapproved cloud destination. [Microsoft policy reference](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/configure).

## Scope and operational risks

The future target is **only the Windows OS volume C: on disk 1 partition 3**, not all of disk 1, D:, W: or the VeraCrypt backing file. Normal BitLocker setup updates its own OS/boot protection metadata; no partition resize/creation is included. The plaintext EFI boot partition is normal and is not the destination for pagefile or database exports.

- Firmware, boot-chain or hardware changes can trigger recovery. A lost/unavailable recovery secret can prevent access even if the disk is healthy. Secure Boot and TPM will remain unchanged.
- Initial encryption adds disk I/O and can take significant time; exact duration is not predicted. Keep AC power connected and a charged battery. Restart and boot validation need a maintenance window without a deadline or active unsaved work.
- Encryption is designed to preserve files, but existing hardware faults or interrupted maintenance still justify a verified backup. A Healthy status is not a substitute for that backup.
- Retain system-managed paging, hibernation and crash-dump settings. Full-volume encryption protects the existing C: spill paths at rest; it does not remove plaintext from live RAM, stop malware/admin access or protect files on another unencrypted volume.
- D: remains decrypted if only C: is encrypted. The `.hc` contents on D: remain VeraCrypt ciphertext; ordinary project files and any secrets elsewhere on D: do not gain BitLocker protection. No production dump may be staged there. Current evidence finds the pagefile on C:, but automatic pagefile placement and future dump changes require a new check before export. If a spill path appears on D:, a separate protection decision is required.
- C: BitLocker does not replace the VeraCrypt password/keyfiles, independent data backups, restore verification or production-export approval.

## Owner preparation checklist - no encryption change yet

- [ ] Confirm administrative authority and any work/school device requirements. Inspect Windows Update for a pending restart or scheduled firmware update; do not combine unrelated upgrades with encryption setup.
- [ ] Save work and prepare a recoverable backup of important C: files and the complete current project on D:, including uncommitted/untracked work. Store it on owner-approved independent protected media; validate sample-file readability privately. Keep credentials protected, never publish them through Git or terminal output. No backup was created by this audit.
- [ ] Confirm the existing VeraCrypt container remains at its approved D: path. Any backup copy of it requires a separate owner-chosen protected destination and a consistent normal-dismount procedure; do not copy a live mounted container as the sole recovery copy. No container copy, dismount or change occurred here.
- [ ] Choose the future BitLocker recovery-secret destinations below and verify they can be accessed without this laptop, C:, D: or W:. Record only confirmed/pending in the project; do not record the secret or its exact custody location.
- [ ] Confirm reliable AC power, charged battery and a maintenance window long enough for setup, restart and encryption. Close applications normally before restart; stop active Docker/database work gracefully if needed, retaining the rehearsal container/volume. Close W: files and use normal VeraCrypt dismount before the planned reboot, never force it.
- [ ] Confirm disk health remains acceptable. If Windows reports filesystem/media errors, resolve them through a separately reviewed plan before encryption; no repair or destructive disk operation is authorized here.
- [ ] Review and explicitly approve the narrow activation scope below. Current authority is preparation only.

## Recovery custody plan

Recommend **an offline removable USB kept physically secured away from the laptop**, with an independent second owner-approved copy (for example a sealed written record or approved password manager accessible from another trusted device). A saved USB recovery text file is itself a secret: do not leave the USB attached, lend it, or keep it in the laptop bag. If encrypted removable storage is used, verify its independent unlock method and another trusted device capable of reading it, so recovery has no circular dependency.

Do not save the sole recovery copy on C:, D:, W:, in the repository, in cloud-synced Documents/Desktop, in chat or in logs. The existing VeraCrypt volume on the same laptop is not the primary custody destination. Account-based Microsoft/Entra escrow is an option **only if the owner approves that account and cloud storage**, with MFA and account recovery independently available. Do not choose it merely because the wizard offers it.

During a future approved setup, the owner privately saves and verifies the generated recovery material before continuing. Privately associate it with this device/drive and its identifier, and confirm the copy is readable independently. The assistant does not retrieve/display the key. Do not intentionally force a recovery boot to test it. A recovery key is not an ordinary Windows sign-in password or a VeraCrypt password. Microsoft cannot recreate a lost key. [Microsoft recovery backup options](https://support.microsoft.com/en-us/windows/security/encryption/back-up-your-bitlocker-recovery-key).

## Recommended manual setup - only after explicit approval

Use **Start > Manage BitLocker > Operating system drive C: > Turn on BitLocker**, rather than enabling broad automatic Device Encryption. This makes the C:-only scope and recovery choice reviewable. Use the supported TPM-based unlock workflow and normal Windows defaults that comply with policy. TPM+PIN is a useful additional preboot protection option but is not silently added; policy/PIN changes need separate review if chosen.

1. Complete the preparation checklist and obtain approval. Do not press **Turn on BitLocker** during the current preparation task.
2. Recheck C: status. If it differs from FullyDecrypted/0%/Off, stop and review rather than restarting or altering encryption.
3. Open the C: wizard. Stop on unexpected prerequisites, partition repair/repartition requests, mandatory unapproved escrow, policy conflicts or errors. Never clear TPM or change Secure Boot to proceed.
4. Save the recovery material **directly to the chosen independent destination**, privately verify it and retain the independent second copy. No temporary copy on C:/D: or screenshot/transcript in the project.
5. Select **Encrypt entire drive** for this already-used C: volume. Choose **New encryption mode** for this fixed Windows 11 drive; use the supported default software encryption method unless an existing policy requires otherwise. Do not change policy to force a different algorithm.
6. Keep **Run BitLocker system check** selected. Restart only after work is saved and W: has been normally dismounted. If preboot/setup rejects the existing EFI layout, stop; no partition repair is included.
7. Allow encryption to finish on AC power. Verify normal boot, `FullyEncrypted`, 100%, `ProtectionStatus On`, and a non-None encryption method. A suspended protector or encryption in progress is not completion.
8. Recheck WinRE and actual pagefile/dump locations; any spill volume outside protected C: remains a separate gate. Remount the original VeraCrypt container normally and run the existing storage preparation checks when ready. Do not repeat filesystem conversion or the PostgreSQL rehearsal.

Microsoft documents the Control Panel workflow, whole-volume choice for existing OS drives and the system check in its [operations guide](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/operations-guide). No activation command has been run or queued by this task.

Read-only status commands for the owner, separately and with explicit formatting:

```powershell
# Elevated PowerShell; neither command exposes recovery secrets.
Get-BitLockerVolume -MountPoint 'C:' |
  Select-Object MountPoint,VolumeStatus,ProtectionStatus,EncryptionPercentage,EncryptionMethod |
  Format-List
Get-BitLockerVolume -MountPoint 'D:' |
  Select-Object MountPoint,VolumeStatus,ProtectionStatus,EncryptionPercentage,EncryptionMethod |
  Format-List
```

These were successfully performed in the audit; there is no need to repeat them now merely to fill the earlier missing table.

## Exact approval boundary and Phase 2 status

The next action is owner confirmation of important-file backup, chosen independent recovery custody and maintenance timing. Then the proposed approval is:

> I authorize manual Microsoft BitLocker activation on the Windows OS volume C: only, using TPM-based protection, full-volume encryption, the normal system check and planned restart. I have verified my important-file backup and selected independent secure recovery custody; I will privately verify the recovery material before continuing. Stop if Windows requires partition changes, policy changes, TPM/firmware changes or an unapproved escrow destination. This does not authorize D:/W: encryption, changes to the VeraCrypt container, memory settings, production export/restore, hosted migrations, commits or pushes.

This is a proposed approval statement, **not approval already received**. If the owner prefers to complete setup themselves, they may state that intention after reviewing the checklist. A setup warning requires the non-secret warning text and a new assessment, not an automatic workaround.

| Gate | Current status |
| --- | --- |
| Windows edition / TPM 2.0 / Secure Boot / WinRE | **VERIFIED** |
| Policy and partition readiness | **No definitive blocker identified; EFI size advisory and setup acceptance remain** |
| C: BitLocker activation | **NOT AUTHORIZED; preparation/custody/timing confirmations pending** |
| Storage filesystem and ACLs | **PASSED**, existing evidence retained |
| Windows memory-spill protection | **PENDING - C: currently decrypted** |
| Recovery-material custody | **PENDING OWNER CONFIRMATION** |
| Production backup export | **NOT AUTHORIZED** |
| Restore verification | **PENDING** |
| Hosted migration | **NOT AUTHORIZED** |

The audit helper `scripts/phase2-bitlocker-readiness.ps1` is read-only and stores selected metadata, never key protectors/recovery secrets. Its PowerShell syntax and evidence JSON were checked. Application code, existing backup guards, tests, migrations and the VeraCrypt volume were unchanged. No completed storage/concurrency tests were rerun. New evidence is linked above; the earlier security/finalization/storage documents link to this current decision.

