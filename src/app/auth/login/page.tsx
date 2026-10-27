"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  return <Suspense fallback={<p className="p-8 text-center">Memuat...</p>}><LoginForm /></Suspense>;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const reasons: Record<string, string> = {
    inactive: "Akun Anda tidak aktif. Hubungi pengelola.",
    profile: "Profil akun belum tersedia. Hubungi pengelola.",
    unavailable: "Layanan sedang tidak tersedia. Silakan coba lagi nanti.",
    confirmation: "Tautan konfirmasi tidak valid, kedaluwarsa, atau sudah digunakan. Coba masuk jika sudah dikonfirmasi; jika belum, isi email lalu kirim ulang konfirmasi.",
  };
  const notices: Record<string, string> = {
    confirmed: "Email berhasil dikonfirmasi. Silakan masuk untuk melanjutkan.",
    "logged-out": "Anda berhasil keluar.",
  };
  const notice = notices[searchParams.get("notice") ?? ""];
  const reason = reasons[searchParams.get("reason") ?? ""];
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  async function resendConfirmation() {
    setLoading(true);
    setError("");
    setResendMessage("");
    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Belum dapat mengirim email.");
      setResendMessage(data.message);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Periksa koneksi lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Belum dapat masuk.");
      window.location.assign(data.redirectTo);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Periksa koneksi lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-dark">Selamat Datang</h1>
          <p className="text-gray-500 mt-2">Masuk ke WellBeing Hub</p>
        </div>

        {(resendMessage || notice) && <div role="status" className="mb-6 p-4 bg-green-50 text-green-800 rounded-lg text-sm border border-green-100">{resendMessage || notice}</div>}
        {(error || reason) && (
          <div role="alert" className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">
            {error || reason}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input id="email" type="email" name="email" autoComplete="username" required value={formData.email} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-soft outline-none transition-all" placeholder="Masukkan email Anda" />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-sm font-medium text-gray-700">Password</label>
            </div>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} name="password" autoComplete="current-password" required value={formData.password} onChange={handleChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-soft outline-none" placeholder="Masukkan password Anda" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm font-medium">
                {showPassword ? "Sembunyikan" : "Tampilkan"}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full py-3 px-4 bg-brand-dark hover:bg-brand-soft text-white font-medium rounded-lg transition-colors disabled:opacity-70 mt-6">
            {loading ? "Memverifikasi..." : "Masuk"}
          </button>
        </form>
        <button type="button" disabled={loading} onClick={resendConfirmation} className="mt-4 text-sm text-brand-dark hover:underline disabled:opacity-70">Kirim ulang email konfirmasi</button>

        <p className="text-center text-sm text-gray-500 mt-6">
          Belum punya akun? <Link href="/auth/register" className="text-brand-dark hover:underline font-medium">Daftar di sini</Link>
        </p>
      </div>
    </div>
  );
}
