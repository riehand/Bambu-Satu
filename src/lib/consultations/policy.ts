import type { AppointmentStatus, ConsultationSessionStatus } from "@prisma/client";
import { isolatedConsultationPolicy } from "./local-policy";

export type ConsultationRole = "PARTICIPANT" | "PSYCHOLOGIST";
export type ConsultationAction = "participant-check-in" | "psychologist-check-in" | "start" | "end";
export type Lifecycle = {
  id: string; status: AppointmentStatus; scheduledStartAt: Date; scheduledEndAt: Date;
  consultationSession: null | {
    appointmentId: string; status: ConsultationSessionStatus;
    scheduledStartAt: Date; scheduledEndAt: Date;
    participantCheckedInAt: Date | null; psychologistCheckedInAt: Date | null;
    startedAt: Date | null; endedAt: Date | null;
  };
};
export type Eligibility = { allowed: boolean; code: string | null; reason: string | null };
const denied = (code: string, reason: string): Eligibility => ({ allowed: false, code, reason });
const allowed: Eligibility = { allowed: true, code: null, reason: null };

// Unapproved development assumption only. No environment switch enables it in production.
export const DEVELOPMENT_POLICY_NOTICE = "Aturan check-in sementara untuk pengembangan; kebijakan institusi belum disetujui.";
export function developmentPolicyEnabled() { return isolatedConsultationPolicy(); }

export function consistentLifecycle(row: Lifecycle) {
  const s = row.consultationSession;
  if (!s || s.appointmentId !== row.id || !Number.isFinite(row.scheduledStartAt.getTime())
    || row.scheduledEndAt.getTime() - row.scheduledStartAt.getTime() !== 2 * 60 * 60 * 1000
    || s.scheduledStartAt.getTime() !== row.scheduledStartAt.getTime()
    || s.scheduledEndAt.getTime() !== row.scheduledEndAt.getTime()) return false;
  if (row.status === "IN_PROGRESS") return s.status === "IN_PROGRESS" && s.startedAt !== null && s.endedAt === null
    && s.participantCheckedInAt !== null && s.psychologistCheckedInAt !== null;
  if (row.status === "CONFIRMED") return !s.startedAt && !s.endedAt
    && (["SCHEDULED", "READY", "PARTICIPANT_LATE", "PSYCHOLOGIST_LATE"].includes(s.status))
    && (s.status !== "READY" || Boolean(s.participantCheckedInAt && s.psychologistCheckedInAt));
  return true; // Historical terminal records are displayed, never reopened.
}

export function consultationEligibility(row: Lifecycle, role: ConsultationRole, action: ConsultationAction, now: Date, developmentWindow: boolean): Eligibility {
  if ((action === "participant-check-in" && role !== "PARTICIPANT")
    || (action !== "participant-check-in" && role !== "PSYCHOLOGIST")) return denied("FORBIDDEN", "Tindakan ini tidak tersedia untuk peran Anda.");
  if (!consistentLifecycle(row)) return denied("CONSULTATION_INCONSISTENT", "Data sesi tidak konsisten. Hubungi pengelola.");
  const s = row.consultationSession!;
  if (!["CONFIRMED", "IN_PROGRESS"].includes(row.status) || s.endedAt
    || ["COMPLETED", "CLOSED", "NO_SHOW"].includes(s.status)) return denied("CONSULTATION_TERMINAL", "Konsultasi telah ditutup dan tidak dapat diubah.");
  if (now >= row.scheduledEndAt) return denied("CONSULTATION_WINDOW_ENDED", "Waktu konsultasi telah berakhir.");
  if (now < row.scheduledStartAt) return denied("CONSULTATION_NOT_OPEN", "Tindakan tersedia saat jadwal konsultasi dimulai.");
  if (["PARTICIPANT_LATE", "PSYCHOLOGIST_LATE"].includes(s.status)) return denied("CONSULTATION_POLICY_PENDING", "Penanganan keterlambatan menunggu kebijakan institusi.");
  if (action === "end") return s.status === "IN_PROGRESS" ? allowed : denied("CONSULTATION_NOT_STARTED", "Konsultasi belum dimulai.");
  if (!developmentWindow) return denied("CONSULTATION_POLICY_PENDING", "Check-in dan mulai sesi menunggu persetujuan kebijakan institusi.");
  if (action === "start") {
    if (s.startedAt) return denied("CONSULTATION_ALREADY_STARTED", "Konsultasi sudah dimulai. Muat ulang status.");
    if (!s.participantCheckedInAt || !s.psychologistCheckedInAt) return denied("CHECK_INS_REQUIRED", "Peserta dan psikolog harus check-in terlebih dahulu.");
    return allowed;
  }
  const checked = role === "PARTICIPANT" ? s.participantCheckedInAt : s.psychologistCheckedInAt;
  if (checked) return denied("ALREADY_CHECKED_IN", "Check-in Anda sudah tercatat.");
  if (s.status === "IN_PROGRESS") return denied("CONSULTATION_ALREADY_STARTED", "Konsultasi sudah dimulai.");
  return allowed;
}

export function effectiveConsultationStatus(row: Lifecycle, now: Date) {
  if (!consistentLifecycle(row)) return "INCONSISTENT";
  const s = row.consultationSession!;
  if (["CONFIRMED", "IN_PROGRESS"].includes(row.status) && !s.endedAt && now >= row.scheduledEndAt) return "WINDOW_ENDED";
  return s.status;
}
