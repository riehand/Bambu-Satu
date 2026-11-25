// TEST ONLY: isolated gateway adapter, not a production DAL integration.
import { chatCommand } from "@/lib/validations/chat";
import { createAppointmentSchema } from "@/lib/validations/appointment";
import { consultationParams } from "@/lib/validations/consultation";
import { developmentPolicyEnabled } from "@/lib/consultations/policy";
import { signedTransaction } from "./stage3e1b-context";
export async function bookTrustedAppointment(input:unknown) {
  const c=createAppointmentSchema.parse(input);
  return signedTransaction(async tx=>(await tx.$queryRaw<Array<{value:Record<string,string>}>>`SELECT wb_guard.book_appointment(${c.psychologistId}::uuid,${c.assessmentSessionId}::uuid,${c.reportId}::uuid,${c.availabilityId}::uuid,${c.reportConsent},${c.participantNote??null}) AS value`)[0].value);
}
export async function transitionTrustedConsultation(input:unknown) {
  const c=consultationParams.parse(input);
  if(!developmentPolicyEnabled())throw new Error("CONSULTATION_POLICY_PENDING");
  return signedTransaction(async tx=>(await tx.$queryRaw<Array<{value:Record<string,string>}>>`SELECT wb_guard.transition_consultation(${c.appointmentId}::uuid,${c.action}) AS value`)[0].value);
}
export async function sendTrustedMessage(appointmentId:string,input:unknown,afterInsert?:()=>Promise<void>) {
  const command=chatCommand.parse(input);
  const message=await signedTransaction(async tx=>{
    const [row]=await tx.$queryRaw<Array<{value:{id:string;body:string;replayed:boolean}}>>`SELECT wb_guard.send_message(${appointmentId}::uuid,${command.clientMessageId}::uuid,${command.body}) AS value`;
    await afterInsert?.();
    return row.value;
  });
  const persisted=await signedTransaction(async tx=>{
    const [row]=await tx.$queryRaw<Array<{ok:boolean}>>`SELECT wb_guard.confirm_message(${appointmentId}::uuid,${message.id}::uuid,${command.clientMessageId}::uuid) AS ok`;
    return row.ok;
  });
  if(!persisted)throw new Error("MESSAGE_NOT_COMMITTED");
  return message;
}
