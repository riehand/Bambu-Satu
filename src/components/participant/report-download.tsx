"use client";

import { useEffect, useRef, useState } from "react";
import { ReportFileDownload } from "@/components/reports/file-download";

type ReportStatus = "PENDING" | "GENERATED";
type ViewState = "idle" | "requesting" | "pending" | "failed" | "generated";

function DownloadLink({ reportId }: { reportId: string }) {
  return <ReportFileDownload reportId={reportId}/>;
}

export function ReportDownload({ reportId, reportStatus, autoGenerate = true }: { reportId: string; reportStatus: ReportStatus; autoGenerate?: boolean }) {
  return <div className="wb-report-action" aria-live="polite">
    {reportStatus === "GENERATED" ? <DownloadLink reportId={reportId}/> : <PendingReport key={`${reportId}:${autoGenerate}`} reportId={reportId} autoGenerate={autoGenerate}/>}
  </div>;
}

function PendingReport({ reportId, autoGenerate }: { reportId: string; autoGenerate: boolean }) {
  const [state, setState] = useState<ViewState>(autoGenerate ? "requesting" : "idle");
  const [attempt, setAttempt] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(0);
  const requestPending = useRef(autoGenerate);

  useEffect(() => {
    if (!autoGenerate && attempt === 0) return;
    const controller = new AbortController();
    function waitToRetry(retrySeconds: number, nextState: "pending" | "failed" = "failed") {
      if (controller.signal.aborted) return;
      const failedAt = Date.now();
      setNow(failedAt);
      setRetryAt(failedAt + retrySeconds * 1000);
      setState(nextState);
      requestPending.current = false;
    }
    async function generate() {
      try {
        const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/generate`, {
          method: "POST",
          headers: { Accept: "application/json" },
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const retrySeconds = Number(response.headers.get("Retry-After"));
        const delay = Number.isFinite(retrySeconds) && retrySeconds > 0 ? Math.max(5, retrySeconds) : 10;
        if (!response.ok) {
          waitToRetry(delay);
          return;
        }
        const result = await response.json();
        if (controller.signal.aborted) return;
        // HTTP acceptance is not evidence that an artifact has been generated.
        const matchesReport = result?.data?.reportId === undefined || result.data.reportId === reportId;
        if (result?.success === true && matchesReport && result.data?.status === "GENERATED") {
          setState("generated");
          return;
        }
        waitToRetry(delay, result?.success === true && matchesReport && result.data?.status === "PENDING" ? "pending" : "failed");
      } catch {
        waitToRetry(10);
      }
    }
    // Cancel a Strict Mode setup replay before it dispatches a generation POST.
    const start = window.setTimeout(() => { void generate(); }, 0);
    return () => {
      window.clearTimeout(start);
      controller.abort();
    };
  }, [reportId, attempt, autoGenerate]);

  useEffect(() => {
    if ((state !== "failed" && state !== "pending") || now >= retryAt) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 250);
    return () => window.clearTimeout(timer);
  }, [state, now, retryAt]);

  function retry() {
    if (requestPending.current || Date.now() < retryAt) return;
    requestPending.current = true;
    setState("requesting");
    setAttempt((current) => current + 1);
  }

  if (state === "generated") return <DownloadLink reportId={reportId}/>;

  const secondsLeft = Math.max(0, Math.ceil((retryAt - now) / 1000));
  return <div role="status" aria-busy={state === "requesting"}>
    <p className="wb-footnote">Status laporan: PENDING · PDF belum tersedia.</p>
    {state === "idle" ? <button className="wb-button secondary" type="button" onClick={retry}>Buat PDF</button> : state === "requesting" ? <span className="wb-footnote">Sedang memproses permintaan pembuatan laporan…</span> : <>
      <span className="wb-footnote">{state === "pending" ? "Laporan masih diproses. Asesmen dan skor Anda tetap tersimpan." : "Laporan belum dapat disiapkan. Asesmen dan skor Anda tetap tersimpan."}{secondsLeft ? ` Coba lagi dalam ${secondsLeft} detik.` : ""}</span>
      <button className="wb-button secondary" type="button" onClick={retry} disabled={secondsLeft > 0}>{state === "pending" ? "Periksa status laporan" : "Coba lagi"}</button>
    </>}
  </div>;
}
