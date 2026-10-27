# Isolated PostgreSQL 17 / Prisma 5.22 rehearsal

25 October 2026. **Explicitly approved and executed: seven real PostgreSQL integration tests passed.** The [handover review](PHASE2-HANDOVER-READINESS.md) records the historical acceptance boundary; detailed operational evidence stays with the owner. The container and dedicated volume are retained; hosted integration and production recovery remain unverified.

## Approved operation and retained environment

The approved run created `wellbeing-phase2-rehearsal` from official `postgres:17`, binding database port **127.0.0.1:55432**, with dedicated volume `wellbeing-phase2-rehearsal-data`. Database: `wellbeing_phase2_rehearsal`. All identities/questions/answers are synthetic. No production source data was read or copied. Docker Desktop was started in the background. Observed PostgreSQL is 17.11; image digest `sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe`. No paid cloud resource was created.

The runner refuses an existing container or volume with these names and remote Docker endpoints. It removes inherited database/Supabase/PG settings, verifies the container label/port/image/volume before each write stage, and writes a random per-run marker which the test checks before fixture writes. `DATABASE_URL` and `DIRECT_URL` are the identical local URL; Supabase URL is an unused local endpoint and API keys are cleared. Explicit environment values override Prisma's automatic `.env` loading. Do not run this against a tunnel or restored-data database. The application Auth API is not called.

```powershell
# Safe now: prints plan only, creates nothing.
node scripts/phase2-rehearsal.mjs
# Already executed with explicit owner approval; shown for reproducibility.
# Refuses the retained existing container/volume. Do not delete them to rerun.
node scripts/phase2-rehearsal.mjs --create-approved-synthetic
```

No arbitrary destination URL is accepted. No `migrate reset`, `db push` or hosted deploy is used. The runner uses installed Prisma 5.22, creates an explicit minimal synthetic `auth.users`/`auth.uid()` baseline, and applies both existing Auth migrations through **Prisma migrate deploy** in a temporary migration directory. It creates a baseline synthetic identity via the migrated trigger, snapshots its profile/trigger definitions, then applies Phase 2 through the original migration directory. All three migration checksums are verified in the database. Original schema and migrations are copied/read only, never rewritten.

## Executed checks

`vitest.rehearsal.config.ts` includes only `tests/rehearsal/*.rehearsal.ts`; ordinary `npm test` cannot execute these files. The standalone config also refuses an unapproved/nonlocal environment. This suite imports the real application service and real Prisma clients, without mocking Prisma.

| Requirement | Prepared check |
| --- | --- |
| Auth migrations and history | Ordered Prisma deployment, exact three checksums and successful migration records |
| Existing Auth/profile integrity | Before/after synthetic baseline comparison; actual signup trigger and email sync; injected role ignored |
| Seven assessment tables | Catalog count and enabled RLS; eight FKs and five enabled custom triggers |
| Draft/publication | Reject published INSERT and empty publication; create 21+14 synthetic questions, publish through UPDATE, reject later edits |
| Real parallel connections | Hold participant row on a separate client; observe at least two distinct PostgreSQL PIDs waiting on the real service's lock before release |
| Concurrent start | Three contenders produce one session |
| Concurrent autosave / stale revisions | One success at revision 0, two `STALE_REVISION` failures; 35 answers persist; stale submit rejected |
| Concurrent final submit | Three contenders return identical completion/result/report; exactly one score/report and one quota use |
| Deterministic scoring | Known synthetic answers yield DASS 14/14/14 and WEMWBS 42 |
| Real rollback | Inject local report-insert failure after score creation; verify no score/report or completion/revision change, then retry |
| Quota | Complete exactly three unified sessions; concurrent fourth starts all rejected |
| Cross-user | Another participant cannot read/save/submit session; history is owner-specific |
| Browser access | Real `SET LOCAL ROLE` denial on all seven tables; authenticated own-profile policy still works |

The existing 230 local tests also passed. They supplement the seven PostgreSQL tests with input ranges, invalid publication variants, inactive/forbidden roles and period rules. The read-only local catalog audit retained 20 constraint definitions, 16 index definitions, five enabled triggers, zero assessment policies, and effective browser table/column/function denials. Three distinct waiting PostgreSQL PIDs were observed in each contention scenario.

The runner reports a fixed stage on failure and saves sanitized execution logs, operation statuses and structured test evidence in `.tmp/phase2-rehearsal-<UTC timestamp>`. A successful `result.json` records actual PostgreSQL/Prisma versions, image identity and migration hashes, and explicitly says no backup restore or hosted Auth verification occurred. Full execution artifacts are retained locally by the owner and excluded from Git. No automatic container/volume/evidence cleanup is included.

## Limits and release evidence

This passed database concurrency test uses a synthetic Auth schema. It does not test Supabase GoTrue, PostgREST, Storage, email delivery, browser cookie refresh or the hosted Session pooler. Before hosted release, address compatible Supabase recovery validation and the separately authorized authenticated end-to-end journey. Neither is required to begin Phase 3 development. The production role/grant proposal must also be rehearsed under the intended least-privilege roles; testing as local `postgres` does not resolve that security blocker.

The service uses READ COMMITTED, participant `FOR UPDATE`, period `FOR SHARE`, maxWait 5 seconds and transaction timeout 15 seconds. After approval, test the deployed connection/pooling topology as well. Record server/Prisma versions, image digest, pending migration checksum, actual passing test count and date; never infer success from the presence of this harness.
