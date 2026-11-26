"use client";
import { useEffect, useRef, useState } from "react";
import { ScoreCards, dateLabel, type Scores } from "@/components/participant/ui";
type Report = { id: string; assessmentDate: string; scores: { depression: { score: number; category: Scores["depressionCategory"] }; anxiety: { score: number; category: Scores["anxietyCategory"] }; stress: { score: number; category: Scores["stressCategory"] }; wemwbs: { score: number } } };
export function SharedReport({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<Report | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const current = useRef<AbortController | null>(null);
  useEffect(() => () => current.current?.abort(), []);
  function close() { current.current?.abort(); current.current = null; setReport(null); setBusy(false); setError(""); }
  async function open() {
    if (current.current) return;
    const controller = new AbortController(); current.current = controller;
    setBusy(true); setError(""); setReport(null);
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok || !body.success || body.data?.id !== reportId || !body.data?.scores?.wemwbs) throw new Error("Laporan belum dapat dibuka atau izin sudah tidak berlaku. Coba muat ulang daftar janji.");
      if (!controller.signal.aborted) setReport(body.data);
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Laporan belum dapat dimuat."); }
    finally { if (!controller.signal.aborted) { current.current = null; setBusy(false); } }
  }
  return <div className="ph-shared-report"><button type="button" className="ph-button" disabled={busy} onClick={() => report ? close() : void open()}>{busy ? "Memeriksa akses..." : report ? "Tutup laporan" : "Lihat laporan bersama"}</button>{error && <p role="alert">{error}</p>}{report && <section aria-label="Laporan yang dibagikan" className="wb-card"><h3>Laporan asesmen bersama</h3><p>{dateLabel(report.assessmentDate)}</p><ScoreCards scores={{ depressionScore: report.scores.depression.score, depressionCategory: report.scores.depression.category, anxietyScore: report.scores.anxiety.score, anxietyCategory: report.scores.anxiety.category, stressScore: report.scores.stress.score, stressCategory: report.scores.stress.category, wemwbsScore: report.scores.wemwbs.score }}/><p>Hasil ini bukan diagnosis klinis. Akses hanya mencakup laporan ini, bukan seluruh riwayat atau jawaban mentah peserta.</p><button type="button" className="ph-button" onClick={() => { close(); void open(); }}>Periksa kembali akses</button></section>}</div>;
}
