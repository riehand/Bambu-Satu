"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PROCESSING_CONSENT_TEXT } from "@/lib/assessment/consent";
import { Icon } from "./icons";
import { DataError, EmergencyNote, PrivacyNote } from "./ui";
import type { Quota } from "./dashboard";
export function Introduction({ quota, error }: { quota: Quota | null; error: string | null }) {
  const router = useRouter();
  const [consent, setConsent] = useState(false), [pending, setPending] = useState(false), [failure, setFailure] = useState("");
  const busy = useRef(false);
  const resume = quota?.inProgressSessionId;
  const unavailable = error ?? quota?.availability?.message ?? (!resume && quota?.remaining === 0 ? "Kuota asesmen untuk periode ini telah habis." : null);
  async function begin() {
    if (busy.current) return;
    busy.current = true; setPending(true); setFailure("");
    try {
      const response = await fetch("/api/assessment/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ processingConsent: consent }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Asesmen belum dapat dimulai.");
      router.push(`/participant/assessment/${result.data.assessmentSessionId}`);
    } catch (e) { setFailure(e instanceof Error ? e.message : "Periksa koneksi Anda lalu coba lagi."); setPending(false); busy.current = false; }
  }
  return <>
    <div className="wb-page-heading"><h1>Mulai dengan mengenali diri.</h1><p>Tidak ada jawaban benar atau salah. Pilih yang paling sesuai dengan pengalaman Anda.</p></div>
    <div className="wb-info-grid"><div className="wb-info"><Icon name="clock"/>Sekitar 10–15 menit</div><div className="wb-info"><Icon name="clipboard"/>35 pertanyaan seluruhnya</div><div className="wb-info"><Icon name="check"/>Progres tersimpan di akun</div></div>
    <div className="wb-grid-two"><section className="wb-card wb-instrument-card"><h2>DASS-21</h2><span className="wb-eyebrow">Bagian 1 · 21 pertanyaan</span><h3>Perasaan Anda selama seminggu terakhir</h3><p>Depression Anxiety Stress Scales membantu Anda merefleksikan gejala depresi, kecemasan, dan stres. Setiap jawaban menggunakan skala 0–3.</p><hr/><p className="wb-footnote">Hasil menggambarkan respons Anda, bukan diagnosis klinis. Skor setiap dimensi dikalikan dua untuk kategori standar.</p></section><section className="wb-card wb-instrument-card"><h2>WEMWBS</h2><span className="wb-eyebrow wb-blue">Bagian 2 · 14 pertanyaan</span><h3>Kesejahteraan Anda selama dua minggu terakhir</h3><p>Warwick–Edinburgh Mental Wellbeing Scale membantu Anda merefleksikan perasaan positif dan keseharian. Setiap jawaban menggunakan skala 1–5.</p><hr/><p className="wb-footnote">Skor total berada pada rentang 14–70. Platform ini tidak memberikan kategori diagnosis untuk WEMWBS.</p></section></div>
    <PrivacyNote/>
    {unavailable && <DataError message={unavailable}/>}
    <section className="wb-card"><h2>Sebelum Anda mulai</h2><p>Jawab sesuai ritme Anda. Anda dapat kembali, mengubah jawaban, atau beristirahat dan melanjutkan nanti.</p>
      {resume ? <p className="wb-muted" style={{marginTop:16}}>Anda memiliki asesmen yang belum selesai. Persetujuan pemrosesan sudah tercatat saat sesi dimulai.</p> : <label className="wb-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={pending}/><span>{PROCESSING_CONSENT_TEXT}</span></label>}
      <p className="wb-footnote">Persetujuan ini tidak mencakup berbagi hasil dengan psikolog atau layanan AI eksternal.</p>
      {failure && <p className="wb-error-text" role="alert">{failure}</p>}
      <div className="wb-actions">{resume && !unavailable ? <Link className="wb-button" href={`/participant/assessment/${resume}`}><Icon name="arrow"/>Lanjutkan asesmen</Link> : <button className="wb-button" disabled={!consent || pending || !!unavailable || !quota} onClick={begin}><Icon name="arrow"/>{pending ? "Menyiapkan asesmen…" : "Mulai DASS-21"}</button>}<Link className="wb-button secondary" href="/participant/dashboard">Nanti saja</Link></div>
    </section><EmergencyNote/>
  </>;
}
