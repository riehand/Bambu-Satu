import "server-only";
import { databaseTransaction,assertDatabaseActor,inDatabaseTransaction,DalError } from "@/lib/dal/context";
import { AppointmentError } from "@/lib/appointments/service";
import type { ConsultationActor } from "./service";
import type { ChatCommand,ChatQuery } from "@/lib/validations/chat";
import type { ChatMessage } from "./chat-service";
type GatewayMessage=ChatMessage;
const iso=(value:string)=>new Date(value).toISOString();
const encode=(appointmentId:string,m:{id:string;createdAt:string})=>Buffer.from(JSON.stringify({appointmentId,id:m.id,at:iso(m.createdAt)})).toString("base64url");
export async function runtimeChatRead(actor:ConsultationActor,appointmentId:string,query:ChatQuery,cursor:{id:string}|null){
 return databaseTransaction(async tx=>{
  assertDatabaseActor(actor.id,actor.role);
  const [row]=await tx.$queryRaw<Array<{value:{items:GatewayMessage[];nextCursor:string|null;latestCursor:string|null}}>>`SELECT wb_guard.read_messages(${appointmentId}::uuid,${query.limit}::integer,${cursor?.id??null}::uuid,${query.after?"after":"before"}) AS value`;
  const items=row.value.items.map(m=>({...m,createdAt:iso(m.createdAt)}));
  const next=items.find(m=>m.id===row.value.nextCursor);
  const latest=items.find(m=>m.id===row.value.latestCursor);
  const a=await tx.appointment.findUniqueOrThrow({where:{id:appointmentId},select:{scheduledEndAt:true}});
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>`SELECT clock_timestamp() AS now`;
  if(clock.now>=a.scheduledEndAt)throw new AppointmentError("CHAT_CLOSED","Waktu konsultasi telah berakhir.",409);
  return {items,nextCursor:next?encode(appointmentId,next):null,latestCursor:latest?encode(appointmentId,latest):query.after??null,canSend:true,scheduledEndAt:a.scheduledEndAt.toISOString(),serverNow:clock.now.toISOString()};
 });
}
export async function runtimeChatSend(actor:ConsultationActor,appointmentId:string,command:ChatCommand){
 // A nested transaction cannot provide a truthful post-COMMIT acknowledgement.
 if(inDatabaseTransaction())throw new AppointmentError("CHAT_SEND_FAILED","Pengiriman membutuhkan batas commit tersendiri.",409);
 try{
  const result=await databaseTransaction(async tx=>{
   assertDatabaseActor(actor.id,actor.role);
   const [row]=await tx.$queryRaw<Array<{value:{id:string;body:string;createdAt:string;clientMessageId:string;replayed:boolean}}>>`SELECT wb_guard.send_message(${appointmentId}::uuid,${command.clientMessageId}::uuid,${command.body}) AS value`;
   return {message:{id:row.value.id,body:row.value.body,createdAt:iso(row.value.createdAt),clientMessageId:row.value.clientMessageId,own:true,senderRole:actor.role},replayed:row.value.replayed};
  });
  const ok=await databaseTransaction(async tx=>{
   assertDatabaseActor(actor.id,actor.role);
   const [row]=await tx.$queryRaw<Array<{ok:boolean}>>`SELECT wb_guard.confirm_message(${appointmentId}::uuid,${result.message.id}::uuid,${command.clientMessageId}::uuid) AS ok`;
   return row.ok;
  });
  if(!ok)throw new Error("Unconfirmed");
  return result;
 }catch(error){
  if(error instanceof AppointmentError)throw error;
  if(error instanceof DalError && error.code==="IDEMPOTENCY_CONFLICT")throw new AppointmentError("IDEMPOTENCY_CONFLICT","Kunci pengiriman sudah dipakai untuk pesan berbeda.",409);
  throw new AppointmentError("CHAT_SEND_FAILED","Pesan belum dapat dikonfirmasi. Muat ulang status atau coba kirim ulang pesan yang sama.",409);
 }
}
