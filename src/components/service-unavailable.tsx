"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
export function ServiceUnavailable({ title = "Layanan belum tersedia", message = "Data belum dapat dimuat. Coba lagi atau kembali ke halaman sebelumnya." }: { title?: string; message?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <section className="wb-card service-unavailable" role="status"><h2>{title}</h2><p>{message}</p><div className="wb-actions"><button type="button" className="wb-button secondary" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Memuat ulang..." : "Coba lagi"}</button><Link href="/help">Bantuan penggunaan</Link></div></section>;
}
