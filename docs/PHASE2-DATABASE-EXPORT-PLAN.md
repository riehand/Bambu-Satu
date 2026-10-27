# Phase 2 database export preparation — 26 October 2026

**RETRY01 TWO-FILE PACKAGE VERIFIED OFF-DEVICE.** The owner confirms private Google Drive upload, independent download and both SHA-256 matches to the locally authenticated originals. [Current evidence, checksums and limits](PHASE2-DATABASE-RETRY01-PACKAGE.md). Full isolated database restoration is NOT YET TESTED; the [current restore plan](PHASE2-ISOLATED-RESTORE-PLAN.md) supersedes the earlier localhost-port target proposal below. Exact source role definitions/memberships and database-level owner/grants remain unverified. No repeat export is needed. Restore execution, hosted migration and privilege changes remain unauthorized.

## Confirmed facts

The historical [read-only preflight](evidence/PHASE2-DATABASE-BACKUP-PREFLIGHT-20261026.json) used the project's Session pooler on port 5432 with `sslmode=verify-full` and the official Supabase public CA. It observed PostgreSQL **17.11**, **11,335,347 database bytes**, **zero Storage buckets, zero Storage objects and zero Vault secrets**. All 41 ordinary/partitioned tables reported SELECT access. Retry01 subsequently completed export and local archive verification; restoration remains untested. Companion creation did not refresh these source observations.

Both applied Auth migration checksums match the local files. Phase 2 is absent. Both WellBeing Auth triggers are enabled and call functions in `public`. There are nine non-internal triggers across Auth/Storage (including platform triggers); their classification must not be guessed from the count. No Auth/Storage RLS policies were reported. `public._prisma_migrations` exists; `supabase_migrations.schema_migrations` does not.

PostgreSQL clients `pg_dump`, `pg_dumpall`, `pg_restore`, `psql` are 17.11. Supabase CLI was not found on PATH or checked standard locations. Docker client 28.5.1 is installed, but its server is unavailable. The native export needs neither CLI nor Docker. Docker will be needed only for the separately approved disposable restore.

The existing 7-Zip remains verified for the project backup. Portable **age 1.3.2** was obtained from its official release into ignored `.tmp/age-v1.3.2`; the release ZIP matched GitHub's published SHA-256 before extraction. No system installation occurred. [Preparation/test evidence](evidence/PHASE2-DATABASE-EXPORT-PREPARATION-20261026.json).

## Why a default Supabase CLI dump is insufficient

The current [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-dump) describes a containerized schema-only default excluding managed schemas; data and roles require separate flags. The [official restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) also requires separate handling of managed-schema customizations and Supabase migration history. Its pg-delta customization rules omit some managed-schema functions/indexes and triggers whose functions live inside managed schemas. Do not use `db pull`, `db push`, `reset` or migration repair in this preparation/export.

The current official [data script](https://raw.githubusercontent.com/supabase/cli/develop/apps/cli-go/pkg/migration/scripts/dump_data.sh) excludes Auth/Storage/platform migration bookkeeping tables. Its [schema script](https://raw.githubusercontent.com/supabase/cli/develop/apps/cli-go/pkg/migration/scripts/dump_schema.sh) filters some ownership, ACL, event-trigger and publication statements; its [roles script](https://raw.githubusercontent.com/supabase/cli/develop/apps/cli-go/pkg/migration/scripts/dump_role.sh) filters reserved roles. These are migration conveniences, not evidence of complete recovery coverage. Prisma history is distinct from Supabase CLI history: explicitly verify its schema AND data rather than infer coverage from the default command.

## Selected export and coverage

Reuse the existing PostgreSQL tools, source/path guards, required Auth/migration checks and recovery checklist. The prepared `scripts/phase2-db-export.mjs` runs native `pg_dump -w --format=custom --compress=6 --lock-wait-timeout=10000` without a file argument, schema filters, `--no-owner`, `--no-acl` or row-security filtering. A binary Node pipe feeds the output directly into age. There is no PowerShell text pipeline and no plaintext dump destination. [PostgreSQL custom/stdout support](https://www.postgresql.org/docs/17/app-pgdump.html).

| Required content | Handling and acceptance |
| --- | --- |
| Application schema/data, profiles, sequences, constraints, indexes | Native full database archive; required `public.users` schema/data entries checked |
| Auth users, identities and relevant Auth data | Full `auth` schema/data, including platform bookkeeping available to native dump; no Auth rows printed |
| Custom Auth triggers/functions | Full definitions retained, including triggers on `auth.users`; both known triggers/functions required in archive index; restore compares enabled state and definitions |
| Prisma history | `public._prisma_migrations` schema AND data required; both applied checksums match; Phase 2 must remain absent |
| Roles and memberships | The original planned role export never ran. The authorized companion contains reconstruction guidance, not exact role definitions/memberships. Reconcile managed roles and obtain authoritative metadata separately if exact recreation is required |
| RLS, grants, ownership, default privileges | Retained by native dump; archive preserves current permissions, including known excessive migration-history access. Remediation is separate |
| Managed schema customizations | Native managed-schema capture avoids CLI filters. Review full archive index and reconcile target platform baseline before restore |
| Extensions | `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`; extension definitions/configuration data follow native pg_dump rules; extension binaries/internal objects require compatible target |
| Storage metadata | Full `storage` schema/data; bucket/object table entries required even when empty |
| Physical Storage bytes | None at this audit. Recheck immediately before export; stop if buckets/objects appear and obtain a separately reviewed object backup scope |
| External dependencies | Database dump excludes hosted Auth/provider settings, JWT/signing secrets, SMTP/OAuth configuration, Edge Function deployments/secrets, role passwords and external storage bytes. Re-provision separately without logging secrets |

One pg_dump transaction gives a consistent data snapshot. Roles and before/after catalog audits are separate observations; coordinate a short schema/role-change freeze. The executor stops on detected migration/extension/trigger/coverage changes, missing required objects, unreadable tables, warnings or failures. It does not change grants to make a dump succeed. A complete archive is not a tested restoration.

## Current verified destinations

The approved Retry01 directory already exists; do not create replacement outputs or overwrite either file:

`D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01`

- Main archive: `D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01\database.dump.age`
- Verified companion: `D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01\recovery.json.age`
- Current evidence: the separate dump-verification and companion JSON records linked in the [package report](PHASE2-DATABASE-RETRY01-PACKAGE.md). Earlier `session.json` and `INCOMPLETE.json` remain historical evidence of the stopped export workflow; no historical record is overwritten to simulate that workflow succeeding.

The parent is outside Git, owner-confirmed unsynchronized, ordinary/non-reparse and access-restricted to the owner/SYSTEM/Administrators. The existing run directory and unused companion path were rechecked before creation; no ACL changes occurred. The directory label preserves the approved name; execution timestamps are in the evidence.

Intended manual cloud destination: the same owner's private Restricted Google Drive backup area, proposed display path **My Drive / WellBeingHub-Backups / Supabase-Phase2 / 20261026-Retry01**. Confirm that folder's actual owner/access before uploading; no cloud folder or account was inspected or created here. Both encrypted files and minimal ciphertext verification record must travel together. This task excludes uploading.

## Encryption, credentials and residual risk

Age uses authenticated streaming encryption, with passphrase protection via scrypt; this is an `.age` backup, not a 7z file. [Official age usage](https://github.com/FiloSottile/age), [Windows terminal handling](https://raw.githubusercontent.com/FiloSottile/age/v1.3.2/internal/term/term.go). The owner enters a strong nonempty passphrase privately in a normal local terminal, repeats it for verification and uses the same passphrase for the companion. Do not accept auto-generation into terminal output, run with a transcript, paste the passphrase into chat, or place it in arguments/environment/files. No production passphrase was requested or tested during preparation. Keep recovery custody in an independently accessible password manager or protected owner record, separate from the archives; lost passphrases cannot be recovered from checksums.

The encryption process does not inherit database credentials. The existing database URL is loaded privately and validated against project `bofoowyzlnfhwcstlmgp`, database `postgres`, direct/Session port 5432. The parsed password is supplied only in short-lived PostgreSQL child-process environment memory, never command arguments, history, reports or a password file. Administrators/same-user debugging and memory paging remain risks; no process-environment secrecy guarantee is claimed.

No production dump, roles SQL, archive index or decrypted verification output is written plaintext to C:/D:. Roles/index/manifest are buffered only in RAM, then encrypted into `recovery.json.age`. Dump verification decrypts into bounded RAM (128 MiB cap) and feeds native `pg_restore` through binary pipes. SQL output is consumed and discarded. Temporary environment paths are confined to the run directory; the chosen custom/stdout and age operations need no plaintext temporary files. Raw diagnostics and object/member lists are suppressed. No OS crash-dump/pagefile/hibernation setting is changed. Memory pages or process crashes can still reach unencrypted Windows/WSL storage; direct encryption prevents deliberate dump staging, not OS memory spill.

The client-to-pooler connection passed CA and hostname verification after using Supabase's official CA. System/Windows roots alone had failed; there was no TLS downgrade. `pg_stat_ssl` reports **false for the pooler's backend connection**; that does not describe the verified client connection and does not prove end-to-end TLS. This provider-side transport limitation is disclosed for export approval; no hosted SSL setting is changed. The [Supabase SSL guide](https://supabase.com/docs/guides/platform/ssl-enforcement) documents the separate pooler/backend legs and notes that changing enforcement can reboot the database.

## Original export implementation (historical procedure; do not rerun)

Safe planning command: `node scripts/phase2-db-export.mjs --plan`. The old backup wrappers remain preparation-only and reject their old export switches. The new executor's export mode must not be invoked until separate authorization exists; the flag itself is not authorization.

After approval, run the reviewed executor from a visible local terminal for private age passphrase entry. It validates source, client versions, pinned age/CA hashes and destination, then:

1. Encrypts stdout directly; records producer/encryptor exits, rejects PostgreSQL stderr warnings and bounds size. The producer starts only after age emits its encrypted header following successful passphrase setup.
2. Authenticates full decryption in memory and compares the plaintext digest to the stream digest. Checks required schema/data/trigger/function/Storage/Vault index entries and makes `pg_restore --file=-` decompress/deparse the complete dump into a discarded pipe. This does **not** connect to a database or restore anything.
3. Captures role metadata, sanitized catalog observations, archive index, reference procedure and timestamps inside the encrypted companion; authenticates its decryption and digest too. Before/after audit checks do not replace a coordinated DDL/role freeze.
4. Writes minimal ciphertext checksums and successful status only after both encrypted outputs pass. Preserve failures as unverified.
5. For a later authorized manual cloud round trip, upload both ciphertext files, download separate copies, compare both SHA-256 values and repeat authenticated decryption/coverage checks in memory. 7-Zip Test is not the verifier for `.age` files. Never decrypt using `age -o` to an unencrypted output file.

Nine focused synthetic transport tests passed, followed by five local-verifier checks and four companion-preparation checks. The separate private-console synthetic round trip passed. The existing 230-test/seven-connection rehearsal baseline was not rerun. Retry01's dump and companion are now locally verified under separate explicit authorizations; no new export is needed to complete this package.

## Separate isolated restore proposal

**Superseded target details:** use the [27 October isolated restore plan](PHASE2-ISOLATED-RESTORE-PLAN.md): pinned official Supabase PG17 candidate, separate `wellbeing-phase2-restore-check`, no network or published port, tmpfs data and no persistent volume. The older port/image notes below are historical. Engine startup, image pull, compatibility probe and restore all remain awaiting authorization.

Preserve `wellbeing-phase2-rehearsal` and its volumes. Its ordinary PostgreSQL image/Auth stub cannot establish Vault/managed Supabase recovery. Reuse Docker Desktop tooling only, after separate restore approval, for a new **wellbeing-phase2-restore-check** target at **127.0.0.1:55433** with independent state, no production credentials and blocked outbound integrations. Pin a Supabase PostgreSQL 17 image/digest only after checking the exact extension versions above. No compatible image has been pulled or falsely claimed verified. Prefer a disposable Linux tmpfs data/work directory for this small restore; Windows/WSL paging residuals still require acknowledgement. Do not mount plaintext production data into the preserved rehearsal or an ordinary host staging folder.

Validate container/database identity and isolation before writes. Keep decrypted data in pipes/RAM; authenticate the full ciphertext before any restore starts. Privately review role SQL and archive selection against the managed target baseline: do not recreate reserved roles blindly, strip all ownership/ACLs and claim parity, or disable triggers in production. A clean database can restore pre-data, data, then post-data so custom Auth triggers do not duplicate profile creation. An initialized Supabase stack needs an explicit reviewed managed-object selection and target-only trigger/session handling. These are restore operations, not included in export approval.

Restore validation must establish zero unexplained errors, matching archived table data/counts, users/profiles UUID links and normalized email uniqueness, enabled custom Auth trigger/function definitions, both Prisma history checksums with Phase 2 absent, extensions, owners/default privileges/grants and browser/runtime effective access. Reconstruct actual archived data counts privately during verification; do not confuse later live-source writes with snapshot mismatch. Service-level signup/login checks require a compatible local Auth service and synthetic test identity with outbound email disabled. Existing Auth tokens/provider settings are not assumed portable. Storage is empty now; recheck scope before export. Record database recovery only after these tests, then resolve remaining deployment gates and seek separate hosted migration approval.

## Separate privilege review

The audit confirms `anon` and `authenticated` have read/write access to `public._prisma_migrations`, whose RLS is off. The backup faithfully preserves that state. [Minimal remediation proposal](PHASE2-PRIVILEGE-REMEDIATION-REVIEW.md) requires separate approval; no export switch repairs it or changes roles/RLS. The configured export role has BYPASSRLS and CREATEROLE, not superuser; use only for the authorized read-only export, not as evidence that application runtime privileges are acceptable.

## Single next approval — EXPORT ONLY

**Historical original-output approval text below is superseded for a retry.** The occupied original directory must remain preserved. The [diagnosis record](PHASE2-DATABASE-EXPORT-FAILURE-20261026.md) specifies the proposed new paths and the required separate retry authorization after a successful local synthetic prompt check.

Approve one native PostgreSQL 17.11 export from existing project **bofoowyzlnfhwcstlmgp / postgres**, with all supported database schema/data and password-free role metadata described above, into exactly **database.dump.age** and **recovery.json.age** under **D:\WellBeingHub-Backups\Supabase-Phase2-20261026T120516Z**; permit creation of that restricted child directory, immediate streaming encryption, private terminal passphrase entry, in-memory non-restoring integrity/coverage checks and sanitized evidence. Acknowledge residual unencrypted Windows memory/pagefile/crash exposure and the observed unencrypted managed pooler/backend leg. Stop on changed scope, tool/identity/TLS/coverage checks or export errors; retain partial ciphertext. No plaintext dump files, upload, restore, privilege/SSL changes, hosted migrations, commits or pushes are included.
