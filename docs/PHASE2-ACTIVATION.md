# Phase 2 content and academic period activation

25 October 2026. **Preparation only. No hosted period, instrument or approval records created.** The institution's actual approved materials and licence evidence are absent from the repository. Refer also to [instrument requirements](PHASE2-INSTRUMENTS.md).

## Exact owner/stakeholder inputs

| Input | Required approving owner |
| --- | --- |
| Real academic period name, start/end dates, designated active status, transition date and quota (default 3) | Academic programme/project owner |
| Exact 21 DASS-21 and 14 WEMWBS items in original approved order | Institution's qualified instrument/content reviewer |
| Approved Indonesian translation and provenance, instructions and response labels (DASS 0–3, WEMWBS 1–5) | Instrument reviewer and translation rights holder where applicable |
| DASS source/terms; WEMWBS licence reference and actual scope covering this institution/use | Institution/licence holder |
| Approval for one-question-at-a-time digital display, response order and non-diagnostic feedback | Instrument/licence reviewer and institutional reviewer |
| Named approver, timestamp, version and evidence references | Authorized institutional approver |
| Assessment processing consent text/version, retention/withdrawal process, privacy notice and support wording | Institutional data/privacy owner |
| Test accounts and permission to create hosted synthetic assessment records after activation | Project/data owner |

No synthetic item, screenshot/mockup text or invented translation may substitute for these inputs. WEMWBS requires the licence appropriate to intended use; this project cannot infer eligibility from being a capstone. [Warwick licensing](https://warwick.ac.uk/services/innovations/wemwbs/licenses/) and [scoring guidance](https://warwick.ac.uk/services/innovations/wemwbs/how/) were checked on 25 October 2026. Institutional evidence, not a nonempty database string, establishes authorization.

## Records and safe publication order

After verified backup, successful isolation rehearsal, privilege resolution, Chatbot coordination and **separate hosted migration approval**:

1. Obtain a separately approved administrative content import with exact record diff and evidence references. There is no Phase 2 admin/import UI; do not seed from tests or improvise a production script.
2. In a transaction, insert one `assessment_question_sets` row with a unique `version`, **`is_published=false`**, approved instructions/options, `approved_at`, `approved_by`, `dass_source`, `wemwbs_licence_reference`, `translation_reference`, and `presentation_approval_reference`.
3. Insert exactly 35 `questions` linked to that set: DASS21 numbers 1–21 with existing dimension mapping; WEMWBS numbers 1–14 with WELLBEING dimension; exact approved wording; all active. Review cardinality, wording/order, response values and metadata against the signed materials, preferably with a second reviewer.
4. Validate using the existing `validateQuestionSet` rules and SQL constraints. Publish by **UPDATE** setting `is_published=true`. The corrected trigger rejects published INSERT and premature publication; never disable it. Commit only after validation. New versions need a new draft/set; published content cannot be edited, unpublished or deleted.
5. Prepare an `academic_periods` row with name, `start_date`, `end_date`, `assessment_limit=3` unless another value is approved, and initially `INACTIVE`. Dates must be ordered and quota nonnegative. Activate only with separate period approval and after content is ready. At most one period may be ACTIVE; an approved transition deactivates the previous period before activating the new one in one transaction.
6. Run the authenticated acceptance journey below. If activation must be suspended, an approved period deactivation blocks start/save/submit while preserving data. Do not mutate published instruments or drop records to roll back.

## Existing behavior to preserve

ACTIVE status controls availability; start/end dates do not automatically activate/expire a period. Owners must operate period transitions. Only COMPLETED unified sessions consume the period quota. An in-progress session resumes with its pinned question set and original processing consent, even after a newer version is published. Deactivating its period blocks saves/submission. New sessions select the latest created published set (ID tie-breaker), so review ordering when scheduling versions; no scheduled-publication feature exists.

DASS-21 maps seven items to each of depression, anxiety and stress; each sum is doubled and categorized using the existing scoring module. WEMWBS sums 14 values for 14–70 without diagnostic bands. There is no combined score or diagnosis. Four separate result values and non-diagnostic messaging are required. Scoring rules are locked for this handover; changes require an independently reviewed versioning/migration plan. Authoritative references are preserved in `PHASE2-INSTRUMENTS.md`.

The start checkbox is initially unchecked. `processingConsent: true` records `processing_consent_at` and `processing_consent_version=assessment-processing-id-v1` on the authenticated participant's session. This is not permission for Chatbot, consultation sharing or PDF disclosure. Withdrawal and deletion workflows remain unimplemented pending policy.

## Hosted authenticated acceptance — pending explicit authorization

Using approved test accounts: verify signup/login and original profile identities; consent/start; one session for both instruments; save, refresh and dashboard resume; correct answer counts/progress; review/edit; cancel submission confirmation; confirm and verify all four scores, atomic score/report creation and idempotent retries. Open two tabs and prove stale save/submit returns 409. Complete three sessions and verify quota, owner-only history, cross-user denial, direct browser-role denial, inactive/nonparticipant rejection and period deactivation behavior. Check Bahasa Indonesia, mobile/tablet/desktop layout and non-diagnostic presentation. Never use real participant responses as fixtures or log request bodies.

Record separately: local fixture evidence, isolated PostgreSQL evidence and hosted authenticated evidence. Current local presentation passes cannot establish any of these hosted flows. Pending migration/content means Phase 2 is not operational in production.
