import Image from "next/image";
import Link from "next/link";
import { Brand, Icon } from "@/components/participant/icons";

export function AuthShell({ children, registration = false }: { children: React.ReactNode; registration?: boolean }) {
  return <main className="auth-shell">
    <aside className="auth-story"><Link href="/" aria-label="WellBeing Hub — beranda"><Brand/></Link>
      <p className="auth-eyebrow">Ruang wellbeing pribadi Anda</p>
      <h2>{registration ? <>Kesejahteraan Anda.<br/>Ruang milik Anda.</> : <>Tempat yang tenang<br/>untuk mengenali diri.</>}</h2>
      <p>Berhenti sejenak, pahami perasaan Anda, dan temukan dukungan. Satu langkah kecil pada satu waktu.</p>
      {registration ? <><ul>{["Refleksi sesuai ritme Anda", "Hasil tetap pribadi", "Terhubung dengan dukungan manusia"].map(text => <li key={text}><Icon name="shield"/>{text}</li>)}</ul><div className="auth-note">Identitas kampus digunakan untuk mengenali akun Anda, bukan sebagai label hasil asesmen.</div></> : <Image src="/images/wellbeing-space.svg" alt="Ilustrasi ruang tenang dengan kursi, tanaman, dan cahaya jendela" width={800} height={700} className="auth-art"/>}
      <small>Untuk mahasiswa dan dosen Telkom University.</small>
    </aside>
    <section className="auth-content"><Link className="auth-back" href="/">← Kembali ke beranda</Link>{children}<footer className="auth-footer"><Link href="/privacy">Privasi & persetujuan</Link><span> · </span><Link href="/help">Bantuan</Link></footer></section>
  </main>;
}
