# WellBeing Hub / Bambu-Satu — Phase 2 team handover

Updated 27 October 2026. **Development implementation complete; hosted deployment pending.** Commit `8a76603` is already published on `origin/riehand_branch`. See the [handover readiness review](PHASE2-HANDOVER-READINESS.md) for the exact repository-hygiene follow-up. The prior 230-test baseline and seven real PostgreSQL tests passed; no rerun was performed for this review. Preserve Phase 2 ownership, scoring and immutability rules while developing Phase 3.

## A. Project overview

Encrypted source and database backups are verified off-device on private Google Drive; upload/download and matching checksums are owner-confirmed. Local archive verification passed. Full project extraction and database restoration remain untested. Those deployment/recovery tasks are deferred and do not block Phase 3 development. No backup, restore or Windows security work is requested by this handover. Chatbot remains a separate application under the [shared database contract](CHATBOT-DATABASE-CONTRACT.md).

The website supports Supabase email/password signup, confirmation, login/logout, trusted profile synchronization and role-based access. Participant pages implement a backend-derived dashboard, unified DASS-21 + WEMWBS session, processing consent, autosave/resume, review/edit, revision-aware confirmation/submission, deterministic scores and owner-specific history. Missing database/content/period dependencies produce unavailable states, not fabricated participant results.

It does not generate PDFs, provide consultations, authorize psychologists to read participant results, share assessment data with Chatbot, or provide institution/content/consent-administration tooling. `Report` currently means metadata only. The separate companion application is **Chatbot**.

## B. Exact stack

Resolved from `package-lock.json` on this checkout; use `npm ci` to preserve it:

| Package/tool | Version |
| --- | --- |
| Next.js / eslint-config-next | 16.4.2 |
| React / React DOM | 19.3.0 |
| TypeScript | 5.9.3 |
| Tailwind CSS / @tailwindcss/postcss | 4.3.3 |
| Prisma CLI / @prisma/client | 5.22.0 |
| @supabase/ssr / @supabase/supabase-js | 0.12.7 / 2.118.0 |
| Zod | 4.6.7 |
| Vitest / Playwright | 3.2.7 / 1.64.1 |
| PGlite | 0.5.11 |
| Current local Node / npm | 22.17.0 / 11.18.0 |
| Hosted PostgreSQL | 17.11 (read-only version check) |

`next-auth` remains an installed legacy dependency; the live auth flow uses Supabase. Do not add Prisma 7/8 adapters, change generator conventions or upgrade dependencies as part of handover. Next has Cache Components/partial prefetching configured; **read relevant `node_modules/next/dist/docs/` guides before editing**, as required by `AGENTS.md`.

## C. Repository map

| Location | Responsibility |
| --- | --- |
| `src/app/api/auth/`, `src/app/auth/` | Auth handlers, confirmation flow and screens |
| `src/lib/auth/`, `src/lib/supabase/`, `src/proxy.ts` | Verified identity/roles, SSR cookies, session refresh and navigation protection |
| `src/lib/prisma.ts` | Server-only Prisma singleton |
| `src/lib/assessment/service.ts` | Period/quota, session ownership, transactions, answers, submission and history |
| `src/lib/assessment/content.ts`, `consent.ts`, `errors.ts`, `http.ts`, `page-data.ts` | Approved-content validation, consent version, safe API errors and page data |
| `src/lib/assessment/scoring/` | Deterministic DASS-21 and WEMWBS rules; no AI scoring |
| `src/lib/validations/assessment.ts` | Strict request/query schemas and revision requirements |
| `src/app/api/assessment/` | Seven participant-only APIs |
| `src/app/participant/`, `src/components/participant/` | Dashboard/introduction/questionnaire/results/history and responsive styling |
| `prisma/schema.prisma`, `prisma/migrations/` | Models, relations, migration history, SQL-only policies/triggers/partial indexes |
| `tests/*.test.ts` | Unit/service/API mocks, actual isolated PGlite SQL, environment and safety checks |
| `tests/browser/`, `tests/visual/`, `tests/fixtures/` | Synthetic Playwright/Vite presentation harness; no production questionnaire text |
| `tests/rehearsal/`, `vitest.rehearsal.config.ts` | Approval-gated real PostgreSQL service/concurrency suite, excluded from normal tests |
| `scripts/*preflight.mjs` | Explicitly invoked read-only Auth, collision and privilege checks against an approved target |
| `scripts/phase2-rehearsal.mjs`, `phase2-safety.mjs` | Guarded synthetic rehearsal; do not rerun the retained environment |
| `scripts/phase2-backup.mjs`, `phase2-backup-layout.mjs` | Inert historical preparation helpers retained for existing safety/layout tests; not an export workflow |
| Shared `docs/PHASE2-*.md`, `docs/CHATBOT-DATABASE-CONTRACT.md` | Migration, activation, implementation and ownership contracts; owner operational records are excluded by the cleanup plan |

## D. Authentication contract

Supabase owns credentials and canonical identity. `getCurrentProfile()` verifies `auth.getUser()`, confirmed email and an active `public.users` record. Roles are `PARTICIPANT`, `PSYCHOLOGIST`, `SUPERADMIN`, resolved from the database; never trust user metadata or a request-supplied role/participant ID. API handlers call `requireApiRole("PARTICIPANT")`; page protection alone is insufficient. Proxy handles cookie refresh/navigation, while backend verification remains authoritative.

`auth.users.id = public.users.id` is enforced by SQL FK and trigger-created profiles. Required signup metadata: `full_name`, `institutional_id`, `phone_number`, `user_type` (`STUDENT`/`LECTURER`). New profiles are always active participants regardless of metadata escalation attempts. Email changes synchronize through the existing trigger. `password_hash` is transitional nullable legacy data, not read or written for authentication. Auth deletion is restricted; no automatic account deletion workflow exists.

Public configuration is Supabase URL + publishable key. Database credentials stay server-side. The website does not need a Supabase service-role API key. See [Auth migration](AUTH-MIGRATION.md); its historical results are not a new hosted signup test.

## E. Database schema and migration ownership

| Table | Meaning and relationships |
| --- | --- |
| `public.users` | Existing canonical participant/profile; FK to `auth.users` |
| `academic_periods` | Dates, active status and completion limit (default 3); at most one ACTIVE |
| `assessment_question_sets` | Versioned instructions/options/approval references; draft then immutable publication |
| `questions` | Set FK; instrument, item number, dimension, approved text; 21+14 active items |
| `assessment_sessions` | Participant + period + pinned set; status/revision/timestamps/processing consent |
| `assessment_answers` | Session + question; one answer per pair; instrument-specific values |
| `assessment_scores` | One immutable score row per completed session; three DASS values/categories + WEMWBS total |
| `reports` | One metadata row per session; PENDING by default, optional future private object key |

The seven new tables have eight FKs, SQL checks and five custom triggers. FK deletes are RESTRICT and updates CASCADE. SQL owns the one-active-period and one-in-progress-session partial indexes, completed-answer/score immutability, complete publication and completion preconditions; Prisma schema alone does not reproduce these protections.

Migrations in order:

1. `20261021144827_init_users` — applied hosted.
2. `20261023000000_supabase_auth` — applied hosted; needs the Supabase Auth baseline.
3. `20261023010000_phase2_assessment` — **pending hosted**, additive, no production seed data. SHA-256: `6befc228490a50bcc3fb411905fa7c5e0790066f2118a6de94a22bfdb77d3823`.

The pending publication correction is committed in `8a76603`. This review changes documentation and Git hygiene only; application source, Prisma schema and migration bytes are unchanged. Do not run either Auth migration blindly against a different shared project. Website owns its ledger and all listed public names; Chatbot needs a separately coordinated schema/history.

## F. Assessment API contract

Base path `/api/assessment`. All handlers return private/no-store responses. Success envelope is `{ "success": true, "data": ... }`; failure is `{ "success": false, "error": { "code": "...", "message": "Bahasa Indonesia feedback" } }`. Dates serialize to ISO strings. Mutations require same-origin requests, `Content-Type: application/json`, trusted participant identity and strict JSON bodies. Body reader limits input to 20,000 JavaScript string characters. Unknown body/query keys are rejected.

| Method / route | Input | `data` on success |
| --- | --- | --- |
| GET `/quota` | No body | `{academicPeriod:{id,name},limit,completed,remaining,inProgressSessionId,inProgress:{answered,total:35,updatedAt} or null,availability:{code,message} or null}` |
| POST `/sessions` | `{processingConsent:true}` | `{assessmentSessionId,status:"IN_PROGRESS",academicPeriodId,startedAt,resumed}`; 201 new, 200 resume |
| GET `/questions` | Optional `instrument=DASS21\|WEMWBS`, optional owned `sessionId` UUID | Array of `{id,instrument,questionNumber,questionText}` from published content; owned session pins the version |
| GET `/sessions/[sessionId]` | UUID path | `{id,academicPeriodId,questionSetId,status,startedAt,completedAt,revision,processingConsentAt,processingConsentVersion,answers:[{questionId,answerValue}],score,report}`; score/report nullable while in progress; report is `{id,status}` |
| PUT `/sessions/[sessionId]/answers` | `{expectedRevision:0,answers:[{questionId:"<uuid>",answerValue:1}]}` | `{saved,revision}`; revision increments once per successful batch |
| POST `/sessions/[sessionId]/submit` | `{expectedRevision:1}` | `{assessmentSessionId,status:"COMPLETED",completedAt,scores:{depression:{score,category},anxiety:{score,category},stress:{score,category},wemwbs:{score}},reportId}` |
| GET `/history` | No body | Array `{assessmentSessionId,completedAt,reportId,scores}` newest first, completed sessions of the actor only |

GET session `score` and history `scores` expose the stored score record: `id`, `assessmentSessionId`, `depressionScore`, `depressionCategory`, `anxietyScore`, `anxietyCategory`, `stressScore`, `stressCategory`, `wemwbsScore`, `calculatedAt`, `createdAt`, `updatedAt`. This differs from submit's nested score representation; consumers must not assume these shapes are identical. There is no separate results API; results use the owned session data. The internal server `getQuestionnaire` also supplies instructions/options; `/questions` returns only the item array.

Save batches contain 1–35 distinct question IDs from the session's pinned set. Values must be integers, DASS 0–3 and WEMWBS 1–5. `expectedRevision` is a nonnegative integer. A successful save acknowledges the submitted batch size (`saved`), not total answered count. The UI confirms acknowledgement and serializes saves.

| Status | Important error codes / meaning |
| --- | --- |
| 401 | `UNAUTHORIZED`: no verified/confirmed identity |
| 403 | `FORBIDDEN`: inactive/missing/incorrect-role profile; `INVALID_ORIGIN` for cross-origin writes |
| 404 | `RESOURCE_NOT_FOUND` for missing or other-owner session; `NO_ACTIVE_ACADEMIC_PERIOD` from quota |
| 409 | `STALE_REVISION`, `ASSESSMENT_ALREADY_COMPLETED`, `ASSESSMENT_QUOTA_EXCEEDED`, `NO_ACTIVE_ACADEMIC_PERIOD` for mutations |
| 413 / 415 | `REQUEST_TOO_LARGE` / `INVALID_CONTENT_TYPE` |
| 422 | `VALIDATION_ERROR`, `INVALID_QUESTION_ID`, `INVALID_ANSWER_VALUE`, `ASSESSMENT_INCOMPLETE`, service-level `PROCESSING_CONSENT_REQUIRED` |
| 503 | `ASSESSMENT_UNAVAILABLE`, `INSTRUMENT_CONTENT_UNAVAILABLE`, `ACADEMIC_PERIOD_CONFLICT`, `RESULT_UNAVAILABLE` |

See `content.ts` and `errors.ts` for exact content-unavailability diagnostics and [existing API contract](API%20CONTRACT.md) for broader project context. Browser clients must reload/review after `STALE_REVISION`; they must not retry blindly with an incremented guessed revision. A completed submission retry returns the same persisted result even with the old revision, but still requires a valid submit body.

## G. Lifecycle and invariants

An active participant consents and starts/resumes one IN_PROGRESS session in the active period. Starting a new session validates the published set and quota, pins its version, and records processing-consent timestamp/version. Each answer batch locks the participant, checks ownership/status/revision/period/content, upserts answers and increments revision atomically. Refresh/resume loads persisted answers/revision, not fixture/local-storage data.

Review permits editing both instruments and shows incomplete items. Submission confirmation is explicit. The service takes the same participant lock, returns an existing completion idempotently, otherwise rechecks revision/active period/quota/all 35 answers and writes score, PENDING report and COMPLETED status in one READ COMMITTED transaction. A failure rolls all writes back. User-row locks serialize start/save/submit for a participant; shared period locks protect the period check. Max transaction wait is 5 seconds, transaction timeout 15 seconds. A real PostgreSQL 17.11 / Prisma 5.22 eight-connection pool passed the isolated rehearsal; the hosted pooler and authenticated journey remain unverified.

DASS mapping: depression 3/5/10/13/16/17/21; anxiety 2/4/7/9/15/19/20; stress 1/6/8/11/12/14/18. Double each seven-item sum. WEMWBS sums 14 values. Four results remain separate; no universal score or AI-derived clinical interpretation. Preserve scoring tests and existing boundaries. Authoritative instrument references and licensing requirements are in [instrument release requirements](PHASE2-INSTRUMENTS.md).

## H. Phase 3 integration points — contracts, not implemented features

- **Scores:** read immutable completed-session scores through an authorized server service. Do not recalculate/rewrite historical scores or infer consent from completion.
- **Reports:** use the existing unique session/report relationship. Phase 2 creates `PENDING`, with no file key/date. A future idempotent worker can produce a private PDF, record its object key/date and mark GENERATED after successful storage, using reviewed authorization/retry rules. No public bucket URL or PDF route exists now.
- **Identity:** use canonical UUID and active trusted profile. Psychologist/SUPERADMIN roles currently cannot call participant assessment APIs; add a separately reviewed recipient-scoped service rather than relaxing these endpoints.
- **Consent:** preserve processing timestamp/version. Add explicit purpose/recipient-scoped sharing consent, revocation and audit models in new migrations; processing consent alone is insufficient.
- **Consultation:** scheduling, psychologist assignment and report-sharing rights are deferred. No appointment records should be invented on the dashboard.
- **Chatbot:** use [the proposed database contract](CHATBOT-DATABASE-CONTRACT.md). Shared login does not authorize shared mental well-being data. No direct assessment grants or integration endpoints are delivered.

## I. Privacy/security

Never log answers, scores, email/phone/institutional identifiers, request bodies, tokens or connection URLs. Never use real participant data in fixtures. Server Prisma access can bypass RLS, so all reads/writes require verified identity and owner predicates. Supabase publishable keys belong in clients; database/service credentials do not.

All seven assessment tables are intended backend-only. Current `_prisma_migrations` grants and privileged role/default-ACL findings are **unresolved**; [security review](PHASE2-SECURITY-REVIEW.md) explains the narrow proposal, including `service_role` exposure. No claim is made that every Chatbot credential lacks access. Consent withdrawal, formal audit persistence, retention/deletion tooling and private PDF access are future policy/design dependencies. Completed-row immutability/FK restrictions mean account deletion must be coordinated, not improvised cascades.

## J. Secure local development and team workflow

1. Clone `riehand_branch` at the agreed commit (`8a76603` is already published). Publish the reviewed hygiene/documentation follow-up after owner approval using the explicit file list in the readiness review, never the entire working tree. Confirm teammates have repository access.
2. Install the tested Node/npm family; run `npm ci`, then `npx prisma generate`. This generates local client artifacts, not database tables.
3. Copy `.env.example` to ignored local configuration and obtain approved development credentials privately. Required names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SITE_URL`, `DATABASE_URL`, `DIRECT_URL`. Never put real secrets in examples or Git.
4. Keep `DATABASE_URL` and `DIRECT_URL` on the same approved project. Next runtime prefers `.env.local`; Prisma CLI reads `.env`/process environment. Avoid contradictory values; set explicit approved shell targets for migration work. Session pooler port 5432 is used where direct IPv6 is unavailable. No service-role API key is needed.
5. Run `npm run dev`, then open the configured `SITE_URL`. Signup callback/redirect settings must match in the approved Supabase project. Without an activated assessment database/content, truthful unavailable states are expected.
6. Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `npm run build`. `npm run test:browser` uses local synthetic Vite fixtures and an installed Chrome channel; it is not a hosted database test. For approved database integration work only, optional read-only checks are `npm run auth:preflight`, `node scripts/assessment-preflight.mjs`, and `node scripts/phase2-privilege-preflight.mjs`. Verify an approved development target first; these commands are not needed to start UI/service development.
7. For database integration work, obtain an approved development destination; [the completed synthetic rehearsal](PHASE2-REHEARSAL.md) documents the tested baseline. Do not rerun or replace the retained rehearsal merely for handover. The two Auth migrations require an Auth baseline; plain empty Postgres is insufficient. Never use production reset/db push/dev migrations. New Phase 3 migrations must be additive, reviewed with the shared team, tested on an approved isolated baseline, and deployed only after separate hosted approval.
8. Before merging, run regression tests, review object names/roles/API shapes, confirm unchanged scoring and require migration checksums/recovery evidence. Never overwrite applied migrations or the shared ledger. No automatic commit/push is part of this handover.

## K. Evidence and acceptance boundaries

Historical acceptance: the original 220 tests plus ten operation-boundary tests passed as the **230-test baseline**; the separate real PostgreSQL suite passed **seven tests** and remains excluded from ordinary `npm test`. TypeScript passed; lint had zero errors and two existing landing-page image warnings. Later backup-layout tests are also retained, so 230 is a dated baseline, not a freshly measured current suite total. See the [rehearsal summary](PHASE2-REHEARSAL.md). This handover review performs static documentation/repository checks only.

Hosted **read-only** checks confirmed both Auth migrations applied, zero identity/profile mismatches or normalized-email duplicates, no Phase 2 objects/history/name collisions, and the privilege findings. They do not establish login/email delivery or authenticated assessment persistence. Those checks made no hosted writes. A subsequently authorized read-only database export was completed and verified off-device; the Phase 2 migration and content activation remain unapplied.

## L. Outstanding work and release gates

**Development:** no missing implementation files were found; the code is already published. Finish the explicit Git hygiene/documentation follow-up and share the branch with teammates. Approved development credentials are needed only for live Auth/database integration; fixture-based development can start now. Joint contract acceptance is needed before changing shared database objects or integrating Chatbot.

**Hosted deployment:** keep recovery validation, privilege remediation, shared-database agreement, approved/licensed instruments and period, separately authorized migration/activation, and authenticated acceptance as deployment tasks. Backups and the synthetic PostgreSQL rehearsal are already complete. Full restore testing is pending, not a new handover prerequisite. See [activation](PHASE2-ACTIVATION.md), [security review](PHASE2-SECURITY-REVIEW.md), and the [readiness checklist](PHASE2-HANDOVER-READINESS.md).

Phase 3/later intentionally includes PDF generation/private delivery, consultations, authorized psychologist access, explicit sharing/revocation/audit, institution/content administration, retention/deletion and optional authorized Chatbot integration. None is implemented by this task. Preserve the existing Phase 2 foundation and its scoring/API behavior while extending it.
