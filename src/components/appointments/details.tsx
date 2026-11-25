"use client";
import { useState } from "react";

type Detail = { appointmentId: string; status: string; scheduledStartAt: string; scheduledEndAt: string; participantNote: string | null; consultationMethod?: string | null; participant: { fullName: string }; psychologist: { fullName: string }; consultationSession: { status: string } | null };
export function AppointmentDetails({ appointmentId }: { appointmentId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function load() {
    if (pending) return;
    setPending(true); setError(false);
    try {
      const response = await fetch(`/api/appointments/${encodeURIComponent(appointmentId)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success || result.data?.appointmentId !== appointmentId) throw new Error("unavailable");
      setDetail(result.data);
    } catch { setError(true); } finally { setPending(false); }
  }
  return <div>
    <button type="button" className="wb-button secondary ph-button" disabled={pending} onClick={() => void load()}>{pending ? "Memuat detail..." : "Lihat detail janji"}</button>
    {error && <p role="alert">Detail janji belum dapat dimuat. Coba lagi.</p>}
    {detail && <div role="region" aria-label="Detail janji">
      <p>{detail.participant.fullName} — {detail.psychologist.fullName}</p>
      <p>{new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(detail.scheduledStartAt))} WIB</p>
      <p>Status: {detail.status} · Konsultasi: {detail.consultationSession?.status ?? "Belum tersedia"}</p>
      {detail.consultationMethod && <p>Metode konsultasi: {detail.consultationMethod}</p>}
      {detail.participantNote && <p>Catatan: {detail.participantNote}</p>}
    </div>}
  </div>;
}
