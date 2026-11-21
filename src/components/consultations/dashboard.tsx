"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsultationDTO, ConsultationList } from "@/lib/consultations/service";
import type { ConsultationAction, ConsultationRole, Eligibility } from "@/lib/consultations/policy";
import "./dashboard.css";
import { ConsultationChat } from "./chat-panel";

const time = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));
const labels: Record<string, string> = {
  CONFIRMED: "Dikonfirmasi", SCHEDULED: "Terjadwal", READY: "Siap dimulai", IN_PROGRESS: "Berlangsung",
  COMPLETED: "Selesai", CLOSED: "Ditutup", CANCELLED: "Dibatalkan", RESCHEDULED: "Dijadwalkan ulang",
  NO_SHOW: "Tidak hadir", PARTICIPANT_LATE: "Peserta terlambat", PSYCHOLOGIST_LATE: "Psikolog terlambat",
  WINDOW_ENDED: "Waktu jadwal berakhir", INCONSISTENT: "Perlu pemeriksaan data",
};

export function ConsultationDashboard({ role }: { role: ConsultationRole }) {
  return <Dashboard key={role} role={role}/>;
}

function Dashboard({ role }: { role: ConsultationRole }) {
  const [data, setData] = useState<ConsultationList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [chatAppointment, setChatAppointment] = useState<string | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const sequence = useRef(0);
  const readController = useRef<AbortController | null>(null);
  const writeController = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    const version = ++sequence.current;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    return fetch("/api/consultations", { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Status konsultasi belum dapat dimuat.");
      if (mounted.current && version === sequence.current && !controller.signal.aborted) { setData(result.data); setStale(false); setError(""); }
    }).catch(cause => {
      if (mounted.current && version === sequence.current && !controller.signal.aborted) {
        setStale(true); setError(cause instanceof Error ? cause.message : "Status konsultasi belum dapat dimuat.");
      }
    }).finally(() => { if (mounted.current && version === sequence.current && !controller.signal.aborted) setLoading(false); });
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    const timer = setInterval(() => { if (!busy.current) void load(); }, 30000);
    return () => { mounted.current = false; clearInterval(timer); readController.current?.abort(); writeController.current?.abort(); };
  }, [load]);

  async function act(item: ConsultationDTO, action: ConsultationAction) {
    if (busy.current || stale || loading) return;
    if (action === "end" && !window.confirm("Akhiri konsultasi sekarang? Akses laporan melalui janji ini akan berakhir. Persetujuan mandiri tetap terpisah.")) return;
    busy.current = true;
    ++sequence.current; readController.current?.abort();
    const controller = new AbortController(); writeController.current = controller;
    setPending(item.appointmentId); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/consultations/${item.appointmentId}/${action}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Status sesi berubah. Muat ulang sebelum mencoba lagi.");
      if (!mounted.current) return;
      // Only server-confirmed evidence is displayed; never optimistically invent a start/end.
      setData(current => current ? { ...current, items: current.items.map(row => row.appointmentId === item.appointmentId ? result.data : row) } : current);
      setMessage(action === "end" ? "Konsultasi selesai." : action === "start" ? "Konsultasi telah dimulai." : "Check-in telah tercatat.");
      await load();
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) { setStale(true); setError(cause instanceof Error ? cause.message : "Permintaan belum dapat diproses."); }
    } finally { busy.current = false; if (mounted.current) setPending(null); }
  }
  const buttonClass = role === "PARTICIPANT" ? "wb-button secondary" : "ph-button";
  const groups = [{ history: false, title: "Konsultasi mendatang dan berlangsung" }, { history: true, title: "Riwayat konsultasi" }];
  function actionButton(item: ConsultationDTO, action: ConsultationAction, text: string, eligibility: Eligibility) {
    const reasonId = `${item.appointmentId}-${action}-reason`;
    return <div className="consultation-action">
      <button type="button" className={buttonClass} disabled={!eligibility.allowed || loading || stale || pending !== null}
        aria-describedby={eligibility.reason ? reasonId : undefined} onClick={() => void act(item, action)}>{text}</button>
      {eligibility.reason && <small id={reasonId}>{eligibility.reason}</small>}
    </div>;
  }
  return <section className={`${role === "PARTICIPANT" ? "wb-card" : "ph-card"} consultation-dashboard`} aria-label="Lifecycle konsultasi" aria-busy={loading || pending !== null}>
    <div className="consultation-heading"><h2>Ruang konsultasi</h2><button type="button" className={buttonClass} disabled={loading || pending !== null} onClick={() => { setLoading(true); void load(); }}>Muat ulang status</button></div>
    {data?.policyNotice && <p className="consultation-notice">{data.policyNotice}</p>}
    {loading && <p role="status">Memuat status konsultasi...</p>}
    {pending && <p role="status">Menyimpan perubahan konsultasi...</p>}
    {error && <p className="wb-error" role="alert">{error} Gunakan Muat ulang status untuk mencoba lagi.</p>}
    {message && <p role="status">{message}</p>}
    {data && groups.map(group => <div key={group.title} className="consultation-group"><h3>{group.title}</h3>
      {data.items.filter(item => item.history === group.history).map(item => <article className="consultation-entry" key={item.appointmentId}>
        <h4>{item.counterpartName}</h4>
        <p>{time(item.scheduledStartAt)} – {time(item.scheduledEndAt)} WIB</p>
        <p>Janji: {labels[item.appointmentStatus] ?? item.appointmentStatus} · Sesi: <strong>{labels[item.effectiveStatus] ?? item.effectiveStatus}</strong></p>
        {item.effectiveStatus === "WINDOW_ENDED" && <p>Waktu sesi telah berakhir. Status tersimpan: {labels[item.sessionStatus ?? ""] ?? "Tidak tersedia"}. Penutupan otomatis belum dijalankan.</p>}
        <dl className="consultation-times">
          <div><dt>Check-in peserta</dt><dd>{item.participantCheckedInAt ? `${time(item.participantCheckedInAt)} WIB` : "Belum tercatat"}</dd></div>
          <div><dt>Check-in psikolog</dt><dd>{item.psychologistCheckedInAt ? `${time(item.psychologistCheckedInAt)} WIB` : "Belum tercatat"}</dd></div>
          <div><dt>Mulai aktual</dt><dd>{item.startedAt ? `${time(item.startedAt)} WIB` : "Belum dimulai"}</dd></div>
          <div><dt>Selesai aktual</dt><dd>{item.endedAt ? `${time(item.endedAt)} WIB` : "Belum tercatat"}</dd></div>
        </dl>
        <div className="consultation-actions">
          {actionButton(item, role === "PARTICIPANT" ? "participant-check-in" : "psychologist-check-in", "Check-in saya", item.actions.checkIn)}
          {role === "PSYCHOLOGIST" && <>{actionButton(item, "start", "Mulai konsultasi", item.actions.start)}{actionButton(item, "end", "Akhiri konsultasi", item.actions.end)}</>}
        </div>
        <button type="button" className={buttonClass} aria-expanded={chatAppointment === item.appointmentId} onClick={() => setChatAppointment(current => current === item.appointmentId ? null : item.appointmentId)}>{chatAppointment === item.appointmentId ? "Tutup chat" : "Buka chat konsultasi"}</button>
        {chatAppointment === item.appointmentId && <ConsultationChat appointmentId={item.appointmentId} active={!stale && item.appointmentStatus === "IN_PROGRESS" && item.effectiveStatus === "IN_PROGRESS"}/>}
      </article>)}
      {!data.items.some(item => item.history === group.history) && <p>Belum ada {group.history ? "riwayat" : "jadwal"} konsultasi.</p>}
    </div>)}
  </section>;
}
