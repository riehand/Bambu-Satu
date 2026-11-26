"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    userType: "STUDENT",
    institutionalId: "",
    phoneNumber: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError("Password dan Konfirmasi Password tidak cocok.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || "Terjadi kesalahan saat registrasi");
      }

      setSuccessMessage(data.message);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Periksa koneksi lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthShell registration>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-brand-dark mb-4">Periksa Pendaftaran Anda</h2>
          <p role="status" className="text-gray-600 mb-6">{successMessage}</p>
          <Link href="/auth/login" className="block w-full py-3 px-4 bg-brand-dark hover:bg-brand-soft text-white font-medium rounded-lg transition-colors">
            Menuju Halaman Login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell registration>
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-brand-dark">Daftar Akun</h1>
          <p className="text-gray-500 mt-2">WellBeing Hub - Telkom University</p>
        </div>

        {error && (
          <div role="alert" className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
            <input id="fullName" type="text" name="fullName" autoComplete="name" required value={formData.fullName} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-soft focus:border-transparent outline-none transition-all" placeholder="Masukkan nama lengkap" />
          </div>

          <div>
            <label htmlFor="userType" className="block text-sm font-medium text-gray-700 mb-1">Tipe Pengguna</label>
            <select id="userType" name="userType" value={formData.userType} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-soft outline-none">
              <option value="STUDENT">Mahasiswa</option>
              <option value="LECTURER">Dosen</option>
            </select>
          </div>

          <div>
            <label htmlFor="institutionalId" className="block text-sm font-medium text-gray-700 mb-1">{formData.userType === "STUDENT" ? "NIM" : "NIP"}</label>
            <input id="institutionalId" type="text" name="institutionalId" required value={formData.institutionalId} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-soft outline-none" placeholder={`Masukkan ${formData.userType === "STUDENT" ? "NIM" : "NIP"} Anda`} />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input id="email" type="email" name="email" autoComplete="email" required value={formData.email} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-soft outline-none" placeholder="alamat@email.com" />
          </div>

          <div>
            <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">Nomor Telepon</label>
            <input id="phoneNumber" type="tel" name="phoneNumber" autoComplete="tel" required value={formData.phoneNumber} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-soft outline-none" placeholder="08xxxxxxxxxx" />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input id="password" type="password" name="password" autoComplete="new-password" minLength={8} maxLength={128} required value={formData.password} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-soft outline-none" placeholder="Minimal 8 karakter" />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Konfirmasi Password</label>
            <input id="confirmPassword" type="password" name="confirmPassword" autoComplete="new-password" required value={formData.confirmPassword} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-soft outline-none" placeholder="Ketik ulang password" />
          </div>

          <button type="submit" disabled={loading} className="w-full py-3 px-4 bg-brand-dark hover:bg-brand-soft text-white font-medium rounded-lg transition-colors disabled:opacity-70 mt-6">
            {loading ? "Memproses..." : "Daftar Sekarang"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Sudah punya akun? <Link href="/auth/login" className="text-brand-dark hover:underline font-medium">Masuk di sini</Link>
        </p>
      </div>
    </AuthShell>
  );
}
