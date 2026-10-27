# Retry01 dump locally verified — 27 October 2026

**Subsequent companion completion:** `recovery.json.age` has now been separately authorized, created and locally authenticated. Both files are **READY FOR MANUAL GOOGLE DRIVE UPLOAD**, with reconstruction guidance and missing exact role/database-grant metadata documented. [Current two-file package report](PHASE2-DATABASE-RETRY01-PACKAGE.md). The missing-companion statements below describe the earlier verification-only scope. No database restoration occurred.

**`database.dump.age` is LOCALLY VERIFIED.** The single authorized verification-only attempt succeeded at 09:33:38 WIB (02:33:38 UTC). The dedicated workflow exited **0**. No production connection, new export, restore, upload or recovery-companion creation occurred. No plaintext dump was written to disk.

Input: `D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01\database.dump.age`.

- Size before and after verification: **379,522 bytes**.
- SHA-256 before and after: `4F77589A80907C7F64B97353CFF55BCD1BC30D9FF8CA9FCBEE93DBD80214CEA5`.
- Path identity, ordinary-file check, expected size and checksum passed. Ciphertext was not modified, renamed or replaced.
- Five focused synthetic tests passed before the actual attempt: binary encrypted round trip, authenticated tamper rejection with fixed diagnostic categories, TOC coverage classification, offline rejection of invalid archive bytes, and a default mode that cannot decrypt or connect.
- The earlier private-console synthetic passphrase test had already passed. The actual verifier used `age --decrypt <approved-file>` with binary stdout captured in bounded RAM, followed only by offline `pg_restore` commands with no database argument. No shell text pipeline or plaintext output destination was used.

| Actual process | Exit code | stderr bytes |
| --- | ---: | ---: |
| age authenticated decryption | 0 | 0 |
| pg_restore archive listing | 0 | 0 |
| pg_restore full archive parse to discarded stdout | 0 | 0 |
| pg_restore schema parse in RAM | 0 | 0 |

The PostgreSQL custom archive signature passed. Full offline parsing read/decompressed the archive successfully. This establishes authenticated decryptability and archive readability; it is **not a database restore test**. The prior decryption failure does not establish corruption or prove that the owner entered an incorrect passphrase.

## Verified coverage

All **20 known required object-presence checks passed**, with **zero missing checks**: application `public.users` definition/data; Auth users and identities definitions/data; Prisma `_prisma_migrations` definition/data; both custom Auth functions and triggers; profile RLS and `users_read_own_active_profile` policy; profile and custom-function privilege entries; Storage buckets/objects definitions; and the Vault extension dependency.

The archive contains **591 entries**, including:

| Object category | Count |
| --- | ---: |
| Table definitions / table-data entries | 40 / 40 |
| Functions / triggers | 51 / 10 |
| Policies / row-security entries | 1 / 26 |
| ACL / default-ACL entries | 146 / 24 |
| Extension / schema entries | 4 / 8 |

Schema parsing found **124 ownership statements, 350 grants and 58 revokes**, and confirmed the profile RLS enablement and policy statement. These are representation checks, not tests of effective privileges after restoration.

| Schema | Table definitions | Table-data entries |
| --- | ---: | ---: |
| auth | 27 | 27 |
| public | 2 | 2 |
| realtime | 3 | 2 |
| storage | 8 | 8 |
| vault | 0 | 1 |

Counts are reported as observed. Per-schema definition/data differences alone are not evidence of missing data: partitioned and extension-managed objects need target-aware interpretation. No new live catalog query was authorized or performed. This check cannot prove complete equivalence to the source catalog at export time. The private catalog from the failed exporter was not persisted, and the companion stage never ran.

Prisma migration history has a data entry, but archived row values and migration checksums were not compared. Full table row counts/content were not independently validated. Extension-owned definitions and managed Supabase services require compatible target dependencies. Cluster-global role definitions/passwords, database-level ownership/grants and platform configuration are not established by the database object's ACL entries. A compatible isolated restore remains separately authorized future work.

## Backup package still incomplete

The existing ciphertext is decryptable/readable using the Retry01 passphrase and does not need another pg_dump merely to resolve the earlier verification failure. End-to-end database recoverability remains untested.

`D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01\recovery.json.age` is still absent. Do not create it automatically or mark the complete two-file package ready for off-device upload. The previous failed attempt and all existing ciphertext remain preserved.

**Next action: review the missing recovery companion's scope before authorizing its creation.** Proposed scope is password-free role definitions/memberships and database-level owner/grant metadata from read-only queries to `bofoowyzlnfhwcstlmgp / postgres`, plus the verified dump checksum, coverage, tool versions, timestamps, recovery instructions and limitations encrypted directly to the exact companion path above. Reuse the reviewed binary streaming helpers; do not re-export table data, modify the dump, restore anything or upload. Any fresh metadata must be labeled as a later snapshot rather than claimed transactionally simultaneous with Retry01. Companion creation and authenticated in-memory verification need separate explicit authorization and a dedicated continuation that cannot invoke a new database dump.

The Retry01 passphrase must remain privately recoverable and must never be requested in chat. Windows memory/pagefile/crash exposure and the previously observed managed pooler/backend TLS limitation remain unchanged; this verification did not reconnect to test transport. No BitLocker/VeraCrypt, application code, hosted permissions or migrations were changed. No commit or push occurred.

[Sanitized verification evidence](evidence/PHASE2-DATABASE-RETRY01-VERIFY01-20261027.json). Earlier [Retry01 failure evidence](PHASE2-DATABASE-RETRY01-RESULT.md) is retained as history; this successful verification supersedes its unverified-dump status only.
