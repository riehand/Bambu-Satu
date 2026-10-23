"use client";

import { useState } from "react";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      // Discard the client router's previously rendered protected pages.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full navigation clears protected client router state after logout.
      window.location.assign("/auth/login?notice=logged-out");
    } catch {
      setError("Belum dapat keluar. Periksa koneksi lalu coba lagi.");
      setPending(false);
    }
  }
  return <div className="mt-6">
    <button type="button" disabled={pending} onClick={logout} className="rounded-lg bg-brand-dark px-4 py-2 text-white hover:bg-brand-soft disabled:opacity-70">{pending ? "Memproses..." : "Keluar"}</button>
    {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
  </div>;
}
