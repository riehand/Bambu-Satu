import { LogoutButton } from "./logout-button";

export function RolePlaceholder({ title, name }: { title: string; name: string }) {
  return <div className="min-h-screen bg-brand-mint p-8">
    <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-8 border border-gray-100">
      <h1 className="text-3xl font-bold text-brand-dark mb-2">{title}</h1>
      <p className="text-gray-600 mb-6">Selamat datang, {name}. Fitur dashboard sedang dipersiapkan.</p>
      <LogoutButton />
    </div>
  </div>;
}
