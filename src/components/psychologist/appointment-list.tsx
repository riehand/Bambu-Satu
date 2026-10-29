"use client";

import { useEffect, useState } from "react";

type Appointment = {
  appointmentId: string; status: string; scheduledStartAt: string; scheduledEndAt: string;
  participantNote: string | null; assessmentDate: string | null; sessionType: string;
  participant: { fullName: string; userType: string | null };
};

const indonesiaTime = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));

export function PsychologistAppointmentList() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/psychologist/appointments").then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("load-failed");
      if (active) setItems(result.data as Appointment[]);
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <section className="ph-card">
    <div className="ph-section-heading"><div><h2>Janji konsultasi</h2><p>Daftar janji yang ditugaskan kepada Anda. Informasi asesmen hanya dapat dibuka melalui izin laporan yang berlaku.</p></div></div>
    {failed ? <p className="ph-status ph-error" role="status">Daftar janji belum dapat dimuat.</p> : loading ? <p className="ph-status" role="status">Memuat janji...</p> : items.length ? <div className="ph-appointments">{items.map((item) => <article className="ph-appointment" key={item.appointmentId}><div><strong>{item.participant.fullName}</strong><small>{item.participant.userType === "STUDENT" ? "Mahasiswa" : item.participant.userType === "LECTURER" ? "Dosen" : "Peserta"} · {item.sessionType}</small><p>{indonesiaTime(item.scheduledStartAt)} WIB</p>{item.participantNote && <p>Catatan peserta: {item.participantNote}</p>}</div><span>{item.status}</span></article>)}</div> : <p className="ph-status">Belum ada janji konsultasi.</p>}
  </section>;
}
