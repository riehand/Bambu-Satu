import "server-only";
import { gatewayMode,assertDatabaseActor,databaseTransaction } from "@/lib/dal/context";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppointmentError, expireAppointmentConsents } from "@/lib/appointments/service";
import { consultationEligibility, consistentLifecycle, developmentPolicyEnabled, DEVELOPMENT_POLICY_NOTICE, effectiveConsultationStatus, type ConsultationAction, type ConsultationRole } from "./policy";

export type ConsultationActor = { id: string; role: ConsultationRole };
const select = {
  id: true, participantId: true, psychologistId: true, status: true, scheduledStartAt: true, scheduledEndAt: true,
  participant: { select: { fullName: true } }, psychologist: { select: { fullName: true } },
  consultationSession: { select: {
    id: true, appointmentId: true, status: true, scheduledStartAt: true, scheduledEndAt: true,
    participantCheckedInAt: true, psychologistCheckedInAt: true, startedAt: true, endedAt: true, endedBy: true, endReason: true,
  } },
} satisfies Prisma.AppointmentSelect;
type Row = Prisma.AppointmentGetPayload<{ select: typeof select }>;
function scope(actor: ConsultationActor): Prisma.AppointmentWhereInput {
  if (actor.role !== "PARTICIPANT" && actor.role !== "PSYCHOLOGIST") throw new AppointmentError("FORBIDDEN", "Akses tidak diizinkan.", 403);
  return actor.role === "PARTICIPANT" ? { participantId: actor.id } : { psychologistId: actor.id };
}
async function assertActor(db: Prisma.TransactionClient, actor: ConsultationActor) {
  scope(actor);
  const profile = await db.user.findFirst({ where: { id: actor.id, role: actor.role, isActive: true }, select: { id: true } });
  if (!profile) throw new AppointmentError("FORBIDDEN", "Akses tidak diizinkan.", 403);
}
function dto(row: Row, actor: ConsultationActor, now: Date) {
  const s = row.consultationSession;
  const window = developmentPolicyEnabled();
  return {
    appointmentId: row.id, appointmentStatus: row.status,
    counterpartName: actor.role === "PARTICIPANT" ? row.psychologist.fullName : row.participant.fullName,
    scheduledStartAt: row.scheduledStartAt.toISOString(), scheduledEndAt: row.scheduledEndAt.toISOString(),
    sessionStatus: s?.status ?? null, effectiveStatus: effectiveConsultationStatus(row, now),
    participantCheckedInAt: s?.participantCheckedInAt?.toISOString() ?? null,
    psychologistCheckedInAt: s?.psychologistCheckedInAt?.toISOString() ?? null,
    startedAt: s?.startedAt?.toISOString() ?? null, endedAt: s?.endedAt?.toISOString() ?? null,
    endedBy: s?.endedBy ?? null, endReason: s?.endReason ?? null,
    history: row.scheduledEndAt <= now || !["CONFIRMED", "IN_PROGRESS"].includes(row.status),
    actions: {
      checkIn: consultationEligibility(row, actor.role, actor.role === "PARTICIPANT" ? "participant-check-in" : "psychologist-check-in", now, window),
      start: consultationEligibility(row, actor.role, "start", now, window),
      end: consultationEligibility(row, actor.role, "end", now, window),
    },
  };
}
export type ConsultationDTO = ReturnType<typeof dto>;
export type ConsultationList = { items: ConsultationDTO[]; serverNow: string; policyNotice: string };

export async function listConsultations(actor: ConsultationActor): Promise<ConsultationList> {
  if(gatewayMode())return databaseTransaction(async tx=>{
    assertDatabaseActor(actor.id,actor.role);
    const rows=await tx.appointment.findMany({where:scope(actor),include:{consultationSession:true},orderBy:[{scheduledStartAt:"asc"},{id:"asc"}]});
    const [clock]=await tx.$queryRaw<Array<{now:Date}>>`SELECT clock_timestamp() AS now`;
    const items=[];
    for(const row of rows){
      const [display]=await tx.$queryRaw<Array<{value:{counterpart:{fullName:string}}|null}>>`SELECT wb_guard.assignment_display(${row.id}::uuid) AS value`;
      if(!display.value)throw new AppointmentError("CONSULTATION_UNAVAILABLE","Identitas pihak konsultasi tidak tersedia.",503);
      const fullName=display.value.counterpart.fullName;
      items.push(dto({...row,participant:{fullName},psychologist:{fullName}},actor,clock.now));
    }
    return {items,serverNow:clock.now.toISOString(),policyNotice:DEVELOPMENT_POLICY_NOTICE};
  });
  await assertActor(prisma, actor);
  const rows = await prisma.appointment.findMany({ where: scope(actor), select, orderBy: [{ scheduledStartAt: "asc" }, { id: "asc" }] });
  const now = new Date();
  return { items: rows.map(row => dto(row, actor, now)), serverNow: now.toISOString(),
    policyNotice: developmentPolicyEnabled() ? DEVELOPMENT_POLICY_NOTICE : "Check-in dan mulai sesi menunggu persetujuan kebijakan institusi." };
}

export async function transitionConsultation(actor: ConsultationActor, appointmentId: string, action: ConsultationAction) {
  if (["hosted", "staging"].includes(process.env.WELLBEING_RUNTIME ?? "")) throw new AppointmentError("CONSULTATION_POLICY_PENDING", "Kebijakan institusi belum disetujui.", 403);
  scope(actor);
  if (gatewayMode()) return databaseTransaction(async tx=>{
    assertDatabaseActor(actor.id,actor.role);
    if(action!=="end"&&!developmentPolicyEnabled())throw new AppointmentError("CONSULTATION_POLICY_PENDING","Kebijakan institusi belum disetujui.",403);
    await tx.$queryRaw`SELECT wb_guard.transition_consultation(${appointmentId}::uuid,${action})`;
    const row=await tx.appointment.findUniqueOrThrow({where:{id:appointmentId},include:{consultationSession:true}});
    const [display]=await tx.$queryRaw<Array<{value:{counterpart:{fullName:string}}|null}>>`SELECT wb_guard.assignment_display(${appointmentId}::uuid) AS value`;
    if(!display.value)throw new AppointmentError("FORBIDDEN","Akses tidak diizinkan.",403);
    const fullName=display.value.counterpart.fullName;
    const [clock]=await tx.$queryRaw<Array<{now:Date}>>`SELECT clock_timestamp() AS now`;
    return dto({...row,participant:{fullName},psychologist:{fullName}},actor,clock.now);
  });
  return prisma.$transaction(async tx => {
    // Stable lock order: actor profile -> scoped appointment -> session -> appointment grants.
    // Recheck the authoritative profile after waiting; never trust a role from the request body.
    await tx.$queryRaw`SELECT id FROM public.users WHERE id=${actor.id}::uuid FOR SHARE`;
    await assertActor(tx, actor);
    const owner = actor.role === "PARTICIPANT" ? Prisma.sql`participant_id` : Prisma.sql`psychologist_id`;
    await tx.$queryRaw`SELECT id FROM public.appointments WHERE id=${appointmentId}::uuid AND ${owner}=${actor.id}::uuid FOR UPDATE`;
    const row = await tx.appointment.findFirst({ where: { id: appointmentId, ...scope(actor) }, select });
    if (!row) throw new AppointmentError("APPOINTMENT_NOT_FOUND", "Janji konsultasi tidak ditemukan.", 404);
    await tx.$queryRaw`SELECT id FROM public.consultation_sessions WHERE appointment_id=${appointmentId}::uuid FOR UPDATE`;
    // Refresh after both locks: no stale snapshot is used to decide a transition.
    const current = await tx.appointment.findFirst({ where: { id: appointmentId, ...scope(actor) }, select });
    if (!current || !consistentLifecycle(current)) throw new AppointmentError("CONSULTATION_INCONSISTENT", "Data sesi tidak konsisten. Hubungi pengelola.", 409);
    if (action === "end") await tx.$queryRaw`SELECT id FROM public.consents WHERE appointment_id=${appointmentId}::uuid
      AND consent_type='APPOINTMENT_REPORT_ACCESS' AND revoked_at IS NULL AND expired_at IS NULL ORDER BY id FOR UPDATE`;
    const now = new Date(); // Captured after every potentially blocking lock.
    const session = current.consultationSession!;
    const eligibility = consultationEligibility(current, actor.role, action, now, developmentPolicyEnabled());
    // A retry of our own completed transition returns the original evidence, never rewrites it.
    if (action === "end" && actor.role === "PSYCHOLOGIST" && current.status === "COMPLETED"
      && session.status === "COMPLETED" && session.endedAt && session.endedBy === "PSYCHOLOGIST"
      && session.endReason === "PSYCHOLOGIST_COMPLETED") return dto(current, actor, now);
    if (!eligibility.allowed) {
      if (eligibility.code === "ALREADY_CHECKED_IN") return dto(current, actor, now);
      throw new AppointmentError(eligibility.code!, eligibility.reason!, eligibility.code === "FORBIDDEN" ? 403 : 409);
    }
    if (action === "participant-check-in" || action === "psychologist-check-in") {
      const participant = action === "participant-check-in" ? now : session.participantCheckedInAt;
      const psychologist = action === "psychologist-check-in" ? now : session.psychologistCheckedInAt;
      await tx.consultationSession.update({ where: { id: session.id }, data: {
        participantCheckedInAt: participant, psychologistCheckedInAt: psychologist,
        status: participant && psychologist ? "READY" : "SCHEDULED",
      } });
    } else if (action === "start") {
      await tx.consultationSession.update({ where: { id: session.id }, data: { status: "IN_PROGRESS", startedAt: now } });
      await tx.appointment.update({ where: { id: appointmentId }, data: { status: "IN_PROGRESS" } });
    } else if (action === "end") {
      await tx.consultationSession.update({ where: { id: session.id }, data: { status: "COMPLETED", endedAt: now, endedBy: "PSYCHOLOGIST", endReason: "PSYCHOLOGIST_COMPLETED" } });
      await tx.appointment.update({ where: { id: appointmentId }, data: { status: "COMPLETED", completedAt: now } });
      await expireAppointmentConsents(tx, appointmentId, now);
    } else throw new AppointmentError("VALIDATION_ERROR", "Tindakan tidak valid.", 422);
    const updated = await tx.appointment.findFirst({ where: { id: appointmentId, ...scope(actor) }, select });
    return dto(updated!, actor, now);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 });
}
