import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";

export default async function ParticipantDashboard() {
  // Mengambil sesi user di sisi server
  const session = await getServerSession(authOptions);

  // Jika tidak ada sesi (belum login), kembalikan ke halaman login
  if (!session) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-brand-mint p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-8 border border-gray-100">
        <h1 className="text-3xl font-bold text-brand-dark mb-2">Participant Dashboard</h1>
        <p className="text-gray-600 mb-6">Platform Asesmen Kesejahteraan Mental Telkom University.</p>
        
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h2 className="font-semibold text-gray-800 border-b pb-2 mb-2">Profil Anda</h2>
          <p className="text-gray-600"><strong>Nama:</strong> {session.user?.name}</p>
          <p className="text-gray-600"><strong>Identitas (NIM/NIP):</strong> {session.user?.institutionalId}</p>
          <p className="text-gray-600"><strong>Role:</strong> {session.user?.role}</p>
        </div>
      </div>
    </div>
  );
}