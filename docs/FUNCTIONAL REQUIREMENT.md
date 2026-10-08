# Functional Requirements — Coding Agent Specification
## Mental Well-Being Assessment Platform

**Document Type:** Coding-Agent Functional Specification  
**Audience:** Codex, Claude Code / Opus, Gemini, software-development agents  
**Status:** Active implementation requirements

---

# 0. Agent Rules

The coding agent MUST:

1. Treat every `MUST` / `MUST NOT` statement as mandatory.
2. Preserve all business-rule invariants.
3. Enforce security-sensitive requirements server-side.
4. Not invent behavior for unresolved requirements.
5. Keep business logic centralized and testable.
6. Prefer explicit domain states over implicit UI assumptions.

---

# 1. Account Requirements

## FR-ACC-001 — Registration

MUST accept:

```text
full_name
user_type
institutional_id
phone_number
email
password
```

MUST validate required fields server-side.

MUST NOT store password in plaintext.

Acceptance:

- valid student registration succeeds;
- valid lecturer registration succeeds;
- missing required field fails.

---

## FR-ACC-002 — User Type

MUST support:

```text
STUDENT
LECTURER
```

UI MAY display NIM/NIP labels dynamically.

---

## FR-ACC-003 — Uniqueness

Backend/database MUST enforce unique:

```text
email
institutional_id
```

Acceptance:

- duplicate email rejected;
- duplicate NIM/NIP rejected.

---

## FR-ACC-004 — Authentication

MUST provide authenticated session/token mechanism.

MUST support login and logout.

MUST NOT trust client-declared role.

---

# 2. Academic Period / Quota

## FR-AP-001

MUST model academic period as persistent domain data.

---

## FR-AP-002

MUST resolve active academic period before new assessment creation.

---

## FR-AP-003

MUST use centralized configurable `assessment_limit`.

Current default:

```text
3
```

---

## FR-AP-004

New assessment creation MUST fail when:

```text
completed_assessment_count >= assessment_limit
```

for active academic period.

---

## FR-AP-005

`IN_PROGRESS` assessment MUST NOT count toward quota.

---

# 3. Assessment Session

## FR-ASMT-001

DASS-21 and WEMWBS MUST share one assessment session identity.

---

## FR-ASMT-002

Final completion MUST require all mandatory items.

---

## FR-ASMT-003

Final submission MUST be protected against duplicate completion/retry.

---

## FR-ASMT-004

Backend MUST reject assessment completion if required answers are missing.

---

# 4. Scoring

## FR-SCORE-001

Scoring MUST be deterministic.

---

## FR-SCORE-002

MUST output separate:

```text
depression_score
depression_category
anxiety_score
anxiety_category
stress_score
stress_category
wemwbs_score
```

---

## FR-SCORE-003

MUST NOT generate a combined universal mental-health score.

---

## FR-SCORE-004

MUST NOT call AI/LLM in official scoring path.

---

## FR-SCORE-005

Scoring functions MUST have automated known-input/expected-output tests.

---

# 5. Report

## FR-REP-001

Completed assessment MUST produce one primary report.

---

## FR-REP-002

Report MUST be owner-private by default.

---

## FR-REP-003

Owner participant MUST be able to view/download report.

---

## FR-REP-004

Report MUST include non-diagnosis disclaimer.

---

## FR-REP-005

Resource endpoint MUST verify ownership/authorized sharing.

---

# 6. Assessment History

## FR-HIST-001

Authenticated participant MUST only retrieve their own history.

---

## FR-HIST-002

Trend visualization MAY exist.

MUST NOT output automatic clinical diagnosis/clinical trend conclusion.

---

# 7. Post-Assessment Paths

After completed report, UI/domain MUST support:

```text
KEEP_PRIVATE
CHAT_WITH_CHATBOT
CONSULT_PSYCHOLOGIST
```

No path may be mandatory before another.

---

# 8. External Chatbot

## FR-CHAT-001

Chatbot handoff MUST require explicit participant action.

---

## FR-CHAT-002

Default chatbot context MUST use current processed report only.

---

## FR-CHAT-003

MUST NOT authorize report access using guessable `assessment_id` alone.

---

## FR-CHAT-004

MUST use scoped secure handoff/token or equivalent approved mechanism.

---

## FR-CHAT-005

MUST NOT expose sensitive report content in public URL/query string.

---

## FR-CHAT-006

External chatbot MUST NOT receive unrestricted database credentials/access.

---

# 9. Psychologist Directory

## FR-PSY-001

Authenticated participant MUST be able to query active/bookable psychologists.

---

## FR-PSY-002

Profile response SHOULD expose approved professional fields.

MUST NOT expose sensitive administrative/internal fields.

---

## FR-PSY-003

Participant MUST choose psychologist explicitly.

MUST NOT auto-assign.

---

# 10. Availability

## FR-SLOT-001

Psychologist MUST be able to create/manage own availability.

---

## FR-SLOT-002

Only `AVAILABLE` slots MAY be booked.

---

## FR-SLOT-003

Booking transaction MUST prevent double booking under concurrency.

---

## FR-SLOT-004

Successful booking MUST atomically transition:

```text
slot: AVAILABLE → BOOKED
appointment: create CONFIRMED
```

---

# 11. Booking

## FR-BOOK-001

Booking MUST require:

```text
completed current assessment
report
selected psychologist
AVAILABLE slot
report consent
```

Contact consent MUST be required if contact detail will be exposed/used.

---

## FR-BOOK-002

Optional participant note MUST support max 500 characters.

Server MUST enforce length.

---

## FR-BOOK-003

Valid booking MUST directly create `CONFIRMED`.

MUST NOT require psychologist manual approval.

---

## FR-BOOK-004

Appointment MUST reference:

```text
participant_id
psychologist_id
assessment_session_id
report_id
schedule_slot_id
```

---

# 12. Appointment Views

## FR-APT-001

Participant endpoint MUST return only participant-owned appointments.

---

## FR-APT-002

Psychologist endpoint MUST return only appointments assigned to that psychologist.

---

## FR-APT-003

Psychologist appointment detail MAY include:

```text
participant full name
user type
current shared report
assessment date
participant note
schedule
phone number if consented
session status
```

MUST NOT include full history by default.

---

# 13. Check-In

## FR-CHK-001

MUST support psychologist check-in.

---

## FR-CHK-002

SHOULD support participant check-in.

---

## FR-CHK-003

Check-in MUST only be allowed within configured window.

---

## FR-CHK-004

Check-in timestamp MUST be server-generated.

---

## FR-CHK-005

Caller MUST belong to appointment.

---

# 14. Reminder

## FR-REM-001

System MUST support scheduled psychologist reminders.

---

## FR-REM-002

System SHOULD support participant reminders.

---

## FR-REM-003

Reminder times MUST be centralized/configurable.

Baseline:

```text
24h
1h
10m
```

---

# 15. Consultation Session

## FR-SESSION-001

Confirmed appointment MUST have or initialize a consultation session.

---

## FR-SESSION-002

Session SHOULD support:

```text
SCHEDULED
READY
IN_PROGRESS
PSYCHOLOGIST_LATE
PARTICIPANT_LATE
NO_SHOW
CLOSED
```

---

## FR-SESSION-003

MUST persist:

```text
scheduled_start_at
scheduled_end_at
participant_checked_in_at
psychologist_checked_in_at
session_started_at
session_ended_at
```

as applicable.

---

# 16. Timed Human Chat

## FR-MSG-001

Consultation messages MUST belong to one consultation session.

---

## FR-MSG-002

Only appointment participant and appointment psychologist MAY read/write.

---

## FR-MSG-003

Backend MUST calculate whether current time is inside authorized writable window.

---

## FR-MSG-004

Before window:

```text
write = DENY
```

---

## FR-MSG-005

Inside window:

```text
write = ALLOW
```

only if authorization and session state are valid.

---

## FR-MSG-006

After window:

```text
write = DENY
read = ALLOW
```

for authorized parties, subject to retention policy.

---

## FR-MSG-007

MUST keep external AI chat and psychologist human chat as separate domains.

---

# 17. Late Detection

## FR-LATE-001

With configured threshold `psychologist_late_after_minutes`, if psychologist has not checked in after threshold:

MUST mark/derive `PSYCHOLOGIST_LATE`.

---

## FR-LATE-002

Late event MUST trigger psychologist reminder.

---

## FR-LATE-003

Participant-facing state MUST indicate psychologist has not arrived.

---

# 18. No-Show

## FR-NOSHOW-001

With configured `psychologist_no_show_after_minutes`, psychologist absence MUST become no-show eligible/state.

---

## FR-NOSHOW-002

Psychologist no-show MUST expose reschedule action to participant.

---

## FR-NOSHOW-003

No-show event SHOULD be audited.

---

# 19. Completion / Reschedule

## FR-END-001

Session end MUST disable message writes.

---

## FR-END-002

Appointment MAY become `COMPLETED` according to approved completion flow.

Agent MUST NOT invent clinical-signoff requirements.

---

## FR-END-003

Reschedule MUST preserve original appointment/session traceability.

---

# 20. Consent

## FR-CNT-001

MUST distinguish:

```text
CHATBOT_REPORT_ACCESS
PSYCHOLOGIST_REPORT_ACCESS
PSYCHOLOGIST_CONTACT_ACCESS
```

---

## FR-CNT-002

Consent controls MUST NOT be prechecked.

---

## FR-CNT-003

Consent record SHOULD persist actor, type, target, report/assessment, and timestamp.

---

# 21. Superadmin

## FR-ADM-001

MUST support academic-period management.

---

## FR-ADM-002

MUST support assessment-limit management.

---

## FR-ADM-003

MUST support psychologist account/status administration.

---

## FR-ADM-004

MUST NOT grant default individual report-content access merely from admin role.

---

# 22. Audit

SHOULD audit:

```text
registration
assessment completion
report generation
consent
chatbot handoff
appointment create/cancel/reschedule/complete
participant check-in
psychologist check-in
late
no-show
session open/close
administrative configuration change
```

MUST NOT copy full sensitive message/report contents into generic logs.

---

# 23. Domain Errors

Implementation SHOULD expose clear errors equivalent to:

```text
DUPLICATE_EMAIL
DUPLICATE_INSTITUTIONAL_ID
NO_ACTIVE_ACADEMIC_PERIOD
ASSESSMENT_QUOTA_EXCEEDED
ASSESSMENT_INCOMPLETE
REPORT_ACCESS_DENIED
CHATBOT_HANDOFF_UNAUTHORIZED
SLOT_NOT_AVAILABLE
SLOT_ALREADY_BOOKED
REPORT_CONSENT_REQUIRED
CONTACT_CONSENT_REQUIRED
CHECK_IN_NOT_OPEN
CONSULTATION_NOT_STARTED
CONSULTATION_CLOSED
CONSULTATION_ACCESS_DENIED
PSYCHOLOGIST_NO_SHOW
```

---

# 24. Minimum Acceptance Test Matrix

## Account
- unique registration works;
- duplicate email fails;
- duplicate NIM/NIP fails.

## Quota
- 0/3 allowed;
- 1/3 allowed;
- 2/3 allowed;
- 3/3 blocked;
- incomplete session does not consume quota.

## Scoring
- deterministic known cases pass;
- no AI dependency exists.

## Report
- owner allowed;
- unrelated participant denied;
- unrelated psychologist denied;
- consented selected psychologist allowed only for bound report.

## Chatbot
- explicit authorization required;
- invalid/expired handoff rejected.

## Booking
- available slot succeeds;
- double booking fails;
- no approval step;
- note >500 rejected.

## Check-In
- valid window succeeds;
- too early fails;
- unrelated user fails.

## Human Chat
- before window write denied;
- during window write allowed;
- after window write denied;
- unauthorized read/write denied.

## Late / No-Show
- late threshold works;
- no-show threshold works;
- checked-in psychologist not marked late/no-show;
- participant receives reschedule when psychologist no-show.

---

# 25. Prohibited Agent Behavior

MUST NOT:

1. split DASS-21 and WEMWBS into two quota sessions;
2. use AI scoring;
3. auto-assign psychologist;
4. make chat permanently writable;
5. allow booking without current assessment/report;
6. allow double booking;
7. trust client timing;
8. expose arbitrary reports by ID;
9. merge AI chatbot and psychologist consultation chat;
10. give psychologist full assessment history;
11. give superadmin automatic individual report access;
12. hard-code timing configuration across modules;
13. invent unresolved cancellation/no-show policy.


---

# 26. Synchronized Consultation Implementation Requirements

This section overrides conflicting prior consultation scheduling/chat behavior.

## FR-SYNC-001 — Fixed Sessions

MUST use:

```text
MORNING   09:00–11:00
AFTERNOON 13:00–15:00
EVENING   16:00–18:00
```

MUST NOT support arbitrary standard consultation times.

---

## FR-SYNC-002 — Availability

Psychologist MUST be able to set availability per:

```text
date + session_type
```

A psychologist MAY enable all, some, or none of the sessions for a date.

---

## FR-SYNC-003 — Capacity

At most one active booking may exist per:

```text
psychologist_id + date + session_type
```

Database/transaction logic MUST enforce this.

---

## FR-SYNC-004 — Participant Selection

Participant MUST explicitly select an AVAILABLE fixed session.

---

## FR-SYNC-005 — Hard End Time

Consultation MUST NOT remain writable after the fixed session end.

Maximum writable duration is two hours.

---

## FR-SYNC-006 — Psychologist Early Close

Assigned psychologist MAY close an IN_PROGRESS consultation before scheduled_end_at.

Backend MUST verify caller is appointment psychologist.

---

## FR-SYNC-007 — Participant Close Prohibited

Participant MUST NOT have an authorized endpoint/action for closing the consultation.

---

## FR-SYNC-008 — Automatic Closure

If still open at:

```text
now >= scheduled_end_at
```

system MUST automatically close the consultation.

---

## FR-SYNC-009 — Closed State

After close:

```text
message write = DENY
attachment upload = DENY
authorized history read = ALLOW
```

---

## FR-SYNC-010 — No Follow-Up

MUST NOT implement:

- automatic follow-up appointment;
- “continue consultation” action after time expires;
- automatic next-session recommendation;
- extension beyond fixed session because conversation was insufficient.

Reschedule MAY exist only as recovery for failed/cancelled/no-show appointment if separately implemented.

---

# 27. Consultation Attachment Functional Requirements

## FR-ATT-001 — Allowed Image Types

Backend MUST allow only:

```text
.jpg
.jpeg
.png
.webp
```

for image attachments.

---

## FR-ATT-002 — Allowed Document Type

Backend MUST allow only:

```text
.pdf
```

for document attachments.

---

## FR-ATT-003 — Validation

For every upload MUST validate:

```text
extension
MIME type
file size
caller authorization
consultation writable state
```

Extension-only validation MUST NOT be sufficient.

---

## FR-ATT-004 — Size Limits

Centralized defaults:

```text
image_max_bytes = 5 MB
pdf_max_bytes = 10 MB
```

SHOULD be configurable.

---

## FR-ATT-005 — Count

Current baseline:

```text
max_attachments_per_message = 1
```

MUST NOT implement multi-attachment UX unless newer specification allows it.

---

## FR-ATT-006 — Private Access

Attachment MUST be stored privately.

Download/view MUST authorize:

```text
caller == appointment participant
OR
caller == appointment psychologist
```

---

## FR-ATT-007 — Timing

Upload MUST fail if consultation is not writable.

Existing authorized attachments MAY remain readable after closure.

---

## FR-ATT-008 — Chatbot Separation

Attachments MUST NOT be included automatically in external chatbot handoff.

---

## FR-ATT-009 — Assessment Isolation

Attachments MUST NOT alter assessment answers, official score, or report calculation.

---

## FR-ATT-010 — System Messages

System MAY create non-user messages for lifecycle events.

Suggested types:

```text
SESSION_STARTED
PSYCHOLOGIST_JOINED
PARTICIPANT_JOINED
SESSION_ENDING_SOON
PSYCHOLOGIST_LATE
SESSION_ENDED_BY_PSYCHOLOGIST
SESSION_AUTO_CLOSED
```
