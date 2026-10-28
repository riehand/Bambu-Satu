# Phase 3 Workstream B1 — Psychologist Profile and Directory

**Status:** implemented in the local `Phase3` worktree; not committed, pushed, or deployed. Implementation completed 28 October 2026; workstream sequencing was synchronized 29 October 2026.

## Scope delivered

- Psychologists can view and update their own professional profile from `/psychologist/dashboard`.
- Participants can view the directory at `/participant/psychologists` and an individual professional profile at `/participant/psychologists/{psychologistId}`.
- Only active `PSYCHOLOGIST` accounts appear. Incomplete profiles remain visible by name and can be completed by their owner.
- Participant responses contain only the canonical user UUID, full name and professional profile fields. Email, phone, institutional ID, role and account state are not selected for presentation.
- Profile writes derive ownership from the verified Supabase session, accept only an allowlist of fields, and require a same-origin JSON request.
- Participant directory/detail reads require the `PARTICIPANT` role. API responses are private and `no-store`.
- Added `PsychologistProfile`, a one-to-one child of the existing canonical `public.users` profile. The migration is additive, enables RLS and revokes direct `PUBLIC`, `anon` and `authenticated` table privileges.

## Current API contract

| Method and route | Role | Behavior |
| --- | --- | --- |
| `GET /api/psychologist/profile` | `PSYCHOLOGIST` | Returns the caller's professional profile or `null` if not created. |
| `PATCH /api/psychologist/profile` | `PSYCHOLOGIST` | Creates or partially updates only the caller's profile. Body fields: `professionalTitle`, `qualification`, `education`, `shortBio`, `areasOfFocus`, `consultationMethod`, `consultationLocation`, `languages`. Unknown keys are rejected. |
| `GET /api/psychologists?page=1&limit=20&focus=...&language=...` | `PARTICIPANT` | Returns active psychologist accounts with public professional fields and pagination metadata. `limit` is capped at 50. Focus/language filters match exact stored array items. |
| `GET /api/psychologists/{psychologistId}` | `PARTICIPANT` | Returns public professional information for an active psychologist; inactive, non-psychologist and missing IDs return the same `404`. |

Successful responses use `{ "success": true, "data": ... }`; directory responses also contain `meta`. Errors use a safe `{ "success": false, "error": { "code", "message" } }` envelope. Mutations reject cross-origin requests, non-JSON content and bodies over 12,000 characters. No sensitive request or database details are logged or returned.

## Data and release boundary

The new migration is `prisma/migrations/20261028000000_psychologist_profiles/migration.sql`. It references `public.users(id)` and does not touch Supabase Auth tables, existing assessment tables, or prior migration files. It has only been exercised against an isolated synthetic PostgreSQL instance; **it has not been applied to hosted or shared Supabase**. Deployment still needs explicit database-owner approval and the shared-database review described in the Chatbot contract.

Profile attributes include professional title, qualification, education, short bio, areas of focus, consultation method/location and languages. Profile photos/uploads are excluded from this slice.

## Explicitly not delivered

- Availability, schedule management, directory booking CTA, appointments, assignment, rescheduling or cancellation.
- Report access, assessment scores, sharing consent, consent revocation, sensitive-access auditing or PDF generation.
- Human consultation chat, Chatbot consent/integration, admin controls, psychologist provisioning/review or profile approval.

This directory is informational and does not assert that any psychologist is available or bookable. Showing a public professional profile does not authorize access to assessment data.

## Verification record

Checks run locally for this workstream:

- `npm.cmd test` — 255 tests passed across 15 files, including API/service authorization checks and the additive migration on an ephemeral synthetic PGlite database.
- `npm.cmd exec -- tsc --noEmit` — passed after tightening the directory service input type and annotating the mixed-argument existing backup-layout test table; the latter is a type-only correction with no behavior change.
- `npm.cmd run lint` — passed with zero errors and two existing `<img>` warnings in `src/app/page.tsx`.
- `prisma validate` — passed against the updated schema.
- `npm.cmd run build` — passed with Next.js 16.4.2 and listed all new pages and endpoints.
- `npm.cmd run test:browser` — 52 of 53 reported scenarios passed before the existing synthetic visual fixture failed to find `.wb-app` at 768 px; the single scenario passed when rerun in isolation. The Playwright/Vite runner then remained alive after the last test and was interrupted, so this suite did not exit cleanly. It exercises existing assessment mockups, not the new authenticated B1 pages.

All test data is synthetic. No hosted Supabase behavior, deployment, or migration application was attempted.

## Next workstream

The next workstream is psychologist availability management, using the fixed two-hour sessions and Jakarta time (`+07:00`) specified in the project documents. After availability, appointment booking will capture explicit report-sharing consent in the booking action and atomically create the confirmed appointment, consent record, booked slot and consultation-session record. Consent is limited to that appointment, expires when the session ends, blocks future access immediately when revoked, and may be granted again explicitly while the appointment/session remains active. The agreed no-show rule is a 15-minute threshold with rescheduling offered as recovery, never as an automatic follow-up appointment. General cancellation behavior remains outside this slice until its policy is approved.
