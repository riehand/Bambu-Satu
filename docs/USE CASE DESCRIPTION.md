# Use Case Description — Coding Agent
## Mental Well-Being Assessment Platform

**Document Type:** Coding-Agent Use Case Description  
**Status:** Synchronized with current Business Rules, Functional Requirements, and Non-Functional Requirements

---

# 1. Actors

## ACT-01 — Participant

Represents a student or lecturer who uses the platform to:

- register and authenticate;
- complete the Mental Well-Being Assessment;
- view/download results and reports;
- choose a post-assessment action;
- access the external AI chatbot;
- browse/select a psychologist;
- book a fixed consultation session;
- check in;
- participate in the in-web psychologist consultation chat;
- send text/emoji/image/PDF attachments.

---

## ACT-02 — Psychologist

Represents a psychologist who:

- maintains a professional profile;
- sets daily availability for fixed consultation sessions;
- views confirmed appointments;
- checks in;
- accesses the participant's consented current assessment report;
- participates in consultation chat;
- receives attachments;
- may end a consultation early if the discussion is sufficiently complete.

---

## ACT-03 — Superadmin

Represents the administrative role responsible for:

- user management;
- psychologist management;
- academic period management;
- assessment-limit configuration;
- operational configuration;
- aggregate monitoring;
- audit-log access.

---

## ACT-04 — External Chatbot System

Represents the external AI application that receives authorized processed assessment context through a secure handoff.

---

# 2. Use Case Catalog

| ID | Use Case | Primary Actor |
|---|---|---|
| UC-01 | Register Account | Participant |
| UC-02 | Login | Participant / Psychologist / Superadmin |
| UC-03 | Manage Participant Profile | Participant |
| UC-04 | View Assessment Quota | Participant |
| UC-05 | Start Assessment | Participant |
| UC-06 | Complete DASS-21 + WEMWBS | Participant |
| UC-07 | Submit Assessment | Participant |
| UC-08 | View Assessment Result | Participant |
| UC-09 | View / Download Report | Participant |
| UC-10 | View Assessment History | Participant |
| UC-11 | Keep Report Private | Participant |
| UC-12 | Continue to External AI Chatbot | Participant |
| UC-13 | Browse Psychologists | Participant |
| UC-14 | View Psychologist Profile | Participant |
| UC-15 | Choose Consultation Session | Participant |
| UC-16 | Add Participant Note | Participant |
| UC-17 | Give Report Consent | Participant |
| UC-18 | Give Contact Consent | Participant |
| UC-19 | Book Consultation | Participant |
| UC-20 | View Appointment | Participant / Psychologist |
| UC-21 | Check In | Participant / Psychologist |
| UC-22 | Join Psychologist Consultation Chat | Participant / Psychologist |
| UC-23 | Send Text Message | Participant / Psychologist |
| UC-24 | Send Image Attachment | Participant / Psychologist |
| UC-25 | Send PDF Attachment | Participant / Psychologist |
| UC-26 | End Consultation Early | Psychologist |
| UC-27 | Auto-Close Consultation | System |
| UC-28 | View Read-Only Consultation History | Participant / Psychologist |
| UC-29 | Manage Psychologist Profile | Psychologist |
| UC-30 | Manage Daily Session Availability | Psychologist |
| UC-31 | View Own Appointment List | Psychologist |
| UC-32 | View Consented Current Assessment | Psychologist |
| UC-33 | Receive Appointment Reminder | Participant / Psychologist |
| UC-34 | Handle Psychologist Late State | System |
| UC-35 | Handle Psychologist No-Show | System |
| UC-36 | Reschedule Appointment (Policy Pending) | Participant |
| UC-37 | Manage Users | Superadmin |
| UC-38 | Manage Psychologists | Superadmin |
| UC-39 | Manage Academic Period | Superadmin |
| UC-40 | Manage Assessment Limit | Superadmin |
| UC-41 | View Aggregate Statistics | Superadmin |
| UC-42 | View Audit Information | Superadmin |

---

# 3. Detailed Use Case Descriptions

## UC-01 — Register Account

**Primary Actor:** Participant  
**Goal:** Create a participant account using institutional identity.

### Preconditions
- Participant is not authenticated.
- Email and institutional identifier are not already registered.

### Trigger
Participant selects Register.

### Main Flow
1. System requests full name.
2. Participant selects `STUDENT` or `LECTURER`.
3. System requests NIM for student or NIP for lecturer.
4. Participant enters active phone number.
5. Participant enters email.
6. Participant creates password.
7. System validates required fields and uniqueness.
8. System securely stores account data.
9. Registration succeeds.

### Alternative / Exception
- Duplicate email → reject.
- Duplicate NIM/NIP → reject.
- Invalid required field → reject.
- Password validation fails → reject.

### Postconditions
- Participant account exists.
- Password is stored securely, never plaintext.

### Related Rules
BR-ACC-01 through BR-ACC-06.

---

## UC-05 — Start Assessment

**Primary Actor:** Participant  
**Goal:** Begin a new Mental Well-Being Assessment session.

### Preconditions
- Participant is authenticated.
- Active academic period exists.
- Participant has remaining assessment quota.

### Trigger
Participant selects Start Assessment.

### Main Flow
1. System resolves active academic period.
2. System counts completed assessments in that period.
3. System checks configured assessment limit.
4. System creates one `IN_PROGRESS` assessment session.
5. Participant begins DASS-21 + WEMWBS flow.

### Exception
- No active academic period → deny.
- Quota exhausted → deny.

### Postconditions
- One assessment session exists.
- Quota is not yet consumed.

---

## UC-06 — Complete DASS-21 + WEMWBS

**Primary Actor:** Participant  
**Goal:** Complete all required questions within one assessment session.

### Preconditions
- An `IN_PROGRESS` assessment exists.

### Main Flow
1. Participant answers DASS-21 questions.
2. System stores/validates responses according to implementation policy.
3. Participant continues to WEMWBS.
4. Participant answers WEMWBS questions.
5. System indicates assessment is ready for final submission.

### Postconditions
- Required responses exist.
- Assessment is still one session.

### Constraint
DASS-21 and WEMWBS MUST NOT be treated as separate quota-consuming sessions.

---

## UC-07 — Submit Assessment

**Primary Actor:** Participant  
**Goal:** Finalize assessment and generate official results.

### Preconditions
- All mandatory assessment items are valid.
- Session is not already completed.

### Main Flow
1. Participant chooses final submit.
2. Backend validates required responses.
3. Backend calculates deterministic DASS-21 scores/categories.
4. Backend calculates WEMWBS score.
5. Backend marks session completed.
6. Backend consumes one quota unit logically.
7. Backend generates result/report.
8. Participant is redirected to result page.

### Exceptions
- Required answers missing → reject.
- Duplicate/retry final submit → must not duplicate completion or quota.
- Scoring failure → assessment must not enter inconsistent final state.

### Postconditions
- Assessment is `COMPLETED`.
- One report exists.
- Result is private by default.

---

## UC-12 — Continue to External AI Chatbot

**Primary Actor:** Participant  
**Supporting Actor:** External Chatbot System

### Preconditions
- Current assessment is completed.
- Current report exists.

### Main Flow
1. Participant selects Chat with Chatbot.
2. System presents sharing/authorization information.
3. Participant explicitly authorizes current-report handoff.
4. System creates secure scoped handoff authorization.
5. System redirects participant to external chatbot.
6. Chatbot retrieves/receives authorized processed current-assessment context.

### Constraints
- Raw assessment answers are not required.
- Assessment history is not automatically shared.
- Consultation attachments are not automatically shared.
- Chatbot must not recalculate official assessment scores.

---

## UC-13 — Browse Psychologists

**Primary Actor:** Participant

### Preconditions
- Participant has a completed current assessment.
- Participant chooses Consult Psychologist.

### Main Flow
1. System shows available/active psychologist profiles.
2. Participant browses professional information.
3. Participant may open psychologist detail.

### Postconditions
- No appointment yet exists.

---

## UC-15 — Choose Consultation Session

**Primary Actor:** Participant

### Preconditions
- Participant has selected a psychologist.

### Fixed Sessions
- `MORNING` = 09:00–11:00
- `AFTERNOON` = 13:00–15:00
- `EVENING` = 16:00–18:00

### Main Flow
1. Participant chooses date.
2. System displays that psychologist's availability by fixed session.
3. Participant chooses one `AVAILABLE` session.

### Exceptions
- Session is unavailable → cannot select.
- Session becomes booked before confirmation → booking must fail safely.

---

## UC-19 — Book Consultation

**Primary Actor:** Participant

### Preconditions
- Participant's latest completed assessment includes DASS-21 and WEMWBS, with its corresponding report in `GENERATED` status.
- Psychologist selected.
- Date and `AVAILABLE` fixed session selected.
- Participant explicitly grants fresh appointment-linked report consent during booking; an existing standalone grant does not satisfy this prerequisite.
- Contact consent provided if required by approved flow.

### Main Flow
1. Participant optionally fills `What would you like to discuss?`.
2. System validates max 500 characters.
3. System shows the exact latest report and an unchecked report-sharing consent control.
4. Participant explicitly selects consent and confirms booking.
5. Server verifies report ownership, latest assessment association, `GENERATED` status, and future slot time.
6. One transaction reserves the slot and creates the `CONFIRMED` appointment, consultation session, and appointment-linked consent with purpose, scope, policy version, and server timestamp.
7. Participant sees confirmation.

Consent audit events distinguish user and system actors. Expiry discovered by an API is persisted once with the effective lifecycle timestamp and a server-observed `EXPIRED` event; the report authorization decision does not wait for that materialization.

### Exception
- Concurrent booking consumed slot → reject with slot unavailable.
- Missing required consent → reject.
- Client report does not match the latest owned `GENERATED` report → reject.
- Any transaction step fails → roll back the appointment, session, slot, and consent.

### Postconditions
- Confirmed appointment exists.
- No psychologist approval step is required.

---

## UC-17 — Manage Standalone Report Consent

**Primary Actor:** Participant

### Main Flow
1. Participant selects one completed report and one psychologist.
2. System explains that the grant is independent of appointments.
3. Participant explicitly grants standalone report access.
4. System records participant, report, psychologist, purpose, policy version, and server timestamp with no appointment association.

### Revocation
Participant may revoke the grant. Revocation immediately removes authorization from that grant but does not cancel an appointment or close a consultation. Any matching appointment-linked or standalone grant is evaluated independently. Re-consent creates a new grant; historical records are not reactivated.

---

## UC-21 — Check In

**Primary Actors:** Participant, Psychologist

### Preconditions
- Confirmed appointment exists.
- Check-in window is open.

### Main Flow
1. Actor opens appointment.
2. Actor selects Check In.
3. Backend confirms actor belongs to appointment.
4. Backend validates check-in timing.
5. Backend stores server-generated check-in timestamp.
6. System updates readiness information.

### Exceptions
- Too early → reject.
- Unrelated actor → reject.
- Duplicate check-in → treat idempotently or reject clearly.

---

## UC-22 — Join Psychologist Consultation Chat

**Primary Actors:** Participant, Psychologist

### Preconditions
- Confirmed appointment exists.
- Consultation session is valid.
- Caller belongs to appointment.
- Consultation has not been closed.

### Main Flow
1. Actor opens appointment/session.
2. System checks current session state.
3. System checks timing and authorization.
4. System displays consultation chat.
5. During writable window, actor may send supported messages.

### Postconditions
- Session remains scoped to one appointment.

---

## UC-23 — Send Text Message

**Primary Actors:** Participant, Psychologist

### Preconditions
- Consultation is writable.
- Caller is authorized.

### Main Flow
1. Actor enters text/emoji.
2. Backend validates session and authorization.
3. Backend assigns server timestamp.
4. Message is persisted.
5. Authorized counterparty sees message.

### Exception
- Session closed / end time reached → reject.
- Unauthorized caller → reject.

---

## UC-24 — Send Image Attachment

**Primary Actors:** Participant, Psychologist

### Allowed Formats
- JPG
- JPEG
- PNG
- WEBP

### Preconditions
- Consultation is writable.
- Caller is authorized.
- Maximum one attachment per message.

### Main Flow
1. Actor chooses image file.
2. Backend validates extension.
3. Backend validates MIME type.
4. Backend validates size ≤ configured image limit (baseline 5 MB).
5. Backend verifies session remains writable.
6. File is stored privately.
7. Message/attachment relationship is created.

### Exceptions
- Unsupported format → reject.
- MIME mismatch → reject.
- Oversized file → reject.
- Session closes before persistence → reject.
- Unauthorized actor → reject.

---

## UC-25 — Send PDF Attachment

Same authorization/timing flow as image attachment.

### Constraints
- Only `.pdf`.
- Baseline max size 10 MB.
- Private storage.
- Not automatically shared with chatbot.

---

## UC-26 — End Consultation Early

**Primary Actor:** Psychologist

### Preconditions
- Caller is assigned psychologist.
- Session is `IN_PROGRESS`.
- Current time is before scheduled end.
- Discussion has been considered sufficiently complete.

### Main Flow
1. Psychologist selects End Consultation.
2. System asks for confirmation.
3. Psychologist confirms.
4. Backend revalidates psychologist ownership and current session state.
5. Backend closes consultation.
6. System records `ended_by = PSYCHOLOGIST`.
7. New messages/attachments are rejected.
8. Conversation becomes read-only.

### Exception
- Participant attempts same action → deny.
- Session already closed → idempotent/reject.
- Wrong psychologist → deny.

---

## UC-27 — Auto-Close Consultation

**Primary Actor:** System

### Trigger
`scheduled_end_at` is reached while session remains open.

### Main Flow
1. Trusted server/scheduler detects scheduled end.
2. System closes consultation.
3. `ended_by = SYSTEM`.
4. `end_reason = SCHEDULED_END_REACHED`.
5. New messages and attachments are rejected.
6. History becomes read-only.

### Constraint
No extension past the fixed two-hour session.

---

## UC-28 — View Read-Only Consultation History

**Primary Actors:** Participant, Psychologist

### Preconditions
- Session is closed/completed.
- Caller belongs to appointment.

### Main Flow
1. Actor opens consultation history.
2. System verifies authorization.
3. System displays messages and authorized attachments.
4. Composer/upload controls remain disabled.

---

## UC-30 — Manage Daily Session Availability

**Primary Actor:** Psychologist

### Preconditions
- Psychologist is authenticated.

### Main Flow
1. Psychologist selects date.
2. System shows:
   - Morning 09:00–11:00
   - Afternoon 13:00–15:00
   - Evening 16:00–18:00
3. Psychologist marks each session available/unavailable.
4. System stores availability.

### Constraint
A booked session cannot be made available to another participant.

---

## UC-34 — Handle Psychologist Late State

**Primary Actor:** System

### Trigger
Configured late threshold is reached and psychologist has not checked in.

### Main Flow
1. System derives/marks `PSYCHOLOGIST_LATE`.
2. System notifies psychologist.
3. System informs participant.

Baseline recommendation: 5 minutes after scheduled start.

---

## UC-35 — Handle Psychologist No-Show

**Primary Actor:** System

### Trigger
Configured no-show threshold is reached and psychologist remains absent.

### Main Flow
1. System marks/derives no-show.
2. Appointment is not treated as successful consultation.
3. The appointment reaches a server-confirmed terminal no-show state; appointment-linked report authorization ends.
4. Rescheduling, if later approved, follows UC-36 policy.

### Constraint
No-show MUST NOT automatically create a replacement appointment.

---

## UC-36 — Reschedule Appointment (Eligibility/Window Pending)

**Primary Actor:** Participant

Eligibility and cutoff are unresolved. Prior requirements considered upcoming appointments as well as failed/no-show recovery; do not implement this use case until approved states and timing rules are documented.

When approved, rescheduling MUST preserve the original appointment and audit history, create a linked replacement, require fresh appointment consent, and replace slots transactionally. A completed consultation MUST NOT be continued or represented as a follow-up.

---

# 4. Out-of-Scope Use Cases

The coding agent MUST NOT invent use cases for:

- automatic psychologist assignment;
- participant-ended consultation;
- extending chat beyond fixed session;
- follow-up session because two hours were insufficient;
- arbitrary psychologist consultation hours;
- audio/video calls;
- voice notes;
- DOCX/XLSX/PPTX/ZIP attachments;
- automatic consultation-attachment sharing to AI chatbot;
- clinical diagnosis.
