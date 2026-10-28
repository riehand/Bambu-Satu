import { requirePageRole } from "@/lib/auth/session";
import { getPsychologistProfile } from "@/lib/psychologist/service";
import { PsychologistProfileEditor } from "@/components/psychologist/profile-editor";
import { LogoutButton } from "@/components/logout-button";
import { Brand } from "@/components/participant/icons";
import "../psychologist.css";

export default async function PsychologistDashboard() {
  const profile = await requirePageRole("PSYCHOLOGIST");
  const psychologistProfile = await getPsychologistProfile(profile.id);
  return <div className="ph-page">
    <header className="ph-header"><Brand/><span>Ruang profesional psikolog</span><div className="ph-logout"><LogoutButton/></div></header>
    <main className="ph-main">
      <div className="ph-heading"><h1>Profil profesional</h1><p>Halo, {profile.fullName}. Lengkapi informasi profesional yang ingin Anda bagikan kepada peserta.</p></div>
      <div className="ph-notice"><strong>Privasi profil</strong>Informasi profesional di bawah ini dapat dilihat peserta yang masuk ke direktori. Profil ini tidak memberikan akses ke hasil asesmen peserta.</div>
      <PsychologistProfileEditor initialProfile={psychologistProfile}/>
    </main>
  </div>;
}
