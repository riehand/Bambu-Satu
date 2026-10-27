# Retry01 encrypted package — locally verified, 27 October 2026

**ENCRYPTED OFF-DEVICE DATABASE PACKAGE VERIFIED — owner-confirmed Google Drive upload/download and matching SHA-256 for both files.** Both originals previously passed local authenticated verification. The downloaded files were not directly inspected or separately decrypted by the agent in this task. **Full isolated database restoration NOT YET TESTED**; exact original role/database privilege parity remains unverified. [Off-device evidence](evidence/PHASE2-DATABASE-OFFSITE-20261027.json).

Directory: `D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `database.dump.age` | 379,522 | `4F77589A80907C7F64B97353CFF55BCD1BC30D9FF8CA9FCBEE93DBD80214CEA5` |
| `recovery.json.age` | 7,538 | `F981978AAA4F425A710171CEFE7CC11D76B6AB3D9980F1CEEDCA2CF13FA47233` |

The dump passed authenticated decryption, PostgreSQL archive listing, full offline parsing and schema parsing in the prior authorized verification-only attempt. All 20 known required object-presence checks passed. [Dump verification details](PHASE2-DATABASE-RETRY01-VERIFICATION.md).

The companion completed at **10:02:29 WIB / 03:02:29 UTC on 27 October**. Dedicated workflow, age encryption and authenticated age decryption all exited **0**, with no stderr output. Its decrypted bytes matched the generated metadata digest, parsed JSON matched the intended structure, and the filename/size/checksum reference to the existing dump was validated. Independent file hashing confirmed both recorded ciphertext checksums. The owner confirmed privately entering the existing Retry01 passphrase; passwords were not captured or compared by the scripts.

Four focused checks passed before creation: Windows BOM-compatible historical-evidence parsing; metadata field selection and explicit unknowns; rejection of unverified/mismatched dump references; and a synthetic encrypted JSON memory round trip. The initial test identified an encoding marker in historical JSON, fixed in the reader without rewriting historical evidence.

## Companion contents and limits

The companion was constructed only from selected fields in existing sanitized evidence and reviewed restoration guidance. The full generated document existed only in memory before encryption. No production reconnection, role export, pg_dump, database operation or plaintext recovery file was used.

It contains:

- Password-free role **reconstruction guidance**, including managed-role handling and target-role reconciliation.
- Database-level ownership/grant restoration requirements, explicitly identifying unavailable exact source values.
- RLS, object privileges, ownership and default-ACL restoration notes, including the separately scoped migration-history privilege finding.
- Observed PostgreSQL 17.11, client/age versions, historical extension versions and Supabase-managed schema/service dependencies, with evidence timestamps.
- The verified dump filename, size, checksum, coverage and limitations.
- Isolated restore sequencing and validation guidance; separate authorization remains required.
- Exclusions, private recovery custody and manual off-device verification instructions.

**Not captured:** exact source role definitions/attributes/memberships and exact database-level owner/grants. These were not retained by the stopped original exporter. The companion supplies guidance and explicit unknown values; it does not invent SQL or claim they were backed up. This satisfies the approved reconstruction-guidance option, but exact privilege parity still needs authoritative configuration or separately authorized metadata before restoration.

Compatible Supabase extension binaries, managed roles and services, Auth/provider configuration and target credentials must be provisioned separately. No passwords, tokens, signing material, credential-bearing URLs, private keys or personal user records are included in the companion. Archive object privileges are represented, but effective restored privileges and archived row/migration-checksum comparisons remain untested. Historical observations are not presented as a new live snapshot.

Windows memory/pagefile/crash residual risk remains; direct encryption avoids deliberate plaintext staging, not OS memory spill. The previously disclosed pooler/backend TLS observation is historical; this operation made no connection. Existing project backups, both previous database attempts, the source dump and Docker rehearsal resources are preserved. No application change, hosted migration, permissions change, system encryption change, commit or push occurred.

## Off-device verification and next action

On 27 October the owner confirmed manual upload of both `.age` files to private Google Drive, independent download, and exact matches to both SHA-256 values above. The agent did not access Drive, inspect cloud permissions, or hash the downloaded paths itself. Matching hashes link the downloaded copies to the locally authenticated originals; no separate downloaded-copy decryption is claimed. The owner performed the cloud operations, not this agent.

Next: review and authorize the [separate isolated restore plan](PHASE2-ISOLATED-RESTORE-PLAN.md). Docker Desktop is installed, but its Linux engine is currently unreachable. Preparation has not started it, pulled an image, decrypted files or restored a database. Keep both ciphertext files and private passphrase custody; no repeat export or cloud upload is needed merely to proceed to restore preparation.

[Companion execution evidence](evidence/PHASE2-DATABASE-RETRY01-COMPANION-20261027.json). [Original local dump verification evidence](evidence/PHASE2-DATABASE-RETRY01-VERIFY01-20261027.json). A full database restore and hosted migration remain separate authorization gates.
