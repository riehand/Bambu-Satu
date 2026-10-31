"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ReportStatus = "PENDING" | "GENERATED";
type ViewState = "pending" | "requesting" | "failed" | "generated";

export function ReportDownload({ reportId, reportStatus }: { reportId: string; reportStatus: ReportStatus }) {
  const [state, setState] = useState<ViewState>(reportStatus === "GENERATED" ? "generated" : "pending");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const requestStarted = useRef(false);
  const generated = useRef(reportStatus === "GENERATED");

  const generate = useCallback(async () => {
    if (requestStarted.current || generated.current) return;
    requestStarted.current = true;
    setState("requesting");
    try {
      const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/generate`, {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (response.ok) {
        generated.current = true;
        setState("generated");
        return;
      }
      const retrySeconds = Math.max(5, Number(response.headers.get("Retry-After")) || 10);
      setRetryAt(Date.now() + retrySeconds * 1000);
      setState("failed");
    } catch {
      setRetryAt(Date.now() + 10_000);
      setState("failed");
    } finally {
      requestStarted.current = false;
    }
  }, [reportId]);

  useEffect(() => {
    if (reportStatus === "PENDING") void generate();
  }, [generate, reportStatus]);

  useEffect(() => {
    if (!retryAt) return;
    if (now >= retryAt) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 250);
    return () => window.clearTimeout(timer);
  }, [now, retryAt]);

  if (state === "generated") {
    return <a className="wb-button secondary" href={`/api/reports/${encodeURIComponent(reportId)}/download`}>Unduh laporan PDF</a>;
  }

  const secondsLeft = Math.max(0, Math.ceil((retryAt - now) / 1000));
  return <div className="wb-report-action" aria-live="polite">
    {state === "requesting" ? <span className="wb-footnote">Sedang memproses permintaan pembuatan laporan…</span>
      : state === "failed" ? <>
        <span className="wb-footnote">Laporan belum dapat disiapkan. Asesmen dan skor Anda tetap tersimpan.{secondsLeft ? ` Coba lagi dalam ${secondsLeft} detik.` : ""}</span>
        <button className="wb-button secondary" type="button" onClick={() => void generate()} disabled={secondsLeft > 0}>Coba lagi</button>
      </>
      : <span className="wb-footnote">Laporan belum siap. Asesmen dan skor Anda tetap tersimpan.</span>}
  </div>;
}
