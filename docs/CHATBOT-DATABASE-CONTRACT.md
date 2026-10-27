# WellBeing Hub and Chatbot database contract

Prepared 25 October 2026. **Proposed coordination contract; not signed by both teams.** Current implementation facts below are verified from this repository. No message has been sent, no Chatbot permissions granted, and no sharing endpoint implemented.

## Architecture and identity

Both applications use one Supabase project and its `auth.users.id` UUID. The website verifies the Supabase session on the server using `auth.getUser()`, requires confirmed email, then resolves role and active status from `public.users`. A client-supplied UUID, email, role or user metadata is not authorization. Chatbot must verify its own sessions and use the same canonical UUID; never match identities by mutable email or generate replacement profile IDs.

`public.users` is the WellBeing Hub profile, owned by the website migration owner. Its ID references `auth.users(id)` with deletion restricted. The existing `wellbeing_auth_user_created` trigger creates the profile, and `wellbeing_auth_email_changed` synchronizes verified email changes. Supabase owns Auth internals; neither team independently rewrites them.

**Critical signup dependency:** every new Auth identity currently needs valid `full_name`, `institutional_id`, `phone_number`, and `user_type` (`STUDENT` or `LECTURER`) metadata. Missing/invalid fields or duplicate institutional IDs abort signup. Role is always `PARTICIPANT`, regardless of injected metadata. Chatbot signup must meet this existing contract or route through approved onboarding. Alternative identity-only onboarding needs a jointly reviewed migration before release; do not weaken the trigger ad hoc. Existing users may sign in to both applications without duplicate profiles.

## Object ownership and reserved names

| Owner | Objects / boundary |
| --- | --- |
| Supabase | `auth`, `storage`, platform roles, Auth provider/session machinery |
| WellBeing Hub | `public.users`, `Role`, `UserType`, profile functions/triggers/policy |
| WellBeing Hub Phase 2 | `academic_periods`, `assessment_question_sets`, `questions`, `assessment_sessions`, `assessment_answers`, `assessment_scores`, `reports`; six assessment enums; all associated indexes/constraints and `phase2_*` functions/triggers |
| Website migration owner | `public._prisma_migrations`; only website history belongs here |
| Chatbot (proposed) | A dedicated `chatbot` schema, its own migration ledger, and its own conversation/message/preference tables; names and retention still to be agreed |

The generic public names `questions` and `reports` are reserved for this existing migration. Chatbot must not create/adopt/rename them. Prefer Chatbot identity FKs to `auth.users.id`, subject to a reviewed deletion policy. No Chatbot FK or dependency on private answers/scores is approved. Do not run a second Prisma project against the website's migration ledger. Schema exposure through Supabase Data API needs explicit review and is not implied by creating a schema.

## Credentials, roles and access

Clients receive only a publishable key and their own session token. Never embed database passwords, secret keys, service-role keys, or migration credentials in browser/mobile builds. A publishable key grants no entitlement to assessment tables.

Current website Prisma uses the privileged database role `postgres`; owner checks in server code are essential because it bypasses RLS. This is an outstanding hardening item, not a role to share with Chatbot. Proposed: independent migration and runtime credentials for each application, no inherited cross-application privileged role, explicit table/schema grants and reviewed RLS. See [privilege remediation](PHASE2-SECURITY-REVIEW.md).

Phase 2 revokes assessment access from `PUBLIC`, `anon`, and `authenticated`, with RLS enabled and no browser read policies. **It does not revoke `service_role` default grants.** The current hosted default ACL grants that role broad access to newly created public tables; its BYPASSRLS privilege makes shared backend credentials unsafe. No absence-of-Chatbot-access certification is possible until credential custody and effective privileges are reviewed with both teams.

Chatbot owns policies/grants on its proposed schema. Website owns assessment policies/grants. Schema owners review default privileges and role memberships, not only visible policies. Do not change Supabase-managed roles, broad public defaults, or Auth RLS unilaterally.

## Consent and future integration

`assessment-processing-id-v1` records consent to assessment processing at session creation. It **does not authorize** Chatbot access, psychologist access, training, profiling or external AI processing. Phase 2 exposes participant-owned website endpoints only.

Future sharing requires institutional/data-owner authorization and explicit purpose-, recipient-, data-, and duration-specific consent. Proposed server mediation should disclose only approved derived fields, validate both identity and recipient rights, expire access, check revocation on every request, and record access decisions. It must not expose raw answers or a reusable unrestricted database credential. There is no approved sharing mechanism in this phase.

Proposed audit records contain actor, recipient, purpose, consent/version reference, resource reference, timestamp, decision and revocation event, without questionnaire answers or tokens. Revocation must prevent future reads and address cached copies/derived data under an approved policy. Consent storage, withdrawal UI, audit persistence, private PDF delivery and consultation access are future work, not existing capabilities.

## Retention, deletion and coordination

The institution must set retention periods, legal/ethical holds and deletion/export responsibilities. Chatbot is responsible for conversations and its derived data; website is responsible for assessments/reports and their future files. An Auth deletion currently fails when restricted profiles/dependencies exist; do not cascade-delete accounts or bypass immutability triggers. Both teams need a coordinated deletion procedure and backup retention schedule. Deletion tooling is not delivered in Phase 2.

Before a shared change: publish object names and a reviewed diff, identify owner and dependencies, agree a migration window and rollback/forward-recovery procedure, run collision/history checks, take a recoverable backup, and get explicit deployment approval. One team serializes shared database deployments. Record approvers, migration checksums, date and test evidence. Keep website and Chatbot ledgers and release processes separate.

## Required joint integration checks and sign-off

- Same existing UUID authenticates in both systems; no duplicated identities/profiles.
- Signup metadata requirements, confirmation, email synchronization, inactive users and logout/token expiry are covered using authorized test accounts.
- Chatbot runtime and mobile roles cannot select/mutate website tables, migration history or invoke privileged functions; test inherited roles and service-key custody.
- Browser roles cannot read any of the seven assessment tables; own-profile column policy still works.
- Migration histories/object names do not collide; each application survives the other's additive deployment.
- Account deletion/retention, future consent denial/revocation and audit expectations have named owners.

| Decision | State | Required sign-off |
| --- | --- | --- |
| Shared Supabase identity and existing website profile contract | Existing implementation; joint acceptance pending | Both leads |
| `chatbot` schema / separate ledger / runtime roles | Proposed | Both leads + database owner |
| No assessment sharing in Phase 2 | Required scope of this handover | Both leads acknowledge |
| Runtime privilege hardening and service-role custody | Open release blocker | Database/security owner + both leads |
| Retention/deletion and future sharing consent | Proposed requirements, policy absent | Institution/data owner |

## Coordination message (draft only; do not send automatically)

> Chatbot team: WellBeing Hub Phase 2 is implemented locally; its hosted migration and instrument activation are still pending. Please review this contract before either team changes the shared database. We share Supabase Auth UUIDs; the existing signup trigger requires institutional profile metadata. Website `public.users`, seven assessment tables (including `questions` and `reports`), and `public._prisma_migrations` are reserved. We propose a separate `chatbot` schema, migration ledger and runtime role. Assessment processing consent grants no Chatbot data access, and service-role/database credentials must not be shared with clients. Please confirm your proposed objects, signup flow, credential roles, migration ownership and retention/deletion requirements. We also need joint review of excessive migration-ledger grants and privileged backend access before hosted Phase 2 deployment.
