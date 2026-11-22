// Isolated prototype ONLY. No API, CLI job, scheduler, or production authorization.
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { expireAppointmentConsents } from "../src/lib/appointments/service";
import { consistentLifecycle } from "../src/lib/consultations/policy";
import { assertPhase3RehearsalEnvironment } from "./phase3-safety.mjs";

export async function reconcileSyntheticConsultation(appointmentId: string, authorization: "synthetic-local-only") {
  if (authorization !== "synthetic-local-only" || process.env.NODE_ENV !== "test") throw new Error("Explicit isolated reconciliation authorization required");
  assertPhase3RehearsalEnvironment(); // Reject hosted URLs before any query.
  return prisma.$transaction(async tx => {
    const marker = await tx.$queryRaw<Array<{ token: string }>>`SELECT token FROM rehearsal.identity`;
    if (marker[0]?.token !== process.env.PHASE3_REHEARSAL_TOKEN) throw new Error("Isolation identity mismatch");
    await tx.$queryRaw`SELECT id FROM public.appointments WHERE id=${appointmentId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM public.consultation_sessions WHERE appointment_id=${appointmentId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM public.consents WHERE appointment_id=${appointmentId}::uuid AND consent_type='APPOINTMENT_REPORT_ACCESS'
      AND revoked_at IS NULL AND expired_at IS NULL ORDER BY id FOR UPDATE`;
    const row = await tx.appointment.findUnique({ where: { id: appointmentId }, include: { consultationSession: true } });
    const now = new Date();
    // No-show, unstarted sessions, and reopening remain institution-policy decisions.
    if (!row || row.status !== "IN_PROGRESS" || row.scheduledEndAt > now) return { changed: false };
    if (!consistentLifecycle(row)) throw new Error("Inconsistent consultation cannot be reconciled");
    await tx.consultationSession.update({ where: { appointmentId }, data: {
      status: "COMPLETED", endedAt: row.scheduledEndAt, endedBy: "SYSTEM", endReason: "SCHEDULED_END_REACHED",
    } });
    await tx.appointment.update({ where: { id: appointmentId }, data: { status: "COMPLETED", completedAt: row.scheduledEndAt } });
    await expireAppointmentConsents(tx, appointmentId, now);
    return { changed: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
}
