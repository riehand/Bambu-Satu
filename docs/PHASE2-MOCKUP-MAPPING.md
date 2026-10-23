# Phase 2 visual reference map

All 17 JPGs in `docs/mockups/` were opened at original resolution before UI edits. The five primary images are 1440 px wide. Observed system: 234 px sidebar, 84 px header, 36 px content gutters, approximately #f3faf6 background, #e5f5ec emphasis, #193f35 headings, #227c55 actions, #dce8e1 borders, 20–26 px card radii, Inter typography, restrained shadows. Questionnaire: 94 px header, 820 px centered column, 32 px card padding, 54 px minimum answer rows.

| Reference (Desktop · … .jpg) | Implementation | Target |
| --- | --- | --- |
| User overview | `/participant/dashboard`; participant shell, hero, shortcuts, quota, latest scores | Match layout; real identity, designed empty/unavailable states; no fictional appointment |
| Assessment introduction | `/participant/assessment`; instrument cards and consent form | Match three information tiles, two cards, privacy banner and actions; unchecked consent |
| DASS-21 questionnaire · Answer saved | `/participant/assessment/[sessionId]`; questionnaire | Single question, native radio inputs, confirmed save state, combined progress |
| WEMWBS questionnaire · Answer saved | Same route and session | Five approved response options, separate timeframe and local question index |
| Assessment results and history | `/participant/assessment/[sessionId]/results`, `/participant/history` | Four scores, disclaimer, real history, optional actual-data chart; PDF disabled |

Secondary references reviewed: Welcome, Log in, Create account, Consent/privacy/AI, Psychologist directory/profile, Book session, Appointment management, Psychologist overview, Shared report, Admin overview, Admin users, Admin consent/audit. Shared visual conventions retained; these features remain outside Phase 2. Existing authentication and landing pages are not redesigned.

No screenshot is embedded as application UI. Questionnaire wording, response labels, instructions, translation approval, licensing and approval of digital presentation must be supplied before publishing a question set. Synthetic fixtures are confined to tests. Rendered verification results are recorded in PHASE2-REPORT.md after checks.
