# Phase 2 isolated restore plan — 27 October 2026

**PREPARATION ONLY. No image pull, container creation, backup decryption or restore has run.** Both encrypted backup files now have owner-confirmed private Google Drive upload, independent download and matching SHA-256. The original files passed local authenticated verification. [Off-device evidence](evidence/PHASE2-DATABASE-OFFSITE-20261027.json). This verifies off-device ciphertext preservation, not a restored database. Downloaded copies were not directly inspected or separately decrypted in this task.

## Local readiness

Docker Desktop is installed and Docker CLI is **28.5.1**. The local Linux-engine named pipe is **unreachable** (exit 1), including outside the sandbox; neither Desktop nor backend process was observed. No engine was started. Existing containers/volumes cannot be freshly inventoried until it starts. No retained resource has been touched. Native **pg_restore 17.11**, **age 1.3.2**, Node binary-pipe helpers and the tested private console are available. Supabase CLI and a complete service stack are unnecessary for this first database-level restore check.

## Smallest practical target

| Item | Proposed value |
| --- | --- |
| Container | `wellbeing-phase2-restore-check` — refuse if this name already exists |
| Database | `wellbeing_restore` — a new database in a new independent cluster |
| Image candidate | Official `supabase/postgres:17.6.1.136`, referenced by current official Supabase Compose |
| Linux amd64 digest | `supabase/postgres@sha256:5a4314708484bec672de2c09653a5c01fb1c84a998564ac231b0325e2238ed5b` |
| Network | `none`; no published ports, no shared application network, no production credentials |
| Access | Binary `docker exec -i` over the verified local Docker named pipe; PostgreSQL Unix socket inside the container |
| Storage | Separate tmpfs for PGDATA, temporary files and Unix sockets; no bind mount or persistent database volume |
| Initial budget | 2 GiB container memory, 768 MiB PGDATA tmpfs, 128 MiB shared memory, two CPUs; check Docker memory availability first |
| Preserved environment | `wellbeing-phase2-rehearsal`, its data volume and `127.0.0.1:55432` remain untouched |

The former `127.0.0.1:55433` proposal is superseded: Docker exec needs no host database port. No web UI, Auth server, pooler, Storage service or outbound email is launched. [Official Compose](https://raw.githubusercontent.com/supabase/supabase/master/docker/docker-compose.yml) provides the candidate tag; public registry metadata supplied the pinned amd64 digest. It has **not** been pulled or run. Do not infer actual PostgreSQL patch or extension versions from its tag.

After approval, first inspect the pinned image and perform a synthetic extension/bootstrap probe in the new isolated target. Confirm actual PostgreSQL major 17, archive-format support with the existing 17.11 client, required extension versions and usable runtime paths. Source observations: `pg_stat_statements 1.11`, `pgcrypto 1.3`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`. Any version difference must be reported and compatibility established before real data is decrypted. Stop if a required extension/target capability cannot be provided; do not silently omit it, substitute a plain postgres image, or upgrade an existing environment.

Use a fresh cluster initialized with the image's binaries and reviewed minimal settings rather than automatically bootstrapping the full Supabase service stack. This avoids pre-existing Auth/Storage schema conflicts with the native full dump. Use a dedicated local restore administrator and `template0` for the new database. Reconcile only known empty template defaults (such as public-schema setup) inside this new database. No `--clean` against any existing environment and no broad reset script. Image-specific init/config paths and extension key hooks must be checked in the synthetic probe before this design is claimed executable.

Container safeguards: run PostgreSQL as its unprivileged OS user, read-only root filesystem where supported by the reviewed bootstrap, no host/Docker-socket mounts, no added privileges, Docker logging driver `none`, core dumps disabled, no restart policy. Database files, WAL, temp files and any extension-generated local keys must all resolve inside the new tmpfs. Validate effective mounts and settings before plaintext enters. Suppress SQL/parameter logging; drain raw client diagnostics privately in bounded memory and emit only fixed classifications/counts. Failure must not cause raw `docker logs`, SQL, rows or full inspect/environment output to be printed.

[Docker documents](https://docs.docker.com/engine/storage/tmpfs/) that tmpfs is temporary, consumes the memory allowance and can be swapped. A per-container memory/swap limit can limit Linux-container swap if supported, but cannot guarantee Windows/WSL never pages memory. No OS paging/encryption setting is changed; the existing memory-spill risk remains. Stopping this new container discards its temporary database; no persistent fallback volume is permitted silently. Do not stop/delete it automatically after a failed check; preserve sanitized evidence and ask before cleanup. Both encrypted originals remain untouched.

## Role, extension and Supabase compatibility

This is a native full `pg_dump`, not Supabase CLI's filtered migration dump. The [Supabase restore guide](https://supabase.com/docs/guides/self-hosting/restore-from-platform) warns that native internals can conflict with a pre-initialized platform. We therefore propose a clean database plus explicit dependency review, not blind replay into the image's seeded `postgres` database. A database-only test cannot validate Auth HTTP flows, SMTP/OAuth, signing configuration, Storage object retrieval, Realtime or Edge Functions; those need separate compatible services/configuration.

Exact original global role definitions, attributes, memberships and database-level owner/grants were not captured. The companion already documents this. After authorized in-memory decryption, derive required owner/grantee names from the archive; do not guess the full list today. Known application-facing references include `anon` and `authenticated`; other owner/service names must come from the archive or reviewed image definitions.

The narrow reconstruction allowance proposed for this test is to create **target-only NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS role placeholders with no inferred memberships**, solely where needed to resolve archived ownership/ACL references. Keep a reconstruction ledger in encrypted or transient memory; report only counts/categories publicly. Built-in PostgreSQL roles already exist and must not be duplicated. The isolated bootstrap administrator is a deliberately synthetic privileged role, not a recovered production identity. A placeholder cannot prove original service_role/BYPASSRLS behavior or inherited permissions; do not grant broad powers simply to pass tests. Stop for review if functionality requires additional unknown attributes/memberships.

Preserve archived object ownership, ACLs/default ACLs, RLS, functions and triggers. Do not use `--no-owner`/`--no-acl` as an unreported workaround. Use a synthetic target database owner/access policy and explicitly exclude exact database-level parity from the result. Inspect extension installation requirements and preloads, Vault configuration and any unexpected foreign-server/subscription/background-job definitions in memory before execution. Network isolation remains mandatory. Historical Vault/Storage counts were zero; if actual archived contents require unavailable external key/object material, report the recovery limitation and stop affected validation.

## Approved-input proposal and private processing

Use these unchanged local originals, whose downloaded copies the owner reports are identical:

| Input in `D:\WellBeingHub-Backups\Supabase-Phase2-20261026-Retry01` | Expected bytes | SHA-256 |
| --- | ---: | --- |
| `database.dump.age` | 379,522 | `4F77589A80907C7F64B97353CFF55BCD1BC30D9FF8CA9FCBEE93DBD80214CEA5` |
| `recovery.json.age` | 7,538 | `F981978AAA4F425A710171CEFE7CC11D76B6AB3D9980F1CEEDCA2CF13FA47233` |

Recheck both hashes, identities and protected paths. Reuse the dedicated console with no active shell after completion. Enter the existing Retry01 passphrase only at age's private prompts; never use the compromised first-attempt passphrase. Authenticate **each whole input into bounded RAM before any restore consumes it**, so a failed final authentication cannot feed untrusted partial data into the target. Use binary Node pipes, never a Windows PowerShell text pipeline, clipboard, transcript, plaintext archive file or credential argument. Any required archive selection list or comparison metadata stays in memory or approved container tmpfs, never the host filesystem.

Review the archive in memory before restoring. Prefer an ordinary full-archive restore into the clean target, allowing native pre-data/data/post-data ordering to create custom triggers after data load. Use `--exit-on-error --single-transaction` where supported, serial execution, and the already checked client through the local Docker transport; no `--dbname` may point outside the verified container. PostgreSQL documents [stdin input and transactional/error-stop options](https://www.postgresql.org/docs/17/app-pgrestore.html). If a managed dependency needs an archive selection or separate phase, enumerate the exact exception privately, preserve source data and stop for review rather than skip errors or disable all triggers. No migration is applied to the restored database merely to make it resemble later Phase 2 state.

The existing helpers (`phase2-encrypted-stream.mjs`, archive inspector, safe failure categories, private console) can be reused. Do not invoke `phase2-rehearsal.mjs`, the production export executor, or anything loading the project environment. A dedicated restore executor must enforce this plan and its target guards; it has not been executed or represented as a tested implementation.

## Post-restore checklist and result labels

1. Verify the target container ID/image digest, network `none`, absence of ports/bind/persistent mounts, tmpfs PGDATA/WAL/temp paths, synthetic administrator and database identity **before every write phase**. Revalidate after initialization. Capture IDs/settings only in sanitized evidence.
2. Record decryption, archive inspection, target bootstrap, restore and validation exit codes separately. Require no unexplained restore errors or omitted table/data/constraint entries. Classify any warnings without recording raw data.
3. Compare archive-derived expected table inventory and per-table COPY row counts against the restored target, computed privately in memory. Include empty tables, partitions, extension configuration data and sequences. If the archive encoding/entry form prevents reliable comparison, record that limitation rather than report a match. Do not query the hosted source.
4. Check `public.users`, Auth users/identities and all 20 known required objects. Validate Auth/profile links, normalized email uniqueness and required constraints through aggregate assertions; output no IDs, emails, hashes, tokens or row samples. Evaluate the FK-defined relationships, not an invented one-profile-per-every-Auth-user rule.
5. Verify both custom Auth functions/triggers and their enabled state. With separate synthetic rows inside a rollback-only test transaction, check profile creation and email synchronization without sending email or touching real accounts. SQL-level behavior is not an Auth service test.
6. Read only required migration metadata in the target: verify the two known applied Auth migration names and local SQL checksums against archived `_prisma_migrations`; require hosted Phase 2 migration/history and assessment tables to remain absent. Print only booleans/counts/checksum-match results.
7. Compare archived RLS flags, policy definitions, object owners, grants/default ACLs and extension versions. Test representative access with local `SET ROLE`/synthetic claims in rolled-back transactions, never just as the restore superuser. Distinguish archived object-ACL fidelity from unverified original role attributes/memberships/database grants. Record known excessive Prisma-history browser access; do not remediate it in this test.
8. Report coverage separately: **database restore and structural/data checks passed** only if these checks succeed; **global role/database privilege parity unverified** remains explicit; **Supabase service recovery untested** remains explicit. Any missing critical database dependency means incomplete/failed validation, not full recovery.

## One requested authorization

Approve starting Docker Desktop if needed, pulling the official pinned candidate image, creating only the new `wellbeing-phase2-restore-check` container with the new `wellbeing_restore` database and temporary in-memory storage, running a synthetic compatibility probe, privately decrypting the two exact verified files into RAM, creating the narrowly scoped synthetic role placeholders, and performing one isolated database restore plus the checks above. Stop before real restoration on failed isolation or unresolved critical compatibility checks; preserve all existing environments/backups and sanitized evidence. This includes no production access, new export, hosted changes, cloud upload, persistent plaintext database volume, automatic deletion, commit or push. Accept the existing Windows/WSL paging risk and the documented limits on original privilege and service-level recovery.
