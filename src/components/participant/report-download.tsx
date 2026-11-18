"use client";

import { useEffect, useRef, useState } from "react";

type ReportStatus = "PENDING" | "GENERATED";
type ViewState = "requesting" | "failed" | "generated";

function DownloadLink({ reportId }: { reportId: string }) {
  return <a className="wb-button secondary" href={`/api/reports/${encodeURIComponent(reportId)}/download`}>Unduh laporan PDF</a>;
}

export function ReportDownload({ reportId, reportStatus }: { reportId: string; reportStatus: ReportStatus }) {
  return <div className="wb-report-action" aria-live="polite">
    {reportStatus === "GENERATED" ? <DownloadLink reportId={reportId}/> : <PendingReport key={reportId} reportId={reportId}/>}
  </div>;
}

function PendingReport({ reportId }: { reportId: string }) {
  const [state, setState] = useState<ViewState>("requesting");
  const [attempt, setAttempt] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(0);
  const requestPending = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    function fail(retrySeconds: number) {
      if (controller.signal.aborted) return;
      const failedAt = Date.now();
      setNow(failedAt);
      setRetryAt(failedAt + retrySeconds * 1000);
      setState("failed");
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
        if (response.ok) {
          setState("generated");
          return;
        }
        const retrySeconds = Number(response.headers.get("Retry-After"));
        fail(Number.isFinite(retrySeconds) && retrySeconds > 0 ? Math.max(5, retrySeconds) : 10);
      } catch {
        fail(10);
      }
    }
    // Cancel a Strict Mode setup replay before it dispatches a generation POST.
    const start = window.setTimeout(() => { void generate(); }, 0);
    return () => {
      window.clearTimeout(start);
      controller.abort();
    };
  }, [reportId, attempt]);

  useEffect(() => {
    if (state !== "failed" || now >= retryAt) return;
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
    {state === "requesting" ? <span className="wb-footnote">Sedang memproses permintaan pembuatan laporan…</span> : <>
      <span className="wb-footnote">Laporan belum dapat disiapkan. Asesmen dan skor Anda tetap tersimpan.{secondsLeft ? ` Coba lagi dalam ${secondsLeft} detik.` : ""}</span>
      <button className="wb-button secondary" type="button" onClick={retry} disabled={secondsLeft > 0}>Coba lagi</button>
    </>}
  </div>;
}
