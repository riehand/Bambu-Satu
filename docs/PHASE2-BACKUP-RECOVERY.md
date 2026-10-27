# Backup and recovery: encrypted Google Drive archives

**Current database status:** both Retry01 encrypted files are **VERIFIED OFF-DEVICE** by owner-confirmed private Google Drive upload/download and both SHA-256 matches to locally authenticated originals. [Package evidence and gaps](PHASE2-DATABASE-RETRY01-PACKAGE.md). Full database restoration is **NOT YET TESTED**. The [isolated restore plan](PHASE2-ISOLATED-RESTORE-PLAN.md) requires separate authorization and does not claim original global-role/database privilege parity. No production access or decryption occurred in this preparation. Historical plaintext staging examples below remain unauthorized.

**PROJECT BACKUP: ENCRYPTED OFF-DEVICE COPY VERIFIED.** Google Drive upload/download and downloaded integrity passed by owner confirmation; the downloaded SHA-256 was independently checked against the verified original. Full extraction-based project restoration remains **UNTESTED**; see [completion evidence](evidence/PHASE2-PROJECT-BACKUP-OFFSITE-20261026.json). Both database Retry01 files are locally verified; database restore and hosted migration remain **NOT AUTHORIZED / NOT EXECUTED**. BitLocker activation remains **CANCELLED BY PROJECT OWNER**, VeraCrypt **RETIRED / CLEANUP COMPLETED**, and the prior PostgreSQL rehearsal **VERIFIED**.

Follow the [current encrypted-archive workflow](PHASE2-GOOGLE-DRIVE-BACKUP.md) for interactive AES-256 encryption with encrypted filenames, private Google account/MFA, manual upload, download/hash comparison, password custody and documented residual risks on this unencrypted laptop. W: and full-system encryption are no longer prerequisites. The [cleanup review](PHASE2-VERACRYPT-RETIREMENT.md) preserves the exact container/ACL findings and records authorized cleanup completion on 26 October 2026. Historical security evidence is retained.

## Available tools and execution boundary

The four verified native PostgreSQL clients remain **17.11**, retained under the ignored local client-tool directory. Tool provenance and original migration/rehearsal evidence are in [durable evidence](evidence/PHASE2-POSTGRES-20261025.json). The active PowerShell/Node backup entry points now perform preparation only and do not load hosted credentials. They deliberately reject export switches; the previous source/coverage/checksum logic is retained in non-executable audit text under `docs/evidence/retired-veracrypt-workflow/` for a separately reviewed execution procedure. No operational export is claimed ready merely because a path plan succeeds.

Safe preparation:

```powershell
.\scripts\phase2-backup.ps1
node scripts/phase2-backup.mjs --dry-run
```

7-Zip 26.05 x64 was verified against the official release package and used for the completed [project archive](PHASE2-PROJECT-ARCHIVE.md), including the authorized local configuration. Detailed inventories remained in memory; no plaintext private manifest or credential staging copy was created. Password entry stayed private in the GUI. No full project extraction was performed or required for off-device verification. No archive member lists or secrets belong in logs or plaintext uploads.

## Future production export approval scope

The next task is to finalize a reviewable database export procedure, not run the existing preparation wrapper as an exporter. The project backup gate is complete; it is not a backup of hosted database data.

1. Confirm the exact source below, privately supplied existing credentials and verified TLS direct/Session connection. Do not reset credentials or change grants. Finalize timestamped staging/temp/archive paths, capacity, restricted access, retention and accepted local plaintext/memory risks. No new hardware requirement is introduced.
2. Review PostgreSQL 17 native export commands and coverage before enabling execution. Include custom Auth triggers/functions and `_prisma_migrations`, supported schema/data, policies/grants/owners and separate role/membership metadata without passwords. Reconcile managed-schema/extension dependencies and any Storage object/configuration exclusions; stop on missing required coverage. Keep sensitive indexes/manifests inside the encrypted package.
3. Present the exact source, destination, data scope, read/egress impact, temporary handling, immediate owner-operated AES-256/header encryption and verification operations for **separate explicit production-export authorization**. Do not execute during preparation, and do not include restore or migration in that authorization.
4. After authorized export, verify dump readability/coverage, manifest/checksums and encrypted archive integrity. Then manually upload/download and verify the encrypted database copy, using separately confirmed offsite handling permission.
5. Before recommending hosted migration, obtain separate approval for a fresh compatible isolated Supabase restore and validate recovery. Preserve the existing synthetic rehearsal. Resolve remaining privilege/team/content/deployment gates, then request separate hosted migration authorization.

Official Supabase backup and CLI restore guidance was reviewed on 26 October 2026. The guide distinguishes roles/schema/data and direct/Session connections; database backups do not include Storage object bytes. These references inform coverage review, not permission to copy their credential-bearing command examples or execute a restore: [database backups](https://supabase.com/docs/guides/platform/backups), [backup/restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

**Source:** existing Supabase project `bofoowyzlnfhwcstlmgp`, database `postgres`, privately configured direct/Session pooler connection. Before any future export, validate exact source identity and TLS/certificate settings without exposing credentials. No source connection was made during this strategy change.

**Destination proposal, not export approval:** use a fresh timestamped run beneath `D:\WellBeingHub-Backups\Supabase-Phase2`, with its own restricted staging/temp directory and separate encrypted `wellbeing-database-<UTC>.7z`, followed by a separate download-check copy after manual Google Drive upload. Select the exact run paths and verify ACLs, no reparse redirects/sync and capacity before authorization; no database directories or outputs have been created. Existing project-backup folder approval does not authorize production staging. Raw custom dumps are not encrypted: explicitly review and accept local plaintext staging and OS memory-spill risks or choose a protected execution environment. This review does not require external hardware or system encryption.

**Scope:** full supported/dump-accessible schema and data, including application/profile and Auth identities, custom functions/triggers, owners, ACLs, RLS, sequences and `_prisma_migrations`; separate role/membership information with role passwords excluded. Capture archive index, UTC/Jakarta manifest, exact server/client versions, SHA-256 checksums, migration reference hashes and restore checklist inside the encrypted package. Stop on permission failures or omitted required objects; never silently narrow scope. No hosted grants or managed objects may be changed to make an export work.

**Approval:** separately authorize this source, exact local/cloud destinations, scope/exclusions, temporary handling, interactive encryption/custody, accepted residual risks and any encrypted upload. Restore and hosted migration need their own approvals. Check actual capacity/quota and coordinate schema/role changes. Local storage/network usage applies; no claim of zero egress cost is made.

Source dependencies already inventoried include PostgreSQL 17.11 and `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault` and `uuid-ossp`. A plain PostgreSQL image cannot establish recovery of all managed Supabase dependencies. Archive integrity/Drive download verification is distinct from an isolated database restore. The [Supabase backup guide](https://supabase.com/docs/guides/platform/backups) and [restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) remain references for managed-schema/extension coverage.

## Coverage and limitations

| Artifact | Included / required handling |
| --- | --- |
| Public data and migration history | Full archive; compare migration names/checksums on restore |
| Auth identities and custom trigger/function definitions | Full archive; index checks required; restore must preserve UUID links |
| Owners, ACLs, RLS, role memberships | Archive plus roles file; preserve/reconcile platform ownership explicitly |
| Supabase-managed schemas/extensions | Archive where readable; exact Supabase image/extension versions must be inventoried and matched before restore |
| Auth sessions/refresh material | Sensitive archive content; never print; do not assume existing tokens remain valid after platform/config changes |
| Storage files | Database metadata is not object bytes; owner must inventory buckets and separately approve a byte-level backup if any exist |
| JWT/signing keys, SMTP/OAuth URLs, Auth provider settings, secrets, Edge Functions | Not recovered by database dump; record non-secret configuration and securely provision secrets separately |

The synthetic PostgreSQL rehearsal is deliberately not a recovery destination. Never place real backup data in that test container or run its synthetic suite on a restored database.

## Isolated restore plan — separate approval, not executed

1. Inventory source extension versions, schema owners, managed schemas, Auth configuration and Storage usage using metadata-only queries. Pin a compatible **Supabase PostgreSQL 17** distribution/local Supabase stack. Plain `postgres:17` with an Auth stub cannot prove Supabase recoverability. Exact compatible image and extension availability remain unresolved; no restore destination is approved yet.
2. Propose a fresh local stack with database listener `127.0.0.1:55433`, separate storage directory/volume, outbound email/webhooks disabled, no external client access, and no connection settings inherited from the production `.env` files. Confirm no SSH tunnel/port forward occupies the listener. Isolate outbound integrations before importing any data.
3. Obtain explicit approval for that image/version, destination, protected volume, scope and local resource cost. Creation and restoration are separate from the synthetic rehearsal approval.
4. Recalculate archive/roles/index checksums against the manifest before use. Inspect `pg_restore --list` and role SQL privately. Never execute a blanket managed-role replacement; reconcile pre-existing platform objects/roles and review an archive selection list. Preserve full coverage evidence for anything supplied by the target baseline instead of the archive. Do not use `--no-owner`/`--no-acl` and then claim privilege parity.
5. Use PostgreSQL 17 tools with local-only `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` and protected `PGPASSFILE`; clear `PGSERVICE`, remote URLs and any inherited host override. Before restoring, read `inet_server_addr()`, `inet_server_port()`, `current_database()`, version and an operator-created destination marker. Compare them to the approved fresh stack and inspect container identity. A local URL by itself is not proof of isolation.
6. Restore reviewed roles/schema/data with stop-on-error and transaction boundaries where supported. A reviewed command template for a compatible fresh target is `pg_restore --exit-on-error --single-transaction --dbname=<approved-local-database-name> --use-list=<reviewed-list> <protected-archive>`; roles are a separate reviewed `psql -X -v ON_ERROR_STOP=1 --single-transaction -f <reviewed-roles>` operation. These placeholders intentionally cannot select production. Managed baseline conflicts require a reviewed plan, never blind retries or disabling Auth triggers on production.
7. Run the checks below and record sanitized counts, object-definition/checksum comparisons and failures outside Git if they reveal sensitive metadata. Seal a checksum-verified second encrypted copy. Only then update a **separate recovery verification record** with operator, destination/image digest, timings, outcomes and known exclusions; do not overwrite the original export manifest.

## Recovery acceptance checklist

- Restore has zero unexplained errors; all schemas/extensions/owners, constraints, indexes, custom functions/triggers, policies and grants reconcile with the approved source inventory.
- Aggregate table counts reconcile with the snapshot; compare selected integrity hashes privately without printing rows. Concurrent writes after the snapshot must not be mistaken for corruption.
- Both existing Auth migrations and their checksums are intact; Phase 2 remains absent in the restored predeployment baseline. No failed migration history is hidden.
- Zero unmatched profiles/Auth identities and normalized-email collisions; FK/unique constraints and enabled profile creation/email-sync triggers match source definitions.
- Browser roles retain only approved own-profile column access, cannot alter migration history after separately reviewed remediation, and have no assessment access after the rehearsal migration.
- In an isolated Supabase Auth service, use separately approved synthetic restore-test identities to verify signup/confirmation/login/token refresh and profile synchronization; no real-user emails or real refresh tokens are exercised. Database-only validation is not Auth service recovery.
- Inventory/restore Storage object bytes if present, plus separately provisioned provider/configuration dependencies. Confirm outbound integrations remain disabled.
- Define owner-approved backup retention, encryption-key custody, access logging and deletion date. No retention duration is invented here. Backups must never become development fixtures.

Do not recommend hosted Phase 2 deployment until this recovery record passes. On deployment trouble, prefer application rollback with additive tables retained and a reviewed forward migration; never drop completed assessment data or overwrite the shared hosted database casually.

## Final execution checklist — not permission to export

1. Select exact restricted, unsynced local staging/ready paths and the private Google Drive destination; verify capacity, ACLs, no reparse redirects, interactive 7z encryption and independent password custody. Explicitly review unencrypted-host/staging residual risks; do not restart BitLocker or VeraCrypt preparation.
2. Recheck retained native tool version and the archive/executable hashes in the tool manifest. Do not use the synthetic rehearsal container for a hosted connection.
3. Identify the configured project's direct/Session source without printing credentials; agree a schema/role-change freeze and export window with both teams. Reconfirm source version and scope only within the authorized operation.
4. Present exact source/destination, full schema/data/role scope, managed-schema/configuration/Storage exclusions, sensitive-copy/read-load/egress risks and costs. Obtain **separate explicit export authorization**. No paid resource or off-site upload is implicitly approved.
5. After the separately reviewed execution procedure and export approval exist, perform the scoped logical export and immediate interactive archive encryption. The current PowerShell wrapper is preparation-only and cannot execute this step. Stop on warnings, incomplete archives or missing required Auth/migration objects. Upload only verified ciphertext, download it again and compare SHA-256; preserve partial artifacts under restricted access pending explicit handling instructions.
6. Verify manifest sizes/checksums and archive object coverage privately. Obtain a separate concrete Supabase-compatible restore-environment approval, then verify restoration and Auth/ownership/configuration/Storage behavior. Export success alone is not recovery success.
7. Document restore evidence and retention/access/key-custody responsibilities before recommending migration approval. Hosted privileges, Chatbot coordination, content/licensing and activation remain independent gates.

