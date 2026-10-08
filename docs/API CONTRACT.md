# API Contract — Coding Agent Specification
## Mental Well-Being Assessment Platform

**Document Type:** Coding-Agent API Contract  
**Audience:** Codex, Claude Code / Opus, Gemini, backend/frontend implementation agents  
**Status:** Synchronized with current Business Rules, FR/NFR, Use Cases, ERD, and System Architecture  
**Architecture:** Next.js + TypeScript modular monolith, PostgreSQL, Prisma, secure session-based authentication

---

# 0. Contract Principles

The coding agent MUST:

1. Treat this document as the canonical API behavior contract.
2. Preserve all authorization, privacy, ownership, consent, quota, booking, and consultation rules.
3. Perform sensitive validation server-side.
4. Return stable machine-readable domain error codes.
5. Avoid leaking sensitive data in error messages.
6. Keep external AI chatbot and human psychologist consultation APIs separated.
7. Use database transactions for race-sensitive operations such as consultation booking.
8. Use server timestamps as authoritative for check-in, message creation, session timing, and audit events.
9. Make retry-sensitive operations idempotent where specified.
10. Never use raw resource IDs alone as authorization.

---

# 1. Common API Conventions

## 1.1 Base Path

```text
/api
```

---

## 1.2 Authentication

Authenticated endpoints require a valid authenticated application session.

The server resolves:

```json
{
  "userId": "uuid",
  "role": "PARTICIPANT | PSYCHOLOGIST | SUPERADMIN"
}
```

Client-supplied `userId` or `role` MUST NOT override authenticated session identity.

---

## 1.3 Standard Success Envelope

Where practical:

```json
{
  "success": true,
  "data": {}
}
```

For collections:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

---

## 1.4 Standard Error Envelope

```json
{
  "success": false,
  "error": {
    "code": "DOMAIN_ERROR_CODE",
    "message": "Human-readable safe message",
    "field": null
  }
}
```

`field` MAY be present for validation errors.

---

## 1.5 Common HTTP Status Codes

```text
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
413 Payload Too Large
415 Unsupported Media Type
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
```

---

## 1.6 Common Error Codes

```text
UNAUTHORIZED
FORBIDDEN
VALIDATION_ERROR
RESOURCE_NOT_FOUND
RESOURCE_CONFLICT
INTERNAL_ERROR
```

---

# 2. AUTH DOMAIN

---

## API-AUTH-01 — Register Participant

### Endpoint

```http
POST /api/auth/register
```

### Actor

Unauthenticated user.

### Request

```json
{
  "fullName": "Bayudanta Yafi Setyawan",
  "userType": "STUDENT",
  "institutionalId": "102022300169",
  "phoneNumber": "+628xxxxxxxxxx",
  "email": "user@example.com",
  "password": "strong-password"
}
```

### Validation

```text
fullName: required
userType: STUDENT | LECTURER
institutionalId: required, unique
phoneNumber: required
email: required, valid email, unique
password: required, satisfy password policy
```

### Success

```http
201 Created
```

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "fullName": "Bayudanta Yafi Setyawan",
    "userType": "STUDENT",
    "institutionalId": "102022300169",
    "email": "user@example.com",
    "role": "PARTICIPANT"
  }
}
```

### Errors

```text
400 VALIDATION_ERROR
409 EMAIL_ALREADY_EXISTS
409 INSTITUTIONAL_ID_ALREADY_EXISTS
```

### Side Effects

- create `users` row;
- hash password securely;
- set `role = PARTICIPANT`.

### MUST NOT

- store plaintext password;
- allow client to choose `SUPERADMIN` or `PSYCHOLOGIST` role.

---

## API-AUTH-02 — Login

### Endpoint

```http
POST /api/auth/login
```

### Request

```json
{
  "email": "user@example.com",
  "password": "secret"
}
```

### Success

```http
200 OK
```

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "fullName": "Name",
      "role": "PARTICIPANT"
    }
  }
}
```

### Errors

```text
401 INVALID_CREDENTIALS
403 ACCOUNT_INACTIVE
```

### Notes

Session cookie/token handling depends on chosen Auth.js strategy.

---

## API-AUTH-03 — Get Current User

```http
GET /api/auth/me
```

### Actor

Any authenticated user.

### Success

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "fullName": "Name",
    "email": "user@example.com",
    "role": "PARTICIPANT",
    "userType": "STUDENT",
    "institutionalId": "1020..."
  }
}
```

Sensitive authentication fields MUST NOT be returned.

---

## API-AUTH-04 — Logout

```http
POST /api/auth/logout
```

### Actor

Authenticated user.

### Success

```http
204 No Content
```

---

# 3. ASSESSMENT DOMAIN

---

## API-ASSESS-01 — Get Assessment Quota

```http
GET /api/assessment/quota
```

### Actor

`PARTICIPANT`

### Authorization

Authenticated participant only.

### Success

```json
{
  "success": true,
  "data": {
    "academicPeriod": {
      "id": "uuid",
      "name": "2026/2027 Ganjil"
    },
    "limit": 3,
    "completed": 1,
    "remaining": 2
  }
}
```

### Errors

```text
404 NO_ACTIVE_ACADEMIC_PERIOD
```

### Rules

Only `COMPLETED` assessment sessions count.

---

## API-ASSESS-02 — Start Assessment

```http
POST /api/assessment/sessions
```

### Actor

`PARTICIPANT`

### Preconditions

- active academic period exists;
- quota remaining > 0.

### Request

No body required.

### Success

```http
201 Created
```

```json
{
  "success": true,
  "data": {
    "assessmentSessionId": "uuid",
    "status": "IN_PROGRESS",
    "academicPeriodId": "uuid",
    "startedAt": "2026-10-08T10:00:00Z"
  }
}
```

### Errors

```text
404 NO_ACTIVE_ACADEMIC_PERIOD
409 ASSESSMENT_QUOTA_EXCEEDED
409 ACTIVE_ASSESSMENT_ALREADY_EXISTS
```

### Side Effects

Creates one assessment session representing both DASS-21 and WEMWBS.

---

## API-ASSESS-03 — Get Assessment Questions

```http
GET /api/assessment/questions
```

### Actor

`PARTICIPANT`

### Query Parameters

Optional:

```text
instrument=DASS21
instrument=WEMWBS
```

### Success

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "instrument": "DASS21",
      "questionNumber": 1,
      "questionText": "...",
      "scoringDimension": "STRESS"
    }
  ]
}
```

### MUST NOT

Return hidden scoring formulas if the implementation chooses to keep them server-only.

---

## API-ASSESS-04 — Save Assessment Answers

```http
PUT /api/assessment/sessions/{sessionId}/answers
```

### Actor

`PARTICIPANT`

### Authorization

```text
assessment_session.participant_id == current_user.id
assessment_session.status == IN_PROGRESS
```

### Request

```json
{
  "answers": [
    {
      "questionId": "uuid",
      "answerValue": 2
    }
  ]
}
```

### Success

```http
200 OK
```

```json
{
  "success": true,
  "data": {
    "saved": 1
  }
}
```

### Errors

```text
403 ASSESSMENT_ACCESS_DENIED
409 ASSESSMENT_ALREADY_COMPLETED
422 INVALID_ANSWER_VALUE
```

### Idempotency

Same `(assessmentSessionId, questionId)` SHOULD upsert rather than duplicate.

---

## API-ASSESS-05 — Get In-Progress Assessment

```http
GET /api/assessment/sessions/{sessionId}
```

### Actor

`PARTICIPANT`

### Authorization

Own session only.

### Success

Returns session status plus already saved answers.

---

## API-ASSESS-06 — Final Submit Assessment

```http
POST /api/assessment/sessions/{sessionId}/submit
```

### Actor

`PARTICIPANT`

### Authorization

Own `IN_PROGRESS` session only.

### Preconditions

- all required DASS-21 answers present;
- all required WEMWBS answers present.

### Success

```http
200 OK
```

```json
{
  "success": true,
  "data": {
    "assessmentSessionId": "uuid",
    "status": "COMPLETED",
    "completedAt": "2026-10-08T10:30:00Z",
    "scores": {
      "depression": {
        "score": 8,
        "category": "..."
      },
      "anxiety": {
        "score": 6,
        "category": "..."
      },
      "stress": {
        "score": 10,
        "category": "..."
      },
      "wemwbs": {
        "score": 49
      }
    },
    "reportId": "uuid"
  }
}
```

### Errors

```text
403 ASSESSMENT_ACCESS_DENIED
409 ASSESSMENT_ALREADY_COMPLETED
422 ASSESSMENT_INCOMPLETE
```

### Transaction / Idempotency

MUST be idempotent.

Logical atomic flow:

```text
validate answers
→ calculate deterministic scores
→ persist assessment_scores
→ mark assessment COMPLETED
→ create report metadata
```

Retry MUST NOT:
- consume quota twice;
- create duplicate score;
- create duplicate report.

---

## API-ASSESS-07 — Assessment History

```http
GET /api/assessment/history
```

### Actor

`PARTICIPANT`

### Success

```json
{
  "success": true,
  "data": [
    {
      "assessmentSessionId": "uuid",
      "completedAt": "2026-10-08T10:30:00Z",
      "reportId": "uuid",
      "scores": {
        "depressionScore": 8,
        "anxietyScore": 6,
        "stressScore": 10,
        "wemwbsScore": 49
      }
    }
  ]
}
```

### Rule

No automatic clinical trend interpretation.

---

# 4. REPORT DOMAIN

---

## API-REPORT-01 — Get Current Report

```http
GET /api/reports/{reportId}
```

### Actors

- owning `PARTICIPANT`;
- assigned `PSYCHOLOGIST` with valid scoped consent.

### Authorization

Participant:

```text
report.assessment_session.participant_id == current_user.id
```

Psychologist:

```text
appointment.psychologist_id == current_user.id
AND appointment.report_id == report.id
AND valid PSYCHOLOGIST_REPORT_ACCESS consent exists
```

### Success

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "assessmentSessionId": "uuid",
    "assessmentDate": "2026-10-08T10:30:00Z",
    "scores": {
      "depression": {
        "score": 8,
        "category": "..."
      },
      "anxiety": {
        "score": 6,
        "category": "..."
      },
      "stress": {
        "score": 10,
        "category": "..."
      },
      "wemwbs": {
        "score": 49
      }
    },
    "disclaimer": "This result is not a clinical diagnosis."
  }
}
```

### Errors

```text
403 REPORT_ACCESS_DENIED
404 REPORT_NOT_FOUND
```

---

## API-REPORT-02 — Download Report PDF

```http
GET /api/reports/{reportId}/download
```

### Actors

Same authorization as `API-REPORT-01`.

### Success

Either:
- streamed PDF; or
- short-lived signed URL.

### MUST NOT

Return permanent public URL.

---

# 5. CONSENT DOMAIN

---

## API-CONSENT-01 — Grant Psychologist Report Consent

```http
POST /api/consents/psychologist-report
```

### Actor

`PARTICIPANT`

### Request

```json
{
  "assessmentSessionId": "uuid",
  "reportId": "uuid",
  "psychologistId": "uuid"
}
```

### Server Validation

```text
participant owns assessment
participant owns report
report belongs to assessment
psychologist role valid
```

### Success

```http
201 Created
```

```json
{
  "success": true,
  "data": {
    "consentId": "uuid",
    "consentType": "PSYCHOLOGIST_REPORT_ACCESS",
    "targetUserId": "uuid",
    "grantedAt": "..."
  }
}
```

---

## API-CONSENT-02 — Grant Psychologist Contact Consent

```http
POST /api/consents/psychologist-contact
```

### Actor

`PARTICIPANT`

### Request

```json
{
  "assessmentSessionId": "uuid",
  "reportId": "uuid",
  "psychologistId": "uuid"
}
```

### Success

Creates `PSYCHOLOGIST_CONTACT_ACCESS`.

---

## API-CONSENT-03 — Grant Chatbot Report Consent

```http
POST /api/consents/chatbot-report
```

### Actor

`PARTICIPANT`

### Request

```json
{
  "assessmentSessionId": "uuid",
  "reportId": "uuid"
}
```

### Success

Creates `CHATBOT_REPORT_ACCESS`.

---

## API-CONSENT-04 — List Own Consents

```http
GET /api/consents
```

### Actor

`PARTICIPANT`

### Success

Returns participant's own consent records.

---

## API-CONSENT-05 — Revoke Consent

```http
POST /api/consents/{consentId}/revoke
```

### Actor

`PARTICIPANT`

### Authorization

Own consent only.

### Success

```http
200 OK
```

```json
{
  "success": true,
  "data": {
    "consentId": "uuid",
    "revokedAt": "..."
  }
}
```

### Note

Revocation effect on already-completed appointments/chatbot sessions must follow the latest business rules. The coding agent MUST NOT invent retrospective deletion behavior.

---

# 6. PSYCHOLOGIST DOMAIN

---

## API-PSY-01 — List Psychologists

```http
GET /api/psychologists
```

### Actor

`PARTICIPANT`

### Query Parameters

Optional:

```text
page
limit
focus
language
```

### Success

```json
{
  "success": true,
  "data": [
    {
      "id": "psychologist-user-uuid",
      "fullName": "Dr. Example",
      "professionalTitle": "Psikolog",
      "qualification": "...",
      "shortBio": "...",
      "areasOfFocus": ["stress", "academic pressure"],
      "languages": ["Indonesian"],
      "profilePhotoUrl": "/authorized-profile-photo"
    }
  ]
}
```

---

## API-PSY-02 — Get Psychologist Detail

```http
GET /api/psychologists/{psychologistId}
```

### Actor

`PARTICIPANT`

### Success

Returns professional profile only.

### MUST NOT

Expose private account/security information.

---

## API-PSY-03 — Get Own Psychologist Profile

```http
GET /api/psychologist/profile
```

### Actor

`PSYCHOLOGIST`

---

## API-PSY-04 — Update Own Psychologist Profile

```http
PATCH /api/psychologist/profile
```

### Actor

`PSYCHOLOGIST`

### Request Example

```json
{
  "professionalTitle": "Psikolog",
  "qualification": "...",
  "education": "...",
  "shortBio": "...",
  "areasOfFocus": ["stress", "anxiety"],
  "consultationMethod": "IN_APP_CHAT",
  "consultationLocation": null,
  "languages": ["Indonesian", "English"]
}
```

### Authorization

Own profile only.

---

# 7. AVAILABILITY DOMAIN

---

## API-AVAIL-01 — Participant View Psychologist Availability

```http
GET /api/psychologists/{psychologistId}/availability
```

### Actor

`PARTICIPANT`

### Query

```text
date=2026-10-10
```

or optional date range:

```text
from=2026-10-10
to=2026-10-17
```

### Success

```json
{
  "success": true,
  "data": [
    {
      "availabilityId": "uuid",
      "date": "2026-10-10",
      "sessionType": "MORNING",
      "startTime": "09:00",
      "endTime": "11:00",
      "status": "AVAILABLE"
    }
  ]
}
```

### Security

Participant only needs public booking availability.

---

## API-AVAIL-02 — Psychologist View Own Availability

```http
GET /api/psychologist/availability
```

### Actor

`PSYCHOLOGIST`

---

## API-AVAIL-03 — Set Own Daily Availability

```http
PUT /api/psychologist/availability/{date}
```

### Actor

`PSYCHOLOGIST`

### Request

```json
{
  "sessions": [
    {
      "sessionType": "MORNING",
      "available": true
    },
    {
      "sessionType": "AFTERNOON",
      "available": false
    },
    {
      "sessionType": "EVENING",
      "available": true
    }
  ]
}
```

### Success

```http
200 OK
```

### Errors

```text
409 AVAILABILITY_ALREADY_BOOKED
422 INVALID_SESSION_TYPE
```

### MUST NOT

- create arbitrary start/end time;
- mark a booked slot free without approved cancellation/reschedule flow.

---

# 8. APPOINTMENT DOMAIN

---

## API-APPT-01 — Create Appointment

```http
POST /api/appointments
```

### Actor

`PARTICIPANT`

### Request

```json
{
  "psychologistId": "uuid",
  "assessmentSessionId": "uuid",
  "reportId": "uuid",
  "availabilityId": "uuid",
  "participantNote": "Saya ingin membahas tekanan akademik yang saya rasakan akhir-akhir ini."
}
```

### Preconditions

```text
assessment completed
report exists
participant owns assessment/report
psychologist active
selected availability == AVAILABLE
valid PSYCHOLOGIST_REPORT_ACCESS consent
contact consent if phone contact will be used
participantNote <= 500 chars
```

### Success

```http
201 Created
```

```json
{
  "success": true,
  "data": {
    "appointmentId": "uuid",
    "status": "CONFIRMED",
    "psychologist": {
      "id": "uuid",
      "fullName": "Dr. Example"
    },
    "date": "2026-10-10",
    "sessionType": "MORNING",
    "scheduledStartAt": "2026-10-10T09:00:00+07:00",
    "scheduledEndAt": "2026-10-10T11:00:00+07:00"
  }
}
```

### Errors

```text
400 PARTICIPANT_NOTE_TOO_LONG
403 REPORT_CONSENT_REQUIRED
403 CONTACT_CONSENT_REQUIRED
409 SLOT_NOT_AVAILABLE
409 SLOT_ALREADY_BOOKED
409 APPOINTMENT_CONFLICT
```

### Transaction

MUST be atomic:

```text
lock/check availability
→ create CONFIRMED appointment
→ mark availability BOOKED
→ create consultation_session
```

### No Approval Step

Successful booking is immediately `CONFIRMED`.

---

## API-APPT-02 — Participant List Own Appointments

```http
GET /api/appointments
```

### Actor

`PARTICIPANT`

### Query

Optional:

```text
status
page
limit
```

---

## API-APPT-03 — Psychologist List Own Appointments

```http
GET /api/psychologist/appointments
```

### Actor

`PSYCHOLOGIST`

### Data Returned

Need-to-know only:

```json
{
  "appointmentId": "uuid",
  "participant": {
    "fullName": "Participant Name",
    "userType": "STUDENT"
  },
  "assessmentDate": "...",
  "participantNote": "...",
  "scheduledStartAt": "...",
  "scheduledEndAt": "...",
  "status": "CONFIRMED"
}
```

NIM/NIP MUST NOT be exposed by default.

---

## API-APPT-04 — Get Appointment Detail

```http
GET /api/appointments/{appointmentId}
```

### Actors

- appointment participant;
- assigned psychologist.

### Authorization

Caller must be one of appointment parties.

---

## API-APPT-05 — Reschedule Failed/No-Show Appointment

```http
POST /api/appointments/{appointmentId}/reschedule
```

### Actor

`PARTICIPANT`

### Preconditions

Appointment qualifies for recovery:

```text
CANCELLED
or
NO_SHOW / failed due to psychologist absence
```

### Request

```json
{
  "newAvailabilityId": "uuid"
}
```

### Errors

```text
409 RESCHEDULE_NOT_ALLOWED
409 SLOT_ALREADY_BOOKED
```

### Rule

This is recovery, NOT follow-up consultation.

---

# 9. CONSULTATION CHAT DOMAIN

---

## API-CONSULT-01 — Get Consultation Session

```http
GET /api/consultations/{consultationSessionId}
```

### Actors

- appointment participant;
- assigned psychologist.

### Success

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "appointmentId": "uuid",
    "status": "SCHEDULED",
    "scheduledStartAt": "...",
    "scheduledEndAt": "...",
    "participantCheckedInAt": null,
    "psychologistCheckedInAt": null,
    "startedAt": null,
    "endedAt": null,
    "endedBy": null,
    "endReason": null,
    "permissions": {
      "canCheckIn": true,
      "canSendMessage": false,
      "canUploadAttachment": false,
      "canEndConsultation": false
    }
  }
}
```

### Note

Permissions are convenience UI hints only. Backend authorization remains authoritative.

---

## API-CONSULT-02 — Check In

```http
POST /api/consultations/{consultationSessionId}/check-in
```

### Actors

`PARTICIPANT` or assigned `PSYCHOLOGIST`

### Preconditions

```text
appointment confirmed
caller is appointment party
current server time within valid check-in window
```

### Success

```json
{
  "success": true,
  "data": {
    "checkedInAt": "...",
    "role": "PARTICIPANT"
  }
}
```

### Errors

```text
403 CONSULTATION_ACCESS_DENIED
409 CHECK_IN_NOT_OPEN
409 CONSULTATION_CLOSED
```

### Idempotency

Repeated check-in SHOULD be idempotent.

---

## API-CONSULT-03 — Get Consultation Messages

```http
GET /api/consultations/{consultationSessionId}/messages
```

### Actors

Appointment parties only.

### Query

Optional cursor pagination:

```text
cursor
limit
```

### Success

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "messageType": "TEXT",
      "sender": {
        "id": "uuid",
        "role": "PARTICIPANT"
      },
      "content": "Saya ingin membahas...",
      "sentAt": "...",
      "attachment": null
    }
  ]
}
```

---

## API-CONSULT-04 — Send Text Message

```http
POST /api/consultations/{consultationSessionId}/messages
```

### Actors

Appointment participant or assigned psychologist.

### Request

```json
{
  "content": "Pesan konsultasi"
}
```

### Guards

```text
caller belongs to appointment
session writable
now < scheduled_end_at
session not closed
```

### Success

```http
201 Created
```

```json
{
  "success": true,
  "data": {
    "messageId": "uuid",
    "content": "Pesan konsultasi",
    "sentAt": "server timestamp"
  }
}
```

### Errors

```text
403 CONSULTATION_ACCESS_DENIED
409 CONSULTATION_NOT_STARTED
409 CONSULTATION_CLOSED
422 EMPTY_MESSAGE
```

---

## API-CONSULT-05 — Psychologist End Consultation Early

```http
POST /api/consultations/{consultationSessionId}/end
```

### Actor

Assigned `PSYCHOLOGIST` only.

### Request

No body required.

### Guards

```text
caller == appointment.psychologist_id
session IN_PROGRESS
now < scheduled_end_at
session not already closed
```

### Success

```json
{
  "success": true,
  "data": {
    "status": "CLOSED",
    "endedAt": "...",
    "endedBy": "PSYCHOLOGIST",
    "endReason": "PSYCHOLOGIST_COMPLETED"
  }
}
```

### Errors

```text
403 CONSULTATION_END_NOT_ALLOWED
409 CONSULTATION_ALREADY_CLOSED
```

### MUST NOT

Expose equivalent participant endpoint.

---

## API-CONSULT-06 — System Auto-Close

Internal system operation, not public participant API.

Conceptual internal call:

```text
closeExpiredConsultationSessions()
```

Condition:

```text
scheduled_end_at <= now
AND session not closed
```

Result:

```text
ended_by = SYSTEM
end_reason = SCHEDULED_END_REACHED
```

Must be idempotent.

---

# 10. ATTACHMENT DOMAIN

---

## API-ATTACH-01 — Upload Consultation Attachment

Recommended multipart endpoint:

```http
POST /api/consultations/{consultationSessionId}/attachments
Content-Type: multipart/form-data
```

### Actors

Appointment participant or assigned psychologist.

### Fields

```text
file
optionalText
```

### Allowed

```text
.jpg
.jpeg
.png
.webp
.pdf
```

MIME:

```text
image/jpeg
image/png
image/webp
application/pdf
```

### Limits

```text
Image <= 5 MB
PDF <= 10 MB
Maximum 1 attachment per message
```

### Guards

```text
caller is appointment party
session writable
now < scheduled_end_at
extension allowed
MIME allowed and consistent
size allowed
```

### Success

```http
201 Created
```

```json
{
  "success": true,
  "data": {
    "messageId": "uuid",
    "attachment": {
      "id": "uuid",
      "originalFileName": "image.png",
      "mimeType": "image/png",
      "fileSize": 1200000
    },
    "sentAt": "..."
  }
}
```

### Errors

```text
403 ATTACHMENT_ACCESS_DENIED
409 CONSULTATION_CLOSED
413 ATTACHMENT_TOO_LARGE
415 ATTACHMENT_TYPE_NOT_ALLOWED
422 ATTACHMENT_MIME_MISMATCH
```

### Storage

Must use generated private object key.

MUST NOT expose permanent public URL.

---

## API-ATTACH-02 — Download/View Attachment

```http
GET /api/consultation-attachments/{attachmentId}
```

### Actors

Appointment participant or assigned psychologist.

### Authorization Path

```text
attachment
→ message
→ consultation session
→ appointment
→ caller must be appointment party
```

### Success

Return:
- streamed file; or
- short-lived signed URL.

---

# 11. NOTIFICATION DOMAIN

---

## API-NOTIFY-01 — List Own Notifications

```http
GET /api/notifications
```

### Actor

Any authenticated user.

### Query

```text
unreadOnly=true|false
page
limit
```

### Success

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "APPOINTMENT_REMINDER_1H",
      "title": "Consultation Reminder",
      "message": "...",
      "readAt": null,
      "createdAt": "..."
    }
  ]
}
```

---

## API-NOTIFY-02 — Mark Notification Read

```http
POST /api/notifications/{notificationId}/read
```

### Actor

Notification owner only.

### Success

```http
200 OK
```

---

## Notification Background Events

Internal services/jobs MAY generate:

```text
APPOINTMENT_REMINDER_24H
APPOINTMENT_REMINDER_1H
APPOINTMENT_REMINDER_10M
PSYCHOLOGIST_LATE_REMINDER
```

No public endpoint should allow arbitrary users to generate system reminders.

---

# 12. ADMIN DOMAIN

---

## API-ADMIN-01 — List Users

```http
GET /api/admin/users
```

### Actor

`SUPERADMIN`

### Query

```text
role
status
search
page
limit
```

### Data

Administrative identity/account metadata only.

### MUST NOT

Include individual psychological report content by default.

---

## API-ADMIN-02 — Get User Administrative Detail

```http
GET /api/admin/users/{userId}
```

### Actor

`SUPERADMIN`

### Response MAY include

```text
identity
role
user type
account status
created_at
```

### MUST NOT include by default

```text
assessment report content
consultation messages
attachments
```

---

## API-ADMIN-03 — Update User Status

```http
PATCH /api/admin/users/{userId}/status
```

### Actor

`SUPERADMIN`

### Request

```json
{
  "isActive": false
}
```

---

## API-ADMIN-04 — Create/Manage Psychologist Account

```http
POST /api/admin/psychologists
```

### Actor

`SUPERADMIN`

### Request Example

```json
{
  "fullName": "Psychologist Name",
  "email": "psy@example.com",
  "phoneNumber": "+62...",
  "temporaryPassword": "..."
}
```

### Success

Creates user with:

```text
role = PSYCHOLOGIST
```

### Security

Temporary-password workflow may vary, but plaintext password must not persist.

---

## API-ADMIN-05 — List Academic Periods

```http
GET /api/admin/academic-periods
```

### Actor

`SUPERADMIN`

---

## API-ADMIN-06 — Create Academic Period

```http
POST /api/admin/academic-periods
```

### Actor

`SUPERADMIN`

### Request

```json
{
  "name": "2026/2027 Ganjil",
  "startDate": "2026-08-01",
  "endDate": "2027-01-31",
  "assessmentLimit": 3,
  "status": "ACTIVE"
}
```

### Validation

Prefer at most one active period.

---

## API-ADMIN-07 — Update Academic Period

```http
PATCH /api/admin/academic-periods/{periodId}
```

### Actor

`SUPERADMIN`

### Request MAY include

```json
{
  "name": "2026/2027 Ganjil",
  "startDate": "2026-08-01",
  "endDate": "2027-01-31",
  "assessmentLimit": 3,
  "status": "ACTIVE"
}
```

---

## API-ADMIN-08 — Get Aggregate Statistics

```http
GET /api/admin/statistics
```

### Actor

`SUPERADMIN`

### Allowed Aggregate Data

Examples:

```json
{
  "success": true,
  "data": {
    "participants": 1200,
    "completedAssessments": 380,
    "appointments": 75,
    "activePsychologists": 12
  }
}
```

### Privacy Rule

Prefer aggregated/de-identified statistics.

Do not return individual report content.

---

## API-ADMIN-09 — Get Audit Logs

```http
GET /api/admin/audit-logs
```

### Actor

`SUPERADMIN`

### Query

```text
action
actorUserId
from
to
page
limit
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "actorUserId": "uuid",
      "action": "APPOINTMENT_CREATED",
      "targetType": "APPOINTMENT",
      "targetId": "uuid",
      "createdAt": "..."
    }
  ]
}
```

### MUST NOT

Return:
- full chat content;
- password/token;
- attachment binary;
- full assessment report.

---

# 13. CHATBOT HANDOFF DOMAIN

---

## API-CHATBOT-01 — Create Chatbot Handoff

```http
POST /api/chatbot/handoffs
```

### Actor

`PARTICIPANT`

### Request

```json
{
  "assessmentSessionId": "uuid",
  "reportId": "uuid"
}
```

### Preconditions

```text
participant owns assessment
participant owns report
assessment completed
valid CHATBOT_REPORT_ACCESS consent exists
```

### Success

```http
201 Created
```

```json
{
  "success": true,
  "data": {
    "handoffId": "uuid",
    "redirectUrl": "https://external-chatbot.example/...opaque-handoff-token...",
    "expiresAt": "2026-10-08T11:00:00Z"
  }
}
```

### Errors

```text
403 CHATBOT_CONSENT_REQUIRED
403 REPORT_ACCESS_DENIED
409 CHATBOT_HANDOFF_ALREADY_ACTIVE
```

### Security

Raw token should be shown only at creation/redirect time.

Database SHOULD store a token hash rather than plaintext token.

---

## API-CHATBOT-02 — Resolve Handoff Context

Server-to-server endpoint.

```http
POST /api/integrations/chatbot/handoff/resolve
```

### Actor

Trusted External Chatbot System.

### Authentication

Must use approved integration authentication, for example:
- signed request;
- service credential;
- mutually agreed token;
- other secure mechanism.

The handoff token alone MUST still be validated and scoped.

### Request

```json
{
  "handoffToken": "opaque-token"
}
```

### Success

```json
{
  "success": true,
  "data": {
    "assessment": {
      "assessmentDate": "2026-10-08T10:30:00Z",
      "depression": {
        "score": 8,
        "category": "..."
      },
      "anxiety": {
        "score": 6,
        "category": "..."
      },
      "stress": {
        "score": 10,
        "category": "..."
      },
      "wemwbs": {
        "score": 49
      }
    },
    "disclaimer": "Assessment results are not a clinical diagnosis."
  }
}
```

### MUST NOT Return by Default

```text
raw DASS-21 answers
raw WEMWBS answers
assessment history
phone number
NIM/NIP
consultation messages
consultation attachments
other participant records
```

### Errors

```text
401 INTEGRATION_UNAUTHORIZED
404 CHATBOT_HANDOFF_INVALID
410 CHATBOT_HANDOFF_EXPIRED
409 CHATBOT_HANDOFF_ALREADY_USED
```

### Side Effect

If single-use policy is chosen:

```text
status -> USED
used_at -> server timestamp
```

Exact one-time vs reusable-until-expiry behavior must be configured consistently; agent must not silently choose conflicting behavior.

---

# 14. INTERNAL BACKGROUND OPERATIONS

These are NOT public APIs but are part of system contract.

---

## JOB-01 — Appointment Reminder Job

Runs periodically.

Find:

```text
upcoming confirmed appointments
with reminder threshold reached
and reminder not already sent
```

Generate:

```text
H-24h
H-1h
H-10m
```

Must be idempotent.

---

## JOB-02 — Psychologist Late / No-Show Job

Rules:

```text
+5 min without psychologist check-in
→ PSYCHOLOGIST_LATE

+15 min without psychologist check-in
→ NO_SHOW / recovery flow
```

Must use server time.

---

## JOB-03 — Consultation Auto-Close Job

Find:

```text
scheduled_end_at <= now
AND session not closed
```

Then:

```text
status -> CLOSED
ended_at -> server time
ended_by -> SYSTEM
end_reason -> SCHEDULED_END_REACHED
```

Must be idempotent and race-safe against psychologist early close.

---

# 15. Authorization Matrix

| Domain | Participant | Psychologist | Superadmin | External Chatbot |
|---|---|---|---|---|
| Register/Login | Own | Login | Login | No |
| Assessment | Own | No | No individual content by default | No |
| Report | Own | Scoped consent + appointment | No default content access | Scoped handoff only |
| Consent | Own | No | No | No |
| Psychologist Directory | View | Own profile | Manage | No |
| Availability | View public | Manage own | Optional admin oversight | No |
| Appointment | Own | Assigned only | Admin metadata only | No |
| Consultation | Own appointment | Assigned appointment | No default access | No |
| Attachment | Own appointment | Assigned appointment | No default access | No |
| Notification | Own | Own | Own/admin system | No |
| Academic Period | Read indirectly | Read indirectly | Manage | No |
| Audit | No | No | Yes | No |
| Chatbot Context | Initiate own | No | No | Scoped integration |

---

# 16. Object-Level Authorization Rules

The coding agent MUST implement these explicitly.

## Assessment

```text
assessment.participant_id == current_user.id
```

## Report — Participant

```text
report.assessment_session.participant_id == current_user.id
```

## Report — Psychologist

```text
appointment.psychologist_id == current_user.id
AND
appointment.report_id == requested_report.id
AND
valid PSYCHOLOGIST_REPORT_ACCESS consent exists
```

## Appointment

```text
current_user.id == appointment.participant_id
OR
current_user.id == appointment.psychologist_id
```

## Consultation

```text
consultation.appointment.participant_id == current_user.id
OR
consultation.appointment.psychologist_id == current_user.id
```

## Attachment

Authorization is inherited through:

```text
attachment
→ message
→ consultation
→ appointment
```

## Availability Management

```text
availability.psychologist_id == current_user.id
```

---

# 17. Idempotency Rules

Operations that SHOULD/MUST be idempotent:

```text
assessment final submit
participant/psychologist check-in
consultation auto-close
psychologist manual close
notification job
late/no-show job
chatbot handoff expiration cleanup
```

Operations that require concurrency protection:

```text
appointment booking
availability booking
consultation closure
```

---

# 18. Privacy and Data Minimization

API responses MUST return only fields necessary for the caller.

Psychologist participant view SHOULD contain:

```text
full name
participant type
current consented report
assessment date
participant note
appointment/session info
phone only if contact consent applies
```

Psychologist SHOULD NOT receive by default:

```text
full assessment history
unrelated reports
unrelated personal profile
NIM/NIP unless operationally required
```

Superadmin SHOULD NOT receive by default:

```text
individual report content
consultation messages
attachments
```

---

# 19. API Security Requirements

The coding agent MUST:

1. validate request body server-side;
2. enforce authentication;
3. enforce role authorization;
4. enforce object authorization;
5. apply rate limiting where appropriate to auth/upload/integration endpoints;
6. protect against CSRF when using cookie-based state-changing requests;
7. store integration secrets only server-side;
8. never expose password hashes;
9. never log raw chatbot handoff tokens;
10. never log file binary;
11. never trust MIME from client without server-side validation;
12. avoid predictable public storage paths;
13. sanitize error messages.

---

# 20. Suggested API Grouping

```text
/api/auth/*
/api/assessment/*
/api/reports/*
/api/consents/*
/api/psychologists/*
/api/psychologist/*
/api/appointments/*
/api/consultations/*
/api/consultation-attachments/*
/api/notifications/*
/api/chatbot/*
/api/integrations/chatbot/*
/api/admin/*
```

---

# 21. Explicitly Prohibited API Behavior

The coding agent MUST NOT implement:

1. `GET /api/admin/reports/{id}` as unrestricted superadmin report access;
2. direct chatbot DB access;
3. participant endpoint to manually close consultation;
4. arbitrary consultation start/end-time submission;
5. assessment score submitted by client;
6. report access based only on report ID;
7. attachment download based only on attachment ID without ownership check;
8. multi-participant booking of the same fixed slot;
9. chatbot context containing human consultation content by default;
10. automatic follow-up appointment endpoint because the 2-hour session felt insufficient;
11. file upload types beyond approved JPG/JPEG/PNG/WEBP/PDF;
12. permanent public URLs for reports or consultation attachments.

---

# 22. Recommended Next Artifact

After this API Contract, the next implementation document SHOULD be:

```text
UI/UX Flow — Coding Agent
```

It should map:
- page/route;
- user action;
- API endpoint called;
- loading state;
- empty state;
- validation;
- error state;
- success state;
- navigation transition;
- role-specific visibility.

This prevents frontend agents from inventing flows that contradict the API or business rules.
