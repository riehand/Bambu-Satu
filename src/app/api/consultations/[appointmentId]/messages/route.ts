import { appointmentApi, readAppointmentJson } from "@/lib/appointments/http";
import { AppointmentError } from "@/lib/appointments/service";
import { appointmentIdSchema } from "@/lib/validations/appointment";
import { chatCommand, chatQuery } from "@/lib/validations/chat";
import { listChatMessages, sendChatMessage } from "@/lib/consultations/chat-service";
import type { AppRole } from "@/lib/auth/roles";
function actorForChat(actor: { id: string; role: AppRole }) {
  if (actor.role !== "PARTICIPANT" && actor.role !== "PSYCHOLOGIST") throw new AppointmentError("FORBIDDEN", "Akses tidak diizinkan.", 403);
  return { id: actor.id, role: actor.role };
}
type Context = { params: Promise<{ appointmentId: string }> };
export async function GET(request: Request, context: Context) {
  return appointmentApi("PARTY", async actor => {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new AppointmentError("VALIDATION_ERROR", "Parameter tidak valid.", 422);
    return listChatMessages(actorForChat(actor), appointmentIdSchema.parse((await context.params).appointmentId), chatQuery.parse(Object.fromEntries(params)));
  });
}
export async function POST(request: Request, context: Context) {
  return appointmentApi("PARTY", async actor => sendChatMessage(actorForChat(actor), appointmentIdSchema.parse((await context.params).appointmentId), chatCommand.parse(await readAppointmentJson(request))), request, true);
}
