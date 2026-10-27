import Link from "next/link";
import { Icon } from "./icons";
import type { DassCategory } from "@/lib/assessment/scoring/dass21";

export function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="wb-notice"><Icon name="shield"/><div><strong>{title}</strong><p>{children}</p></div></div>;
}
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="wb-empty"><span className="wb-empty-icon"><Icon name="clipboard"/></span><h3>{title}</h3><p>{children}</p></div>;
}
export function DataError({ message }: { message: string }) { return <div className="wb-notice wb-warning" role="status"><Icon name="clock"/><div><strong>Asesmen belum tersedia</strong><p>{message}</p></div></div>; }
export function EmergencyNote() { return <p className="wb-footnote">Layanan ini bukan layanan darurat. Jika Anda berada dalam bahaya langsung, hubungi layanan darurat setempat atau datangi IGD terdekat.</p>; }
export function PrivacyNote() { return <Notice title="Hasil Anda bersifat pribadi">Jawaban dan hasil asesmen tidak dibagikan secara otomatis kepada psikolog atau Chatbot. Persetujuan berbagi merupakan izin yang terpisah.</Notice>; }
export function dateLabel(value: string | Date) { return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB"; }
export const categoryLabels: Record<DassCategory, string> = { NORMAL: "Normal", MILD: "Ringan", MODERATE: "Sedang", SEVERE: "Berat", EXTREMELY_SEVERE: "Sangat berat" };
export type Scores = { depressionScore: number; depressionCategory: DassCategory; anxietyScore: number; anxietyCategory: DassCategory; stressScore: number; stressCategory: DassCategory; wemwbsScore: number };
export function ScoreCards({ scores }: { scores: Scores }) {
  const cards = [{ title: "Depresi", value: scores.depressionScore, category: scores.depressionCategory }, { title: "Kecemasan", value: scores.anxietyScore, category: scores.anxietyCategory }, { title: "Stres", value: scores.stressScore, category: scores.stressCategory }, { title: "WEMWBS", value: scores.wemwbsScore, category: null }];
  return <div className="wb-score-grid">{cards.map(c => <div className="wb-score" key={c.title}><h3>{c.title}</h3><p className="wb-score-number">{c.value}<span> / {c.category ? 42 : 70}</span></p><span className={`wb-category ${c.category ? c.category.toLowerCase() : "wellbeing"}`}>{c.category ? categoryLabels[c.category] : "Skor kesejahteraan"}</span><small>{c.category ? `Skor mentah ${c.value / 2} × 2` : "Rentang 14–70"}</small><div className="wb-score-bar"><span style={{ width: `${c.value / (c.category ? 42 : 70) * 100}%` }}/></div></div>)}</div>;
}
export type HistoryItem = { assessmentSessionId: string; completedAt: string | null; reportId: string | null; scores: Scores | null };
export function HistoryList({ history }: { history: HistoryItem[] }) {
  return <section className="wb-card"><h2>Riwayat asesmen Anda</h2><p className="wb-muted">Hasil pribadi dari setiap waktu yang Anda luangkan untuk diri sendiri.</p>{history.length ? <div className="wb-history-list">{history.map(item => <article key={item.assessmentSessionId} className="wb-history-row"><div><h3>{item.completedAt ? dateLabel(item.completedAt) : "Tanggal belum tersedia"}</h3>{item.scores && <p>Depresi {item.scores.depressionScore} · Kecemasan {item.scores.anxietyScore} · Stres {item.scores.stressScore} · WEMWBS {item.scores.wemwbsScore}/70</p>}<small>Pribadi · DASS-21 + WEMWBS</small></div><Link className="wb-button secondary" href={`/participant/assessment/${item.assessmentSessionId}/results`}>Lihat hasil <Icon name="arrow"/></Link></article>)}</div> : <EmptyState title="Belum ada asesmen selesai">Hasil asesmen Anda akan muncul di sini setelah seluruh jawaban dikirim.</EmptyState>}</section>;
}
