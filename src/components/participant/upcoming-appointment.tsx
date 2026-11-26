"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { dateLabel } from "./ui";
type Appointment = { appointmentId: string; scheduledStartAt: string; scheduledEndAt: string; status: string; psychologist: { fullName: string } };
export function UpcomingAppointment() {
  const [state, setState] = useState<{ loading: boolean; failed: boolean; item: Appointment | null }>({ loading: true, failed: false, item: null });
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/appointments", { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok || !body.success || !Array.isArray(body.data)) throw new Error("unavailable");
      const items = (body.data as Appointment[]).filter(item => ["CONFIRMED", "IN_PROGRESS"].includes(item.status) && new Date(item.scheduledEndAt).getTime() > Date.now()).sort((a,b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt));
      if (!controller.signal.aborted) setState({ loading: false, failed: false, item: items[0] ?? null });
    }).catch(() => { if (!controller.signal.aborted) setState({ loading: false, failed: true, item: null }); });
    return () => controller.abort();
  }, []);
  return <section className="wb-card"><span className="wb-eyebrow">Dukungan manusia</span><h2>Janji konsultasi Anda</h2>{state.loading ? <p role="status">Memuat jadwal...</p> : state.failed ? <p role="status">Jadwal belum dapat dimuat. Buka pengelolaan janji untuk mencoba lagi.</p> : state.item ? <><h3>{state.item.psychologist.fullName}</h3><p>{dateLabel(state.item.scheduledStartAt)}</p><p className="wb-footnote">{state.item.status === "IN_PROGRESS" ? "Sedang berlangsung" : "Dikonfirmasi"} · Akses laporan mengikuti persetujuan Anda.</p></> : <p>Belum ada janji mendatang. Anda dapat memilih psikolog ketika merasa siap.</p>}<div className="wb-actions"><Link href="/participant/appointments" className="wb-button secondary">Kelola janji</Link></div></section>;
}
