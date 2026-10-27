# Pending Phase 2 migration — approval required

Exact file: `prisma/migrations/20261023010000_phase2_assessment/migration.sql`.

**Not applied to Supabase.** SQL was generated from the tracked baseline schema and the completed local schema using `prisma migrate diff --from-schema-datamodel ... --to-schema-datamodel ... --script`; custom constraints, triggers and grants were then added. Generation did not inspect or modify the hosted database. The complete SQL is the reviewable change, not a proposal to run `db push`.

### Read-only review, 24 October 2026

`node scripts/assessment-preflight.mjs` was executed against the configured project using local environment variables and a READ ONLY transaction. Results: no Phase 2 migration record, no collisions with the draft's declared table/index names (including primary-key indexes), enum names or function names; the current backend role reports RLS bypass capability. No schema/data changes occurred. These point-in-time checks do not replace a backup, shared-team agreement, full migration rehearsal or explicit application approval. Rerun immediately before an approved application because the database is shared.

The earlier 24 October application improvements required **no additional schema changes**. They use the existing session revision, answer count and update timestamp. The subsequent publication correction below changes only the pending Phase 2 trigger; both earlier Auth migrations and the Prisma schema remain unchanged.

The final read-only recheck on 24 October confirmed `20261021144827_init_users` and `20261023000000_supabase_auth` are applied and not rolled back. `20261023010000_phase2_assessment` has no migration record. The Auth inventory found no unmatched profiles or identities without profiles; this is a database consistency check, not a new interactive login test.

## Publication INSERT correction — 24 October 2026

The previous trigger ran only on UPDATE/DELETE. A direct INSERT with `is_published=true` and complete approval metadata could therefore create a published set with no questions. A new PGlite regression reproduced this bypass against the previous SQL before the correction (the INSERT unexpectedly succeeded).

Exact SQL changes in this pending migration:

1. Added this branch at the beginning of `public.phase2_freeze_question_set()`, before any `OLD` access:

   ```sql
   -- Questions reference an existing set: create a draft first, then publish.
   IF TG_OP = 'INSERT' THEN
     IF NEW.is_published THEN RAISE EXCEPTION 'Question sets must be inserted as unpublished drafts'; END IF;
     RETURN NEW;
   END IF;
   ```

2. Changed its event list from `BEFORE UPDATE OR DELETE` to:

   ```sql
   CREATE TRIGGER phase2_freeze_question_set BEFORE INSERT OR UPDATE OR DELETE ON assessment_question_sets FOR EACH ROW EXECUTE FUNCTION public.phase2_freeze_question_set();
   ```

New sets must now be unpublished drafts, whether the caller uses the existing false default or explicitly supplies false. Explicit true is rejected even when all approval metadata is supplied. Drafts remain editable/deletable. Publication remains an UPDATE requiring exactly 35 active questions plus the existing `published_question_set_approval` constraint: approval timestamp and nonblank approver, DASS source, WEMWBS licence, translation and presentation references. Existing unique item-number and dimension/range constraints ensure those 35 items comprise 21 DASS-21 and 14 WEMWBS items. The database enforces the presence of approval evidence; institutional reviewers still establish its authenticity.

The existing immutability branches remain unchanged: published sets cannot be edited, unpublished or deleted; published questions cannot be edited, deactivated, removed or moved. `AssessmentQuestionSet.isPublished @default(false)` already matches this workflow, so no Prisma schema change is needed.

Regression coverage in `tests/assessment-database.test.ts` now includes rejected direct published INSERT, default/explicit draft creation, draft editing/deletion, premature publication with no questions or only 34 active items, missing/blank evidence fields, valid 21+14 publication, and post-publication mutation rejection. `tests/database.test.ts` additionally applies both Auth migrations and Phase 2 in isolated PGlite, compares existing user data, columns, constraints, Auth trigger/function definitions, RLS policies and privileges before/after, and verifies registration/email-sync triggers still work afterward. All fixtures are synthetic and local.

Verification after correction:

| Command | Result |
| --- | --- |
| `npm test` | PASS: 220 tests in 10 files, including 35 assessment PGlite tests and 24 Auth/database tests |
| `npx prisma validate` | PASS; local schema valid (initial sandbox engine-download failure resolved by permitted network retry) |
| `npx tsc --noEmit` | PASS |
| `git diff --check` | PASS |

Only the pending migration, the two SQL test files and this review were changed for this correction. No unrelated application source changed. The migration remains additive: seven new tables and their supporting objects, with the existing assessment-to-user foreign key unchanged. That foreign key adds PostgreSQL's normal internal referential-integrity machinery; it does not replace existing authentication triggers or change existing user columns/data. No Supabase-managed Auth object, existing Auth trigger/function, Auth RLS policy or earlier migration file was modified.

**Ready for final deployment review of this correction; not approved or applied to hosted Supabase.** The earlier read-only findings are point-in-time evidence, not a new hosted check in this correction pass. The backup, collision recheck, shared-team coordination and actual PostgreSQL pool/concurrency rehearsal below remain deployment requirements. No `db push`, `migrate reset`, hosted migration or hosted test-data creation was run.

## Scope

Adds seven tables: `academic_periods`, `assessment_question_sets`, `questions`, `assessment_sessions`, `assessment_answers`, `assessment_scores`, `reports`. Adds six domain enums: academic-period status, instrument, scoring dimension, session status, DASS category, report status. Existing Role and UserType remain unchanged.

The only relationship to existing users is a foreign key from `assessment_sessions.participant_id` to `public.users.id`. No existing user columns, records, Supabase `auth` objects, profile triggers, Auth RLS, or Chatbot objects are altered. There are no data inserts. The `Report` row is metadata with `PENDING` status and a null object key; it is not a generated PDF.

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

## Read-only migration verification queries

Run the preflight before any approved application: `node scripts/assessment-preflight.mjs`. It checks declared table/index, enum and function names without printing credentials. The following SQL only reads migration history and catalog metadata; it can also be used after an approved application. Before application, Phase 2 catalog queries should return no rows. After application, expect seven tables with RLS enabled, no browser-role privileges or policies, eight foreign keys, five custom triggers, and the indexes/checks declared in the reviewed SQL. Compare definitions, not just counts. No participant responses are selected.

```sql
BEGIN READ ONLY;

SELECT migration_name, finished_at, rolled_back_at
FROM public._prisma_migrations
WHERE migration_name IN (
  '20261021144827_init_users', '20261023000000_supabase_auth',
  '20261023010000_phase2_assessment'
)
ORDER BY migration_name;

-- Seven rows after application; rls_enabled=true and direct_privileges=false.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
  has_table_privilege('anon', c.oid,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS anon_direct_privileges,
  has_table_privilege('authenticated', c.oid,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_direct_privileges
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname ~ '^(academic_periods|assessment_question_sets|questions|assessment_sessions|assessment_answers|assessment_scores|reports)$'
ORDER BY c.relname;

SELECT con.conrelid::regclass AS table_name, con.conname,
  con.contype, con.convalidated, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname ~ '^(academic_periods|assessment_question_sets|questions|assessment_sessions|assessment_answers|assessment_scores|reports)$'
ORDER BY table_name, con.conname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename ~ '^(academic_periods|assessment_question_sets|questions|assessment_sessions|assessment_answers|assessment_scores|reports)$'
ORDER BY tablename, indexname;

SELECT c.relname AS table_name, t.tgname, t.tgenabled,
  pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname ~ '^(academic_periods|assessment_question_sets|questions|assessment_sessions|assessment_answers|assessment_scores|reports)$'
ORDER BY c.relname, t.tgname;

-- Expected: zero policies. Access is through the trusted backend.
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename ~ '^(academic_periods|assessment_question_sets|questions|assessment_sessions|assessment_answers|assessment_scores|reports)$';

COMMIT;
```

The foreign keys link questions to question sets; sessions to users, periods and question sets; answers to sessions and questions; and scores/reports to sessions. All eight use `ON DELETE RESTRICT` and `ON UPDATE CASCADE`. In addition to primary/unique keys, review the participant-period lookup index, completed-history index, one-active-period partial index and one-in-progress-session partial index. A successful catalog check does not replace the authorized multi-connection behavior rehearsal.

## Existing data and recovery

The migration is additive and enclosed in BEGIN/COMMIT. A collision or SQL error should roll back the draft as a unit; inspect any Prisma failed-migration record before a reviewed retry. No data is backfilled or deleted.

If application rollback is needed after migration, restore the previous application version and leave the additive tables intact. Once assessments exist, do not drop these tables to roll back. Preserve a backup and use a forward corrective migration approved by the database owner. Removing empty new tables/functions/enums still requires explicit approval and a dependency review. The application can continue showing the dashboard with a safe unavailable state while a database issue is investigated.

## Verification performed locally

Prisma validation/client generation; actual SQL execution in PGlite (embedded PostgreSQL); publication/immutability, uniqueness, range, completion, rollback, quota isolation and denied browser-role access tests. This does not substitute for multi-connection hosted Prisma integration. No hosted migration or hosted test-data creation was attempted.
