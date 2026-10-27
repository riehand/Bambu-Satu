# Phase 2 shared database security review

25 October 2026. Read-only review executed; **no hosted privileges changed**. `scripts/phase2-privilege-preflight.mjs` runs catalog queries inside a READ ONLY transaction and emits no row data, passwords or connection strings.

## Observed findings

- Hosted PostgreSQL reports `170011` (17.11).
- `anon` and `authenticated` both have effective SELECT and at least one mutation privilege on `public._prisma_migrations`, including effective column access. This is a high-risk grant finding. Catalog privileges do not alone prove an exploitable public HTTP route, but they are inappropriate for the migration ledger and must be removed and verified.
- Runtime `postgres` has BYPASSRLS, CREATEDB and CREATEROLE, with memberships including `pg_read_all_data`, `service_role` and `supabase_privileged_role`. It is too powerful as a long-term application runtime credential.
- `service_role` bypasses RLS. `postgres` defaults in `public` grant `anon`, `authenticated` and `service_role` broad table privileges and function execution.
- Pending Phase 2 SQL revokes browser-role table privileges/function execution but does not revoke `service_role`. Consequently, under the observed default ACL, a service-role credential would retain access when those objects are created. No Phase 2 tables exist yet.
- Neither team credential distribution nor all custom role memberships were audited. Do not claim Chatbot currently lacks privileged credentials.

## Narrow remediation proposal — not applied

First capture owner, explicit table and column ACLs, policies and role inheritance for the ledger in a protected administrator review. Agree the website deployer that must retain access. After backup/rehearsal and separate privilege approval, the following is a **review template**, not an auto-run script:

```sql
BEGIN;
REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM PUBLIC, anon, authenticated;
-- Table REVOKE does not remove separately granted column privileges.
REVOKE ALL (id, checksum, finished_at, migration_name, logs,
            rolled_back_at, started_at, applied_steps_count)
ON public._prisma_migrations FROM PUBLIC, anon, authenticated;
-- Commit only after the owner/deployer retains necessary access and effective
-- table/column checks are false for browser roles. Otherwise ROLLBACK.
COMMIT;
```

Verify actual ledger columns before use. If effective access persists through other memberships or grants, stop and review the precise inheritance path; do not broadly alter Supabase roles. Separately decide whether `service_role` needs any ledger access (normally no); revoke only after both backends' dependencies are checked. Preserve an exact protected ACL snapshot for a narrowly scoped reversal, never restore blanket `GRANT ALL`.

For the seven pending assessment tables and five `phase2_*` functions, prepare a separately reviewed migration/security change explicitly revoking `service_role` and any unapproved custom-role access. Recheck owner default privileges and column grants; test effective access after creation. Do not silently edit the already reviewed Phase 2 file or its checksum. If the database owner chooses to amend the pending migration instead, that requires a new review/checksum/rehearsal before approval.

Avoid changing all `public`/Supabase default privileges in this task: that could break Chatbot or platform features. Longer term, use per-application schema ownership and separate deployment/runtime roles. A future website runtime role needs reviewed SELECT access to profiles/content/periods and appropriate answer/session/score/report writes. It must also support the participant `FOR UPDATE` and period `FOR SHARE` locks. Simply removing BYPASSRLS while leaving no assessment policies will break the current service. Prototype explicit runtime RLS policies/grants (including immutable-table restrictions and required row-lock privileges) in isolation first. No such role migration is implemented here.

## Acceptance before closing the blocker

1. Browser roles have no effective table or column ledger privileges; authenticated profile reads still work.
2. Website deployer can run migration status/deploy in the approved environment; runtime cannot modify the ledger.
3. Website runtime passes start/save/submit and all ownership tests under its intended privileges.
4. Chatbot runtime/service credentials cannot read or write assessments or execute private functions; both teams confirm credential boundaries.
5. Check table owners, membership inheritance, default ACLs, grants and RLS together. RLS alone cannot constrain an owner/BYPASSRLS role.
6. Record exact approved SQL, before/after metadata, migration checksum and local/hosted evidence. No privilege issue is marked resolved merely because a proposal exists.
