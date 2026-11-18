"use client";

import { useEffect, useRef, useState } from "react";
import { consultationSessions, type ConsultationSessionType } from "@/lib/psychologist/availability-config";

type Slot = { sessionType: ConsultationSessionType; status: "AVAILABLE" | "UNAVAILABLE" | "BOOKED" };
type Slots = Record<ConsultationSessionType, Slot["status"]>;
type LoadState = { status: "loading" | "error" } | { status: "ready"; date: string; slots: Slots };

function slotsForDay(items: Slot[]): Slots {
  const slots: Slots = { MORNING: "UNAVAILABLE", AFTERNOON: "UNAVAILABLE", EVENING: "UNAVAILABLE" };
  for (const slot of items) slots[slot.sessionType] = slot.status;
  return slots;
}

export function PsychologistAvailabilityEditor({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  return <section className="ph-card ph-availability" aria-labelledby="availability-title">
    <div className="ph-section-heading"><div><h2 id="availability-title">Ketersediaan konsultasi</h2><p>Pilih sesi dua jam yang dapat dipesan peserta. Waktu menggunakan Asia/Jakarta.</p></div></div>
    <label className="ph-field ph-date-field"><span>Tanggal</span><input type="date" min={today} value={date} disabled={saving} onChange={(event) => setDate(event.target.value)}/></label>
    {/* Reset only the day's data, preserving focus on the date picker. */}
    <AvailabilityDay key={date} date={date} saving={saving} onSavingChange={setSaving}/>
  </section>;
}

function AvailabilityDay({ date, saving, onSavingChange }: { date: string; saving: boolean; onSavingChange: (saving: boolean) => void }) {
  const [load, setLoad] = useState<LoadState>({ status: date ? "loading" : "error" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const saveRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (date) void fetch(`/api/psychologist/availability?date=${encodeURIComponent(date)}`, { signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("load-failed");
      if (!controller.signal.aborted) setLoad({ status: "ready", date, slots: slotsForDay(result.data as Slot[]) });
    }).catch(() => {
      if (!controller.signal.aborted) setLoad({ status: "error" });
    });
    return () => {
      controller.abort();
      saveRequest.current?.abort();
    };
  }, [date, loadAttempt]);

  const ready = load.status === "ready" && load.date === date;

  function retryLoad() {
    if (!date || saving) return;
    setLoad({ status: "loading" });
    setMessage("");
    setSaveFailed(false);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function save() {
    if (load.status !== "ready" || load.date !== date || saveRequest.current) return;
    const controller = new AbortController();
    saveRequest.current = controller;
    onSavingChange(true);
    setSaveFailed(false);
    setMessage("");
    try {
      const response = await fetch(`/api/psychologist/availability/${load.date}`, {
        method: "PUT",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: consultationSessions.map(({ type }) => ({ sessionType: type, available: load.slots[type] === "AVAILABLE" })) }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("save-failed");
      if (controller.signal.aborted) return;
      setLoad({ status: "ready", date, slots: slotsForDay(result.data as Slot[]) });
      setMessage("Ketersediaan berhasil disimpan.");
    } catch {
      if (controller.signal.aborted) return;
      setSaveFailed(true);
      setMessage("Ketersediaan belum berhasil disimpan. Muat ulang jadwal lalu coba lagi.");
      // A conflict or lost response may mean the server's slots have changed.
      setLoad({ status: "error" });
    } finally {
      if (!controller.signal.aborted) {
        saveRequest.current = null;
        onSavingChange(false);
      }
    }
  }

  return <>
    <div className="ph-session-list" aria-busy={load.status === "loading"}>{consultationSessions.map(({ type, startTime, endTime }) => {
      const status = ready ? load.slots[type] : null;
      return <label className={`ph-session-row ${status === "BOOKED" ? "is-booked" : ""}`} key={type}>
        <span><strong>{type === "MORNING" ? "Pagi" : type === "AFTERNOON" ? "Siang" : "Sore"}</strong><small>{startTime}–{endTime} WIB</small></span>
        <span className="ph-session-status">{status === null ? "Belum dimuat" : status === "BOOKED" ? "Sudah dipesan" : status === "AVAILABLE" ? "Tersedia" : "Tidak tersedia"}<input type="checkbox" checked={status === "AVAILABLE"} disabled={!ready || saving || status === "BOOKED"} onChange={(event) => {
          const available = event.target.checked;
          setLoad((current) => current.status === "ready" && current.date === date && current.slots[type] !== "BOOKED"
            ? { ...current, slots: { ...current.slots, [type]: available ? "AVAILABLE" : "UNAVAILABLE" } } : current);
        }}/></span>
      </label>;
    })}</div>
    <div className="ph-form-footer">
      <p className={`ph-status ${load.status === "error" || saveFailed ? "ph-error" : ""}`} role="status" aria-live="polite">{!date ? "Pilih tanggal untuk memuat jadwal." : load.status === "loading" ? "Memuat jadwal…" : load.status === "error" ? message || "Jadwal belum dapat dimuat. Coba muat ulang jadwal tanggal ini." : message}</p>
      {load.status === "error" && date && <button type="button" className="ph-button" disabled={saving} onClick={retryLoad}>Muat ulang jadwal</button>}
      <button type="button" className="ph-button" disabled={!ready || saving} onClick={() => void save()}>{saving ? "Menyimpan…" : "Simpan ketersediaan"}</button>
    </div>
  </>;
}
