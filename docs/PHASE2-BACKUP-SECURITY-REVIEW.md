# Final backup security review - 25 October 2026

> **SUPERSEDED BY OWNER DECISION:** BitLocker activation is **CANCELLED BY PROJECT OWNER**; VeraCrypt backup workflow is **RETIRED / CLEANUP COMPLETED**. Do not execute the activation/conversion instructions below. Findings are retained as historical evidence. Use the [selected Google Drive encrypted-archive workflow](PHASE2-GOOGLE-DRIVE-BACKUP.md) and [completed cleanup evidence](PHASE2-VERACRYPT-RETIREMENT.md). No system-encryption preparation remains an active requirement.

**20:06 WIB follow-up supersedes the unknown TPM/firmware/encryption findings below:** an elevated read-only audit independently confirms TPM 2.0 ready, Secure Boot True, WinRE enabled, and **both C: and D: FullyDecrypted / 0% / Protection Off / method None** through separate queries. The inspected BitLocker policy keys are absent. C: is on a healthy GPT SSD with a separate FAT32 EFI partition; the 100 MiB EFI size is an advisory for normal setup acceptance, not permission to resize. See the [current C:-only activation plan and evidence](PHASE2-BITLOCKER-ACTIVATION-PLAN.md). Important-file backup, recovery custody, timing and explicit activation approval remain pending. No settings changed. Older findings below are retained as the earlier review snapshot.

**Decision: production backup remains NOT READY and NOT AUTHORIZED.** Storage filesystem and ACL verification passed previously. This review inspected Windows configuration only; it did not repeat storage correction, access probes or PostgreSQL tests. No production connection, export, restore, system-setting change, commit or push occurred.

## Findings and limits

Read-only observations were collected on 25 October 2026, including the registry follow-up at **19:40:16 WIB / 12:40:16 UTC**. [Sanitized evidence](evidence/PHASE2-MEMORY-SECURITY-20261025.json) distinguishes successful checks from unavailable results.

| Item | Actual result / implication |
| --- | --- |
| Edition/build | Registry: `Professional`, `25H2`, build `26200.9711`, consistent with Windows 11 Pro. Legacy `ProductName` says Windows 10 Pro; it is not used alone to identify this release. CIM OS details were denied |
| Microsoft encryption feature | BitLocker and TPM PowerShell modules and `manage-bde.exe` are installed. Pro supports BitLocker; presence/edition do not prove encryption or eligibility |
| TPM | `Get-Tpm` returned no usable selected status values in this session. Presence, readiness and specification version **UNKNOWN**, not absent |
| Secure Boot | Registry `UEFISecureBootEnabled=1`; firmware cmdlet denied privileges. Registry reports enabled, but independent firmware confirmation remains pending |
| Device Encryption | `PreventDeviceEncryption=1` under `HKLM\SYSTEM\CurrentControlSet\Control\BitLocker`. Automatic encryption is configured to be prevented; this does not prove current volumes decrypted or manual BitLocker unsupported. Do not change the value |
| Existing C:/D: encryption | `Get-BitLockerVolume` failed with access denied. **UNKNOWN in this review**; owner previously described C: as unencrypted. Do not infer status from EFS or these failures |
| Pagefile | Registry `ExistingPageFiles=\??\C:\pagefile.sys`; `PagingFiles=?:\pagefile.sys`; `ClearPageFileAtShutdown=0`. Active allocation/usage and RAM could not be read via CIM. Automatic placement means future locations must also be reviewed |
| Hibernation | `powercfg /a`: Hibernate and S3 available; S0 Low Power Idle unsupported; Fast Startup disabled by policy. Hibernate availability is a spill path, not proof it occurred. HibernateEnabledDefault=1; current hiberfile size was not inspected |
| System crash dumps | CrashDumpEnabled=3 (small dumps), MinidumpDir=`C:\WINDOWS\Minidump`; configured DumpFile=`C:\WINDOWS\MEMORY.DMP`. The latter path does not mean a full dump is enabled or a file exists |
| Application dumps | Three machine-wide per-application LocalDumps entries target `C:\Users\hp\AppData\Local\CrashDumps`, type 1. No global DumpType/Folder value was returned. This is not evidence that all application/Windows error reporting is disabled; no dump contents were read |
| Reboot indicators | Two checked CBS/Windows Update pending-reboot keys absent. This is a limited check, not a guarantee that no reboot/update is pending |
| Hardware, RAM, disk health/free space, WinRE | Not established by privileged checks. Sandbox Get-PSDrive results were unusable and are not treated as actual disk sizes. Complete the manual checks below |

The initial sandbox denied CIM and firmware access. A requested outside-sandbox read-only retry was interrupted before any result was returned; it is **not counted as a pass**. No automatic-approval rejection was reported. No elevated audit was completed in this review.

Microsoft identifies build 26200 with Windows 11 25H2 ([release announcement](https://blogs.windows.com/windows-insider/2025/08/29/releasing-windows-11-version-25h2-to-the-release-preview-channel/)). Pro supports manual BitLocker; Device Encryption has separate prerequisites ([Microsoft support](https://support.microsoft.com/en-us/windows/security/encryption/device-encryption-in-windows)). Lack of Modern Standby alone is not a disqualifier on 25H2: Microsoft removed that prerequisite from automatic encryption starting with 24H2 ([OEM requirements](https://learn.microsoft.com/en-us/windows-hardware/design/device-experiences/oem-bitlocker)).

## Risk and recommended approach

W: encrypts backup files at rest, but decrypted client buffers and connection credentials exist in RAM during export. Windows may persist portions to paging, hibernation or dumps outside W:. Redirecting application TEMP/TMP and archives to W: does not redirect OS-managed spills. VeraCrypt documents both [paging exposure](https://veracrypt.io/en/Paging%20File.html) and [hibernation exposure](https://veracrypt.io/en/Hibernation%20File.html). No production export occurred, so this is an unresolved protection requirement, not a finding that production backup contents leaked.

**Recommended practical route for this laptop: A, conditional on the administrator findings.** Verify existing protection first. If C: is unprotected and hardware/recovery checks pass, separately approve supported Microsoft BitLocker protection of the complete C: volume, retaining the system-managed pagefile and current memory settings. Protect any other identified spill volumes too, under their own explicit scope. Continue to store archives inside the existing VeraCrypt W: destination. Do not set `-SystemSpillProtectionConfirmed` until evidence supports it.

| Approach | Practicality and prerequisites | Security tradeoffs and operational risks |
| --- | --- | --- |
| A. BitLocker on this laptop | Pro is present; requires administrator, TPM/firmware/WinRE and storage checks, reliable power, recoverable backup of existing personal/project work, independently accessible recovery material, and a maintenance window. No new computer or exporter port is needed | Covers OS spill files on encrypted volumes at rest. Startup/firmware changes can require recovery; lost recovery material can mean lost access. Encryption consumes I/O/time and may require restart. TPM+PIN offers stronger preboot protection but needs a separately reviewed configuration. Encryption does not stop malware, an active administrator, or access while unlocked |
| B. Separate encrypted backup computer | Prefer an already managed, patched physical machine with verified full-volume encryption for OS, swap/pagefile, temporary files and dumps; restricted account, approved network, PG17 tools and a newly reviewed encrypted destination. Availability is not established | Avoids processing production data on this Windows installation and avoids changing this laptop. Requires trusted device/operator and separate destination approval; adds equipment, credential provisioning and transfer/custody work. It retains live-memory and endpoint compromise risks on that machine |

If A is unsuitable or the owner does not want to alter the laptop, **choose B before export**. A separately booted, verified OS on encrypted external media can also avoid the installed Windows OS, but needs a specific boot/media plan, encrypted swap/temp/dumps and internal volumes left unmounted; it is more setup-sensitive than an already secured physical machine. Do not change Secure Boot just to boot it. Docker, WSL, a VM, or a remote session hosted by this unprotected Windows installation is not sufficient evidence that host spills are protected. This is a threat-model conclusion, not a claim that every hypervisor pages every buffer.

For B, select the physical device and exact destination first; inspect its protection, obtain approved official tools, and dry-run the reviewed workflow there. Do not copy `.env` or credentials into ordinary storage, route dump streams through this laptop, or open completed archives on this laptop while its spill protection is pending. Any return transfer must be ciphertext only and separately approved. Current scripts require Windows W: and the exact VeraCrypt identity: a different machine/container or Linux boot requires a reviewed adaptation and new approval, never bypassing the interlock. No B environment was created or verified here.

Simply disabling the pagefile is not recommended. It reduces the system commit limit, can cause allocation failures under development/Docker load and affects crash diagnostics; this review could not even verify installed RAM and peak commit usage. It also leaves hibernation and dump paths unresolved. Preserve system management and encrypt its storage instead. [Microsoft pagefile guidance](https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/how-to-determine-the-appropriate-page-file-size-for-64-bit-versions-of-windows).

## Exact manual actions now: read-only administrator checks

Open **Start > Windows Terminal > Run as administrator > PowerShell**. Run these status-only commands. Share only the selected status fields or failure messages, never recovery keys. Do not use `manage-bde -protectors -get`, unfiltered TPM output, or a full system-information export.

```powershell
Get-CimInstance Win32_OperatingSystem |
  Select-Object Caption, Version, BuildNumber, OSArchitecture, TotalVisibleMemorySize
Get-CimInstance Win32_ComputerSystem |
  Select-Object Manufacturer, Model, TotalPhysicalMemory, AutomaticManagedPagefile
Get-Tpm | Select-Object TpmPresent, TpmReady, TpmEnabled, TpmActivated, LockedOut
Get-CimInstance -Namespace 'root\CIMV2\Security\MicrosoftTpm' -ClassName Win32_Tpm |
  Select-Object SpecVersion, IsEnabled_InitialValue, IsActivated_InitialValue
Confirm-SecureBootUEFI
Get-BitLockerVolume -MountPoint 'C:', 'D:' |
  Select-Object MountPoint, VolumeStatus, ProtectionStatus, EncryptionPercentage,
    EncryptionMethod, LockStatus
Get-CimInstance Win32_PageFileUsage |
  Select-Object Name, AllocatedBaseSize, CurrentUsage, PeakUsage
powercfg.exe /a
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl' |
  Select-Object CrashDumpEnabled, DumpFile, MinidumpDir, DedicatedDumpFile
reagentc.exe /info
Get-PhysicalDisk | Select-Object MediaType, HealthStatus, OperationalStatus, Size
[System.IO.DriveInfo]::GetDrives() |
  Where-Object { $_.Name -in @('C:\', 'D:\') } |
  Select-Object Name, DriveFormat, TotalSize, AvailableFreeSpace
```

If the BitLocker cmdlet fails, `manage-bde.exe -status C:` and `manage-bde.exe -status D:` are read-only alternatives; they do not reveal recovery passwords. If a volume contains any additional pagefile or dump path, check that exact volume too. Failure/blank output leaves the corresponding item pending.

Open **System Information as administrator**. Read only **BIOS Mode**, **Secure Boot State**, **PCR7 Configuration** and **Device Encryption Support / Automatic Device Encryption Support** from System Summary. Record only those values/reasons; do not export the full report. Open **Settings > Privacy & security > Device encryption** and **Manage BitLocker** only to inspect status, without toggling anything. Missing Device Encryption UI is not proof manual BitLocker is unsupported. TPM absence does not categorically prevent BitLocker, but alternate startup-key configurations need separate review ([BitLocker requirements](https://learn.microsoft.com/windows/security/operating-system-security/data-protection/bitlocker/)).

## Conditional manual change plan: NOT AUTHORIZED in this review

After the findings are reviewed and the owner separately approves A:

1. Confirm authority over the device and any organization policy. Secure a recoverable backup of existing work; confirm disk health, adequate free space, WinRE and a stable AC supply. Plan a maintenance window. Do not clear TPM or change firmware as a shortcut.
2. Use **Start > Manage BitLocker > Operating system drive C: > Turn on BitLocker** only if C: is confirmed unprotected. If it is already protected, do not reconfigure it merely for this task. Use the supported TPM workflow; stop on unmet prerequisites or unexpected policy prompts.
3. Privately back up the recovery material to an owner-approved location independently accessible if this laptop and W: are unavailable. Verify retrieval before continuing. Do not automatically choose cloud escrow without owner approval, or keep the sole copy on C:, D: or inside this same container.
4. For this existing system volume, select **Encrypt entire drive**, use the supported fixed-drive encryption mode, retain the BitLocker system check and complete its scheduled restart when ready. Do not skip the hardware check. Review TPM+PIN separately if desired; never improvise PCR policy changes.
5. Wait for completion, then verify C: is fully encrypted, **100%**, **ProtectionStatus On**, and not suspended/waiting for activation. Verify normal boot and independent recovery-material access. Recheck all spill destinations and repeat backup preparation before requesting export approval. No pagefile/hibernate/crash-dump changes are needed for the preferred plan if all their storage is protected.

These are planned actions, not executed instructions. Microsoft describes full-volume encryption for existing OS drives and the distinction between encryption and active protection in its [operations guide](https://learn.microsoft.com/en-us/windows/security/operating-system-security/data-protection/bitlocker/operations-guide). Device encryption does not retroactively retract data previously copied elsewhere or guarantee removal of historical SSD remnants. No assertion is made that this task's read-only checks established system health or recovery readiness.

## Private VeraCrypt recovery-material custody checklist

Owner completes privately; report only **confirmed / pending** for each item, never material or exact secret storage locations:

- The container's password and any PIM/keyfile requirements are known and independently retrievable; identify privately whether keyfiles are actually used.
- Every required keyfile is preserved byte-for-byte in protected, owner-approved independent storage; no sole copy is inside W:, on this laptop, or in Git/chat/logs. If no keyfile is used, mark this not applicable.
- A strong unique password is retained in an approved password manager or another protected offline record with a recoverable access path. Avoid circular dependency on the same laptop/container.
- Authorized recovery custodian and fallback access are established; possession of recovery material is restricted and any cloud storage is explicitly approved.
- The owner can unlock the correct container using the saved material, not solely cached credentials. A future controlled test requires closing files and a normal dismount/remount; do not force it and do not perform it during active work. No mount test is executed in this review.
- Record privately whether a current VeraCrypt volume-header backup exists and how it is protected. Header backup does not replace password/keyfiles or a backup of the data. Creating/copying recovery material is a separate action, not performed here.
- There is a plan for a separate encrypted data backup and integrity check once export/copy operations are authorized; the present single container is not redundancy.

Do not check `-RecoveryKeyCustodyConfirmed` on the strength of this prepared checklist alone. VeraCrypt stresses that encrypted volumes still need data backups ([backup guidance](https://veracrypt.io/en/How%20to%20Back%20Up%20Securely.html)). BitLocker recovery custody, if enabled, is a separate checklist item from VeraCrypt credentials.

## Phase 2 status and next authorization gates

| Gate | Current status |
| --- | --- |
| Storage filesystem and ACL verification | **PASSED** - prior execution evidence, not repeated |
| Windows memory-spill protection | **PENDING** - administrator evidence required; no setting changed |
| Recovery-material custody | **PENDING OWNER CONFIRMATION** |
| Production backup export | **NOT AUTHORIZED** |
| Restore verification | **PENDING** - separate environment/scope and authorization required |
| Hosted migration | **NOT AUTHORIZED** |

Immediate next action is the read-only administrator check above. After the results, obtain explicit approval for a concrete C: protection change if needed, or a named alternative environment. Export authorization cannot substitute for unresolved protection evidence.

Once protection and custody pass, the **proposed export request for route A** is: authorize one read-only logical export of database `postgres` on existing Supabase project `bofoowyzlnfhwcstlmgp`, using the privately configured and identity-validated direct/session connection. Use verified PostgreSQL 17 clients to capture a full dump-accessible schema/data archive (including Auth custom triggers/functions and Prisma migration history), role definitions/memberships without role passwords, index, manifest, UTC/Jakarta timestamps, SHA-256 checksums and restore checklist. Write all output and application scratch directly to `W:\WellBeingHub-Backups\wellbeing-<UTC-timestamp>\` in the already reviewed container. No plaintext staging, external upload, production writes, restore or migration is included. Revalidate actual destination/mount/capacity, TLS/source identity and protection immediately before execution. The source size remains the owner's prior **11,335,347-byte** measurement; no new hosted size query occurred. For route B the exact machine and destination must replace this proposal before approval. See [backup scope and limitations](PHASE2-BACKUP-RECOVERY.md).

Changed in this review: this report, sanitized memory-security evidence, current-status links/matrix in finalization and storage review, and the backup/recovery procedure's review link and stale folder-existence wording. Operational scripts, application files and tests were not changed.

