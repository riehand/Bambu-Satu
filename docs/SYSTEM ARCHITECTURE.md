# System Architecture — Coding Agent Specification
## Mental Well-Being Assessment Platform

**Document Type:** Coding-Agent System Architecture  
**Audience:** Codex, Claude Code / Opus, Gemini, software-development agents  
**Status:** Implementation context and architectural guardrails

# 0. Agent Operating Principles

The coding agent MUST:
1. Preserve approved business rules, FR/NFR, use cases, and ERD.
2. Use a modular monolith for current Capstone scope.
3. Keep sensitive authorization checks server-side.
4. Keep assessment scoring deterministic and isolated from AI.
5. Keep psychologist consultation and external AI chatbot as separate domains.
6. Avoid unnecessary distributed systems, microservices, or speculative abstractions.
7. Prefer mainstream, well-supported technologies.
8. Keep implementation understandable for a small academic team using AI-assisted coding.

# 1. Recommended Technology Stack

```text
Frontend / Web Application
- Next.js
- React
- TypeScript

Backend / Application Layer
- Next.js Route Handlers / server-side application services
- TypeScript

Database
- PostgreSQL

ORM
- Prisma ORM

Authentication
- Auth.js or equivalent secure session-based authentication

Realtime Consultation Chat
- Preferred: WebSocket / Socket.IO
- Simpler acceptable alternative: REST POST + polling or SSE

Private File Storage
- S3-compatible object storage or equivalent private object storage

Report Generation
- Server-side PDF generation

Notifications
- In-app notification
- Email notification

Background / Scheduled Jobs
- Cron / scheduled worker / platform scheduler

External Chatbot Integration
- REST-style secure handoff
- Short-lived scoped authorization/token
```

Exact providers MAY vary, but responsibilities and trust boundaries MUST remain.

# 2. Architectural Style

Use:

> **Modular Monolith with Clear Domain Boundaries**

Do NOT implement microservices unless a newer approved architecture explicitly requires them.

```text
┌─────────────────────────────────────┐
│           Next.js Application       │
│                                     │
│  UI / Presentation                  │
│  API / Route Handlers               │
│  Application Services               │
│  Domain Modules                     │
│  Authorization                      │
└─────────────┬───────────┬───────────┘
              │           │
              ▼           ▼
        PostgreSQL   Private Object Storage
              │
              ▼
       Scheduled Jobs
              │
              ▼
      External Chatbot API
```

# 3. High-Level Architecture

```text
Web Client
├── Participant Portal
├── Psychologist Portal
└── Superadmin Portal
        │ HTTPS
        ▼
Next.js Application Layer
├── Authentication
├── Authorization
├── API / Route Handlers
├── Application Services
└── Domain Modules
    ├── Account
    ├── Academic Period
    ├── Assessment
    ├── Scoring
    ├── Report
    ├── Consent
    ├── Psychologist
    ├── Availability
    ├── Appointment
    ├── Consultation
    ├── Messaging
    ├── Attachment
    ├── Notification
    ├── Chatbot Integration
    └── Audit
        │
        ├── PostgreSQL
        ├── Private File Storage
        └── Scheduled Jobs
             ├── Reminder
             ├── Late / No-Show
             └── Auto-Close

Secure Integration
        │
        ▼
External Chatbot Application
```

# 4. Presentation Layer

Use one Next.js application for all portals.

Suggested route groups:

```text
/auth/login
/auth/register

/participant/dashboard
/participant/assessment
/participant/results
/participant/history
/participant/psychologists
/participant/appointments
/participant/consultation/[id]

/psychologist/dashboard
/psychologist/profile
/psychologist/availability
/psychologist/appointments
/psychologist/consultation/[id]

/admin/dashboard
/admin/users
/admin/psychologists
/admin/academic-periods
/admin/configuration
/admin/audit
```

Frontend responsibilities:
- rendering;
- interaction;
- form state;
- client-side UX validation;
- calling server APIs/actions.

Frontend MUST NOT be authoritative for:
- role authorization;
- object ownership;
- quota;
- scoring;
- consent;
- slot status;
- double-booking prevention;
- session timing;
- attachment authorization.

# 5. Authentication & Authorization

Recommended:
```text
Auth.js
```

Roles:
```text
PARTICIPANT
PSYCHOLOGIST
SUPERADMIN
```

Use both:
```text
RBAC + Object-Level Authorization
```

Example: `role = PSYCHOLOGIST` is not enough to access a report. Backend must also verify:
```text
appointment.psychologist_id == current_user.id
AND valid consent exists
AND appointment.report_id == requested_report.id
```

# 6. Logical Modules

```text
AuthModule
UserModule
AcademicPeriodModule
AssessmentModule
ScoringModule
ReportModule
ConsentModule
PsychologistModule
AvailabilityModule
AppointmentModule
ConsultationModule
MessagingModule
AttachmentModule
NotificationModule
ChatbotIntegrationModule
AuditModule
```

These are logical modules inside one codebase, not microservices.

# 7. Account / User Module

Responsibilities:
```text
registration
profile
role validation
participant/psychologist identity lookup
```

MUST NOT contain scoring or appointment logic.

# 8. Academic Period Module

Responsibilities:
```text
resolve active academic period
manage academic period
expose assessment limit
```

Current default:
```text
assessment_limit = 3
```

Do not scatter the value `3` throughout code.

# 9. Assessment Module

Responsibilities:
```text
create assessment session
save answers
validate completion
quota validation
final submit
```

Invariant:
```text
DASS-21 + WEMWBS = ONE assessment session
```

Flow:
```text
Participant
→ Assessment Service
→ Resolve Active Academic Period
→ Check Completed Count
→ Check Limit
→ Create IN_PROGRESS
→ Save DASS-21 + WEMWBS Answers
→ Final Submit
```

# 10. Scoring Module

Use deterministic domain functions:

```text
calculateDass21(answers)
calculateWemwbs(answers)
```

MUST NOT:
- call LLM;
- use probabilistic AI;
- combine DASS-21 + WEMWBS into one universal score.

This module MUST have strong unit-test coverage.

# 11. Report Module

Flow:

```text
Completed Assessment
→ Scores
→ Report Service
→ PDF Generator
→ Private Object Storage
→ Report Metadata in PostgreSQL
```

Database stores report metadata and private storage key, not unrestricted public file URLs.

Phase 2 currently writes `PENDING` report metadata. `GENERATED` is set only after the separate report worker successfully creates and stores the private PDF artifact. B3 may be developed/tested with synthetic `GENERATED` reports, but production acceptance depends on the separate generation workflow; B3 MUST NOT implement PDF generation or fabricate the status.

# 12. Consent Module

Consent is a first-class domain concern.

Types:
```text
CHATBOT_REPORT_ACCESS
APPOINTMENT_REPORT_ACCESS
STANDALONE_REPORT_ACCESS
PSYCHOLOGIST_CONTACT_ACCESS
```

Consent scope:
```text
participant
assessment/report
target psychologist or target system
purpose
```

Appointment grants require an appointment ID and match the appointment's participant, exact report, and psychologist. Standalone grants have no appointment association and are evaluated independently. Revoking an appointment grant immediately removes that grant's authorization but does not cancel the appointment or close consultation; any matching standalone grant is checked separately. Re-consent creates a new audited grant and never reactivates revoked or expired records.

Appointment-linked report authorization ends at the earliest applicable event: explicit revocation, assigned psychologist early close, scheduled end, authorized cancellation, or confirmed terminal no-show. The report API checks state and server time on each request; it does not wait for a delayed auto-close job. Standalone access remains active until revoked and does not inherit appointment expiry.

When a consent-list, revoke, re-consent, or report API first observes an appointment grant that has expired by time or terminal lifecycle state, it records `expired_at` at the effective event time and appends one `EXPIRED` event in the same transaction. The access decision is made from current state/server time before materialization. Audit `actor_type` is `USER` with a user ID for a known psychologist close/completion, or `SYSTEM` with a null user ID for system-observed expiry. Future lifecycle writers must call the same expiry path when they perform a terminal transition.

# 13. Psychologist Module

Responsibilities:
```text
professional profile
directory
active status
participant-facing psychologist information
```

Participant may see richer psychologist information than psychologist sees about participant.

# 14. Availability Module

Fixed sessions only:

```text
MORNING   09:00–11:00
AFTERNOON 13:00–15:00
EVENING   16:00–18:00
```

Psychologist configures:
```text
date + session_type + availability
```

No arbitrary standard time slots.

At most one participant per psychologist/date/session.
Availability reads omit slots whose start has passed. Past no-show slots are never automatically reopened; only an authorized transition may release a slot when reuse remains permitted.

# 15. Appointment Module

Responsibilities:
```text
validate selected psychologist
validate current assessment/report
validate consent
validate availability
create confirmed appointment
mark availability BOOKED
initialize consultation session
```

Booking MUST be transactionally safe:

```text
BEGIN
lock/check availability
if status != AVAILABLE: fail
validate latest completed combined assessment and owned GENERATED report
require fresh explicit booking consent
create appointment CONFIRMED
update availability -> BOOKED
create consultation_session
create APPOINTMENT_REPORT_ACCESS with required appointment_id
COMMIT
```

Any failure rolls back the slot, appointment, consultation session, and consent. Booking rejects slots whose scheduled start has passed.

# 16. Consultation Module

Responsibilities:
```text
check-in
attendance
late detection
no-show
session start
psychologist early close
system auto-close
read-only transition
```

Core rules:
```text
Participant cannot close consultation.
Assigned psychologist may close early.
System auto-closes at scheduled_end_at.
No session extension.
No follow-up session because time felt insufficient.
```

# 17. Consultation State

Suggested states:
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

Closure metadata:
```text
ended_by:
- PSYCHOLOGIST
- SYSTEM

end_reason:
- PSYCHOLOGIST_COMPLETED
- SCHEDULED_END_REACHED
```

# 18. Check-In Architecture

Recommended:
```text
check_in_open_before_minutes = 10
```

Store:
```text
participant_checked_in_at
psychologist_checked_in_at
```

Use trusted server time, never client/browser time as authority.

# 19. Messaging Architecture

Human psychologist consultation chat is separate from AI chatbot.

Acceptable modes:

## Option A — WebSocket / Socket.IO
Best realtime UX, more complexity.

## Option B — REST POST + Polling/SSE
Simpler and acceptable for Capstone.

Do NOT introduce Kafka/RabbitMQ solely for chat.

# 20. Message Write Guard

Every message creation MUST validate:

```text
appointment exists
consultation session exists
caller belongs to appointment
session is writable
now < scheduled_end_at
session not closed
```

Frontend disabled state is not sufficient.

# 21. Supported Consultation Content

Supported:
```text
Text
Emoji as text
Image Attachment
PDF Attachment
System Message
```

Allowed image formats:
```text
JPG
JPEG
PNG
WEBP
```

Allowed document:
```text
PDF only
```

Current limit:
```text
max 1 attachment per message
```

# 22. Attachment Module

Responsibilities:
```text
authorize upload
validate session writable
validate extension
validate MIME
validate size
generate safe private object key
upload private file
persist metadata
authorize download
```

Recommended limits:
```text
Image = 5 MB
PDF   = 10 MB
```

Do NOT trust original filename as storage path.

# 23. Private Object Storage

Use S3-compatible private storage or equivalent.

Store:
- assessment report PDF;
- consultation image attachment;
- consultation PDF attachment;
- psychologist profile image.

Authorized access via:
- authenticated proxy endpoint;
- short-lived signed URL;
- equivalent secure access.

# 24. Psychologist Early Close

Flow:
```text
Psychologist
→ End Consultation
→ Confirmation
→ Backend validates assigned psychologist + session state
→ set ended_at
→ ended_by = PSYCHOLOGIST
→ end_reason = PSYCHOLOGIST_COMPLETED
→ close session
→ messages/attachments become read-only
```

Participant MUST NOT have this capability.

# 25. Automatic Session Closure

Do not rely on browser/client.

Defense-in-depth:

```text
Layer 1: Scheduled Job
Find sessions where scheduled_end_at <= now and not closed
→ close

Layer 2: API Guard
if now >= scheduled_end_at
→ reject message/upload
```

# 26. Late / No-Show

Recommended baseline:

```text
psychologist_late_after_minutes = 5
psychologist_no_show_after_minutes = 15
```

At +5 without psychologist check-in:
```text
PSYCHOLOGIST_LATE
notify psychologist
inform participant
```

At +15:
```text
NO_SHOW
```

Reschedule eligibility and cutoff remain unresolved until approved. Prior requirements considered upcoming appointments as possible candidates; do not infer a terminal-state-only rule. Reschedule, when authorized, preserves the original, creates a linked replacement with fresh consent, and replaces slots transactionally. Completed consultations cannot become follow-up sessions.

# 27. Notification Module

Responsibilities:
```text
in-app notification
email notification
appointment reminders
late reminder
```

Recommended reminders:
```text
24h
1h
10m
```

Use simple scheduler/jobs.

# 28. Background Jobs

Required:
```text
Appointment Reminder Job
Late / No-Show Evaluation Job
Consultation Auto-Close Job
```

Optional:
```text
Expired Chatbot Handoff Cleanup
Old Notification Cleanup
```

Jobs MUST be idempotent.

# 29. External Chatbot Integration

Approved flow:

```text
Participant
→ Website
→ Explicit Chatbot Authorization
→ Create Short-Lived Handoff Token
→ Redirect to External Chatbot
→ Chatbot Backend
→ Secure Integration Endpoint
→ Validate Token
→ Return Processed Current Assessment Context
```

MUST NOT:
```text
Chatbot -> Direct PostgreSQL
```

MUST NOT authorize only with:
```text
?assessment_id=123
```

# 30. Chatbot Data Boundary

Allowed by default:
```text
assessment date
depression score/category
anxiety score/category
stress score/category
wemwbs score
disclaimer
```

Not allowed by default:
```text
raw assessment answers
assessment history
psychologist consultation messages
consultation attachments
phone number
unrelated profile data
```

# 31. Database

Use PostgreSQL.

Reasons:
- relational business model;
- transactional booking;
- constraints/FKs;
- concurrency control;
- strong fit with Prisma and ERD.

Preserve constraints from the ERD specification.

# 32. ORM

Recommended:
```text
Prisma ORM
```

Use for:
```text
models
migrations
queries
transactions
constraints
relationships
```

Prefer explicit service-layer authorization.

# 33. Suggested Project Structure

```text
src/
├── app/
│   ├── (auth)/
│   ├── participant/
│   ├── psychologist/
│   ├── admin/
│   └── api/
│
├── modules/
│   ├── auth/
│   ├── users/
│   ├── academic-period/
│   ├── assessment/
│   ├── scoring/
│   ├── reports/
│   ├── consent/
│   ├── psychologists/
│   ├── availability/
│   ├── appointments/
│   ├── consultations/
│   ├── messaging/
│   ├── attachments/
│   ├── notifications/
│   ├── chatbot-integration/
│   └── audit/
│
├── lib/
│   ├── db/
│   ├── auth/
│   ├── storage/
│   ├── mail/
│   ├── scheduler/
│   └── validation/
│
├── config/
│   ├── assessment.ts
│   └── consultation.ts
│
└── tests/
```

# 34. Central Configuration

Centralize:

```text
assessment.limit = 3

consultation.sessions:
  MORNING   = 09:00–11:00
  AFTERNOON = 13:00–15:00
  EVENING   = 16:00–18:00

consultation.check_in_open_before_minutes = 10
consultation.psychologist_late_after_minutes = 5
consultation.psychologist_no_show_after_minutes = 15

attachment.image_max_bytes = 5 MB
attachment.pdf_max_bytes = 10 MB
attachment.max_per_message = 1

notification.reminders = [24h, 1h, 10m]
```

Avoid magic numbers.

# 35. API Boundary Guidance

Suggested API groups:

```text
/api/auth/*
/api/assessment/*
/api/reports/*
/api/consents/*
/api/psychologists/*
/api/availability/*
/api/appointments/*
/api/consultations/*
/api/consultations/:id/messages
/api/consultations/:id/attachments
/api/notifications/*
/api/chatbot/handoff/*
/api/admin/*
```

All sensitive endpoints MUST enforce object-level authorization.

# 36. Domain Errors

Prefer explicit errors:

```text
UNAUTHORIZED
FORBIDDEN
ASSESSMENT_QUOTA_EXCEEDED
NO_ACTIVE_ACADEMIC_PERIOD
ASSESSMENT_INCOMPLETE
REPORT_ACCESS_DENIED
CONSENT_REQUIRED
SLOT_NOT_AVAILABLE
SLOT_ALREADY_BOOKED
CHECK_IN_NOT_OPEN
CONSULTATION_NOT_STARTED
CONSULTATION_CLOSED
CONSULTATION_ACCESS_DENIED
ATTACHMENT_TYPE_NOT_ALLOWED
ATTACHMENT_TOO_LARGE
CHATBOT_HANDOFF_INVALID
CHATBOT_HANDOFF_EXPIRED
```

# 37. Testing Architecture

Unit tests:
```text
DASS-21 scoring
WEMWBS scoring
quota calculation
session-time logic
attachment validation
consent logic
```

Integration tests:
```text
assessment completion
booking transaction
double-booking prevention
report authorization
consultation close
attachment access
chatbot handoff
```

Negative authorization tests are mandatory.

Time-based tests SHOULD use fake/injected clock.

# 38. Deployment Architecture

Keep deployment simple:

```text
Web Application
- Next.js
- application services
- API
- optional websocket endpoint

Database
- PostgreSQL

Storage
- Private object storage

Scheduler
- cron/platform scheduler/worker

Email
- transactional provider

External Chatbot
- separate application/team
```

Avoid Kubernetes, Kafka, service mesh, microservice fleet unless later required.

# 39. Trust Boundaries

## Browser -> Server
Browser is untrusted.

Never trust client-supplied:
```text
role
user_id
quota
score
consent
slot status
session status
current time
```

## Application -> Database
Database enforces structural integrity with:
```text
FK
UNIQUE
transactions
constraints
```

## Application -> Storage
Storage is private; application controls access.

## Application -> External Chatbot
Only approved processed report context crosses this boundary.

# 40. Architecture Invariants

The coding agent MUST preserve:

```text
DASS-21 + WEMWBS = 1 assessment session
Assessment scoring = deterministic backend logic
Assessment report = private by default
Psychologist selected by participant

Fixed sessions:
09–11
13–15
16–18

1 psychologist + date + session = max 1 participant
Booking AVAILABLE slot = immediately CONFIRMED

Participant cannot end consultation
Psychologist may end early
System auto-closes at fixed session end
No write after scheduled_end_at
No follow-up because 2 hours felt insufficient

Human psychologist chat != External AI chatbot

Attachments:
JPG/JPEG/PNG/WEBP/PDF only
private storage
1 per message
not auto-shared to chatbot
```

# 41. Explicitly Prohibited Architecture Decisions

The coding agent MUST NOT:

1. introduce microservices for current scope;
2. allow frontend direct database access;
3. allow chatbot direct database access;
4. use AI for official scoring;
5. implement arbitrary psychologist time slots;
6. allow multiple participants in one psychologist fixed session;
7. allow participant to close consultation;
8. keep chat writable after session end;
9. create follow-up workflow because time was insufficient;
10. expose public consultation attachment URLs;
11. merge external chatbot data model with psychologist consultation model;
12. expose full assessment history to psychologist;
13. use admin role as universal privacy bypass;
14. add Kafka/RabbitMQ without clear need;
15. create multiple frontend applications without explicit requirement.

# 42. Implementation Decision Hierarchy

Use this priority:

```text
1. Security / Privacy
2. Business Rules
3. Functional Requirements
4. Non-Functional Requirements
5. Use Cases
6. ERD
7. System Architecture
8. Existing project conventions
9. Simplest correct implementation
```

If documents conflict, use the newest synchronized specification or flag the conflict.

# 43. Final Architecture Summary

```text
Next.js + TypeScript
        │
        ├── Participant UI
        ├── Psychologist UI
        ├── Superadmin UI
        │
        └── Server Application Layer
              │
              ├── Auth / Authorization
              ├── Assessment
              ├── Deterministic Scoring
              ├── Report
              ├── Consent
              ├── Psychologist
              ├── Availability
              ├── Appointment
              ├── Consultation
              ├── Messaging
              ├── Attachment
              ├── Notification
              ├── Chatbot Integration
              └── Audit
                    │
          ┌─────────┼─────────────┐
          │         │             │
          ▼         ▼             ▼
    PostgreSQL  Private Storage  Scheduler
                                  │
                                  ├── Reminder
                                  ├── Late / No-Show
                                  └── Auto-Close

                         Secure Handoff
                              │
                              ▼
                    External Chatbot App
```

The architecture MUST remain simple, modular, privacy-preserving, transactionally safe, and suitable for AI-assisted development.
