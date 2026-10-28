# WellBeing Hub / Bambu-Satu

Participant well-being assessments using Next.js 16, React 19, Prisma 5.22 and Supabase Auth/PostgreSQL. Phase 2 implements unified DASS-21/WEMWBS sessions, consent, autosave/resume, review, revision-aware submission, deterministic scoring and participant history. The companion application's name is **Chatbot**.

**Phase 2 handover:** the delivered assessment foundation and its historical evidence are documented in the [handover](docs/PHASE2-HANDOVER.md). Phase 3 workstream B1 (psychologist profiles and participant directory) is implemented locally on the current `Phase3` branch and has not been committed, pushed or deployed. See the [B1 status and API contract](docs/PHASE3-B1-STATUS.md) for the current scope and verification evidence.

**Hosted deployment: not activated.** The Phase 2 migration is unapplied. Privilege review, shared-database coordination, approved content/period activation and hosted acceptance remain separate deployment work. Encrypted project and database backups are verified off-device on private Google Drive; full restoration remains untested. Restoration and new backup/security work are not prerequisites for starting Phase 3 development.

## Start here

- [Team handover](docs/PHASE2-HANDOVER.md): architecture, implemented APIs, invariants and development workflow.
- [Phase 3 B1 status](docs/PHASE3-B1-STATUS.md): current psychologist profile/directory implementation, API shapes and remaining scope.
- [Phase 3 progress](docs/PROGRESS-FASE3.md): current worktree state, confirmed decisions, validation evidence and staged roadmap.
- [Chatbot database contract](docs/CHATBOT-DATABASE-CONTRACT.md): shared identity, reserved objects, migration ownership and consent boundaries.
- [Auth migration](docs/AUTH-MIGRATION.md) and [Phase 2 migration](docs/PHASE2-MIGRATION.md): ordered database setup and approval boundaries.
- [Activation](docs/PHASE2-ACTIVATION.md) and [security review](docs/PHASE2-SECURITY-REVIEW.md): hosted-release tasks, not general development prerequisites.
- [Synthetic PostgreSQL rehearsal](docs/PHASE2-REHEARSAL.md): retained test design and historical results; no rerun required for handover.

## Local development

Use the versions in `package-lock.json` (`npm ci`; Prisma stays at 5.22). Read `AGENTS.md` and the relevant installed `node_modules/next/dist/docs/` guides before changing Next.js code.

```powershell
npm ci
npx prisma generate
# Configure ignored local environment files privately before starting the app.
npm run dev
```

Use `.env.example` for variable names and placeholders only. Obtain credentials for an approved development Supabase project privately; never copy production credentials into a teammate's development setup. Next runtime prefers `.env.local`, while Prisma CLI reads `.env`/process environment. Check the intended development target before any database command. Client generation does not apply migrations.

Synthetic unit/database and browser fixtures support development without production access. Full signup/authenticated integration needs a Supabase-compatible development Auth baseline and approved development configuration; a plain empty PostgreSQL database does not supply GoTrue. Missing assessment tables/content/periods produce truthful unavailable states. Synthetic questionnaires are for isolated development/tests only.

For relevant future changes, use `npm test`, `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `npm run build`, and `npm run test:browser` (synthetic fixtures; installed Chrome required). These are teammate/regression instructions, not a request to repeat completed checks now.

## Database and Git boundaries

Preserve all three migration files and their checksums. Follow the migration guide on an explicitly approved development target; do not use `db push`, reset the shared database or rewrite applied migrations. Hosted migrations, permission changes and activation require separate authorization. Joint agreement is needed before changing shared objects or integrating Chatbot, not before starting independent Phase 3 UI/service work.

Never commit `.env`, credentials, archives or owner-only operational evidence. Existing tracked operational files require the index-only cleanup described in the readiness review; `.gitignore` alone cannot remove them. Do not use blanket `git add .` for handover. No commit, push, restore, backup or hosted operation is performed by this review.
