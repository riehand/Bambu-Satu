"use client";

import { useEffect, useState } from "react";
import { consultationSessions, type ConsultationSessionType } from "@/lib/psychologist/availability-config";

type Slot = { sessionType: ConsultationSessionType; status: "AVAILABLE" | "UNAVAILABLE" | "BOOKED" };

export function PsychologistAvailabilityEditor({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<Record<ConsultationSessionType, Slot["status"]>>({
    MORNING: "UNAVAILABLE", AFTERNOON: "UNAVAILABLE", EVENING: "UNAVAILABLE",
  });
  const [pending, setPending] = useState(true);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch(`/api/psychologist/availability?date=${date}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("load-failed");
      if (active) {
        const next = { MORNING: "UNAVAILABLE", AFTERNOON: "UNAVAILABLE", EVENING: "UNAVAILABLE" } as Record<ConsultationSessionType, Slot["status"]>;
        for (const slot of result.data as Slot[]) next[slot.sessionType] = slot.status;
        setSlots(next);
      }
    }).catch(() => {
      if (active) { setFailed(true); setMessage("Jadwal belum dapat dimuat."); }
    }).finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, [date]);

  async function save() {
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch(`/api/psychologist/availability/${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: consultationSessions.map(({ type }) => ({ sessionType: type, available: slots[type] === "AVAILABLE" })) }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("save-failed");
      const next = { MORNING: "UNAVAILABLE", AFTERNOON: "UNAVAILABLE", EVENING: "UNAVAILABLE" } as Record<ConsultationSessionType, Slot["status"]>;
      for (const slot of result.data as Slot[]) next[slot.sessionType] = slot.status;
      setSlots(next);
      setMessage("Ketersediaan berhasil disimpan.");
    } catch {
      setFailed(true);
      setMessage("Ketersediaan belum berhasil disimpan. Muat ulang lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return <section className="ph-card ph-availability" aria-labelledby="availability-title">
    <div className="ph-section-heading"><div><h2 id="availability-title">Ketersediaan konsultasi</h2><p>Pilih sesi dua jam yang dapat dipesan peserta. Waktu menggunakan Asia/Jakarta.</p></div></div>
    <label className="ph-field ph-date-field"><span>Tanggal</span><input type="date" min={today} value={date} onChange={(event) => { setPending(true); setDate(event.target.value); setMessage(""); setFailed(false); }}/></label>
    <div className="ph-session-list">{consultationSessions.map(({ type, startTime, endTime }) => {
      const status = slots[type];
      return <label className={`ph-session-row ${status === "BOOKED" ? "is-booked" : ""}`} key={type}>
        <span><strong>{type === "MORNING" ? "Pagi" : type === "AFTERNOON" ? "Siang" : "Sore"}</strong><small>{startTime}–{endTime} WIB</small></span>
        <span className="ph-session-status">{status === "BOOKED" ? "Sudah dipesan" : status === "AVAILABLE" ? "Tersedia" : "Tidak tersedia"}<input type="checkbox" checked={status === "AVAILABLE"} disabled={pending || status === "BOOKED"} onChange={(event) => setSlots((current) => ({ ...current, [type]: event.target.checked ? "AVAILABLE" : "UNAVAILABLE" }))}/></span>
      </label>;
    })}</div>
    <div className="ph-form-footer"><p className={`ph-status ${failed ? "ph-error" : ""}`} role="status" aria-live="polite">{message}</p><button type="button" className="ph-button" disabled={pending} onClick={() => void save()}>{pending ? "Menyimpan…" : "Simpan ketersediaan"}</button></div>
  </section>;
}
