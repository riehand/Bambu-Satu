import "server-only";
import { gatewayMode } from "@/lib/dal/context";
import { runtimeChatRead,runtimeChatSend } from "./chat-runtime";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppointmentError } from "@/lib/appointments/service";
import { chatCommand, chatCursor, chatQuery, type ChatCommand, type ChatQuery } from "@/lib/validations/chat";
import type { ConsultationActor } from "./service";
import { chatDevelopmentEnabled, chatOpen } from "./chat-policy";

function assertEnabled(actor: ConsultationActor) {
  if (actor.role !== "PARTICIPANT" && actor.role !== "PSYCHOLOGIST") throw new AppointmentError("FORBIDDEN", "Akses tidak diizinkan.", 403);
  if (!chatDevelopmentEnabled()) throw new AppointmentError("CHAT_POLICY_PENDING", "Chat produksi menunggu persetujuan privasi dan keamanan institusi.", 403);
}
const scope = (actor: ConsultationActor) => actor.role === "PARTICIPANT" ? { participantId: actor.id } : { psychologistId: actor.id };
const rowSelect = {
  id: true, participantId: true, psychologistId: true, status: true, scheduledStartAt: true, scheduledEndAt: true,
  participant: { select: { role: true, isActive: true } }, psychologist: { select: { role: true, isActive: true } },
  consultationSession: { select: { id: true, appointmentId: true, status: true, scheduledStartAt: true, scheduledEndAt: true,
    participantCheckedInAt: true, psychologistCheckedInAt: true, startedAt: true, endedAt: true } },
} satisfies Prisma.AppointmentSelect;
type Row = Prisma.AppointmentGetPayload<{ select: typeof rowSelect }>;
const messageSelect = { id: true, senderId: true, clientMessageId: true, body: true, createdAt: true } satisfies Prisma.ConsultationMessageSelect;
type Message = Prisma.ConsultationMessageGetPayload<{ select: typeof messageSelect }>;
function messageDTO(message: Message, actor: ConsultationActor, row: Row) {
  return { id: message.id, body: message.body, createdAt: message.createdAt.toISOString(), own: message.senderId === actor.id,
    senderRole: message.senderId === row.participantId ? "PARTICIPANT" as const : "PSYCHOLOGIST" as const,
    clientMessageId: message.senderId === actor.id ? message.clientMessageId : null };
}
export type ChatMessage = ReturnType<typeof messageDTO>;
function encode(appointmentId: string, message: Message) { return Buffer.from(JSON.stringify({ appointmentId, id: message.id, at: message.createdAt.toISOString() })).toString("base64url"); }
function decode(cursor: string | undefined, appointmentId: string) {
  if (!cursor) return null;
  try {
    const parsed = chatCursor.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
    if (parsed.appointmentId !== appointmentId) throw new Error("scope");
    return parsed;
  } catch { throw new AppointmentError("INVALID_CURSOR", "Cursor pesan tidak valid untuk konsultasi ini.", 422); }
}
async function databaseNow(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return rows[0].now;
}
function verify(row: Row | null, actor: ConsultationActor, now: Date): asserts row is Row {
  if (!row || (actor.role === "PARTICIPANT" ? row.participantId : row.psychologistId) !== actor.id) throw new AppointmentError("APPOINTMENT_NOT_FOUND", "Janji konsultasi tidak ditemukan.", 404);
  if (row.participant.role !== "PARTICIPANT" || !row.participant.isActive || row.psychologist.role !== "PSYCHOLOGIST" || !row.psychologist.isActive) throw new AppointmentError("FORBIDDEN", "Akses chat tidak diizinkan.", 403);
  if (!chatOpen(row, now)) throw new AppointmentError("CHAT_CLOSED", "Chat hanya tersedia selama konsultasi aktif. Akses setelah sesi menunggu kebijakan institusi.", 409);
}
async function locked(tx: Prisma.TransactionClient, actor: ConsultationActor, appointmentId: string, send: boolean) {
  await tx.$queryRaw`SELECT id FROM public.users WHERE id=${actor.id}::uuid FOR SHARE`;
  const user = await tx.user.findFirst({ where: { id: actor.id, role: actor.role, isActive: true }, select: { id: true } });
  if (!user) throw new AppointmentError("FORBIDDEN", "Akses tidak diizinkan.", 403);
  const owner = actor.role === "PARTICIPANT" ? Prisma.sql`participant_id` : Prisma.sql`psychologist_id`;
  const lock = send ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`;
  await tx.$queryRaw`SELECT id FROM public.appointments WHERE id=${appointmentId}::uuid AND ${owner}=${actor.id}::uuid ${lock}`;
  // Scope check BEFORE touching the linked session; never lock an unrelated conversation.
  const first = await tx.appointment.findFirst({ where: { id: appointmentId, ...scope(actor) }, select: rowSelect });
  if (!first) throw new AppointmentError("APPOINTMENT_NOT_FOUND", "Janji konsultasi tidak ditemukan.", 404);
  await tx.$queryRaw`SELECT id FROM public.consultation_sessions WHERE appointment_id=${appointmentId}::uuid ${lock}`;
  const row = await tx.appointment.findFirst({ where: { id: appointmentId, ...scope(actor) }, select: rowSelect });
  verify(row, actor, await databaseNow(tx));
  return row;
}
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 15000 };

export async function listChatMessages(actor: ConsultationActor, appointmentId: string, input: ChatQuery) {
  assertEnabled(actor);
  const query = chatQuery.parse(input), cursor = decode(query.before ?? query.after, appointmentId);
  if (gatewayMode()) return runtimeChatRead(actor,appointmentId,query,cursor);
  return prisma.$transaction(async tx => {
    const row = await locked(tx, actor, appointmentId, false);
    const direction = query.after ? "asc" : "desc";
    const comparison = query.after ? "gt" : "lt";
    const messages = await tx.consultationMessage.findMany({
      where: { consultationSessionId: row.consultationSession!.id, ...(cursor ? { OR: [
        { createdAt: { [comparison]: new Date(cursor.at) } }, { createdAt: new Date(cursor.at), id: { [comparison]: cursor.id } },
      ] } : {}) },
      select: messageSelect, orderBy: [{ createdAt: direction }, { id: direction }], take: query.limit + 1,
    });
    const more = messages.length > query.limit, page = messages.slice(0, query.limit);
    const nextCursor = more && page.length ? encode(appointmentId, page[page.length - 1]) : null;
    if (!query.after) page.reverse();
    const now = await databaseNow(tx);
    verify(row, actor, now); // A slow read cannot authorize history after expiry.
    return { items: page.map(message => messageDTO(message, actor, row)), nextCursor,
      latestCursor: page.length ? encode(appointmentId, page[page.length - 1]) : query.after ?? null,
      canSend: true, scheduledEndAt: row.scheduledEndAt.toISOString(), serverNow: now.toISOString() };
  }, transactionOptions);
}
export type ChatPage = Awaited<ReturnType<typeof listChatMessages>>;

export async function sendChatMessage(actor: ConsultationActor, appointmentId: string, input: ChatCommand) {
  assertEnabled(actor);
  const command = chatCommand.parse(input);
  if (gatewayMode()) return runtimeChatSend(actor,appointmentId,command);
  try {
    const result = await prisma.$transaction(async tx => {
      const row = await locked(tx, actor, appointmentId, true);
      const key = { consultationSessionId: row.consultationSession!.id, senderId: actor.id, clientMessageId: command.clientMessageId };
      const existing = await tx.consultationMessage.findUnique({ where: { session_sender_request: key }, select: messageSelect });
      if (existing) {
        if (existing.body !== command.body) throw new AppointmentError("IDEMPOTENCY_CONFLICT", "Kunci pengiriman sudah dipakai untuk pesan berbeda.", 409);
        verify(row, actor, await databaseNow(tx));
        return { message: messageDTO(existing, actor, row), replayed: true };
      }
      const message = await tx.consultationMessage.create({ data: { ...key, body: command.body }, select: messageSelect });
      // SQL deferred trigger rechecks status and wall clock at commit too.
      return { message: messageDTO(message, actor, row), replayed: false };
    }, transactionOptions);
    // Prisma 5.22 can resolve an interactive transaction whose deferred COMMIT
    // constraint rolled it back. Confirm persistence outside the transaction;
    // never acknowledge an INSERT result alone. Query only the scoped own ID.
    const committed = await prisma.consultationMessage.findFirst({
      where: { id: result.message.id, senderId: actor.id, clientMessageId: command.clientMessageId,
        consultationSession: { appointmentId } }, select: { id: true },
    });
    if (!committed) throw new Error("Message commit unconfirmed");
    return result;
  } catch (error) {
    if (error instanceof AppointmentError) throw error;
    // Never return or log raw errors (which can include body/query parameters).
    throw new AppointmentError("CHAT_SEND_FAILED", "Pesan belum dapat dikonfirmasi. Muat ulang status atau coba kirim ulang pesan yang sama.", 409);
  }
}
