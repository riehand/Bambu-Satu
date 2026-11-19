// Public appointment-list DTO: no scores, consent IDs, or Storage metadata.
export type AppointmentReportAccess =
  | { status: "AVAILABLE"; reportId: string; consentType: "APPOINTMENT_REPORT_ACCESS" | "STANDALONE_REPORT_ACCESS" }
  | { status: "CONSENT_UNAVAILABLE" | "CONSENT_EXPIRED" | "REPORT_UNAVAILABLE" };
