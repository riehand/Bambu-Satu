"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

type Props = { reportId: string; appointmentId?: string; className?: string };

export function ReportFileDownload(props: Props) {
  return <DownloadAction key={`${props.reportId}:${props.appointmentId ?? ""}`} {...props}/>;
}

function DownloadAction({ reportId, appointmentId, className = "wb-button secondary" }: Props) {
  const [state, setState] = useState<"idle" | "downloading" | "failed" | "done">("idle");
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  const objectUrls = useRef(new Map<string, number>());
  const href = `/api/reports/${encodeURIComponent(reportId)}/download${appointmentId ? `?appointmentId=${encodeURIComponent(appointmentId)}` : ""}`;

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      request.current?.abort();
      for (const [url, timer] of urls) {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  async function download(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState("downloading");
    setMessage("Menyiapkan unduhan laporan…");
    try {
      const response = await fetch(href, {
        headers: { Accept: "application/pdf" }, credentials: "same-origin", cache: "no-store",
        signal: controller.signal, redirect: "error",
      });
      if (!response.ok) {
        throw new Error(response.status === 401 ? "session" : response.status === 403 ? "denied" : "unavailable");
      }
      if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/pdf") throw new Error("unavailable");
      const blob = await response.blob();
      const signature = await blob.slice(0, 5).text();
      const tail = await blob.slice(-1024).text();
      // Full identity/content validation happens server-side before the response.
      if (signature !== "%PDF-" || !tail.trimEnd().endsWith("%%EOF")) throw new Error("unavailable");
      if (controller.signal.aborted) return;
      const filename = response.headers.get("content-disposition")?.match(/filename="([a-zA-Z0-9._-]+\.pdf)"/i)?.[1]
        ?? `hasil-asesmen-${reportId}.pdf`;
      const url = URL.createObjectURL(blob);
      // Give the browser time to consume the Blob; also release it on unmount.
      const timer = window.setTimeout(() => { URL.revokeObjectURL(url); objectUrls.current.delete(url); }, 60_000);
      objectUrls.current.set(url, timer);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      setState("done");
      setMessage("Unduhan laporan dimulai.");
    } catch (error) {
      if (controller.signal.aborted) return;
      setState("failed");
      setMessage(error instanceof Error && error.message === "session" ? "Sesi Anda berakhir. Silakan masuk kembali."
        : error instanceof Error && error.message === "denied" ? "Akses laporan tidak tersedia. Persetujuan mungkin telah dicabut atau berakhir."
        : "Laporan belum dapat diunduh. Silakan coba lagi nanti.");
    } finally {
      if (!controller.signal.aborted) request.current = null;
    }
  }

  return <div aria-busy={state === "downloading"}>
    <a className={className} href={href} onClick={(event) => { void download(event); }} aria-disabled={state === "downloading"}>
      {state === "downloading" ? "Mengunduh laporan…" : state === "failed" ? "Coba unduh lagi" : "Unduh laporan PDF"}
    </a>
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
