import Link from "next/link";
import { Icon } from "./icons";
import { DataError, EmptyState, PrivacyNote, ScoreCards, dateLabel, type HistoryItem } from "./ui";
export type Quota = {
  academicPeriod: { id: string; name: string }; limit: number; completed: number; remaining: number;
  inProgressSessionId: string | null;
  inProgress: { answered: number; total: number; updatedAt: string } | null;
  availability: { code: string; message: string } | null;
};
export function DashboardView({ fullName, quota, quotaError, history, historyError }: { fullName: string; quota: Quota | null; quotaError: string | null; history: HistoryItem[] | null; historyError: string | null }) {
  const latest = history?.[0];
  const resume = quota?.inProgressSessionId;
  return <>
    <div className="wb-page-heading"><h1>Sejenak untuk dirimu, {fullName.split(" ")[0]}.</h1><p>Selamat datang di ruang wellbeing pribadi Anda.</p></div>
    <section className="wb-hero"><div><span className="wb-eyebrow">Langkah kecil tetap berarti</span><h2>Apa kabarmu hari ini?</h2><p>Luangkan waktu untuk memahami perasaanmu.<br/>Mulai saat kamu merasa siap.</p><Link className="wb-button" href={resume ? `/participant/assessment/${resume}` : "/participant/assessment"}><Icon name="arrow"/>{resume ? "Lanjutkan asesmen" : "Mulai check-in pribadi"}</Link></div><div className="wb-hero-art" aria-hidden="true"><svg viewBox="0 0 180 160" fill="none"><path d="M20 145h140" stroke="#b4cbb5" strokeWidth="3"/><path d="M70 112h40l-6 33H76Z" fill="#ceb99e"/><path d="M90 112V38" stroke="#718f6e" strokeWidth="3"/><path d="M89 89C51 91 43 65 51 55c25-4 40 10 38 34M91 71c34 4 45-20 37-34-25-2-39 11-37 34M89 50C66 51 60 32 65 22c18-2 27 11 24 28" fill="#a1bd97"/><path d="M132 125h20v15h-20zm20 2c15-2 13 12 0 10" stroke="#c6ac85" strokeWidth="3"/></svg></div></section>
    <div className="wb-shortcuts">{[{ name: "clipboard", title: "Asesmen", sub: "Kenali perasaan Anda", href: "/participant/assessment" },{ name: "chart", title: "Riwayat", sub: "Lihat kembali hasil Anda", href: "/participant/history" }].map(c => <Link className="wb-shortcut" href={c.href} key={c.title}><Icon name={c.name}/><div><strong>{c.title}</strong><small>{c.sub}</small></div></Link>)}{[{ name:"people", title:"Psikolog" },{ name:"spark", title:"Pendamping AI" }].map(c => <div className="wb-shortcut" aria-disabled="true" key={c.title}><Icon name={c.name}/><div><strong>{c.title}</strong><small>Segera tersedia</small></div></div>)}</div>
    {quotaError ? <DataError message={quotaError}/> : quota && <section className="wb-card wb-quota" aria-label="Kuota asesmen">
      <div><span className="wb-eyebrow">Periode akademik aktif</span><h2>{quota.academicPeriod.name}</h2><small>Satu asesmen mencakup DASS-21 dan WEMWBS.</small></div>
      <dl className="wb-quota-stats"><div><dt>Selesai</dt><dd>{quota.completed}</dd></div><div><dt>Tersisa</dt><dd>{quota.remaining}<small> / {quota.limit}</small></dd></div></dl>
    </section>}
    {quota?.availability && <DataError message={quota.availability.message}/>}
    {resume && quota?.inProgress && <section className="wb-card wb-resume" aria-label="Asesmen tersimpan">
      <div className="wb-section-meta"><div><span className="wb-eyebrow">Sedang berlangsung</span><h2>Lanjutkan saat Anda siap.</h2></div><span className="wb-progress-badge">{quota.inProgress.answered}/{quota.inProgress.total} tersimpan</span></div>
      <div className="wb-progress"><progress value={quota.inProgress.answered} max={quota.inProgress.total} aria-label="Jawaban asesmen tersimpan"/></div>
      <p className="wb-footnote">Terakhir disimpan {dateLabel(quota.inProgress.updatedAt)}. Sesi ini belum mengurangi kuota Anda.</p>
      <div className="wb-actions">{!quota.availability && <Link className="wb-button" href={`/participant/assessment/${resume}`}>Lanjutkan asesmen<Icon name="arrow"/></Link>}</div>
    </section>}
    {quota && quota.remaining === 0 && !resume && <section className="wb-notice"><Icon name="check"/><div><strong>Check-in periode ini sudah lengkap.</strong><p>Anda telah menggunakan {quota.limit} kesempatan asesmen. Hasil Anda tetap tersedia di riwayat.</p><Link href="/participant/history" className="wb-review-link">Lihat riwayat <Icon name="arrow"/></Link></div></section>}
    <section className="wb-card"><h2>Asesmen terakhir Anda</h2>{historyError ? <DataError message={historyError}/> : latest?.scores ? <><div className="wb-section-meta"><p>{latest.completedAt && dateLabel(latest.completedAt)} · DASS-21 + WEMWBS</p><span className="wb-eyebrow">Pribadi</span></div><ScoreCards scores={latest.scores}/><p className="wb-footnote" style={{marginTop:16}}>Skor DASS-21 dikalikan dua. Hasil ini bukan diagnosis klinis.</p><div className="wb-actions"><Link className="wb-button secondary" href={`/participant/assessment/${latest.assessmentSessionId}/results`}>Lihat hasil lengkap</Link></div></> : <EmptyState title="Ruang untuk langkah pertama Anda">Belum ada hasil asesmen. Setelah menyelesaikan check-in, ringkasan pribadi Anda akan muncul di sini.</EmptyState>}</section>
    <div className="wb-grid-two"><section className="wb-card"><span className="wb-eyebrow">Sesuai ritme Anda</span><h2>Tak perlu selesai sekaligus.</h2><p>Jawaban yang berhasil disimpan akan tetap tersedia di akun Anda. Ambil jeda dan lanjutkan saat merasa siap.</p><div className="wb-actions"><Link className="wb-button secondary" href="/participant/assessment">Tentang asesmen <Icon name="arrow"/></Link></div></section><section className="wb-card"><span className="wb-eyebrow">Pengingat kecil</span><h2>Istirahat juga bagian dari proses.</h2><p>Di tengah kesibukan, beri diri Anda waktu untuk berhenti sejenak dan menyadari apa yang sedang Anda rasakan.</p></section></div>
    <PrivacyNote/>
  </>;
}
