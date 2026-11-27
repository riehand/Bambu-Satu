# WellBeing Hub / Bambu-Satu

Participant well-being assessments using Next.js 16, React 19, Prisma 5.22 and Supabase Auth/PostgreSQL. Phase 2 implements unified DASS-21/WEMWBS sessions, consent, autosave/resume, review, revision-aware submission, deterministic scoring and participant history. The companion application's name is **Chatbot**.

**One application source:** Phase 4 Sprint 1–3 code is in the primary `riehand_branch` workspace. The isolated acceptance runtime is an environment, not another application branch. See the [environment consolidation and hosted compatibility assessment](docs/DEVELOPMENT-ENVIRONMENT-CONSOLIDATION.md). The [Phase 2 handover](docs/PHASE2-HANDOVER.md) and [B1 contract](docs/PHASE3-B1-STATUS.md) remain historical references.

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

`npm run dev` serves **http://localhost:3000** and uses the configured Supabase Auth project. Profile lookup uses the authenticated Supabase session and existing own-profile RLS. It does not activate synthetic accounts or the local signer. The configured hosted project currently lacks the Phase 2–4 clinical tables, restricted roles/gateways, report bucket, and approved hosted signer/worker integration. These features are **BLOCKED**, and the application refuses the previous owner-credential Prisma fallback. A working login page is not hosted assessment/booking acceptance.

For dedicated synthetic acceptance, keep using `python scripts/local-manual.py start` at **http://127.0.0.1:55430**; see the [isolated manual-testing guide](docs/LOCAL-MANUAL-TESTING.md). Both workflows use the same frontend/API/services. Compiler outputs `.next` and `.next-isolated` are separate so the two development servers can coexist. Hosted accounts and local GoTrue accounts are independent.

Synthetic unit/database and browser fixtures support development without production access. Full signup/authenticated integration needs a Supabase-compatible development Auth baseline and approved development configuration; a plain empty PostgreSQL database does not supply GoTrue. Missing assessment tables/content/periods produce truthful unavailable states. Synthetic questionnaires are for isolated development/tests only.

Private PDF generation/download passed against the isolated stack using a separate restricted worker, artifact attestation, and private `assessment-reports` bucket. Do not put worker Storage/signing credentials into the interactive website environment. The hosted bucket and trusted worker/signer require the approval plan in the consolidation document; they are not provisioned by `npm run dev` or by setting a service key.

For relevant future changes, use `npm test`, `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `npm run build`, and `npm run test:browser` (synthetic fixtures; installed Chrome required). These are teammate/regression instructions, not a request to repeat completed checks now.

## Database and Git boundaries

Preserve all eight historical migration files and their checksums. Follow the migration guide on an explicitly approved development target; do not use `db push`, reset the shared database or rewrite applied migrations. Hosted migrations, permission changes and activation require separate authorization. Joint agreement is needed before changing shared objects or integrating Chatbot, not before starting independent Phase 3 UI/service work.

Never commit `.env`, credentials, archives or owner-only operational evidence. Existing tracked operational files require the index-only cleanup described in the readiness review; `.gitignore` alone cannot remove them. Do not use blanket `git add .` for handover. No commit, push, restore, backup or hosted operation is performed by this review.

## Hosted development (setup bersama satu kali)

Gunakan satu aplikasi dan project Supabase yang disetujui. Developer: clone/pull,
`npm ci`, isi `.env.local` secara privat dari `.env.example`, lalu `npm run dev`
dan buka `http://localhost:3000`. Docker/GoTrue/launcher lokal bukan prasyarat.
Jangan menyalin `.env` milik orang lain ke repository atau memakai role postgres.

**Status integrasi:** registrasi memakai Supabase Auth + trigger constraint existing;
fitur klinis masih menunggu [persetujuan paket database hosted](deployment/hosted/APPROVAL.md)
dan endpoint signer/PDF hosted. Env hosted baru diaktifkan setelah setup selesai;
placeholder bukan konfigurasi siap pakai. Chat/lifecycle hosted tetap nonaktif,
termasuk pada Next development. Lingkungan sintetis lama hanya opsi pengujian.
Vercel memakai source/runtime yang sama dengan SITE_URL sesuai origin preview;
tidak ada migration/seed otomatis saat build.
