import { AppointmentCenter } from "@/components/participant/appointment-center";

export default function ParticipantAppointmentsPage() {
  return <>
    <div className="wb-page-heading"><span className="wb-eyebrow">Konsultasi</span><h1>Janji dan persetujuan laporan</h1><p>Kelola janji konsultasi serta izin berbagi laporan secara terpisah.</p></div>
    <AppointmentCenter />
  </>;
}
