import { requirePageRole } from "@/lib/auth/session";
import { LogoutButton } from "@/components/logout-button";

export default async function ParticipantDashboard() {
  const profile = await requirePageRole("PARTICIPANT");

  return (
    <div className="min-h-screen bg-brand-mint p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-8 border border-gray-100">
        <h1 className="text-3xl font-bold text-brand-dark mb-2">Participant Dashboard</h1>
        <p className="text-gray-600 mb-6">Platform Asesmen Kesejahteraan Mental Telkom University.</p>
        
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h2 className="font-semibold text-gray-800 border-b pb-2 mb-2">Profil Anda</h2>
          <p className="text-gray-600"><strong>Nama:</strong> {profile.fullName}</p>
          <p className="text-gray-600"><strong>Identitas (NIM/NIP):</strong> {profile.institutionalId}</p>
          <p className="text-gray-600"><strong>Role:</strong> {profile.role}</p>
        </div>
        <LogoutButton />
      </div>
    </div>
  );
}
