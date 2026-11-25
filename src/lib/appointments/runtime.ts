import "server-only";
import { Prisma } from "@prisma/client";
import { databaseTransaction,assertDatabaseActor } from "@/lib/dal/context";
import { createAppointmentSchema,standaloneConsentSchema } from "@/lib/validations/appointment";
import { consultationSessions, jakartaDate } from "@/lib/psychologist/availability-config";
import { AppointmentError } from "./service";
import type { AppointmentReportAccess } from "@/lib/reports/contracts";
type AppointmentView = {
 appointmentId:string;status:string;scheduledStartAt:string;scheduledEndAt:string;bookedAt:string;participantNote:string|null;
 participant:{fullName:string;userType:string|null};psychologist:{id:string;fullName:string};consultationMethod:string|null;
 sessionType:string;assessmentDate:string|null;reportId?:string;assessmentSessionId?:string;canReconsent:boolean;
 consultationSession:null|{id:string;status:string;participantCheckedInAt:string|null;psychologistCheckedInAt:string|null;startedAt:string|null;endedAt:string|null;endedBy:string|null;endReason:string|null};
 reportAccess:AppointmentReportAccess;
};
export async function runtimeAppointmentViews(actorId:string,role:"PARTICIPANT"|"PSYCHOLOGIST",appointmentId?:string){
 return databaseTransaction(async tx=>{
  assertDatabaseActor(actorId,role);
  const [row]=await tx.$queryRaw<Array<{data:AppointmentView[]}>>`SELECT wb_guard.appointment_views(${appointmentId??null}::uuid) AS data`;
  return role==="PARTICIPANT" ? row.data.reverse() : row.data;
 });
}
export async function runtimeBookingReportReady(reportId:string){
 return databaseTransaction(async tx=>{
  const [row]=await tx.$queryRaw<Array<{ready:boolean}>>`SELECT wb_guard.booking_report_ready(${reportId}::uuid) AS ready`;
  return row.ready;
 });
}
export async function runtimeBooking(actorId:string,input:unknown){
 const c=createAppointmentSchema.parse(input);
 if(c.reportConsent!==true)throw new AppointmentError("REPORT_CONSENT_REQUIRED","Persetujuan berbagi laporan diperlukan untuk pemesanan.",403);
 return databaseTransaction(async tx=>{
  assertDatabaseActor(actorId,"PARTICIPANT");
  const [row]=await tx.$queryRaw<Array<{value:{appointmentId:string;consentId:string;consultationSessionId:string;status:"CONFIRMED";scheduledStartAt:string;scheduledEndAt:string}}>>`SELECT wb_guard.book_appointment(${c.psychologistId}::uuid,${c.assessmentSessionId}::uuid,${c.reportId}::uuid,${c.availabilityId}::uuid,${c.reportConsent},${c.participantNote??null}) AS value`;
  const [display]=await tx.$queryRaw<Array<{value:{id:string;fullName:string}|null}>>`SELECT wb_guard.psychologist_display(${c.psychologistId}::uuid) AS value`;
  const start=new Date(row.value.scheduledStartAt);
  const time=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(start);
  const session=consultationSessions.find(value=>value.startTime===time);
  if(!session)throw new AppointmentError("SLOT_ALREADY_BOOKED","Jadwal tidak valid; muat ulang daftar sesi.",409);
  if(!display.value)throw new AppointmentError("PSYCHOLOGIST_NOT_FOUND","Psikolog tidak tersedia.",404);
  return {...row.value,scheduledStartAt:new Date(row.value.scheduledStartAt).toISOString(),scheduledEndAt:new Date(row.value.scheduledEndAt).toISOString(),psychologist:{id:display.value.id,fullName:display.value.fullName},date:jakartaDate(start),sessionType:session.type};
 });
}
async function grant(tx:Prisma.TransactionClient,report:string,psychologist:string,appointment:string|null,affirmative:boolean){
 const [row]=await tx.$queryRaw<Array<{id:string}>>`SELECT wb_guard.grant_consent(${report}::uuid,${psychologist}::uuid,${appointment}::uuid,${affirmative}) AS id`;
 return tx.consent.findUniqueOrThrow({where:{id:row.id}});
}
export async function runtimeStandalone(actorId:string,input:unknown){
 const c=standaloneConsentSchema.parse(input);
 if(c.consent!==true)throw new AppointmentError("CONSENT_REQUIRED","Persetujuan berbagi laporan diperlukan.",403);
 return databaseTransaction(async tx=>{
  assertDatabaseActor(actorId,"PARTICIPANT");
  const report=await tx.report.findFirst({where:{id:c.reportId,assessmentSessionId:c.assessmentSessionId}});
  if(!report)throw new AppointmentError("REPORT_NOT_FOUND","Laporan tidak ditemukan.",404);
  const consent=await grant(tx,c.reportId,c.psychologistId,null,c.consent);
  return {consentId:consent.id,consentType:consent.consentType,targetUserId:consent.targetUserId,appointmentId:null,grantedAt:consent.grantedAt.toISOString()};
 });
}
export async function runtimeAppointmentConsent(actorId:string,appointmentId:string,affirmative:boolean){
 if(affirmative!==true)throw new AppointmentError("CONSENT_REQUIRED","Persetujuan berbagi laporan diperlukan.",403);
 return databaseTransaction(async tx=>{
  assertDatabaseActor(actorId,"PARTICIPANT");
  const appointment=await tx.appointment.findUnique({where:{id:appointmentId}});
  if(!appointment)throw new AppointmentError("APPOINTMENT_NOT_FOUND","Janji konsultasi tidak ditemukan.",404);
  const consent=await grant(tx,appointment.reportId,appointment.psychologistId,appointmentId,affirmative);
  return {consentId:consent.id,consentType:consent.consentType,appointmentId,grantedAt:consent.grantedAt.toISOString(),expiresAt:consent.expiresAt?.toISOString()??null};
 });
}
export async function runtimeRevoke(actorId:string,consentId:string){
 return databaseTransaction(async tx=>{
  assertDatabaseActor(actorId,"PARTICIPANT");
  const [row]=await tx.$queryRaw<Array<{at:Date}>>`SELECT wb_guard.revoke_consent(${consentId}::uuid) AS at`;
  return {consentId,revokedAt:row.at.toISOString()};
 });
}
// Database authorization evidence only; does not authorize a Storage download.
export async function authorizeReportGrant(actorId:string,reportId:string){
 return databaseTransaction(async tx=>{
  assertDatabaseActor(actorId,"PSYCHOLOGIST");
  const [row]=await tx.$queryRaw<Array<{id:string|null}>>`SELECT wb_guard.report_access(${reportId}::uuid) AS id`;
  if(!row.id)throw new AppointmentError("REPORT_NOT_FOUND","Laporan tidak ditemukan.",404);
  return {reportId,consentId:row.id};
 });
}
