# Approved local rehearsal and backup preparation — 25 October 2026

**The PostgreSQL 17 / Prisma 5.22 synthetic rehearsal passed. Production Phase 2 remains blocked.** The owner explicitly authorized this local run and backup tooling/storage inspection only. No hosted connection, hosted migration/privilege/data change, production export/restore, external upload, credential reset, commit or push was performed in this continuation. All pre-existing work is preserved; application behavior, scoring, schema and migration SQL are unchanged.

This report supersedes the *pending local rehearsal/tooling* statuses in the [pre-approval finalization snapshot](PHASE2-FINALIZATION.md). It does not supersede its production security/content/recovery blockers.

## Docker and isolation evidence

Docker Desktop was started in the background. Docker Engine/CLI: **28.5.1**; local endpoint: `npipe:////./pipe/dockerDesktopLinuxEngine`. The official `postgres:17` image was pulled. Container and volume were verified absent before creation.

| Item | Observed value |
| --- | --- |
| Container | `wellbeing-phase2-rehearsal`, retained, running and healthy |
| Published port | Only `127.0.0.1:55432 -> 5432/tcp`; no wildcard/IPv6 publication |
| Dedicated volume | `wellbeing-phase2-rehearsal-data`, local driver, mounted only at `/var/lib/postgresql/data`, retained |
| Database | `wellbeing_phase2_rehearsal` |
| PostgreSQL | `17.11 (Debian 17.11-1.pgdg13+2)`, server version number `170011` |
| Image digest / recorded image ID | `sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe` |
| Prisma CLI / generated client | `5.22.0` |
| Completed | 25 October 2026, 12:59 WIB (`2026-10-25T05:59:38.052Z`) |

The runner excludes inherited database/Supabase/PG configuration from its child environment and sets both Prisma URLs to the same local database with an eight-connection pool. It clears Supabase keys and sets an unused local Supabase URL. It rejects nonlocal Docker endpoints, mismatched image/label/volume/port, and an existing container or volume. Each SQL/migration/test stage rechecks container identity. The test verifies the randomly generated database marker, actual database name, server version and port before writing fixtures. The internal Docker address observed by Prisma was `172.17.0.2/32:5432`, reached through the approved loopback port.

Prisma's CLI still reports loading `.env` automatically; the explicitly supplied `DATABASE_URL` and `DIRECT_URL` take precedence. Its datasource output identified `wellbeing_phase2_rehearsal` at `127.0.0.1:55432`, and the marker check confirmed that destination. No production credentials or data were used. This is verified target isolation, not a claim that Docker's bridge has no possible outbound network route.

## Migration results

The synthetic Auth baseline contains only the minimal `auth.users`, `auth.uid()` and application roles needed by the existing migrations. Both Auth migrations were applied first using Prisma `migrate deploy`; a synthetic baseline identity/profile and Auth trigger definitions were then captured. Phase 2 was applied with the same workflow. No reset/db push or migration rewrite was used.

All three `_prisma_migrations` records finished successfully, were not rolled back, and matched the local SQL bytes:

| Migration | Executed SHA-256 |
| --- | --- |
| `20261021144827_init_users` | `1847814270d05a8411a3c63de8121639e8bc8b4ea4436635c451ee1cb6d15b59` |
| `20261023000000_supabase_auth` | `c5272ddb6fdd9624848d69bbeeb05fa5a4912d9a077264b21aaf20451b16622b` |
| `20261023010000_phase2_assessment` | `6befc228490a50bcc3fb411905fa7c5e0790066f2118a6de94a22bfdb77d3823` |

Catalog verification recorded seven assessment tables with RLS, 20 constraints including eight foreign keys, 16 indexes, five enabled custom triggers, and zero assessment RLS policies. Definitions are retained in the evidence artifact. The initial profile and Auth trigger definitions were preserved; synthetic signup profile creation, rejected metadata role escalation and email synchronization passed.

## Concurrent connections and service behavior

All **seven real PostgreSQL integration tests passed**. These use the existing application service and real Prisma clients. A separate transaction held the participant lock while three service operations attempted it. `pg_stat_activity` observed distinct waiting backend PIDs **152, 153 and 155** in every contention scenario.

| Scenario | Actual result |
| --- | --- |
| Three concurrent starts | Three successful responses, one session |
| Three autosaves at revision 0 | One committed batch; two `STALE_REVISION` failures; 35 answers persisted |
| Stale submit after save | Rejected; the updated revision was required |
| Three final submissions | Three identical results; one score, one report, one completed quota use |
| Known synthetic answers | Separate DASS scores 14/14/14; WEMWBS 42 |
| Failure after score insert | Report trigger fault rolled back score/report/completion; session remained IN_PROGRESS at revision 1; retry succeeded |
| Concurrent final quota submission | Identical idempotent results for the third completion |
| Three starts after quota exhaustion | All rejected with `ASSESSMENT_QUOTA_EXCEEDED`; completed=3, remaining=0 |

The rollback trigger was a test-only fault injection in this synthetic database; its trigger was removed by the test afterward. The container, volume, completed synthetic test data, fault-injection function and evidence remain retained. No automatic cleanup/reset was performed.

## Security and SQL checks

- Direct published question-set INSERT and empty publication were rejected. Draft creation, 21+14 synthetic item insertion and UPDATE publication succeeded. Published-question modification was rejected.
- Completed answers and scores rejected modification. Invalid academic dates, a second active period and an orphan participant FK were rejected.
- Cross-user session read/save/submit were denied; another participant's completed history was empty.
- Fourteen actual browser-role table reads were denied (seven tables for both `anon` and `authenticated`). A separate read-only catalog audit confirmed **no effective table or column privileges** for those roles on all seven tables, and no execution privilege on the five private trigger functions (ten denied role/function combinations).
- The authenticated own-profile policy still returned only the caller's profile.

These results do **not** resolve hosted `_prisma_migrations` grants, runtime BYPASSRLS or `service_role` default grants. Plain local PostgreSQL does not reproduce the hosted Supabase default ACLs or credential distribution. The [shared-database security proposal](PHASE2-SECURITY-REVIEW.md) remains unapplied. Supabase GoTrue, hosted Session pooler behavior, hosted authenticated assessment and recovery of real data were **not tested**.

## Backup tooling and storage review

PostgreSQL.org's [Windows download page](https://www.postgresql.org/download/windows/) links the [EDB binary archives](https://www.enterprisedb.com/download-postgresql-binaries). The currently linked Windows 17 archive (file ID 1260616) resolved to `postgresql-17.11-5-windows-x64-binaries.zip`. Downloaded over HTTPS; its SHA-256 matched the publisher's `.sha256` sidecar:

```text
80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f
```

Only `pg_dump`, `pg_dumpall`, `pg_restore`, `psql` and their runtime DLLs were extracted into ignored `.tmp/postgresql17-client-tools/pgsql/bin`. All four report **17.11**. No server service or PATH change was installed. The native executable inspected was not Authenticode-signed; provenance is the official linked HTTPS archive plus its matching publisher checksum, not a code-signature claim. Archive, publisher checksum, extracted files and tool manifest are retained locally. The Docker image also contains matching 17.11 clients, but the rehearsal container must never be reused for a production export.

The new `scripts/phase2-backup.ps1` defaults to **PREPARATION_ONLY**, does not load hosted environment configuration, and checks tools/storage without creating files in the backup destination. Export requires a new explicit authorization, its `-ExportApproved` switch, verified encryption/ACLs and `-RecoveryKeyCustodyConfirmed`. The underlying Node exporter also requires the wrapper's storage-verification interlock. Neither export path was executed.

| Proposed destination review | Result |
| --- | --- |
| `C:/Users/hp/WellBeingHub-Backups` | Does not exist; no folder created |
| Parent `C:/Users/hp` EFS | Not encrypted |
| BitLocker on C: | Unknown: status query denied even outside the sandbox; no OS administrator elevation was forced |
| Parent access | Current user, SYSTEM and Administrators have inheritable FullControl |
| Additional parent ACE | Application-capability SID has non-inheriting Execute/Traverse + Synchronize only; this does not demonstrate read access to future backup files |
| Reparse points | None observed in reviewed path |
| Export-ready | **No** — destination ACLs and encryption are not verified |

Do not infer that C: is unencrypted from an access-denied query. Safer alternative: an owner-controlled, verified fully encrypted BitLocker NTFS volume (for example an existing encrypted removable drive) with a dedicated folder restricted to the operator/SYSTEM and an approved administrator group, and recovery-key custody documented separately. Do not create or encrypt a volume automatically. Alternatively, the owner can provide a read-only administrator status confirmation for C: and authorize preparing/reviewing the intended restricted folder. Do not disclose recovery passwords/keys.

Safe administrator status command (owner-run; reads no recovery keys):

```powershell
Get-BitLockerVolume -MountPoint C: |
  Select-Object MountPoint, VolumeStatus, ProtectionStatus, EncryptionPercentage
```

Actual backup execution remains unapproved. A checklist and separate Supabase-compatible restoration plan are maintained in [backup/recovery](PHASE2-BACKUP-RECOVERY.md).

## Preserved evidence and regression checks

Durable sanitized record: [PHASE2-POSTGRES-20261025.json](evidence/PHASE2-POSTGRES-20261025.json). It includes versions/digests, isolation checks, exact migration checksums, concurrency PIDs/outcomes, catalog definitions, tooling provenance and storage status. It contains no user rows or credentials.

Detailed local artifacts remain in `.tmp/phase2-rehearsal-2026-10-25T05-59-26.136Z/`: `result.json`, `isolation.json`, `checks.jsonl`, `catalog.json`, `operations.jsonl`, sanitized `execution.log` and `postgresql.log`, plus the temporary Auth migration directory. The durable artifact records their SHA-256 hashes. Evidence was checked against the generated local password/marker and connection-URL patterns; no matches remained. These are synthetic rehearsal artifacts, not production backups.

The original **230-test suite passed**, in addition to the seven real PostgreSQL tests. TypeScript passed. Lint passed with the same two pre-existing landing-page image warnings. No browser/build rerun was needed for this tooling/documentation-only continuation; previous results remain historical. No hosted checks were repeated in this continuation.

## Files changed in this continuation

- `scripts/phase2-rehearsal.mjs`: dedicated volume, inherited-configuration filtering, repeated target checks, sanitized logs and actual version/digest/checksum evidence.
- `tests/rehearsal/phase2.rehearsal.ts`: structured real-connection/transaction/security evidence; existing tested service behavior preserved.
- `scripts/phase2-backup.ps1` (new): read-only storage/tool inspection and guarded future export entry point.
- `scripts/phase2-backup.mjs`: refuses export without the storage-verification interlock.
- `docs/PHASE2-LOCAL-REHEARSAL-REPORT.md` and `docs/evidence/PHASE2-POSTGRES-20261025.json` (new): executed evidence and remaining gates.
- `docs/PHASE2-REHEARSAL.md`, `docs/PHASE2-BACKUP-RECOVERY.md`, `docs/PHASE2-HANDOVER.md`, `docs/PHASE2-FINALIZATION.md`, `README.md`: current status and workflow links; earlier evidence retained as historical.

Ignored `.tmp` tooling/download/audit artifacts were also created and retained. No application source, dependency/lockfile, environment file, Prisma schema or migration SQL was changed in this continuation. No Phase 3 work, commit or push occurred.

## Exact next step and remaining production blockers

**Next: establish a demonstrably encrypted, access-restricted backup destination and recovery-key custody.** Obtain the owner's read-only encryption confirmation or selected encrypted volume, then review the actual folder ACLs. Once these checks pass, present the exact configured source, destination, full database/roles scope, sensitive-copy/read-load/egress risks and cost for **separate explicit export authorization**.

After the authorized export, require a separately approved compatible Supabase PG17 restoration test (including managed extensions/Vault/Auth dependencies and any Storage bytes), resolve/rehearse the narrow hosted-privilege proposal, obtain Chatbot-team coordination and instrument/licence/period approvals, reconfirm migration checksum and read-only history/collisions, and only then request hosted migration/activation and authenticated-test approvals. The successful local rehearsal closes the real PostgreSQL concurrency gate; it does not make production ready.
