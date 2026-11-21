"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatPage } from "@/lib/consultations/chat-service";
import { CHAT_BODY_LIMIT, CHAT_POLL_MS } from "@/lib/consultations/chat-policy";
import type { ChatCommand } from "@/lib/validations/chat";
import "./chat-panel.css";

type Failure = Error & { status?: number };
const time = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(value));
function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const unique = new Map(current.map(item => [item.id, item]));
  for (const item of incoming) unique.set(item.id, item);
  return [...unique.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export function ConsultationChat({ appointmentId, active }: { appointmentId: string; active: boolean }) {
  if (!active) return <p role="status">Chat tidak tersedia: konsultasi belum aktif atau telah berakhir. Akses setelah sesi menunggu kebijakan institusi.</p>;
  return <ChatPanel key={appointmentId} appointmentId={appointmentId}/>;
}
function ChatPanel({ appointmentId }: { appointmentId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<ChatCommand | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [closed, setClosed] = useState(false);
  const [older, setOlder] = useState<string | null>(null);
  const mounted = useRef(false), readBusy = useRef(false), writeBusy = useRef(false), blocked = useRef(false);
  const latest = useRef<string | null>(null), pendingRef = useRef<ChatCommand | null>(null);
  const reader = useRef<AbortController | null>(null), writer = useRef<AbortController | null>(null);
  const epoch = useRef(0), expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = `/api/consultations/${appointmentId}/messages`;

  const lockPanel = useCallback(() => {
    blocked.current = true; reader.current?.abort(); writer.current?.abort();
    setClosed(true); setLoading(false); setSending(false);
    setMessages([]); setCanSend(false); setDraft(""); setPending(null); pendingRef.current = null;
    setOlder(null); latest.current = null;
    setConfirmed(false); setSendError(""); setError("Chat ditutup. Akses setelah sesi menunggu kebijakan institusi.");
  }, []);
  const refresh = useCallback((before?: string) => {
    if (readBusy.current || writeBusy.current || blocked.current) return Promise.resolve();
    readBusy.current = true;
    const version = ++epoch.current, controller = new AbortController(); reader.current = controller;
    const query = new URLSearchParams();
    if (before) query.set("before", before); else if (latest.current) query.set("after", latest.current);
    return fetch(`${url}?${query}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success) throw Object.assign(new Error(result.error?.message || "Pesan belum dapat dimuat."), { status: response.status });
      if (!mounted.current || controller.signal.aborted || version !== epoch.current) return;
      const page = result.data as ChatPage;
      setMessages(current => mergeMessages(current, page.items));
      if (before || !latest.current) setOlder(page.nextCursor);
      if (!before) latest.current = page.latestCursor;
      setCanSend(page.canSend); setError("");
      if (expiry.current) clearTimeout(expiry.current);
      // Relative server time only disables the client early; server remains authoritative.
      const remaining = new Date(page.scheduledEndAt).getTime() - new Date(page.serverNow).getTime();
      expiry.current = setTimeout(lockPanel, Math.max(0, remaining));
      const uncertain = pendingRef.current;
      if (uncertain && page.items.some(item => item.own && item.clientMessageId === uncertain.clientMessageId && item.body === uncertain.body)) {
        pendingRef.current = null; setPending(null); setDraft(""); setSendError(""); setConfirmed(true);
      }
    }).catch((cause: Failure) => {
      if (!mounted.current || controller.signal.aborted || version !== epoch.current) return;
      if ([401, 403, 404, 409].includes(cause.status ?? 0)) lockPanel();
      else { setMessages([]); latest.current = null; setOlder(null); setCanSend(false); }
      setError(cause.message);
    }).finally(() => {
      if (reader.current === controller) readBusy.current = false;
      if (mounted.current && !controller.signal.aborted && version === epoch.current) setLoading(false);
    });
  }, [url, lockPanel]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const poll = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(poll, CHAT_POLL_MS);
    document.addEventListener("visibilitychange", poll);
    window.addEventListener("online", poll);
    return () => {
      mounted.current = false; clearInterval(timer); if (expiry.current) clearTimeout(expiry.current);
      reader.current?.abort(); writer.current?.abort();
      readBusy.current = false;
      document.removeEventListener("visibilitychange", poll); window.removeEventListener("online", poll);
    };
  }, [refresh]);

  async function send() {
    if (!canSend || writeBusy.current || blocked.current) return;
    const command = pendingRef.current ?? { clientMessageId: crypto.randomUUID(), body: draft.trim() };
    if (!command.body || command.body.length > CHAT_BODY_LIMIT) return;
    pendingRef.current = command; setPending(command);
    writeBusy.current = true; ++epoch.current; reader.current?.abort();
    setSending(true); setSendError(""); setConfirmed(false);
    const controller = new AbortController(); writer.current = controller;
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command), signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.success) throw Object.assign(new Error(result.error?.message || "Pengiriman belum dapat dikonfirmasi."), { status: response.status });
      if (!mounted.current || controller.signal.aborted) return;
      setMessages(current => mergeMessages(current, [result.data.message as ChatMessage]));
      // Do not advance latest cursor from a send response: a peer message may precede it.
      pendingRef.current = null; setPending(null); setDraft(""); setConfirmed(true);
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) {
        const failure = cause as Failure;
        if ([401, 403, 404].includes(failure.status ?? 0)) lockPanel();
        setSendError(failure.message || "Pengiriman belum dapat dikonfirmasi. Coba kirim ulang pesan yang sama.");
      }
    } finally {
      writeBusy.current = false;
      if (mounted.current) { setSending(false); void refresh(); }
    }
  }
  return <section className="consultation-chat" aria-label="Chat konsultasi privat" aria-busy={loading || sending}>
    <h5>Percakapan dengan peserta dan psikolog</h5>
    <p>Chat teks pengembangan. Kebijakan privasi institusi belum disetujui; chat production dinonaktifkan.</p>
    {loading && <p role="status">Memuat pesan...</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="wb-button secondary ph-button" disabled={sending || closed} onClick={() => void refresh()}>Muat ulang pesan</button>
    {older && <button type="button" className="wb-button secondary ph-button" disabled={sending} onClick={() => void refresh(older)}>Pesan lebih lama</button>}
    <ol className="consultation-messages" aria-label="Daftar pesan">
      {messages.map(message => <li key={message.id} className={message.own ? "chat-own" : "chat-peer"}>
        <strong>{message.own ? "Anda" : message.senderRole === "PSYCHOLOGIST" ? "Psikolog" : "Peserta"}</strong>
        <p>{message.body}</p><time dateTime={message.createdAt}>{time(message.createdAt)} WIB</time>
      </li>)}
    </ol>
    {!loading && !error && !messages.length && <p>Belum ada pesan.</p>}
    <form onSubmit={event => { event.preventDefault(); void send(); }}>
      <label htmlFor={`chat-${appointmentId}`}>Pesan konsultasi</label>
      <textarea id={`chat-${appointmentId}`} rows={3} maxLength={CHAT_BODY_LIMIT} value={draft} disabled={!canSend || sending || pending !== null}
        aria-describedby={`chat-limit-${appointmentId}`} onChange={event => { setDraft(event.target.value); setConfirmed(false); }}/>
      <small id={`chat-limit-${appointmentId}`}>Maksimal {CHAT_BODY_LIMIT} karakter. Hanya teks; lampiran tidak tersedia.</small>
      <button className="wb-button ph-button" type="submit" disabled={!canSend || sending || (!pending && !draft.trim())}>{sending ? "Mengirim..." : pending ? "Coba kirim ulang" : "Kirim pesan"}</button>
    </form>
    {sending && <p role="status">Menunggu konfirmasi server...</p>}
    {sendError && <p role="alert">{sendError} Retry memakai identitas pesan yang sama.</p>}
    {confirmed && <p role="status">Pesan dikonfirmasi server.</p>}
  </section>;
}
