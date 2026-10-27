# WellBeing Hub / Bambu-Satu

Participant well-being assessments using Next.js 16, React 19, Prisma 5.22 and Supabase Auth/PostgreSQL. Phase 2 implements unified DASS-21/WEMWBS sessions, autosave/review, deterministic scoring and participant history.

**Phase 2 is not yet operational in production.** The approved local PostgreSQL rehearsal passed seven integration tests and the existing 230-test suite passes. Hosted assessment migration, recoverable backup, privilege remediation and institution-approved instrument/period activation remain gated. See the [local rehearsal and backup preparation report](docs/PHASE2-LOCAL-REHEARSAL-REPORT.md). Do not run hosted migrations or seed synthetic questionnaires.

Start with [Phase 2 handover](docs/PHASE2-HANDOVER.md), [current finalization evidence](docs/PHASE2-FINALIZATION.md), [Chatbot database contract](docs/CHATBOT-DATABASE-CONTRACT.md), and [activation requirements](docs/PHASE2-ACTIVATION.md). The owner selected [encrypted archives in private Google Drive](docs/PHASE2-GOOGLE-DRIVE-BACKUP.md); BitLocker activation is cancelled and VeraCrypt is retired with approved cleanup completed. Recovery and isolated testing procedures are in [backup/recovery](docs/PHASE2-BACKUP-RECOVERY.md) and [PostgreSQL rehearsal](docs/PHASE2-REHEARSAL.md). Existing source and migration changes must be reviewed/committed by the owner before teammates can clone this handover; this task does not commit or push.

Install with `npm ci`, generate the local client with `npx prisma generate`, and configure the variable names in `.env.example` using approved development credentials in ignored environment files. Never commit secrets. See the handover for environment precedence, Auth setup and safe migration workflow. Validate with `npm test`, `npx tsc --noEmit`, `npm run lint`, `npx prisma validate`, `npm run build`, and `npm run test:browser` (synthetic local fixtures).

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. Read `AGENTS.md` and the installed Next.js guides first. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to optimize and load Inter.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The links below are framework references. Deployment of this shared-database project requires the explicit approvals and readiness gates in the handover.

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
