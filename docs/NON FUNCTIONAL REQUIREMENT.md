# Non-Functional Requirements — Coding Agent Specification
## Mental Well-Being Assessment Platform

**Document Type:** Coding-Agent NFR Specification  
**Audience:** Codex, Claude Code / Opus, Gemini, software-development agents

---

# 0. Agent Quality Rules

The coding agent MUST optimize for this priority order:

```text
1. Security / Privacy
2. Correctness / Data Integrity
3. Reliability
4. Usability
5. Maintainability
6. Performance
7. Scalability
```

The agent MUST NOT trade authorization correctness for implementation convenience.

---

# 1. Security

## NFR-SEC-001 — Passwords

MUST use industry-standard password hashing.

MUST NOT log or persist plaintext passwords.

---

## NFR-SEC-002 — Server Authorization

MUST perform authorization server-side.

Frontend route guards MAY improve UX but MUST NOT be the security boundary.

---

## NFR-SEC-003 — Object-Level Authorization

For every resource endpoint containing IDs, MUST validate access to that exact object.

Examples:

```text
assessment_id
report_id
appointment_id
consultation_session_id
message_id
psychologist_id
```

---

## NFR-SEC-004 — Least Privilege

MUST expose only fields required by caller role/purpose.

Prefer role-specific DTO/serializer/view models.

---

## NFR-SEC-005 — Sensitive Transport

Production MUST use encrypted transport for authenticated/sensitive traffic.

---

## NFR-SEC-006 — Secret Handling

Secrets, API keys, signing keys, and credentials MUST NOT be committed to source code.

---

## NFR-SEC-007 — Logs

MUST NOT log:

```text
password
password hash
raw auth tokens
full assessment answers
full assessment report
full consultation conversation
```

unless an explicitly approved secure logging requirement exists.

---

# 2. Privacy

## NFR-PRIV-001

Report MUST default to no external/psychologist access.

---

## NFR-PRIV-002

Psychologist responses MUST exclude unrelated participant history/data.

---

## NFR-PRIV-003

Chatbot context MUST be scoped to authorized current report by default.

---

## NFR-PRIV-004

Superadmin role MUST NOT automatically bypass report-content privacy.

---

## NFR-PRIV-005

Consent MUST be checked at access/use boundary, not only recorded in UI.

---

# 3. Correctness

## NFR-COR-001 — Scoring

Scoring logic SHOULD be implemented as pure deterministic functions where practical.

---

## NFR-COR-002 — Single Source of Truth

Official score MUST come from backend scoring logic.

---

## NFR-COR-003 — State Machine

Assessment, appointment, slot, and consultation session states SHOULD have explicit valid transitions.

Invalid transitions MUST be rejected.

---

## NFR-COR-004 — Server Time

Critical timing MUST use authoritative server/database time, not client browser time.

---

# 4. Data Integrity and Transactions

## NFR-DATA-001 — Booking Transaction

Booking SHOULD execute within transaction/atomic mechanism that preserves:

```text
slot AVAILABLE
→ create appointment CONFIRMED
→ slot BOOKED
```

---

## NFR-DATA-002 — Double Booking

Database/transaction strategy MUST prevent concurrent double booking.

---

## NFR-DATA-003 — Duplicate Assessment Completion

Assessment finalization MUST be idempotent or guarded against duplicate execution.

---

## NFR-DATA-004 — Referential Integrity

Database SHOULD enforce foreign keys/constraints for critical relationships where supported.

---

# 5. Reliability

## NFR-REL-001 — External Failure Isolation

External chatbot failure MUST NOT corrupt assessment/report/appointment data.

---

## NFR-REL-002 — Notification Failure

Notification delivery failure MUST NOT cancel/invalidate appointment.

---

## NFR-REL-003 — Retry Safety

Retryable operations SHOULD be idempotent where duplicate side effects are harmful.

Particularly:

```text
assessment completion
report generation
appointment booking
notification dispatch
chatbot handoff creation
```

---

# 6. Performance

## NFR-PERF-001

Avoid unnecessary N+1 queries in:

```text
psychologist directory
availability listing
appointment list
message history
```

---

## NFR-PERF-002

Interactive authenticated API operations SHOULD target normal web-app responsiveness.

Do not optimize prematurely at cost of correctness.

---

## NFR-PERF-003

Message send/read SHOULD be sufficiently responsive for text consultation.

Implementation MAY use polling, SSE, WebSocket, or equivalent based on approved architecture.

Agent MUST NOT introduce complex real-time infrastructure unless justified.

---

# 7. Availability

## NFR-AVL-001

Core assessment and report functionality SHOULD remain available even if chatbot integration is down.

---

## NFR-AVL-002

System SHOULD degrade gracefully when email/notification provider is unavailable.

---

# 8. Usability

## NFR-UX-001

UI MUST clearly distinguish:

```text
External AI Chat
Human Psychologist Consultation
```

---

## NFR-UX-002

UI MUST display meaningful states for:

```text
quota exhausted
assessment incomplete
appointment confirmed
check-in not open
psychologist ready
psychologist late
psychologist no-show
consultation not started
consultation active
consultation closed
```

---

## NFR-UX-003

Consent UI MUST NOT use preselected consent.

---

## NFR-UX-004

Sensitive error messages MUST be user-friendly and MUST NOT leak internal authorization data.

---

# 9. Accessibility

## NFR-A11Y-001

Core UI SHOULD meet WCAG-oriented good practices appropriate for the project.

---

## NFR-A11Y-002

Forms MUST use semantic labels.

---

## NFR-A11Y-003

Keyboard interaction MUST be supported for core flows.

---

## NFR-A11Y-004

Status MUST NOT rely on color alone.

---

# 10. Maintainability

## NFR-MNT-001

Centralize configuration for:

```text
assessment_limit
check_in_open_before_minutes
psychologist_late_after_minutes
psychologist_no_show_after_minutes
chat_open_before_minutes
chat_close_after_minutes
reminder_schedule
```

---

## NFR-MNT-002

Do not duplicate scoring constants across frontend/backend.

Backend is authoritative.

---

## NFR-MNT-003

Separate modules/services by domain responsibility where architecture supports it:

```text
auth
assessment
scoring
report
psychologist
availability
appointment
consultation
notification
chatbot_integration
audit
```

Avoid over-engineered abstraction.

---

## NFR-MNT-004

Use explicit names over generic `data`, `service`, `manager` abstractions where domain meaning is known.

---

# 11. Testability

## NFR-TEST-001

Business-critical functions MUST be testable without depending on real external chatbot/email service.

Use interfaces/fakes/mocks only where useful.

---

## NFR-TEST-002

Time-dependent logic MUST be testable using injected/controlled clock or equivalent.

Do not write tests that wait real minutes.

---

## NFR-TEST-003

Concurrency-sensitive booking SHOULD have integration/database tests.

---

## NFR-TEST-004

Authorization MUST include negative tests, not only happy-path tests.

---

# 12. Auditability

## NFR-AUD-001

Audit event SHOULD include:

```text
actor_id
action
target_type
target_id
timestamp
metadata limited to non-sensitive operational context
```

---

## NFR-AUD-002

Generic audit log MUST NOT duplicate consultation message body or full report content.

---

## NFR-AUD-003

Security-sensitive admin configuration changes SHOULD be auditable.

---

# 13. Interoperability

## NFR-INT-001

Chatbot integration contract SHOULD be versionable.

---

## NFR-INT-002

External chatbot MUST consume documented API/handoff contract.

MUST NOT query internal database directly.

---

## NFR-INT-003

Integration payload SHOULD expose only approved processed fields.

---

# 14. Scalability

## NFR-SCAL-001

Queries/data model SHOULD support multiple psychologists, academic periods, participants, and simultaneous distinct appointments.

---

## NFR-SCAL-002

Do not assume only one psychologist exists.

---

## NFR-SCAL-003

Do not assume only one appointment can be active system-wide.

Concurrency rules are per resource/psychologist/slot.

---

# 15. Messaging Integrity

## NFR-MSG-001

Messages MUST have stable ordering semantics.

Recommended:

```text
sent_at + id
```

or equivalent.

---

## NFR-MSG-002

Server MUST validate consultation write window for every message creation request.

---

## NFR-MSG-003

Closed session message POST MUST return rejection and MUST NOT persist the message.

---

## NFR-MSG-004

Consultation conversation SHOULD remain appointment-scoped at database and API level.

---

# 16. Notification Quality

## NFR-NOTIF-001

Scheduled notification jobs SHOULD tolerate retry without excessive duplicates.

---

## NFR-NOTIF-002

Use deterministic notification event keys where practical, e.g.:

```text
appointment:{id}:reminder:24h
appointment:{id}:reminder:1h
appointment:{id}:reminder:10m
appointment:{id}:psychologist_late
```

---

## NFR-NOTIF-003

Notification channel failures SHOULD be observable/logged without sensitive payload.

---

# 17. Observability

## NFR-OBS-001

Application SHOULD expose operational logging/monitoring for:

```text
failed assessment finalization
booking conflict
notification failure
chatbot handoff failure
unauthorized access attempts
late/no-show state transitions
```

---

## NFR-OBS-002

Monitoring MUST minimize sensitive psychological content.

---

# 18. Configuration

Configuration MUST NOT be scattered magic numbers.

Suggested config namespace:

```text
assessment.limit
consultation.check_in_open_before_minutes
consultation.psychologist_late_after_minutes
consultation.psychologist_no_show_after_minutes
consultation.chat_open_before_minutes
consultation.chat_close_after_minutes
consultation.reminder_schedule
```

---

# 19. Dependency Restraint

The coding agent SHOULD prefer existing project dependencies and platform capabilities.

MUST NOT add heavy infrastructure/dependencies for features that can be implemented simply within current architecture.

Examples:

- do not add message broker solely for a small Capstone reminder flow unless required;
- do not add microservices without architectural justification;
- do not introduce AI libraries into deterministic scoring.

---

# 20. Quality Gates

Before a feature is considered implementation-complete, relevant checks SHOULD pass:

```text
lint
typecheck
unit tests
integration tests for critical business rules
authorization tests
build
```

If the project stack uses equivalent tools, use those.

---

# 21. Security Test Matrix

Minimum:

- Participant A cannot fetch Participant B report.
- Participant A cannot fetch Participant B appointment.
- Psychologist A cannot fetch Psychologist B appointment.
- Psychologist without consent cannot fetch report.
- Guessing report/appointment IDs does not bypass authorization.
- Chatbot token cannot access human consultation messages.
- Human consultation session credential cannot retrieve unrelated chatbot context.
- Closed consultation rejects new messages.

---

# 22. Reliability Test Matrix

Minimum:

- duplicate assessment submit does not consume quota twice;
- concurrent same-slot bookings produce at most one success;
- notification retry does not create harmful duplicate state;
- chatbot provider failure leaves report intact;
- session timing rules remain correct around boundary timestamps.

---

# 23. Agent Prohibitions

The agent MUST NOT:

1. weaken authorization to simplify implementation;
2. store plaintext passwords;
3. expose psychological data in logs;
4. use client time as authoritative session time;
5. use frontend-only double-booking protection;
6. introduce permanent psychologist messaging outside appointment;
7. give chatbot database access;
8. generate diagnosis;
9. use AI for scoring;
10. add unnecessary architecture/dependencies beyond project need.


---

# 24. Synchronized Consultation NFR Requirements

## NFR-SYNC-001 — Fixed Session Source of Truth

Session definitions MUST be centralized:

```text
MORNING   09:00–11:00
AFTERNOON 13:00–15:00
EVENING   16:00–18:00
```

Frontend/backend MUST NOT maintain divergent copies.

---

## NFR-SYNC-002 — Server-Side Auto Close

Automatic close MUST be enforced server-side or by trusted scheduled/domain logic.

Client tab/browser presence MUST NOT determine whether the session closes.

---

## NFR-SYNC-003 — Close Race Safety

If psychologist manual close and system auto-close occur near the same time, operation MUST be idempotent/race-safe.

Only one logical closure MUST result.

---

## NFR-SYNC-004 — Participant Restriction

Participant MUST NOT be able to bypass UI and close session through direct API calls.

---

## NFR-SYNC-005 — No Follow-Up Coupling

Do not add follow-up scheduling dependencies to consultation completion logic.

---

# 25. Attachment Security NFR

## NFR-ATT-001 — Allowlist

MUST use allowlist, not denylist.

Allowed:

```text
image/jpeg
image/png
image/webp
application/pdf
```

with compatible approved extensions.

---

## NFR-ATT-002 — MIME/Extension Agreement

MUST reject suspicious extension/MIME mismatch.

---

## NFR-ATT-003 — Size Limits

MUST enforce size limits server-side before final persistence.

Defaults:

```text
image = 5 MB
pdf = 10 MB
```

---

## NFR-ATT-004 — Private Object Storage

MUST use private storage/object access.

MUST NOT rely on permanently public bucket/object URLs.

---

## NFR-ATT-005 — Authorization

Every attachment download/view MUST perform object-level authorization.

---

## NFR-ATT-006 — Safe Object Key

Stored object key MUST be generated safely.

MUST NOT trust original filename as filesystem path/object key.

---

## NFR-ATT-007 — Original Filename

Original filename MAY be stored as metadata for display after sanitization.

---

## NFR-ATT-008 — Upload State

Upload endpoint MUST verify consultation is writable immediately before persistence.

---

## NFR-ATT-009 — Closed Session

After session closure:

```text
new upload = reject
authorized read = allowed
```

---

## NFR-ATT-010 — Logging

MUST NOT log binary file content.

SHOULD avoid logging sensitive original filenames unless operationally needed.

---

## NFR-ATT-011 — Chatbot Isolation

Attachment identifiers/URLs MUST NOT be included in chatbot handoff by default.

---

## NFR-ATT-012 — Failure Isolation

Failed upload MUST NOT roll back unrelated completed assessment/report data.

---

# 26. Attachment Test Matrix

Minimum tests:

- JPG accepted;
- JPEG accepted;
- PNG accepted;
- WEBP accepted;
- PDF accepted;
- EXE rejected;
- DOCX rejected;
- renamed executable with `.jpg` rejected via MIME/content validation policy;
- oversized image rejected;
- oversized PDF rejected;
- unrelated participant denied download;
- unrelated psychologist denied download;
- upload after close rejected;
- concurrent close/upload race does not persist unauthorized late attachment;
- chatbot payload excludes consultation attachment.
