# Phase 1A: Supabase Auth migration

## Current status — verified 2026-10-24

The interrupted authentication work has been recovered and verified. Both approved
local configuration corrections were already complete: SITE_URL is configured and
the runtime DATABASE_URL matches the working CLI connection. Both auth migrations
are recorded as successfully applied in hosted Supabase. The read-only audit found
two profiles, zero legacy hashes and no identity/profile mismatches. No migration
or hosted write was performed during recovery.

All 185 current automated tests pass, including 25 registration diagnostics tests;
Prisma validation/generation, TypeScript and the production build pass. Lint has
zero errors and two existing landing-page image warnings. The owner reports that
registration, login, email verification and participant dashboard access work.
The agent did not create hosted test accounts or execute live signup/email flows.
See the [current handover](PHASE2-HANDOVER.md) for developer setup and integration limits.
Detailed machine-specific recovery evidence is retained privately by the owner.

The dated notes below preserve the earlier investigation. Missing configuration,
IPv6 connectivity, unapplied-migration and test-count statements in those snapshots
describe their historical state, not the current status above.

## Configuration follow-up (2026-10-23)

The local public URL was verified against the project supplied by the user, and
the publishable key successfully read `/auth/v1/settings` (HTTP 200). Email auth
and signups are enabled; email confirmation is required. No account was created
and no email was sent during these read-only checks.

SITE_URL and DIRECT_URL are missing. DATABASE_URL points at that project's direct
endpoint. DNS returned no IPv4 address and one IPv6 address; a direct IPv6 TCP
probe outside the sandbox returned ENETUNREACH. Copy the exact **Session pooler**
string (5432) from Dashboard → Connect into private local DATABASE_URL/DIRECT_URL.
Do not guess a region, pooler host or password. Set SITE_URL to the website origin.
See [Supabase's connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

The original preflight had an environment precedence bug: importing Prisma 5
before loading Next env caused `.env` to win over `.env.local`. That read-only
query reached the **old local database**, finding one active profile with a legacy
hash, the applied initial migration, zero normalized email duplicates, and no
auth.users table. It did not inspect hosted Supabase. The script now loads Next
env first, dynamically imports Prisma, explicitly pins the resolved datasource,
and refuses a target that does not match the configured Supabase project. The
corrected hosted preflight fails on the IPv6 connectivity issue. Preserve that
local legacy account and review its migration mapping before cutover.
The hosted Data API zero-row profile probe returned HTTP 404 / PGRST205: `users`
is not present in its exposed schema cache. This does not prove the database is
empty or that no private table exists; hosted identity/profile consistency remains
unverified until a direct database inventory succeeds.

NextAuth 4 was removed in the earlier working-tree change before live verification.
Its dependency has now been restored to honor the requested verification gate;
it is intentionally not wired into the new auth routes. Removal must wait for
live signup/confirmation/login acceptance. bcrypt remains unused/removed. The
restored legacy dependency installation reported 8 dependency advisories; do not
run a forced major-version audit fix as part of this migration.

The example environment file had been populated with real credential values.
It is now placeholders only, with a regression test that never prints values on
failure. Private `.env` and `.env.local` files were not changed. A database password
was inadvertently displayed during the initial inspection: rotate it in Dashboard
and update private local configuration, never through chat. No commit was made.

The SQL remains an **unapplied proposal**. It attaches triggers to auth.users;
that requires specific review/approval under the instruction not to modify
Supabase-managed tables. No managed Auth table, trigger, column, or record was
modified. Do not execute the proposal as part of this configuration check.

## Audit and scope

The original flow used NextAuth Credentials, NIM/NIP login, bcrypt hashes in
`public.users`, a one-day JWT containing role/identity fields, and middleware that
checked login but not role. Registration created an independent UUID through Prisma.
The participant page read the JWT. Psychologist/admin dashboards did not exist.
There were no assessment/report/consultation tables or operations to migrate.

The repository contains `20261021144827_init_users`, which creates Role/UserType,
users, and unique email/institutional-ID indexes. That migration is unchanged.
The working tree already contained the two Supabase dependencies; they were kept.
Read-only inventory attempts could not reach the configured database, including a
retry outside the network sandbox. **Existing rows, applied migration history,
Auth schema presence, and identity overlap remain unverified. Do not assume empty.**
The environment had public Supabase settings and DATABASE_URL; DIRECT_URL was absent
at audit time. Existing `.env` and `.env.local` were not changed or printed.

## Architecture

1. Login/register/resend/logout UI calls same-origin Next Route Handlers. POSTs
   compare Origin with server-only SITE_URL; no Host/header-derived callback URLs.
2. Supabase Auth alone checks email/password and issues sessions. `@supabase/ssr`
   handles cookies, using a per-request server client and a browser-client factory.
   Passwords are never sent to Prisma, written to profiles, or logged.
3. Next.js 16 `src/proxy.ts` uses verified `getClaims()` for refresh and coarse page
   redirects, preserving cookies on both the request and response. Auth/protected
   responses have private/no-store headers. Login is never redirected merely for
   having a cookie, avoiding inactive/missing-profile redirect loops.
4. Every protected page calls `requirePageRole`, which calls `getUser()` against
   Auth, checks email confirmation, then selects a safe profile by **that ID only**.
   Database role and is_active are authoritative, never metadata or browser state.
   A wrong-role page redirects to the user's own dashboard. `requireApiRole` is
   available for future backend operations; APIs must enforce roles themselves.
5. Supabase inserts the profile in the same database transaction as auth.users via
   the validated trigger. Missing/invalid fields and unique conflicts roll back
   both inserts. Unconfirmed signups still have a profile; no session is required
   to create it. Email delivery is outside this transaction: a delivery problem
   may leave a consistent pending account, handled through resend.
6. Logout uses `scope: local`, revoking the website refresh session without logging
   out Nani. It then performs a full navigation to discard client router state.
   Supabase access tokens already issued may remain valid until expiry; RLS and
   server profile checks still enforce account status on every data operation.

The participant layout, registration fields, login password visibility, branding,
and Tailwind styling are retained. Login now uses email. Privileged dashboards are
minimal placeholders. Four landing-page apostrophes were escaped solely to fix
existing lint errors; rendered text/design is identical. There is no chatbot
handoff, assessment implementation, consultation, or report-consent schema.

## Profile model and SQL ownership

`User.id` is a required UUID with no independently generated default. It references
`auth.users.id` through a SQL-owned foreign key. `ON DELETE RESTRICT` deliberately
prevents accidental Auth deletion from deleting application history; a later
approved account-deletion workflow must reconcile related records explicitly.

Full name, email, phone, NIM/NIP, user type, role, account status and timestamps stay
in public.users. The existing unique constraints remain. An additional normalized
email unique index rejects case/whitespace duplicates. Auth email changes synchronize
the profile; user metadata changes do not change profile role/status/identity.

`passwordHash` is nullable for the transition only. New profiles have NULL. Existing
hashes are preserved until verified cutover and separate approval to run
`prisma/manual/clear-legacy-passwords.sql`. That script refuses cleanup while an
identity is missing, mismatched or unconfirmed. Verify real login/recovery first;
confirmation alone does not prove a working password. No application query selects
hashes. The password column can be removed in a later reviewed migration.

The cross-schema foreign key, trigger/functions, expression index, RLS and grants
are SQL-managed, not fully modeled by Prisma 5.22. **Do not use `db push`, migrate
reset, or an unreviewed generated diff**: it may discard SQL-owned protection.
Do not introspect/manage Supabase's auth schema with Prisma migrations. Use a
disposable Supabase database for migration development, not a plain PostgreSQL
shadow database without auth.users.

## Approval-gated rollout and existing-account plan

Do these in a maintenance window, with a verified backup and tested recovery plan.
Do not deploy the new application against the old database before these gates pass.

1. Run `npm run auth:preflight` with the intended configuration. It is read-only,
   reports aggregate counts/applied migration names, and omits credentials and PII.
   Inventory legacy roles/status, UUID dependencies, duplicate normalized emails,
   existing auth.users, existing triggers/policies/grants, and downstream consumers
   in a secure administrator session. Check the website and Nani target one project.
2. If legacy profiles exist, obtain approval for an explicit account-by-account
   mapping. Prefer importing each verified legacy account into Supabase Auth with
   **the existing UUID**. The installed Auth Admin API supports `id` and bcrypt
   `password_hash` on createUser; test compatibility in staging first. Use a temporary
   server-only admin script/secret outside the web runtime; never log hash contents.
   Do not mark email confirmed just because a legacy row exists: require evidence of
   prior verification or send a verification/recovery flow. Preserve database roles,
   active status and existing references. This import must precede the new signup
   trigger, which intentionally rejects conflicting profile inserts.
3. An existing Supabase identity with another UUID requires a separately reviewed
   reconciliation of every dependent foreign key and application reference. Never
   auto-link by matching email, regenerate UUIDs casually, or merge/delete rows to
   make the migration pass. If hash transfer is unsuitable, use a reviewed password
   reset/invitation transition and confirm recovery works. Account migration tooling
   is deliberately deferred until the real inventory is available.
4. Reconcile Auth-only identities too: each needs a reviewed profile. Disable new
   registrations while importing, checking and applying the migration to avoid races.
   Repeat the preflight; all mappings must be consistent. Resolve normalized email
   conflicts manually without silently overwriting data. Review any existing RLS
   policies: the migration refuses to coexist with unknown users policies.
5. **Obtain explicit approval before applying** the prepared migration using
   `npx prisma migrate deploy` with DIRECT_URL targeting the reviewed Supabase DB.
   On a new empty Supabase DB, this also applies the existing initial migration.
   On an existing DB, verify its migration baseline/history first; do not mark
   migrations applied without evidence. The new migration is transactional and
   fails before alterations if identities are inconsistent. If Prisma records a
   failed attempt, diagnose and review its state before an approved resolve/retry.
6. Configure Supabase below, deploy with matching env, and run the manual checklist.
   Old NextAuth cookies are ignored; everyone must sign in again. Keep the previous
   application release/backup available during the cutover validation window.
7. Only after verified Supabase login/recovery for migrated accounts, approve the
   separate legacy-hash cleanup. Do not run it as part of routine app startup.
   After cleanup, rollback to legacy password auth requires the protected backup;
   an application-only rollback is insufficient. Do not disable RLS during rollback.

## Supabase Dashboard setup

- Enable Email/password Auth and **Confirm email**. Set minimum password length to
  at least 8, aligned with the UI. Disable anonymous and unused providers. Configure
  signup/resend/login rate limits and production email delivery in Supabase.
- Set Auth URL Configuration Site URL to the canonical website origin; add exact
  redirect URLs `http://localhost:3000/auth/confirm` for development and
  `https://YOUR_WEBSITE_HOST/auth/confirm` for production. Set SITE_URL in each web
  environment to its own origin. Avoid wildcard production callbacks.
- Change the **Confirm signup** email link to the token-hash SSR route:

  ```html
  <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Konfirmasi email</a>
  ```

  Website signup/resend always sets RedirectTo to the fixed `/auth/confirm` URL.
  The handler accepts only `type=email`, verifies the token, removes token/query
  data from the redirect, and shows a login confirmation notice. Expired/invalid or
  used links show instructions and a resend action. No arbitrary `next` redirect is
  accepted. The default ConfirmationURL/code callback is not this configured flow.
  Future Nani signup must configure its own approved callback compatible with this
  shared template; the website does not hand tokens to mobile.
- Configure custom SMTP for production. Hosted Supabase's built-in mail service is
  restricted/rate-limited and is not a general production mail delivery service.
  Use approved test recipients when testing the hosted project.
- For fully local development use Supabase CLI + Docker and the local mail-capture
  inbox URL printed by `supabase status` (Mailpit in current local stacks). Apply the
  same email template and enable confirmations locally. There is no requirement to
  use the hosted email service. `npm run dev` alone does not start Auth/PostgreSQL or
  a test inbox; no local Supabase stack was provisioned by this change.
- Verify public.users RLS and column grants after migration. Browser/mobile queries
  must select named safe columns; `select('*')` is intentionally denied while the
  legacy password column exists. No anon access and no authenticated profile writes
  are granted. Assign PSYCHOLOGIST/SUPERADMIN only through a trusted administrator
  database process; the website exposes no role assignment endpoint.

## Environment and Prisma 5.22 connections

Use `.env.example` placeholders; copy values from the intended project's Connect
dialog. Do not replace existing secrets with example values.

| Variable | Visibility and purpose |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Public Auth/Data API URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public publishable key only; never a secret/service-role key |
| SITE_URL | Server-only canonical website origin for CSRF and confirmation |
| DATABASE_URL | Server-only Prisma runtime connection |
| DIRECT_URL | Server-only Prisma migration connection via schema `directUrl` |

For serverless deployments, Prisma 5.22 can use the Supavisor transaction pooler
on port 6543 with `pgbouncer=true`; use direct port 5432 on IPv6, or the **session**
pooler on port 5432 for migrations on IPv4. A persistent server may use a session
connection for runtime too. URL-encode database passwords and use TLS for hosted
connections. Do not copy Prisma 7 adapter/prisma.config.ts examples into this v5 app.
The runtime database role should have only required table access; migration DDL
uses a separate privileged connection. A privileged connection bypasses RLS, which
is why the server independently verifies identity, active status, role and ownership.

Next loads `.env.local` before `.env`; Prisma CLI loads `.env`/process environment,
not automatically `.env.local`. Supply matching DATABASE_URL and DIRECT_URL to the
CLI without printing them. `npm run auth:preflight` deliberately uses Next's env
loading order to inspect the application's database. This website needs no Supabase
secret/service-role API key. Remove obsolete NEXTAUTH variables from deployment
configuration only after successful cutover; existing local secret files are intact.

## Tests and manual acceptance

`npm test` executes mocked Route Handler/authorization/Proxy tests and real embedded
PostgreSQL tests via PGlite. SQL tests create a disposable Auth-table/role/UID-function
fixture, then execute the **actual** original and new migration SQL. They never use
DATABASE_URL. They exercise triggers, uniqueness, rollback, foreign keys, RLS and
column grants; they do not run Supabase's GoTrue/PostgREST services or SMTP.

Automated coverage includes both user types, invalid fields/password mismatch,
signup failure, generic duplicate email responses, duplicate institutional ID,
forged role/ID metadata, no password selects, inactive/missing profiles, all role
destinations, protected-route redirects, wrong-role API denial, CSRF, logout scope,
confirmation/resend, refreshed cookies/cache headers, own-profile reads, denied
other-user/anonymous reads, denied profile writes, and migration abort with legacy
data/hash preservation. See final recorded check results below.

Run this checklist on staging after approved database setup:

| Check | Required observation |
| --- | --- |
| Student registration | All original fields accepted; STUDENT/PARTICIPANT; same UUID in Auth/profile; NULL profile password hash |
| Lecturer registration | LECTURER/PARTICIPANT with unique NIP and same Auth/profile UUID |
| Confirmation | No protected data before verification; email link works in another browser; notice after confirmation |
| Invalid/reused/expired link | Controlled login message, no token in destination; resend is rate-limited and neutral |
| Email login | Valid credentials route each of the three database roles to its own dashboard |
| Login failure | Wrong password, unknown email and NIM-as-login denied; no internal errors exposed |
| Duplicate signup | Existing email stays neutral where obscured; duplicate NIM/NIP denied; concurrent duplicates leave no orphan identity |
| Session persistence | Reload/new tab retain session; wait for token expiry and verify refresh cookies on request and response |
| Logout | Current website refresh session revoked; protected navigation requires login; separate mobile session stays signed in |
| Inactive account | Disable profile in trusted DB; existing cookie cannot render profile or read it through Data API |
| Role access | Try every dashboard under every role, including direct URL/RSC navigation; role metadata edits grant nothing |
| Identity tampering | Forged cookie/body/user ID never selects another Prisma profile |
| RLS | With anon/publishable key alone, deny reads; user A cannot select B; all browser writes denied |
| Column grants | Named safe columns work for own active profile; password_hash and SELECT * fail |
| Profile consistency | Compare both directions between auth.users/public.users after successful/failed signups |
| Network/DB failure | UI shows recoverable failure; sensitive pages fail closed; no credentials in responses/logs |
| Legacy account | Imported UUID/references/role/status retained; email verification plus password or recovery confirmed |
| Build/lint | Run npm test, npm run build, npm run lint; inspect any environment-specific errors |

No assessment/report data access is granted to Nani. Both clients share Auth IDs
and this profile contract, but maintain independent sessions. Any future sensitive
table requires its own RLS/grants and independently authorized Prisma operations.

## Changed files

| Files | Change |
| --- | --- |
| `.env.example`, `.gitignore` | Placeholder config and example-file tracking |
| `package.json`, `package-lock.json` | Preserve Supabase deps; retain unused NextAuth pending live acceptance; remove bcrypt; server-only and test tooling/scripts |
| `prisma/schema.prisma` | Required external UUID, transitional nullable hash, directUrl |
| `prisma/migrations/20261023000000_supabase_auth/migration.sql` | Guarded FK, registration/email triggers, RLS and grants |
| `prisma/manual/clear-legacy-passwords.sql` | Separately approved post-cutover cleanup |
| `scripts/auth-preflight.mjs` | Safe read-only inventory |
| `src/lib/supabase/{config,client,server}.ts` | Public config and SSR client factories |
| `src/lib/prisma.ts`, `src/lib/auth/{roles,session,http,registration-diagnostics}.ts`, `src/lib/configuration-error.ts` | Server-only DB/authorization, safe configuration errors, stage-based diagnostics and response/origin helpers |
| `src/lib/validations/auth.ts` | Normalized email, bounded profile inputs, password matching |
| `src/proxy.ts` | Next 16 verified session refresh and coarse route protection |
| `src/app/api/auth/{register,login,logout,resend}/route.ts` | Auth-only mutations with CSRF/error handling |
| `src/app/auth/confirm/route.ts` | Token-hash confirmation |
| `src/app/auth/{login,register}/page.tsx` | Preserve design, use email auth and accurate feedback |
| `src/app/participant/dashboard/page.tsx` | Verified own-profile view and logout |
| `src/app/{participant,psychologist,admin}/loading.tsx` | Cache Components loading boundaries |
| `src/app/{psychologist,admin}/dashboard/page.tsx` | Role-protected placeholders |
| `src/components/{logout-button,role-placeholder}.tsx` | Shared minimal auth UI |
| `src/app/page.tsx` | Four JSX apostrophe escapes; no rendered/design change |
| `tests/{auth,database,proxy,environment,preflight,registration-diagnostics}.test.ts`, `tests/server-only.ts`, `vitest.config.ts` | Isolated authorization, PostgreSQL, placeholder safety, database-target and registration diagnostic checks |
| `docs/AUTH-MIGRATION.md` | Audit, rollout, configuration, testing and limitations |
| Removed `src/lib/authOptions.ts`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts` | Replaced legacy auth |

## Official references used

- [Supabase SSR for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase user data and registration triggers](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase signup semantics](https://supabase.com/docs/reference/javascript/auth-signup)
- [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Prisma connections](https://supabase.com/docs/guides/database/prisma)
- [Prisma legacy connection guidance](https://www.prisma.io/docs/orm/v6/overview/databases/supabase)
- [Supabase local development](https://supabase.com/docs/guides/local-development)
- Installed Next 16.4.2 guides in `node_modules/next/dist/docs/` for Proxy,
  cookies, Route Handlers, Cache Components authentication, and `unstable_rethrow`.
- Installed `@supabase/auth-js` AdminUserAttributes documents optional UUID and
  password-hash import; any live import still requires review/approval.

## Recorded verification results

- `npm test`: **62 passed** (32 auth/authorization/Route Handler, 4 Proxy, 23 PostgreSQL,
  1 environment-example safety, 2 preflight target/error handling).
- `npm run build`: **passed** on Next 16.4.2 with Cache Components and Proxy.
  The initial sandboxed build could not download the existing Google Inter font;
  the successful build used approved network access, without changing the font.
- `npm run lint`: **0 errors**, 2 existing landing-page `no-img-element` warnings.
- `npx tsc --noEmit`: **passed** after clearing a stale generated type referring to
  the deleted NextAuth route.
- `npx prisma generate` and `npx prisma validate`: **passed** with Prisma 5.22.
  Validation used a process-local placeholder DIRECT_URL for schema parsing only;
  this is not a successful database connection test.
- Built-app HTTP smoke checks: landing/login/register returned 200; all three
  dashboards redirected anonymous requests to login with no-store; invalid login
  returned 400; cross-origin logout 403; GET logout 405; unsupported confirmation
  type redirected safely to the fixed login destination.
- Built browser assets contained neither of the configured DATABASE_URL nor
  NEXTAUTH_SECRET values. No credentials were printed by this check.
- No remaining NextAuth/bcrypt references in runtime source. NextAuth remains an
  unused dependency pending live verification, per the configuration follow-up.
  `git diff --check` passed. Restoring it reported 8 dependency advisories.

Live email delivery, hosted Auth/PostgREST behavior, real session expiry,
imported-account login and Dashboard configuration remain manual staging gates
because the DB was unreachable. SITE_URL and DIRECT_URL still need configuration
in the real environment; the smoke server used only a temporary localhost SITE_URL.
