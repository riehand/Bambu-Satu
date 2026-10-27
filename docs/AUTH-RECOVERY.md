# Authentication recovery and final verification — 2026-10-24

## Recovered state and interruption

The working tree was clean when this continuation began. Commit `b14bce1` already
contains the auth migration and registration diagnostics. Commit `9f9c136` contains
later assessment work and the missing closing brace in the registration test's
`request` helper. Neither commit was created, reset or reverted during recovery.
The existing assessment implementation was preserved; no Phase 2 feature was added.

Before the interruption, the two authorized environment corrections had completed:
SITE_URL was appended and DATABASE_URL was aligned with the working CLI value.
Recovery checked these conditions without displaying either connection string or
credentials. All five required configuration variables load. No environment file
needed another edit.

The interrupted regression run had failed on the test helper's missing brace.
The subsequent Prisma validation escalation was rejected because automatic approval
review could not complete after the usage limit was reached, not because it found
the command unsafe. Generation and final verification were unfinished. The current
checkout already fixes the brace; validation, generation and the tests were resumed
successfully. No additional application source correction was needed.

## Verified causes of the registration 503

1. SITE_URL was absent. The original handler called `isSameOrigin`, which called
   `getSiteUrl` and threw before validation, Prisma or Supabase signup. The focused
   regression test reproduced the exact safe 503 response.
2. The runtime DATABASE_URL from `.env.local` contained outdated credentials.
   Next.js preferred that file over `.env`. Both connections identified the same
   Session pooler, but runtime authentication was rejected while the CLI value
   passed the actual institutional-ID lookup. The approved alignment fixed this.

There was no evidence of a broken registration trigger or stale identity model.
Prior read-only checks confirmed the nullable legacy hash, canonical UUID foreign
key, email/institutional-ID indexes, enabled triggers, active RLS and required
metadata names. No schema changes were needed or executed.

The handler now resolves SITE_URL once for both CSRF and the email callback and
reports failures by stage. The logger emits only allowlisted error names/codes,
bounded numeric status, configuration-presence booleans and fixed Prisma failure
categories. It never emits an exception object, message, stack, request body,
participant identifiers, passwords, tokens or connection strings. Validation and
weak-password errors are 400, duplicate institutional IDs are 409, rate limits are
429, dependency failures are 503 and unexpected response failures are 500. Existing
email responses retain Supabase's neutral account-enumeration behavior.

## Files and scope

Only these files changed during this recovery turn:

| File | Change |
| --- | --- |
| `docs/AUTH-MIGRATION.md` | Current verified status, historical-status clarification, corrected auth file inventory |
| `docs/AUTH-RECOVERY.md` | This recovery report, evidence and manual checklist |

The following registration-fix files were recovered from the existing commits:

| File | Recovered implementation |
| --- | --- |
| `src/app/api/auth/register/route.ts` | Stage tracking, single origin resolution, safe error mappings |
| `src/lib/auth/http.ts` | Typed missing/invalid SITE_URL errors |
| `src/lib/auth/registration-diagnostics.ts` | Allowlisted structured diagnostics |
| `src/lib/configuration-error.ts` | Non-sensitive configuration error codes |
| `src/lib/supabase/config.ts` | Distinct missing URL/key failures |
| `tests/registration-diagnostics.test.ts` | 25 cases covering configuration, Prisma, Supabase, safe logging and valid/invalid signup |
| `.env.local` (ignored) | Previously approved origin addition and database alignment; values not reproduced |

The complete earlier auth migration file inventory is in
[AUTH-MIGRATION.md](AUTH-MIGRATION.md#changed-files). Prisma generation updated only
ignored generated client artifacts. UI, authentication providers, Prisma schema,
migration SQL, RLS, triggers, assessment code and existing accounts were unchanged.
NextAuth remains an already-installed unused dependency; it was not reintroduced
into any authentication flow or changed during recovery.

## Executed checks

| Command/check | Actual result |
| --- | --- |
| `npx prisma validate` | Passed, existing Prisma 5.22 schema valid |
| `npx prisma generate` | Passed, Prisma Client 5.22 generated locally |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed: 0 errors, 2 existing `no-img-element` warnings in the landing page |
| `npm run build` | Passed, including existing assessment routes; Next 16.4.2 Cache Components and Proxy |
| `npm test` | 185 passed across 10 files; 25 registration-diagnostics tests passed |
| `npm run auth:preflight` | Passed against hosted Supabase Session pooler, read-only |
| Final documentation/example credential scan | 16 files checked, zero matches for configured private credentials or secret-key patterns; values never printed |

Built-app HTTP smoke checks ran on a temporary local listener on port 3103 using
the existing configured canonical origin. Landing/login/register returned 200;
all three dashboards returned 307 to login with no-store; empty registration and
login requests returned 400; cross-origin registration returned 403; an unsupported
confirmation type returned 303 to the fixed login route. The temporary server was
stopped afterward. These requests did not submit a valid signup or send an email.

The test runner emitted one expected safe diagnostic for an intentionally mocked
Supabase signup failure. It contained stage/status/config-presence fields only.
SQL tests run actual migration SQL in disposable PGlite databases; they do not
apply migrations to hosted Supabase. The existing assessment browser suite targets
a fixture site and was not rerun for this auth-only recovery; it is not live auth
verification.

The hosted audit returned two active profiles, zero legacy password hashes, zero
normalized email duplicates, both auth migrations completed, auth.users present,
zero unmatched profiles and zero identities without profiles. These aggregate
checks validate existing data consistency; they do not prove delivery of a new
confirmation email or successful registration of a new account.

## Authentication acceptance and limits

| Behavior | Evidence and status |
| --- | --- |
| Student and lecturer registration | Automated handler/metadata tests pass; SQL tests verify UUID/role/profile creation. Owner reports working signup; agent did not create hosted users. |
| Email confirmation and resend | Automated valid/expired/unsupported-link and resend checks pass. Owner reports successful email verification; live email delivery was not exercised by the agent. |
| Email/password login | Automated valid/invalid/inactive/missing-profile and role-routing checks pass. Owner reports working login/dashboard access. |
| Profile synchronization | SQL trigger tests pass; hosted read-only audit has no unmatched identities/profiles. |
| Authorization | Verified identity, database roles, active status and ownership remain enforced; metadata-based escalation is rejected in tests. |
| Duplicate/invalid input | Tests cover institutional-ID conflicts, neutral duplicate-email handling, malformed fields and password mismatch. |
| Privacy and secrets | Documentation/example scan found no configured private secrets. Credential rotation is **not verified** and was not performed. |

## Manual verification at localhost:3000

1. Restart `npm run dev` after any environment change. Open `/auth/register`.
2. Using an account you control, register a student with a unique NIM; repeat with
   a lecturer and unique NIP when explicitly authorized to create those accounts.
   Confirm the UI shows the neutral confirmation instruction rather than 503.
3. Follow the email link. Confirm the login page displays confirmation success.
   Try an expired/used link and the resend action to check their safe feedback.
4. Sign in with email/password and verify participant dashboard access. Sign out
   and verify direct navigation to participant/admin/psychologist dashboards is
   denied. Do not change real users' roles just for testing.
5. Submit invalid fields and duplicate NIM/NIP; verify 400/409 handling. Existing
   email handling must remain neutral when Supabase obscures account existence.
6. If registration fails, inspect the `[auth.register]` stage and safe code in the
   server terminal. Do not share raw environment values, tokens or participant data.
7. Run `npm run auth:preflight` for aggregate identity consistency. No migration
   rerun, reset, trigger recreation or direct profile insert is required.

## Remaining work and readiness

No failing required automated check remains. The two landing-page lint warnings
are pre-existing. Real token expiry/refresh, fresh student/lecturer hosted signup,
email delivery and logout across real sessions have not been exercised by the
agent. Owner verification is recorded separately from executed automated tests.
Password rotation after the earlier exposure must be confirmed by the owner;
the agent did not rotate hosted credentials or infer that rotation occurred.

The auth foundation is ready to support continued assessment development on this
evidence. This is not a production-readiness certification or approval to apply
assessment migrations. The current repository already contains assessment work;
the hosted audit lists only the two auth migrations. Any Phase 2 deployment needs
its own schema/content/authorization review and explicit migration approval.

No commit, push, hosted account creation or hosted database write was performed.
The expected final uncommitted changes are the two documentation files listed above.
