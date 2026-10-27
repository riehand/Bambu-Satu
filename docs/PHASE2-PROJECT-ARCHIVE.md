# Phase 2 verified off-device project backup - 26 October 2026

**ENCRYPTED OFF-DEVICE PROJECT BACKUP VERIFIED. CREATED: YES. UPLOADED: YES. DOWNLOAD / SHA-256 / DOWNLOADED INTEGRITY: PASSED. FULL EXTRACTION-BASED RESTORATION: UNTESTED.** Upload, download and downloaded 7-Zip result are owner-confirmed; the downloaded size/hash were also independently checked locally. See [completion evidence](evidence/PHASE2-PROJECT-BACKUP-OFFSITE-20261026.json).

## Verified tooling and source

7-Zip **26.05 x64**, installed at `C:\Program Files\7-Zip`, reports 7z, LZMA2 and 7zAES support. Its local help documents AES-256 and the separate **Encrypt file names** control. Installed `7z.exe`, `7zFM.exe`, `7zG.exe` and `7z.dll` SHA-256 values match files extracted from the official HTTPS release package linked by [7-zip.org](https://www.7-zip.org/download.html). The executables are unsigned; matching version/publisher strings alone were not treated as provenance verification. The downloaded installer was extracted for comparison, never executed; nothing was reinstalled. See [preparation evidence](evidence/PHASE2-PROJECT-ARCHIVE-PREPARED-20261026.json).

Source: `D:\TELKOM UNIVERSITY\SEMESTER 7\Capstone\Bambu-Satu`. Ancestors are ordinary directories. `.git` is a complete local directory, not a linked-worktree pointer; no object-store alternates, shallow marker or `.gitmodules` were found. Initial Git inventory: 349 tracked paths, 24 modified tracked files, 46 untracked files, zero staged changes. Counts change as these preparation artifacts are added; refresh at capture time. No remote URLs, diffs or credential contents were printed.

## Complete inclusion/exclusion policy

- Include all physical files and empty directories, including hidden/system files, `.git` history/index/refs, tracked changes, all untracked and ignored files, source/components/API routes, Prisma schema and every migration, tests, mockups/assets, scripts, documentation, configuration, `.env`, `.env.local`, `.agents`, `.tmp` local PostgreSQL tools/evidence, and `test-results`. Keep unknown files; no Git-ignore-based exclusion. Keep `tsconfig.tsbuildinfo` too rather than expanding the exclusion scope.
- Exclude **only root `node_modules` and root `.next`**, verified installed dependencies and generated build output. Nested same-name directories are not automatically excluded. This is a development-state backup with rebuildable caches omitted, not a complete offline runnable installation or Windows image.
- Twenty `.claude/skills/<name>` and `.windsurf/skills/<name>` junctions point to the matching `.agents/skills/<name>` within this repository. Validate each exact target before traversing. Archive their contents as ordinary directories, with **Store symbolic links** and **Store hard links** disabled. Canonical skill contents are retained too. Do not preserve absolute D: junctions as the only copy of these files. The installed 7-Zip passed a synthetic direct-archive/extract check: a junction became an ordinary directory with matching content, and hidden `.git` content survived. This does not replace verifying the real archive.
- Stop on any new/unexpected link, unreadable file, lock or changed source. Do not blindly follow links into external folders. The inventory helper permits only the reviewed internal skill aliases and rejects other links. The two previously observed generated junctions under excluded `.next` are outside the archive scope.
- The completed workflow kept per-file inventories and hashes only in memory. No plaintext private manifest was created or included. Aggregate evidence records the comparisons without exposing member lists or individual hashes.

Physical included input at initial inspection: **1,033 files, 470,505,941 bytes**. Materializing aliases adds 142 file entries and 602,554 bytes. New preparation documents/helper add a small amount; use the refreshed aggregate evidence. Plan approximately **450 MiB of uncompressed input**, about **500 MiB archive allowance**, and at least **2 GiB free** for ciphertext output, temporary archives and a downloaded copy. These are capacity estimates, not a measured compressed size or guaranteed upper bound. D: is NTFS with approximately **156.7 GiB free**. Actual archive size and Drive quota must be checked before upload.

## Exact verified archive and authorization boundary

Source: the project root above. Final archive: `D:\WellBeingHub-Backups\Bambu-Satu-Phase2-Final-20261026T064154Z.7z`. Downloaded copy: `D:\WellBeingHub-Backups\Drive-Verification\Bambu-Satu-Phase2-Final-20261026T064154Z.7z`.

Both are **410,223,461 bytes (391.22 MiB)** with SHA-256 `4382A7CD5688A4797554CA39D3A037607BE066E695B66192EC0E1F67EB07A6C1`. The owner confirmed the destination is local and unsynchronized; restricted ACLs were checked during preparation. The older `Bambu-Satu-Phase2-Backup-20261025T184031Z.7z` remains preserved.

The owner authorized creation including local configuration and then manually uploaded/downloaded the final encrypted archive. No automatic upload, extraction, production export, migration, commit or push occurred. New documentation records postdate the archived snapshot; this does not invalidate that snapshot.

## Completed stable snapshot verification

The earlier 141 filesystem notifications did not establish corruption. Historical fingerprints could not prove the old discrepancy was solely later Git metadata, so the original archive was retained and a new controlled archive was created.

No active Node/Git writer processes were found. A background helper outside the project captured and confirmed a read-only baseline, launched owner-operated GUI compression, and immediately captured the source again. No evidence was written into the project during that window. Detailed inventories remained in memory.

Baseline and post-compression inventories both contained **1,188 files, 389 directories, 471,192,162 bytes and 20 validated aliases**. Added, removed, content-changed, metadata-only and directory-difference counts were all zero. The identical aggregate content/path SHA-256 was `6C3FED09351E942BC4F0CD58B0E990E1FEC7A529A1A781B710792C5F250FF052`.

The fresh source inventory covered all tracked, untracked and ignored content except the two approved root caches. Metadata-only changes were evaluated separately from content, rather than treating notifications as proof of corruption.

## GUI creation settings used for the verified archive

The controlled helper launched the existing 7-Zip GUI from the exact project root with a new destination, root-only cache exclusions, 7z/LZMA2 compression and encrypted headers configured. The owner entered the password privately. Source selection and alias materialization were checked against the in-memory source inventory using aggregate archive checksums.

No plaintext staging copy, password argument, password environment variable, extraction or delete-after-compression operation was used. The final archive now exists and must not be overwritten. Password custody remains independent of the archive and Drive folder; no password or recovery material was requested or recorded.

## Completed local verification

- GUI compression returned exit code zero.
- Before/after source contents and paths matched exactly.
- The non-extracting 7-Zip integrity test returned exit code zero.
- The encoded-header Folder coder definitions were parsed and contain AES-256; archive member filenames are encrypted.
- 7-Zip aggregate SHA-256 checksums for data and for data plus names matched the source checksums. This covers expected included content and paths without extracting secrets.
- The archive size and ciphertext hash were rechecked; the integrity test did not change the archive.
- The helper initially left inclusion pending because its GUI label matcher missed the checksum rows. A separate read of the completed checksum dialog captured and matched both aggregates; the final review resolves that automation limitation.

No extracted per-file comparison, full restoration, or junction topology restoration was tested. This limitation does not block verified off-device storage under the owner's accepted criteria.

## Completed manual Google Drive round trip

The owner confirmed upload to Google Drive, independent download, identical SHA-256 and downloaded 7-Zip Test result **Everything is Ok**. The downloaded copy's byte size and SHA-256 were independently verified locally. Cloud provenance and the GUI result are owner attestations; no cloud account access, automated upload, or repeated integrity test was performed.

The encrypted off-device project backup is **VERIFIED**. Full extraction-based restoration remains **UNTESTED**, with no external hardware or second computer required as a prerequisite. A future extraction requires separate approval and a suitable destination; do not extract credentials onto unencrypted C: or D:.

Retain the original and downloaded archives and keep password custody independent of the archive. Google account access, Restricted sharing, MFA and independent recovery remain owner responsibilities; this review did not inspect them or receive any secrets.

## Outside-project dependencies and remaining gates

The archive does not include Docker engine/images/volumes, Windows/Node/Git/7-Zip installations, browser test binaries outside the checkout, global editor settings/extensions, external personal project notes, hosted provider settings, password-manager recovery or the hosted database. No external Git object store or external skill-junction target was detected. PostgreSQL tools/evidence under `.tmp` are included. Owner separately reviews external tools/settings or personal files needed for recovery; do not bulk-copy user profiles, SSH keys, Credential Manager or unrelated secrets. Existing PostgreSQL rehearsal resources stay unchanged.

Phase 2 implementation and prior 230-test/seven-integration-test evidence remain preserved; they were not rerun. Project backup creation and off-device verification are complete; full extraction-based restoration remains untested. Production database backup, compatible isolated database restore, privilege/runtime-role review, content/team-contract prerequisites and hosted activation still need their separate approvals. A project archive does not back up the Supabase database and does not authorize applying Phase 2 migrations.

## Next database backup boundary

Project backup authorization is fulfilled and does not authorize a production database copy. Follow [database backup/recovery](PHASE2-BACKUP-RECOVERY.md) to finalize an exact source, export scope, restricted staging/temp/output paths, immediate interactive encryption, coverage checks and residual-risk review. Existing database scripts are preparation-only. Production export, isolated database restoration and hosted Phase 2 migration each require separate explicit authorization.

