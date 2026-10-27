# Retry01 result — 27 October 2026

**Later verification succeeded:** the separately authorized verification-only attempt authenticated and fully parsed the retained dump with all process exits 0. The dump is now **LOCALLY VERIFIED**, unchanged; the companion remains absent and no restore occurred. See [current verification results](PHASE2-DATABASE-RETRY01-VERIFICATION.md). The original attempt's failure record below is preserved as history.

**STOPPED / UNVERIFIED / NOT READY FOR GOOGLE DRIVE UPLOAD.** Exactly one authorized attempt ran. Source/TLS and protected unused-destination checks passed. The dump and encryption processes exited successfully, but the first authenticated decryption failed. No automatic retry occurred. The owner reported "Stopped or prompt unavailable".

Execution started at 09:06:59 WIB and stopped at 09:09:00 WIB (02:06:59–02:09:00 UTC). The approved directory retains its original `20261026` label; this is not the execution date. The executor's failure exit code is **1**.

| Process | Exit | stderr bytes |
| --- | ---: | ---: |
| Private read-only catalog inspection | 0 | 0 |
| PostgreSQL 17.11 pg_dump | 0 | 0 |
| age dump encryption | 0 | 0 |
| age dump decryption | 1 | 109 |

Failure stage: `AWAITING_PRIVATE_DUMP_VERIFICATION`. Failure classification: `PROCESS_FAILED_OR_WARNED`. Raw error text was discarded by design. This evidence cannot distinguish incorrect private input, terminal interaction, authentication failure or another age error; it does not prove corruption or identify a passphrase problem. No password, terminal contents, history, screenshot, credential or SQL row was inspected or recorded.

Retained file: `D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01\database.dump.age` — **379,522 bytes**.

SHA-256: `4F77589A80907C7F64B97353CFF55BCD1BC30D9FF8CA9FCBEE93DBD80214CEA5`.

`D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01\recovery.json.age` **does not exist**. Its size/checksum, companion verification and password-free role export are unavailable because those stages were not reached. No successful `verification.json` exists.

Export intent was the full supported database without schema/data filters. **Actual archive object coverage has not been verified**: no TOC, full offline parse, required Auth/application/Prisma checks, RLS/policy/ACL verification or role comparison completed. Missing objects are unknown. A successful pg_dump exit and ciphertext checksum are not proof of decryptability, complete coverage or restoration. The existing encrypted dump is retained unchanged as unverified, not discarded as proven corrupt.

The original failed run is unchanged: zero-byte `database.dump.age`, absent companion. No plaintext dump was staged, no file was deleted/overwritten, and no upload, restore, hosted migration, grants/RLS/Auth change, application change, commit or push occurred. Windows memory/pagefile exposure and the previously observed non-TLS managed pooler/backend connection remain disclosed. A compatible Supabase restore and its extension/role/service dependencies remain untested.

See [sanitized result evidence](evidence/PHASE2-DATABASE-RETRY01-RESULT-20261027.json). Stop here under the one-attempt authorization. The smallest next proposal is a separately authorized **verification-only** attempt against the retained dump, using the same new passphrase originally used to encrypt Retry01, privately in the dedicated console. This would authenticate/deparse in memory without re-exporting, overwriting, restoring or uploading anything. It would not create the missing recovery companion; that requires a separately scoped follow-up if verification succeeds. Never use the earlier compromised passphrase.
