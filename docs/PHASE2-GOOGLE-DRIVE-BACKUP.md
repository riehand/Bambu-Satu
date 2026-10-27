# Selected backup strategy: encrypted archives in private Google Drive

**Database update — 27 October:** the owner confirmed private Google Drive upload, independent download and matching SHA-256 for both `database.dump.age` and `recovery.json.age`. Status: **ENCRYPTED OFF-DEVICE DATABASE PACKAGE VERIFIED**. [Hashes and evidence provenance](PHASE2-DATABASE-RETRY01-PACKAGE.md). Both originals were locally authenticated; no separate downloaded-copy decryption or agent cloud-permission audit is claimed. Full database restoration remains **NOT YET TESTED**. [Isolated restore plan](PHASE2-ISOLATED-RESTORE-PLAN.md) awaits authorization. The verified project backup remains unchanged.

**Current status:** encrypted off-device project backup **VERIFIED**: owner-confirmed Google Drive upload/download and downloaded integrity test, with an independently checked matching SHA-256. Full extraction-based restoration remains **UNTESTED**. [Completion evidence](evidence/PHASE2-PROJECT-BACKUP-OFFSITE-20261026.json). Database off-device upload/download/hash verification is now owner-confirmed complete. Database restore and hosted migration remain **NOT AUTHORIZED / NOT EXECUTED**. BitLocker activation remains **CANCELLED BY PROJECT OWNER** and VeraCrypt **RETIRED / CLEANUP COMPLETED**. No external hardware is required for this project-backup acceptance.

This document supersedes the W:-dependent storage and pre-BitLocker instructions. Keep their security findings as historical evidence, not active prerequisites. The [VeraCrypt cleanup review](PHASE2-VERACRYPT-RETIREMENT.md) records the authorized successful normal dismount and exact container/empty-parent deletion on 26 October 2026. The retained PostgreSQL rehearsal is VERIFIED; it is not a production restore destination. Chatbot integration belongs to the future team under the existing shared database contract.

## What is prepared and what remains manual

- Active `phase2-backup.ps1`, `phase2-backup.mjs` and `phase2-backup-layout.mjs` now prepare generic local paths without W:, VeraCrypt or BitLocker dependencies. They do not create files, read hosted configuration, connect, export, encrypt or upload. `--export-approved` / `-ExportApproved` deliberately fail closed; the old exporter must not silently run with relaxed storage checks.
- The previous W:-specific scripts are retained byte-for-byte as non-executable `.txt` evidence under `docs/evidence/retired-veracrypt-workflow/`. Read-only mount and security helpers remain for audit/cleanup; do not rerun conversion or system preparation.
- PostgreSQL 17.11 clients remain available. Verified 7-Zip 26.05 was used for the completed [project archive](PHASE2-PROJECT-ARCHIVE.md). Stable source hashes, archive/source aggregate data and filename checksums, AES-256 encrypted headers and local integrity checks passed. The owner completed the manual Drive round trip. Full extraction-based restoration remains untested.
- The project backup uses the owner-confirmed unsynchronized, restricted local directory `D:\WellBeingHub-Backups` and its `Drive-Verification` download directory. No cloud account access or automated upload occurred. A production database staging/output layout and its residual-risk acceptance still require separate review and authorization; project approval does not cover production data.

Safe preparation, no hosted operation:

```powershell
.\scripts\phase2-backup.ps1
node scripts/phase2-backup.mjs --dry-run
# Optional candidate path only; this creates nothing and does not approve storage:
node scripts/phase2-backup.mjs --dry-run --directory 'D:\WellBeingHub-BackupWork'
```

## Local handling and residual risks

Use a dedicated local directory outside the repository, W: and all cloud-sync folders. Verify it has no reparse redirect and restrict access to the owner and necessary SYSTEM/Administrators before any sensitive staging. Choose separate `work`, `ready` and `download-check` directories; all temporary files and logs must be routed inside the reviewed local work area. These are planned paths, not folders created by this task.

C: and D: are unencrypted. ACLs limit ordinary account access but do not provide encryption at rest. 7z protects the completed archive, not existing `.env` files, plaintext SQL/custom dumps before encryption, restored files, process memory, pagefile, hibernation or crash dumps. SSD deletion/TRIM and emptying Recycle Bin cannot be claimed to securely erase all remnants. No BitLocker, pagefile, hibernation or crash-setting changes are proposed. For production export, the owner must explicitly accept these residual local-staging/memory risks for an exact path, or select a separately protected execution environment. This is not a request to restart BitLocker preparation.

Minimize extra plaintext copies and time in staging; do not use Downloads/Desktop if synced. Close sensitive files rather than opening them from inside an archive (which may extract to a default temporary directory). Use no transcript, debug logging, shell password argument, password environment variable or plaintext password file. Do not upload raw `.env`, `.git`, SQL, custom dump, role export, manifests listing private objects or archive passwords. Only the verified encrypted archive and a minimal ciphertext checksum record may leave the laptop. Creation/deletion of sensitive staging is separately scoped; no automatic deletion is implemented.

## Source-code archive: complete current development state

Use the [project inventory](evidence/PHASE2-PROJECT-BACKUP-INVENTORY-20261025.json) as a historical baseline and refresh filename/status inventories when creating the archive. Preserve `.git` history/index/local refs, modified tracked files, every untracked project artifact, source, public assets, Prisma schema/migrations, tests, docs, scripts, package lock/configuration, `.agents`, and required ignored `.env`/`.env.local`. Preserve `.tmp` PostgreSQL tools and rehearsal evidence and `test-results`. Exclude only declared reproducible root `node_modules` and `.next` caches. Never use `git archive`, a fresh clone or a patch alone as the complete backup of this dirty tree. GitHub receives reviewed source commits only after separate owner instruction; secrets remain ignored.

Save work and stop writers normally before taking the snapshot. Follow the exact selection in the [project archive plan](PHASE2-PROJECT-ARCHIVE.md): navigate inside the source in 7-Zip File Manager, select all root items including hidden files, and deselect only root `node_modules` and `.next`. Stop if selection is uncertain. Set the approved archive destination outside the project and sync folders. Verify hidden `.git` and both environment filenames privately after unlocking. No plaintext configuration staging copies are permitted.

Twenty editor skill junctions point to corresponding `.agents/skills` inside the checkout; two generated junctions live under excluded `.next`. The installed 7-Zip passed a synthetic check that direct archiving with link-storage options disabled materializes directory contents. The new inventory helper validates each reviewed internal target and rejects unexpected links. The real archive must recover those aliases as ordinary directories. If it does not, stop and revise the method; do not fall back to plaintext project staging or the retired copy workflow.

The completed capture kept relative-path/size/SHA-256 inventories in memory only and saved aggregate comparisons. No plaintext private manifest was created. Preserve the recorded exclusions and link handling. The project archive covers files and Git state, not Docker volumes or an already runnable installed Windows environment. Do not delete the rehearsal resources.

## Encryption: owner-only interactive GUI

1. In **7-Zip File Manager > Add**, set archive format **7z** and a neutral unique filename such as `wellbeing-project-<UTC>.7z`. Use a separate `wellbeing-database-<UTC>.7z` for the later authorized database backup. Do not use ZIP or a self-extracting executable as a substitute.
2. Select **AES-256**, enter and confirm a strong unique password privately, and enable **Encrypt file names**. Keep password display off. Do not enter any password in this chat, a command line, script, environment variable or document. [Official format description](https://www.7-zip.org/7z.html); the [official GUI source](https://github.com/ip7z/7zip/blob/main/CPP/7zip/UI/GUI/CompressDialog.cpp) includes separate filename-encryption and password controls.
3. Do not select delete-after-compression. Make a new archive, not an update to an old unencrypted archive. Ensure sufficient local space for work, output and a downloaded verification copy. Enter passwords interactively again for verification; do not automate them.
4. Close all 7-Zip windows, reopen the archive in a fresh process and confirm file names cannot be listed without a password. Cancel this first prompt. Then reopen, privately unlock and use **Test**; require no errors. If filenames are visible without a password in a fresh process, stop and recreate correctly. Do not upload yet.
5. Independently retain the password in an approved password manager or protected offline record accessible without this laptop or the Google account. Keep an independent recovery route and an owner-approved second copy; never store it beside the archive in Drive. Lost passwords cannot be recovered from a checksum.

## Google Drive: manual upload and independent round trip

1. Sign in to the intended private account. Verify MFA/2-Step Verification and independent account-recovery access; do not report codes or recovery secrets. [Google MFA instructions](https://support.google.com/accounts/answer/185839). Check the account's current available storage and allow room for the actual archive sizes and planned retained versions; no quota or plan was assumed.
2. In **My Drive > New > New folder**, create a dedicated backup folder outside any shared parent. Open **Share > General access > Restricted**, and review **People with access** so only the owner is present unless explicitly approved otherwise. Verify file-level access after upload; inherited parent access matters. [Google sharing guidance](https://support.google.com/drive/answer/2494822).
3. Compute SHA-256 of the completed ciphertext archive locally. Save its name, byte size and hash in a minimal checksum record; keep an independent local record, not only a copy beside it in Drive. The hash detects transfer changes, not account compromise by an attacker who can replace both files.
4. Use the Drive website **New > File upload** and select only the tested `.7z` and optional minimal ciphertext checksum. Do not configure Drive for desktop to synchronize the project or staging directory. Wait for completion and check filename, size and restricted access. [Google upload steps](https://support.google.com/drive/answer/2424368).
5. **Download the uploaded archive again** using its file menu into the separate `download-check` directory. Keep the original local ciphertext. Compare the downloaded file's SHA-256 and byte size to the independently saved original. [Google download steps](https://support.google.com/drive/answer/2423534).
6. Reopen the downloaded archive in a new 7-Zip process, privately supply the password and run **Test**. The owner has now confirmed this passed. Stable source capture, matching archive/source aggregate checksums, encrypted headers, local integrity and downloaded hash/integrity establish the accepted off-device project backup. A full extraction test is not a prerequisite; it remains untested and would require separate scope/approval. Do not extract credentials onto unencrypted C:/D: or run application code, hooks or migrations.
7. Retain verification date, archive alias/hash, result and exclusions. Establish an owner-approved retention policy; neither local originals nor Drive versions are deleted automatically. A database archive test only verifies archive integrity: actual isolated database restore remains separately authorized and pending.

Ciphertext-only checksum example, with a path selected by the owner:

```powershell
Get-FileHash -LiteralPath '<completed-local-archive.7z>' -Algorithm SHA256
Get-FileHash -LiteralPath '<downloaded-copy.7z>' -Algorithm SHA256
```

## Separate database backup: prepared scope, NOT EXECUTED

Source is the existing hosted Supabase project `bofoowyzlnfhwcstlmgp`, database `postgres`, accessed only through the privately configured validated direct/session connection after separate explicit authorization. No production URL or credential value belongs in commands/reports. Use PostgreSQL 17.11 tools and encrypted verified TLS transport; resolve source identity, certificate-validation settings and approved credentials privately before execution.

The planned logical set is a full supported/dump-accessible schema/data custom archive, plus roles/memberships without role passwords. Include application/profile and Auth identities/relationships, custom Auth triggers/functions, policies/grants/owners/sequences and `_prisma_migrations`. Retain the existing required-object checks and migration-checksum comparisons; never silently omit unreadable managed schemas to get a successful dump. Coordinate a schema/role change freeze. Role metadata and database data are separate snapshots.

Package `database.dump`, `roles.sql`, `archive-index.txt`, an internal manifest with UTC and Asia/Jakarta timestamps/tool versions/coverage/exclusions/checksums, and a restore checklist into the separate encrypted 7z. Custom PostgreSQL format is **not encryption**. Export staging/temp/log paths require explicit review outside Git/cloud sync; no default drive is assumed. All private details stay inside the encrypted archive. The old guarded native export implementation remains as a reviewed historical recipe, not an active executable. A new exact execution procedure must be reviewed for the selected staging path, TLS/source checks and immediate interactive encryption before export is authorized.

Plain logical SQL does not back up Storage object bytes, hosted provider configuration, JWT/signing secrets, Edge Functions or role passwords. Source extensions include `supabase_vault`; recovery needs a compatible Supabase PostgreSQL 17 environment and an explicit key/configuration dependency review. Keep the detailed restore acceptance in [backup/recovery](PHASE2-BACKUP-RECOVERY.md). Do not restore into the synthetic rehearsal database.

The future export request must name: this source; exact local staging/ready paths; the owner-controlled Drive account/folder (identified privately); full data/role scope and exclusions; interactive 7z settings and password custody; quota/capacity; the accepted residual Windows/staging risks; retention/deletion handling; and whether manual encrypted upload is included. Approval for this strategy is not production export approval. No restore or migration is bundled with it.

## Return to Phase 2 handover

The implementation, local tests and verified PostgreSQL rehearsal are preserved; do not restart Phase 2 or implement Phase 3. Remaining production gates are: authorized backup plus independently verified compatible restore; narrow privilege/role remediation approval; both-team database ownership/credential boundaries; approved/licensed instruments, consent and academic period; fresh deployment preflight; explicit hosted migration/activation approval; and authorized hosted acceptance. Chatbot feature integration is future-team work, while the shared database contract still needs review before shared-production changes.
