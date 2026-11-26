"use client";

import { useEffect, useState } from "react";
import { ReportFileDownload } from "@/components/reports/file-download";
import type { AppointmentReportAccess } from "@/lib/reports/contracts";
import { SharedReport } from "./shared-report";
import { AppointmentDetails } from "@/components/appointments/details";

type Appointment = {
  appointmentId: string; status: string; scheduledStartAt: string; scheduledEndAt: string;
  participantNote: string | null; assessmentDate: string | null; sessionType: string;
  participant: { fullName: string; userType: string | null };
  reportAccess: AppointmentReportAccess;
};

const indonesiaTime = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value));

function ReportAccess({ access, appointmentId }: { access: AppointmentReportAccess; appointmentId: string }) {
  if (access.status === "AVAILABLE") return <div>
    <p>Akses laporan tersedia{access.consentType === "STANDALONE_REPORT_ACCESS" ? " melalui persetujuan mandiri" : ""}.</p>
    <SharedReport key={access.reportId} reportId={access.reportId}/>
    <ReportFileDownload reportId={access.reportId} appointmentId={appointmentId} className="ph-button"/>
  </div>;
  return <p>{access.status === "CONSENT_EXPIRED" ? "Persetujuan akses laporan telah berakhir."
    : access.status === "REPORT_UNAVAILABLE" ? "Laporan belum tersedia."
    : "Persetujuan akses laporan belum tersedia atau telah dicabut."}</p>;
}

export function PsychologistAppointmentList() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void fetch("/api/psychologist/appointments").then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error("load-failed");
      if (active) setItems(result.data as Appointment[]);
    }).catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  return <section className="ph-card">
    <div className="ph-section-heading"><div><h2>Janji konsultasi</h2><p>Daftar janji yang ditugaskan kepada Anda. Informasi asesmen hanya dapat dibuka melalui izin laporan yang berlaku.</p></div></div>
    {failed ? <div><p className="ph-status ph-error" role="status">Daftar janji belum dapat dimuat.</p><button className="ph-button" onClick={() => { setFailed(false); setLoading(true); setRevision(value => value + 1); }}>Coba lagi</button></div> : loading ? <p className="ph-status" role="status">Memuat janji...</p> : items.length ? <div className="ph-appointments">{items.map((item) => <article className="ph-appointment" key={item.appointmentId} data-appointment-id={item.appointmentId}><AppointmentDetails appointmentId={item.appointmentId}/><div><strong>{item.participant.fullName}</strong><small>{item.participant.userType === "STUDENT" ? "Mahasiswa" : item.participant.userType === "LECTURER" ? "Dosen" : "Peserta"} · {item.sessionType}</small><p>{indonesiaTime(item.scheduledStartAt)} WIB</p>{item.participantNote && <p>Catatan peserta: {item.participantNote}</p>}<ReportAccess access={item.reportAccess} appointmentId={item.appointmentId}/></div><span>{item.status}</span></article>)}</div> : <p className="ph-status">Belum ada janji konsultasi.</p>}
  </section>;
}
