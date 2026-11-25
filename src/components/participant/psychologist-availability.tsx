"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { consultationSessions, type ConsultationSessionType } from "@/lib/psychologist/availability-config";

type PublicSlot = { availabilityId: string; date: string; sessionType: ConsultationSessionType; startTime: string; endTime: string; status: "AVAILABLE" };
type BookingContext = {
  latestAssessment: null | { assessmentSessionId: string; completedAt: string; reportId: string; reportStatus: string };
  canBook: boolean;
};

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" }).format(new Date(`${date}T12:00:00+07:00`));
}

export function PsychologistAvailability({ psychologistId, psychologistName, today }: { psychologistId: string; psychologistName: string; today: string }) {
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<PublicSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [context, setContext] = useState<BookingContext | null>(null);
  const [contextFailed, setContextFailed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [contextReload, setContextReload] = useState(0);
  const bookingPending = useRef(false);

  useEffect(() => {
    if (!date) return;
    let active = true;
    void fetch(`/api/psychologists/${psychologistId}/availability?date=${date}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("load-failed");
      if (active) setSlots(result.data as PublicSlot[]);
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, psychologistId, reload]);

  useEffect(() => {
    let active = true;
    void fetch("/api/appointments/booking-context").then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("context-failed");
      if (active) setContext(result.data as BookingContext);
    }).catch(() => { if (active) setContextFailed(true); });
    return () => { active = false; };
  }, [contextReload]);

  async function book(slot: PublicSlot) {
    if (bookingPending.current || loading || failed || slot.date !== date || !context?.canBook || !context.latestAssessment || !consent) return;
    bookingPending.current = true;
    setBookingId(slot.availabilityId);
    setConsent(false);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          psychologistId,
          assessmentSessionId: context.latestAssessment.assessmentSessionId,
          reportId: context.latestAssessment.reportId,
          availabilityId: slot.availabilityId,
          reportConsent: true,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error?.message || "Pemesanan belum berhasil. Silakan muat ulang jadwal.");
      setSlots((current) => current.filter(({ availabilityId }) => availabilityId !== slot.availabilityId));
      setMessage("Janji konsultasi Anda telah dikonfirmasi.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pemesanan belum berhasil. Silakan coba lagi.");
    } finally {
      bookingPending.current = false;
      setBookingId(null);
    }
  }

  const available = new Map(slots.map((slot) => [slot.sessionType, slot]));
  return <section className="wb-card wb-availability" aria-labelledby="availability-title">
    <div className="wb-section-meta"><div><h2 id="availability-title">Jadwal yang tersedia</h2><p>Pilih tanggal untuk melihat sesi konsultasi. Waktu menggunakan Asia/Jakarta.</p></div><label className="wb-availability-date"><span>Tanggal</span><input type="date" min={today} value={date} disabled={bookingId !== null} onChange={(event) => { setSlots([]); setConsent(false); setLoading(Boolean(event.target.value)); setFailed(false); setDate(event.target.value); }}/></label></div>
    <button className="wb-button secondary" type="button" disabled={!date || loading || bookingId !== null} onClick={() => { setSlots([]); setFailed(false); setLoading(true); setReload(value => value + 1); }}>Muat ulang jadwal</button>
    {!date ? <p role="status">Pilih tanggal untuk memuat jadwal.</p> : failed ? <p className="wb-muted" role="status">Jadwal belum dapat dimuat. Gunakan tombol muat ulang jadwal.</p> : loading ? <p className="wb-muted" role="status">Memuat jadwal...</p> : <>
      <p className="wb-muted wb-availability-day">{dateLabel(date)}</p>
      <div className="wb-availability-list">{consultationSessions.map(({ type, startTime, endTime }) => {
        const slot = available.get(type);
        return <div className="wb-availability-row" key={type}><div><strong>{type === "MORNING" ? "Pagi" : type === "AFTERNOON" ? "Siang" : "Sore"}</strong><small>{startTime}–{endTime} WIB</small></div>{slot ? <button className="wb-book-button" type="button" disabled={!context?.canBook || !consent || bookingId !== null} onClick={() => void book(slot)}>{bookingId === slot.availabilityId ? "Memesan..." : "Pesan sesi"}</button> : <span>Tidak tersedia</span>}</div>;
      })}</div>
    </>}
    {contextFailed ? <div><p className="wb-muted" role="status">Persyaratan pemesanan belum dapat dimuat.</p><button type="button" className="wb-button secondary" onClick={() => { setContextFailed(false); setContextReload(value => value + 1); }}>Muat ulang persyaratan</button></div> : context?.latestAssessment && !context.canBook ? <p className="wb-notice" role="status">Pemesanan memerlukan asesmen DASS-21 dan WEMWBS terbaru yang selesai serta laporan privat berstatus GENERATED. Laporan Anda belum siap. <Link href={`/participant/assessment/${context.latestAssessment.assessmentSessionId}/results`}>Buka hasil asesmen</Link></p> : null}
    {context?.canBook && context.latestAssessment && <label className="wb-report-consent"><input type="checkbox" checked={consent} disabled={bookingId !== null} onChange={(event) => setConsent(event.target.checked)}/><span>Saya setuju membagikan laporan asesmen terbaru yang selesai kepada {psychologistName} untuk konsultasi ini. Persetujuan ini khusus untuk laporan, psikolog, dan janji yang dibuat; dapat dicabut kapan saja.</span></label>}
    {context && !context.latestAssessment && <p className="wb-notice">Selesaikan asesmen DASS-21 dan WEMWBS sebelum membuat janji.</p>}
    {error && <p className="wb-error" role="alert">{error}</p>}
    {message && <p className="wb-success" role="status">{message} <Link href="/participant/appointments">Lihat janji konsultasi</Link></p>}
  </section>;
}
