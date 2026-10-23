# Pending Phase 2 migration — approval required

Exact file: `prisma/migrations/20261023010000_phase2_assessment/migration.sql`.

**Not applied to Supabase.** SQL was generated from the tracked baseline schema and the completed local schema using `prisma migrate diff --from-schema-datamodel ... --to-schema-datamodel ... --script`; custom constraints, triggers and grants were then added. Generation did not inspect or modify the hosted database. The complete SQL is the reviewable change, not a proposal to run `db push`.

## Scope

Adds seven tables: `academic_periods`, `assessment_question_sets`, `questions`, `assessment_sessions`, `assessment_answers`, `assessment_scores`, `reports`. Adds six domain enums: academic-period status, instrument, scoring dimension, session status, DASS category, report status. Existing Role and UserType remain unchanged.

The only relationship to existing users is a foreign key from `assessment_sessions.participant_id` to `public.users.id`. No existing user columns, records, Supabase `auth` objects, profile triggers, Auth RLS, or Nani objects are altered. There are no data inserts. The `Report` row is metadata with `PENDING` status and a null object key; it is not a generated PDF.

## Constraints and transaction safety

- Partial unique index: at most one ACTIVE academic period. Missing periods are allowed and handled by the UI.
- Partial unique index: one IN_PROGRESS session per participant and period.
- Unique question number per question set/instrument; unique answer per session/question; one score and one report per session.
- Period dates/quota checks, exact item-to-dimension mapping, answer ranges, score ranges, completed timestamp consistency and nonempty consent version.
- Session-scoped content version, processing-consent timestamp/version, monotonic application revision.
- Published questions/options/evidence and official scores are immutable. Completed session/answers cannot change. Completion requires 35 answers, scores and report metadata.
- Backend mutations lock the participant row for the duration of one READ COMMITTED transaction; this serializes start/save/submit for the same participant. Period rows are shared-locked while validating quota/status. No user row is updated. Save revisions reject competing stale tabs. Submission retries return the already persisted result and original completion date.

## RLS and grants

RLS is enabled on all seven new tables. `PUBLIC`, `anon` and `authenticated` receive no direct table privileges; no browser/mobile policies are installed. Trigger functions have public execution revoked. The trusted server Prisma database role must be verified to own or legitimately bypass RLS and have the required table privileges. These changes do not grant broader access to existing roles or alter existing users' RLS.

## Before any hosted application

1. Obtain explicit user approval for this exact migration, plus agreement with the team sharing the database. Take a recoverable backup.
2. Read-only review the actual schema/migration history. Confirm the existing Auth migrations are applied. Check for collisions with every proposed table, enum, index and `phase2_*` function name. In particular, generic names `questions` and `reports` may already belong to another system. **Do not overwrite, adopt or rename existing shared objects automatically.** This draft deliberately fails on collisions.
3. Verify the server database role and ownership privileges. Rehearse on an isolated PostgreSQL clone, including concurrent connections and the actual Prisma driver/pool configuration.
4. Apply only the reviewed pending migration in a maintenance window using the version-matched Prisma 5 migration workflow. No `migrate reset`, `db push`, Auth trigger replacement or RLS disablement.
5. Verify `_prisma_migrations`, all seven tables, indexes/checks/triggers, RLS flags and grants. Confirm existing users still log in and browser roles cannot read assessment tables directly.
6. With separate approval for hosted data, configure the real academic period and approved question set. Run authenticated participant integration checks and concurrent start/save/submit requests using approved test accounts. Verify one session, one score/report, one completed quota count, and rejection of cross-user reads.

## Existing data and recovery

The migration is additive and enclosed in BEGIN/COMMIT. A collision or SQL error should roll back the draft as a unit; inspect any Prisma failed-migration record before a reviewed retry. No data is backfilled or deleted.

If application rollback is needed after migration, restore the previous application version and leave the additive tables intact. Once assessments exist, do not drop these tables to roll back. Preserve a backup and use a forward corrective migration approved by the database owner. Removing empty new tables/functions/enums still requires explicit approval and a dependency review. The application can continue showing the dashboard with a safe unavailable state while a database issue is investigated.

## Verification performed locally

Prisma validation/client generation; actual SQL execution in PGlite (embedded PostgreSQL); publication/immutability, uniqueness, range, completion, rollback, quota isolation and denied browser-role access tests. This does not substitute for multi-connection hosted Prisma integration. No hosted migration or hosted test-data creation was attempted.
