# Database export stopped before dump startup

The authorized attempt stopped; **no usable encrypted database backup exists**. A new export is **NOT AUTHORIZED**. Existing outputs and original session evidence are preserved. No production connection, decryption, restore, upload, deletion or migration was performed during this diagnosis.

## Findings

- Original run: `D:\WellBeingHub-Backups\Supabase-Phase2-20261026T120516Z`.
- `privateCatalogRead`: exit 0, stderr 0 bytes. This was metadata inspection, not a database dump.
- Last stage: `AWAITING_PRIVATE_PASSPHRASE_AND_EXPORT`; stopped at `2026-10-26T12:50:19.071Z`.
- `dumpEncryption`: null exit status, stderr 0 bytes. The empty output was created at `12:35:19.0609050Z`, approximately 15 minutes earlier, matching the wrapper's timeout.
- `database.dump.age`: **0 bytes**, retained, **INCOMPLETE / UNVERIFIED**. It contains no encrypted database payload.
- `recovery.json.age`: absent. No successful verification record exists.
- The executor cannot start `pg_dump` until age emits its encryption header. No header was written and no pg_dump result exists. Failure was before dump startup and before verification, while waiting for encryption setup.

Most likely cause: the private passphrase interaction did not complete before the 15-minute timeout. The old wrapper discarded the error classification, so the precise prompt visibility/input failure cannot be reconstructed from its sanitized record. Null is not an age exit code of 1: the workflow's outer exit code was 1, while age was terminated without a normal numeric exit recorded.

The pinned [age CLI source](https://raw.githubusercontent.com/FiloSottile/age/v1.3.2/cmd/age/age.go) prompts before constructing the encryption writer and copying input. Its [Windows terminal implementation](https://raw.githubusercontent.com/FiloSottile/age/v1.3.2/internal/term/term.go) opens `CONIN$`/`CONOUT$` and reads without echo. This supports the binary-pipe design; code review found no input-before-password circular wait. It does not prove the old window's prompt was visible to the owner.

## Minimal correction and private entry

1. Retire the previous temporary launcher using `-NoExit`. It returned to an active PowerShell shell after failure, allowing accidental shell input. Do not launch it again.
2. Use `scripts/phase2-age-private-console.ps1`. Its default is a **local synthetic prompt check** with no environment loader or database connection. It opens a dedicated `powershell.exe -File` process without `-NoExit`, ends with a static dialog without a text-entry field, and explicitly exits. Its prepared `ExportApproved` mode must not be run before separate approval and approved destination revision.
3. Type only after age itself displays `Enter passphrase (leave empty to autogenerate a secure one):`, then `Confirm passphrase:`; later decryption displays `Enter passphrase:`. Choose a **nonempty** passphrase so age does not generate and display one. Input must not echo. If no prompt appears, input echoes, or STOP/PS appears, do not type; close the dedicated window.
4. The synthetic check uses a disposable test passphrase, never the future database passphrase. It encrypts dummy bytes, authenticates decryption in memory and compares hashes. No private input is captured by scripts, arguments, environment, transcripts or evidence. The actual terminal interaction requires owner observation; automated recipient-mode tests do not establish it.
5. The exposed passphrase is compromised and must never be reused. It was not inspected or reproduced during diagnosis. A future export requires a completely new private passphrase with secure recovery custody. Removing history/screenshots would not make the old passphrase safe; no history or screenshot was inspected or changed.
6. Process tracking now records `PROCESS_TIMEOUT`, start failure or failed exit/warning using fixed codes. Binary pipe errors get a fixed classification. Unknown exceptions remain generic; raw stderr, SQL, URLs, environment values and exception text are never printed. Exit codes/stderr byte counts remain available. The 15-minute timeout still applies: do not leave the prompt unattended.

Nine focused synthetic transport/diagnostic tests passed, including timeout-before-producer, binary round trips, tampering, producer failure, overwrite refusal and secret-safe error classification. Node and Windows PowerShell syntax checks passed; age 1.3.2 executable hash matches its pinned value and pg_dump is 17.11. Completed application/concurrency tests were not repeated.

The reopened **private-console synthetic check PASSED** at `2026-10-26T13:06:16.589Z`: encryption exit 0, authenticated decryption exit 0, stderr 0 bytes for both, and exact synthetic plaintext hash/length match in memory. The first local check stopped at decryption; the owner reported closing its window and requested reopening. The successful second check establishes that the reviewed binary-pipe/password interaction works in this Windows PowerShell launch context. Terminal contents and private input were not captured; it does not retrospectively establish what was visible during the original production attempt.

## Pending retry scope (not executed)

No cleanup is needed. Preserve the original run unchanged. Proposed new outputs, subject to separate approval and fresh destination checks:

- `D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01\database.dump.age`
- `D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01\recovery.json.age`

The proposed directory was absent at diagnosis; it has not been created. The executor and destination guard still target the occupied original run and reject reuse. Update both to the approved new path only after authorization; never remove the existence guard.

Approval request after the synthetic prompt check passes: **Approve one corrected read-only export from `bofoowyzlnfhwcstlmgp / postgres` into the two new paths above, with immediate binary streaming encryption using a completely new privately entered passphrase, password-free encrypted recovery metadata, authenticated in-memory non-restoring verification and sanitized evidence. Preserve the failed original run. No upload, restore, hosted changes or migration.** Existing Windows memory/pagefile and managed pooler/backend TLS limitations remain unchanged and disclosed in the [export plan](PHASE2-DATABASE-EXPORT-PLAN.md).
