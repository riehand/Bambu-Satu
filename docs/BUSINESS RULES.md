# Business Rules — Coding Agent Specification
## Mental Well-Being Assessment Platform

**Document Type:** Coding-Agent Business Rules  
**Audience:** Codex, Claude Code / Opus, Gemini, other software-development agents  
**Status:** Synchronized implementation source of truth  
**Normative Terms:** MUST, MUST NOT, SHOULD, SHOULD NOT, MAY

---

# 0. Agent Operating Rules

The coding agent MUST:

1. Read and preserve this document's business invariants.
2. Treat `MUST` and `MUST NOT` as hard constraints.
3. Avoid inventing unresolved product behavior.
4. Enforce privacy, authorization, timing, quota, and booking rules server-side.
5. Keep the assessment platform authoritative for scores/reports.
6. Keep external AI chat and human psychologist consultation as separate domains.
7. Prefer simple implementation over speculative architecture.

---

# 1. Core Invariants

## INV-001 — One Assessment

DASS-21 + WEMWBS MUST equal one assessment session.

MUST NOT consume two quota units.

---

## INV-002 — Assessment Quota

Participant MUST NOT exceed configured completed-assessment limit per academic period.

Current default:

```text
3
```

Only completed assessments count.

---

## INV-003 — Deterministic Scoring

Official scoring MUST be deterministic.

AI/LLM MUST NOT participate in score calculation.

---

## INV-004 — Private by Default

Assessment report MUST be private by default.

---

## INV-005 — Explicit Sharing

Psychologist/chatbot access MUST require explicit participant authorization.

---

## INV-006 — Participant Selects Psychologist

System MUST NOT auto-assign psychologist.

---

## INV-007 — Fixed Consultation Sessions

Psychologist consultation booking MUST use exactly these current business slots:

```text
MORNING   = 09:00–11:00
AFTERNOON = 13:00–15:00
EVENING   = 16:00–18:00
```

Standard booking MUST NOT allow arbitrary psychologist start/end times.

---

## INV-008 — Per-Day Psychologist Availability

Psychologist MUST be able to mark each fixed session AVAILABLE/UNAVAILABLE per date.

Psychologist MAY be available for all, some, or none of the three sessions.

---

## INV-009 — One Participant per Psychologist Session

One psychologist fixed session MUST NOT be successfully booked by more than one participant.

---

## INV-010 — Available Means Bookable

Valid AVAILABLE session booking MUST directly create a CONFIRMED appointment.

MUST NOT add a second psychologist approval step.

---

## INV-011 — Hard Maximum Consultation Duration

Human consultation MUST NOT remain writable beyond the selected session's scheduled end.

Maximum duration is two hours.

---

## INV-012 — Psychologist Can End Early

Only the assigned psychologist MAY manually close an in-progress consultation before scheduled end when the consultation has been sufficiently completed.

---

## INV-013 — Participant Cannot End Session

Participant MUST NOT be given authority/API capability to close the consultation session.

---

## INV-014 — Automatic Closure

If the psychologist has not closed the session earlier, the system MUST automatically close the consultation at `scheduled_end_at`.

---

## INV-015 — Closed Means Read-Only

After manual psychologist closure or automatic system closure:

```text
message write = DENY
conversation read = ALLOW for authorized parties
```

subject to retention policy.

---

## INV-016 — No Follow-Up for Insufficient Time

System MUST NOT create or recommend a follow-up consultation merely because the participant considers the two-hour session insufficient.

MUST NOT extend the current chat beyond the fixed session.

---

# 2. Actors and Authorization

## 2.1 Participant

Participant MAY be:

```text
STUDENT
LECTURER
```

Participant MUST only access own:

- profile;
- assessments;
- reports;
- history;
- chatbot handoffs;
- appointments;
- consultation sessions/messages.

Participant MUST NOT close a consultation session.

---

## 2.2 Psychologist

Psychologist MAY:

- manage own profile;
- manage own fixed-session availability;
- access own appointments;
- check in;
- read authorized current report;
- read limited participant context;
- participate in own consultation chat;
- manually end own in-progress consultation.

Psychologist MUST NOT:

- browse arbitrary participant reports;
- access unrelated appointments;
- access full history by default;
- manually close another psychologist's consultation.

---

## 2.3 Superadmin

Superadmin MAY manage:

- users;
- psychologists;
- academic periods;
- assessment limit;
- operational configuration;
- aggregate stats;
- audit metadata.

Superadmin MUST NOT gain automatic individual report-content access.

---

## 2.4 External Chatbot

External chatbot MAY receive authorized processed current-report context.

MUST NOT receive unrestricted database access.

---

# 3. Registration

Participant registration MUST accept:

```text
full_name
user_type
institutional_id
phone_number
email
password
```

`user_type` MUST support:

```text
STUDENT
LECTURER
```

Email and institutional_id MUST be unique.

Passwords MUST be securely hashed.

---

# 4. Academic Period and Quota

Academic period MUST be persistent domain data.

System MUST resolve active academic period before assessment creation.

Assessment limit MUST be centralized/configurable.

New assessment creation MUST fail when:

```text
completed_count >= assessment_limit
```

for current academic period.

`IN_PROGRESS` MUST NOT count.

---

# 5. Assessment Session

DASS-21 and WEMWBS MUST share one assessment session ID/context.

Final completion MUST require all mandatory responses.

Duplicate final submission MUST NOT consume quota twice or duplicate logical reports.

---

# 6. Scoring

Backend MUST be authoritative for scores.

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

MUST NOT create universal combined mental-health score.

MUST NOT call AI in official scoring path.

---

# 7. Report

Completed assessment MUST produce a report.

Report MUST be private by default.

Owner participant MUST be able to view/download.

Report MUST include non-diagnosis disclaimer.

Report access endpoint MUST enforce object-level authorization.

---

# 8. Post-Assessment Paths

MUST support independent:

```text
KEEP_PRIVATE
CHAT_WITH_CHATBOT
CONSULT_PSYCHOLOGIST
```

No path may be required before another.

---

# 9. Chatbot Integration

Chatbot handoff MUST:

- require explicit participant action;
- default to current processed report;
- use secure scoped authorization;
- avoid sensitive query-string payload;
- avoid unrestricted database access.

Chatbot MUST NOT independently recalculate official score.

---

# 10. Psychologist Directory

Participant MUST explicitly select psychologist.

Psychologist profile SHOULD expose approved professional fields only.

System MUST NOT add auto-matching/auto-assignment unless a newer approved spec overrides this document.

---

# 11. Fixed Session Definitions

Current session constants:

```text
MORNING:
  start = 09:00
  end   = 11:00

AFTERNOON:
  start = 13:00
  end   = 15:00

EVENING:
  start = 16:00
  end   = 18:00
```

Agent SHOULD centralize these definitions.

Do not scatter session time magic values across modules.

---

# 12. Psychologist Availability

Availability domain MUST identify:

```text
psychologist_id
date
session_type
status
```

Minimum status:

```text
AVAILABLE
BOOKED
UNAVAILABLE
```

Psychologist MUST be able to set availability per session per date.

---

# 13. Booking

Booking MUST require:

```text
authenticated participant
completed current assessment
current report
selected psychologist
selected date
selected fixed session
session status AVAILABLE
report consent
```

Contact consent MUST be required only if phone/contact use is part of approved flow.

Optional participant note:

```text
max_length = 500
```

Backend MUST validate it.

---

## 13.1 Atomic Booking

Successful booking SHOULD atomically:

```text
verify session AVAILABLE
create appointment CONFIRMED
mark psychologist session BOOKED
initialize consultation session
```

Concurrent double booking MUST be prevented.

---

# 14. Appointment Relationships

Appointment MUST reference:

```text
participant_id
psychologist_id
assessment_session_id
report_id
availability/session slot id
```

or equivalent domain relationships.

Psychologist report access MUST be limited to appointment-bound current report.

---

# 15. Check-In

Psychologist check-in MUST be supported and required by attendance workflow.

Participant check-in SHOULD be supported.

Check-in MUST use server-generated timestamp.

Check-in MUST only be accepted for user associated with appointment.

Recommended:

```text
check_in_open_before_minutes = 10
```

configurable.

---

# 16. Reminder

System MUST support psychologist appointment reminders.

Participant reminders SHOULD be supported.

Baseline recommended schedule:

```text
24h before
1h before
10m before
```

Values SHOULD be configurable.

---

# 17. Consultation Session Model

Consultation session SHOULD persist:

```text
id
appointment_id
status
scheduled_start_at
scheduled_end_at
participant_checked_in_at
psychologist_checked_in_at
started_at
ended_at
ended_by
end_reason
```

Suggested `ended_by`:

```text
PSYCHOLOGIST
SYSTEM
```

Suggested `end_reason`:

```text
PSYCHOLOGIST_COMPLETED
SCHEDULED_END_REACHED
```

---

# 18. Consultation Session States

Recommended states:

```text
SCHEDULED
READY
IN_PROGRESS
PSYCHOLOGIST_LATE
PARTICIPANT_LATE
NO_SHOW
COMPLETED
CLOSED
```

Exact names MAY differ.

Do not require `COMPLETED_EARLY` as a separate state if completion metadata records who ended the session and when.

---

# 19. Human Consultation Chat Authorization

Consultation messages MUST belong to exactly one consultation session.

Only:

```text
appointment.participant_id
appointment.psychologist_id
```

MAY read the conversation.

Only authorized in-session users MAY send messages.

Server MUST verify resource authorization on every read/write operation.

---

# 20. Chat Time Rules

## BR-HCHAT-A — Before Start

Before authorized consultation start:

```text
write = DENY
```

---

## BR-HCHAT-B — During Active Session

During valid active session:

```text
write = ALLOW
```

for appointment participant and psychologist.

---

## BR-HCHAT-C — Psychologist Manual Early End

Assigned psychologist MAY request manual end while:

```text
session.status == IN_PROGRESS
AND now < scheduled_end_at
```

Server MUST verify caller is assigned psychologist.

Upon valid psychologist end:

```text
ended_at = server_time
ended_by = PSYCHOLOGIST
end_reason = PSYCHOLOGIST_COMPLETED
status = CLOSED or equivalent
write = DENY
```

Participant MUST NOT have an equivalent endpoint/action.

---

## BR-HCHAT-D — Scheduled Automatic End

At:

```text
now >= scheduled_end_at
```

if session is still writable/open, system MUST close it automatically.

Result:

```text
ended_at = scheduled_end_at or authoritative closure time
ended_by = SYSTEM
end_reason = SCHEDULED_END_REACHED
write = DENY
```

No user action is required.

---

## BR-HCHAT-E — No Extension

System MUST NOT allow:

```text
scheduled_end_at extension
message write after scheduled_end_at
automatic continuation into next fixed session
```

for normal consultation.

---


# 20A. Supported Consultation Message Content

Consultation chat MUST support:

```text
TEXT
SYSTEM
```

and MAY associate one approved attachment with a user message.

Emoji MAY be transmitted as ordinary text content.

---

# 20B. Approved Attachment Formats

## Images

MUST allow only the approved image formats:

```text
.jpg
.jpeg
.png
.webp
```

## Documents

MUST allow only:

```text
.pdf
```

The agent MUST NOT accept arbitrary document or executable formats.

---

# 20C. Attachment Validation

For every uploaded attachment, backend MUST validate:

```text
file extension
MIME type
file size
authorization
consultation writable state
```

Extension-only validation MUST NOT be treated as sufficient.

---

# 20D. Attachment Size Limits

Recommended centralized baseline:

```text
consultation.image_max_bytes = 5 MB
consultation.pdf_max_bytes   = 10 MB
```

Values SHOULD be configurable.

---

# 20E. Attachment Count

Current baseline SHOULD limit:

```text
max_attachments_per_message = 1
```

Agent MUST NOT implement multiple-attachment UX unless a newer approved specification requests it.

---

# 20F. Attachment Storage and Access

Attachments MUST be stored privately.

MUST NOT expose unrestricted permanent public URLs.

Download/view endpoint MUST enforce:

```text
caller == appointment participant
OR
caller == appointment psychologist
```

for the related consultation session.

---

# 20G. Attachment Timing

Attachment upload MUST be rejected when consultation is not writable.

After session closure:

```text
existing attachment read = ALLOW for authorized parties
new attachment upload = DENY
```

---

# 20H. Attachment Scope

Consultation attachments MUST NOT:

- alter official assessment scoring;
- grant access to additional assessment history;
- be automatically included in chatbot handoff;
- be copied into generic application/audit logs.

---

# 20I. Suggested Attachment Model

A separate entity is preferred:

```text
consultation_attachments
- id
- message_id
- original_file_name
- stored_object_key
- mime_type
- file_size
- created_at
```

Exact names MAY differ.

Storage path/object key SHOULD reference private storage, not a public asset path.

---

# 20J. System Messages

System-generated events MAY be represented as consultation messages with a system type.

Examples:

```text
SESSION_STARTED
PSYCHOLOGIST_JOINED
PARTICIPANT_JOINED
SESSION_ENDING_SOON
PSYCHOLOGIST_LATE
SESSION_ENDED_BY_PSYCHOLOGIST
SESSION_AUTO_CLOSED
```

System messages MUST NOT be treated as user-authored content.

# 21. Participant End Restriction

MUST NOT expose:

```text
POST /consultations/{id}/end
```

or equivalent end capability to participant authorization.

If a shared endpoint exists, backend MUST reject participant caller.

Participant MAY communicate that consultation is sufficient in chat, but psychologist performs closure action.

---

# 22. No Follow-Up Session

Agent MUST NOT implement:

- "Book Follow-Up" because session was insufficient;
- automatic next-session recommendation;
- continuation into next fixed session;
- automatic same-psychologist follow-up;
- chat extension beyond two hours.

Rescheduling MAY exist only as recovery for failed/cancelled/no-show appointment if separately supported.

Do not conflate `reschedule` with `follow-up`.

---

# 23. Late Detection

With configured:

```text
psychologist_late_after_minutes = 5
```

if:

```text
now >= scheduled_start_at + threshold
AND psychologist_checked_in_at IS NULL
```

system MUST mark/derive psychologist late.

MUST notify psychologist.

MUST expose participant-facing late status.

---

# 24. No-Show

With configured baseline:

```text
psychologist_no_show_after_minutes = 15
```

if psychologist remains absent, system MUST support no-show state/handling.

No-show MAY enable reschedule because the booked consultation failed to occur.

This MUST NOT be presented as a follow-up session.

---

# 25. Message Model

Consultation message SHOULD contain:

```text
id
consultation_session_id
sender_id
message
sent_at
```

`sent_at` MUST use trusted server time.

Messages MUST NOT persist after session closure if write request arrives late/races with close.

Backend MUST re-check writable state transactionally or immediately before persistence.

---

# 26. Consent

MUST semantically distinguish:

```text
CHATBOT_REPORT_ACCESS
PSYCHOLOGIST_REPORT_ACCESS
PSYCHOLOGIST_CONTACT_ACCESS
```

Consent MUST NOT be prechecked.

Psychologist report consent MUST be scoped to selected psychologist + relevant current report/appointment.

---

# 27. Privacy

MUST enforce least privilege.

Psychologist MUST NOT receive full history automatically.

Superadmin MUST NOT bypass report privacy merely through admin role.

Full report/message content MUST NOT be copied into generic logs.

---

# 28. Audit

System SHOULD audit:

```text
registration
assessment completion
report generation
consent
chatbot handoff
appointment creation
appointment cancellation
reschedule caused by failed/no-show appointment
participant check-in
psychologist check-in
psychologist late
psychologist no-show
consultation started
consultation ended by psychologist
consultation auto-closed by system
admin configuration change
```

Audit log SHOULD store event metadata, not full consultation conversation.

---

# 29. Configuration

Centralize at least:

```text
assessment_limit
check_in_open_before_minutes
psychologist_late_after_minutes
psychologist_no_show_after_minutes
reminder_schedule
```

Fixed consultation session definitions SHOULD live in one authoritative configuration/domain module.

---

# 30. Suggested Domain Entities

```text
users
psychologist_profiles
academic_periods
assessment_sessions
assessment_answers
assessment_scores
reports
questions
consents
psychologist_availability
appointments
consultation_sessions
consultation_messages
consultation_attachments
notifications
chatbot_handoffs
audit_logs
```

Exact names MAY differ.

---

# 31. Minimum Acceptance Tests

## Session Availability
- psychologist marks MORNING available;
- participant sees 09:00–11:00;
- psychologist may mark AFTERNOON unavailable;
- unavailable session cannot be booked;
- same psychologist/session cannot be booked twice.

## Consultation Start/End
- chat not writable before session;
- chat writable during valid active session;
- participant cannot manually close session;
- assigned psychologist can close at 45 minutes;
- after psychologist closure, new messages rejected;
- if not manually closed, at scheduled end system auto-closes;
- after auto-close, new messages rejected;
- no write succeeds after scheduled_end_at.

## Attachments
- valid JPG accepted during active session;
- valid PNG accepted during active session;
- valid WEBP accepted during active session;
- valid PDF accepted during active session;
- unsupported extension rejected;
- MIME mismatch rejected;
- oversize file rejected;
- attachment upload after closure rejected;
- unrelated participant/psychologist cannot download attachment;
- attachment is not included in chatbot handoff by default.

## Follow-Up Exclusion
- no follow-up action generated when two-hour session ends;
- no automatic next appointment created;
- no chat extension beyond fixed session.

## Authorization
- unrelated participant denied;
- unrelated psychologist denied;
- selected psychologist accesses only bound appointment/report.

## No-Show
- psychologist absent beyond threshold enters no-show;
- reschedule recovery may be offered if implemented;
- reschedule is not represented as follow-up.

---

# 32. Prohibited Implementation

The agent MUST NOT:

1. split DASS-21 and WEMWBS into separate quota sessions;
2. use AI scoring;
3. auto-assign psychologist;
4. permit arbitrary psychologist standard session times;
5. permit two participants to book same psychologist/session;
6. require psychologist approval after valid booking;
7. allow participant to end consultation;
8. keep chat writable after scheduled_end_at;
9. automatically extend session;
10. create follow-up session due to insufficient discussion time;
11. merge AI chatbot and human psychologist chat;
12. expose full participant history to psychologist;
13. use frontend-only timing/authorization;
14. use client time as authoritative close time;
15. expose sensitive report/message content in logs;
16. give chatbot unrestricted database access;
17. expose consultation attachments through unrestricted public URLs;
18. accept arbitrary file formats outside JPG/JPEG/PNG/WEBP/PDF;
19. auto-share consultation attachments to the external AI chatbot.

---

# 33. Final Agent Flow

```text
ASSESSMENT COMPLETED
        ↓
REPORT GENERATED
        ↓
CONSULT PSYCHOLOGIST
        ↓
PARTICIPANT SELECTS PSYCHOLOGIST
        ↓
PARTICIPANT SELECTS DATE
        ↓
PARTICIPANT SELECTS AVAILABLE FIXED SESSION
        ├── 09:00–11:00
        ├── 13:00–15:00
        └── 16:00–18:00
        ↓
OPTIONAL NOTE
        ↓
CONSENT
        ↓
CONFIRMED APPOINTMENT
        ↓
REMINDERS + CHECK-IN
        ↓
SESSION STARTS
        ↓
PRIVATE HUMAN CONSULTATION CHAT
        │
        ├── CONSULTATION FINISHED EARLY
        │        ↓
        │   PSYCHOLOGIST CLOSES
        │
        └── SCHEDULED END REACHED
                 ↓
             SYSTEM CLOSES
        ↓
CHAT READ-ONLY
        ↓
CONSULTATION COMPLETED
```

No standard follow-up consultation is generated from this flow.
