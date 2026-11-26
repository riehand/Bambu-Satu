import { Suspense } from "react";
import { requirePageRole, withApplicationDatabase } from "@/lib/auth/session";
import { getPsychologistProfile } from "@/lib/psychologist/service";
import { PsychologistProfileEditor } from "@/components/psychologist/profile-editor";
import { PsychologistAvailabilityEditor } from "@/components/psychologist/availability-editor";
import { PsychologistAppointmentList } from "@/components/psychologist/appointment-list";
import { ConsultationDashboard } from "@/components/consultations/dashboard";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { jakartaDate } from "@/lib/psychologist/availability-config";
import "../psychologist.css";

async function PsychologistDashboardContent() {
  const profile = await requirePageRole("PSYCHOLOGIST");
  let psychologistProfile;
  let profileUnavailable = false;
  try { psychologistProfile = await withApplicationDatabase(() => getPsychologistProfile(profile.id)); }
  catch { profileUnavailable = true; }
  return <WorkspaceShell fullName={profile.fullName}>
      <div id="overview" className="ph-heading"><h1>Selamat datang, {profile.fullName}.</h1><p>Kelola janji, jadwal ketersediaan, dan profil profesional Anda.</p></div>
      <div className="ph-notice"><strong>Privasi profil</strong>Informasi profesional di bawah ini dapat dilihat peserta yang masuk ke direktori. Profil ini tidak memberikan akses ke hasil asesmen peserta.</div>
      <ConsultationDashboard role="PSYCHOLOGIST"/>
      <section id="appointments"><PsychologistAppointmentList/></section>
      <section id="availability"><PsychologistAvailabilityEditor today={jakartaDate()}/></section>
      <section id="profile">{profileUnavailable ? <ServiceUnavailable title="Profil profesional belum dapat dimuat" message="Informasi profil belum tersedia. Coba lagi nanti; profil lama Anda tidak diubah."/> : <PsychologistProfileEditor initialProfile={psychologistProfile ?? null}/>}</section>
  </WorkspaceShell>;
}

export default function PsychologistDashboard() { return <Suspense fallback={<p role="status">Memuat dashboard...</p>}><PsychologistDashboardContent/></Suspense>; }
