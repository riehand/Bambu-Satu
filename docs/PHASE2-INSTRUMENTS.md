# Instrument release requirements

Reviewed 23 October 2026. No approved Indonesian item bank, response labels, instructions, institutional instrument approval, or WEMWBS licence was found in the repository. The screenshots are visual references only. No clinical wording or fictional participant data has been seeded.

## Verified scoring references

- [UNSW DASS FAQ](https://www2.psy.unsw.edu.au/DASS/DASSFAQ.htm): seven items per DASS-21 dimension, summed and doubled for comparison with full DASS norms. [Official scoring template](https://www2.psy.unsw.edu.au/dass/Download%20files/Dass_template.pdf).
- [University of Bristol DASS-21 scoring reference](https://www.bristol.ac.uk/media-library/sites/sps/documents/c-change/dass-twenty-one-scoring-and-interpretation.pdf): doubled-score category boundaries match the recovered scoring module. Depression: 9/13/20/27; anxiety: 7/9/14/19; stress: 14/18/25/33 (upper bounds, followed by extremely severe). Labels describe responses, not diagnoses.
- [WEMWBS development/validation paper hosted by Warwick](https://wrap.warwick.ac.uk/id/eprint/623/1/WRAP_Stewart_Brown_Internal_Construct.pdf): 14 positively phrased items, five response categories, total 14–70. The implementation sums these items without diagnostic bands or a combined DASS/WEMWBS score.
- [UNSW download terms](https://www2.psy.unsw.edu.au/dass/down.htm): copying is permitted, modification is restricted. This does not select or approve a particular Indonesian translation for the institution.
- [Warwick licensing](https://warwick.ac.uk/services/innovations/wemwbs/) and [published non-commercial licence](https://warwick.ac.uk/services/innovations/wemwbs/licenses/wemwbs_non_commercial_licence_17.4.24.pdf): obtain the appropriate licence and approved resources. The published terms also address digital presentation, unchanged wording/order/scoring, and institutional review of a digital implementation. Confirm the terms of the institution's actual licence before releasing the single-question presentation.

## Required release material

An authorized instrument owner must provide the exact approved Indonesian 21+14 items in their original order, instrument-specific instructions, response labels for 0–3 and 1–5, translation provenance, DASS source, WEMWBS licence reference, approval of this digital presentation and feedback, approver and approval timestamp. References must identify real institutional evidence; the presence of a string is not proof of a licence.

Create an unpublished `assessment_question_sets` record and its 35 questions through a separately approved administrative import. This task does not supply a production seed command. Populate approval evidence, review all content, then publish. The service validates the complete set, mappings, numbering, options and evidence before use. Published sets and their questions are immutable; revisions require a new set. New sessions select the most recently created published set; existing sessions remain pinned to their original set.

The application currently has no content withdrawal/admin UI. If a published version must be withdrawn, disable new assessment availability through the academic period and arrange a reviewed recovery migration. Do not disable triggers or mutate historical questions ad hoc.

Synthetic strings in `tests/fixtures/assessment.ts` and the browser harness are exclusively test data. They are not approved questionnaire substitutes and are not reachable through production routes.

## Processing consent

`assessment-processing-id-v1` refers to the exact text in `src/lib/assessment/consent.ts`. Creating a session requires `processingConsent: true`; the server records the timestamp, text version and authenticated participant through the session relationship. The checkbox starts unchecked. Resuming preserves the original consent record. This permission does not authorize sharing with psychologists or Nani. Withdrawal/retention policies and broader consent management remain a future phase requiring institutional policy review.
