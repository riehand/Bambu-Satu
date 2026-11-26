import Link from "next/link";
export default function NotFound() { return <section className="wb-card"><h1>Halaman tidak ditemukan</h1><p>Informasi mungkin sudah tidak tersedia atau tidak dapat diakses melalui akun Anda.</p><div className="wb-actions"><Link className="wb-button" href="/participant/dashboard">Kembali ke dashboard</Link></div></section>; }
