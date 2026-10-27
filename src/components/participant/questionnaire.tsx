"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Brand, Icon } from "./icons";
import { replaceAnswer, resumeIndex, saveStatusLabel, type Answer, type QuestionItem, type SaveStatus } from "@/lib/assessment/questionnaire-state";

export type QuestionnaireProps = {
  sessionId: string; initialRevision: number; initialAnswers: Answer[]; questions: QuestionItem[];
  dassInstructions: string; wemwbsInstructions: string;
  dassOptions: { value: number; label: string }[]; wemwbsOptions: { value: number; label: string }[];
};

function SubmissionConfirmation({ pending, onCancel, onConfirm }: {
  pending: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="wb-confirm-dialog" aria-labelledby="confirm-title"
    aria-describedby="confirm-description" onCancel={event => { event.preventDefault(); if (!pending) onCancel(); }}>
    <span className="wb-eyebrow">Konfirmasi akhir</span>
    <h2 id="confirm-title">Kirim jawaban Anda?</h2>
    <p id="confirm-description">Seluruh 35 jawaban telah tersimpan. Setelah dikirim, jawaban tidak dapat diubah dan satu kesempatan asesmen akan digunakan. Hasil tetap pribadi.</p>
    <div className="wb-actions">
      <button ref={cancel} className="wb-button secondary" disabled={pending} onClick={onCancel}>Periksa lagi</button>
      <button className="wb-button" disabled={pending} onClick={onConfirm}>{pending ? "Mengirim…" : "Ya, kirim asesmen"}</button>
    </div>
  </dialog>;
}

export function Questionnaire(props: QuestionnaireProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState(props.initialAnswers);
  const [index, setIndex] = useState(() => resumeIndex(props.questions, props.initialAnswers));
  const [revision, setRevision] = useState(props.initialRevision);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Answer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const restoreSubmitFocus = useRef(false);
  const question = props.questions[index];
  const review = index === props.questions.length;
  const saved = question ? answers.find(a => a.questionId === question.id) : undefined;
  const selected = draft && question && draft.questionId === question.id ? draft.answerValue : saved?.answerValue;
  const isDass = question?.instrument === "DASS21";
  const options = isDass ? props.dassOptions : props.wemwbsOptions;
  const dirty = status === "saving" || status === "error";
  const answeredCount = props.questions.filter(q => answers.some(a => a.questionId === q.id)).length;
  const missingCount = props.questions.length - answeredCount;
  const instrumentCounts = ["DASS21", "WEMWBS"].map(instrument =>
    props.questions.filter(q => q.instrument === instrument && answers.some(a => a.questionId === q.id)).length);

  useEffect(() => {
    if (!dirty && !submitting) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, submitting]);
  useEffect(() => { heading.current?.focus(); }, [index]);
  useEffect(() => {
    // Wait until the modal is removed: the rest of the page is inert while open.
    if (!confirming && restoreSubmitFocus.current) {
      restoreSubmitFocus.current = false;
      if (!submitButton.current?.disabled) submitButton.current?.focus();
      else heading.current?.focus();
    }
  }, [confirming]);

  async function save(answer: Answer) {
    if (busy.current || conflict) return;
    busy.current = true; setDraft(answer); setStatus("saving"); setError("");
    try {
      const response = await fetch(`/api/assessment/sessions/${props.sessionId}/answers`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision, answers: [answer] }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.error?.code === "STALE_REVISION") setConflict(true);
        throw new Error(result.error?.message ?? "Jawaban belum tersimpan.");
      }
      if (result.data?.saved !== 1 || result.data?.revision !== revision + 1)
        throw new Error("Penyimpanan belum dapat dikonfirmasi. Muat ulang untuk memeriksa jawaban Anda.");
      setAnswers(current => replaceAnswer(current, answer));
      setRevision(result.data.revision); setStatus("saved"); setDraft(null);
    } catch (e) {
      setStatus("error"); setError(e instanceof Error ? e.message : "Koneksi terputus. Coba simpan lagi.");
    } finally { busy.current = false; }
  }
  function move(next: number) {
    if (busy.current || dirty || conflict) return;
    setIndex(next); setStatus("idle"); setError("");
  }
  function closeConfirmation() {
    restoreSubmitFocus.current = true;
    setConfirming(false);
  }
  async function submit() {
    if (busy.current || missingCount !== 0 || conflict) return;
    busy.current = true; setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/assessment/sessions/${props.sessionId}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.error?.code === "STALE_REVISION") setConflict(true);
        throw new Error(result.error?.message ?? "Asesmen belum berhasil dikirim.");
      }
      router.replace(`/participant/assessment/${props.sessionId}/results`); router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Periksa koneksi dan coba kirim lagi.");
      setSubmitting(false); busy.current = false; closeConfirmation();
    }
  }
  function leave() {
    if (!busy.current && !dirty) { router.push("/participant/dashboard"); router.refresh(); }
  }

  return <>
    <header className="wb-question-header"><Brand/><strong>Check-in pribadi Anda</strong>
      <button className="wb-button secondary" disabled={dirty || submitting} onClick={leave}>Simpan & lanjut nanti</button>
    </header>
    <main className="wb-question-main" id="main-content">
      <div className={`wb-progress${!isDass && !review ? " wb-progress-wemwbs" : ""}`}>
        <div className="wb-progress-labels">
          <strong>{review ? "Tinjau jawaban Anda" : isDass ? "Bagian 1 · DASS-21" : "Bagian 2 · WEMWBS"}</strong>
          <span>{review ? `${answeredCount} dari 35 lengkap` : `Pertanyaan ${question.questionNumber} dari ${isDass ? 21 : 14}`}</span>
        </div>
        <progress value={answeredCount} max={35} aria-label={`${answeredCount} dari 35 jawaban tersimpan`}/>
        <div className="wb-progress-summary"><p>{answeredCount} dari 35 jawaban tersimpan</p>
          <p>DASS-21 {instrumentCounts[0]}/21 · WEMWBS {instrumentCounts[1]}/14</p></div>
      </div>
      <section className="wb-question-card">
        {review ? <>
          <span className="wb-eyebrow">Satu langkah lagi</span>
          <h1 ref={heading} tabIndex={-1}>Siap menyelesaikan check-in?</h1>
          <p>Periksa pilihan Anda di bawah. Pilih pertanyaan untuk mengubah jawaban sebelum mengirim.</p>
          {missingCount > 0 && <p role="alert" className="wb-error-text">Masih ada {missingCount} pertanyaan yang belum dijawab. Lengkapi semuanya sebelum mengirim.</p>}
          {(["DASS21", "WEMWBS"] as const).map(instrument => <section className="wb-review-group" key={instrument} aria-label={`Tinjau ${instrument === "DASS21" ? "DASS-21" : "WEMWBS"}`}>
            <h2>{instrument === "DASS21" ? "DASS-21" : "WEMWBS"} <small>{instrumentCounts[instrument === "DASS21" ? 0 : 1]}/{instrument === "DASS21" ? 21 : 14} tersimpan</small></h2>
            <div className="wb-review-list">{props.questions.map((q, i) => {
              if (q.instrument !== instrument) return null;
              const answer = answers.find(a => a.questionId === q.id);
              const label = (instrument === "DASS21" ? props.dassOptions : props.wemwbsOptions).find(o => o.value === answer?.answerValue)?.label;
              return <button key={q.id} disabled={submitting || conflict} onClick={() => move(i)}>
                <span className="wb-review-copy"><strong>{q.questionNumber}. {q.questionText}</strong>
                  <span>{answer ? `${answer.answerValue} · ${label}` : "Belum dijawab"}</span></span>
                <span className="wb-review-edit">{answer ? "Ubah" : "Lengkapi"}<Icon name="arrow"/></span>
              </button>;
            })}</div>
          </section>)}
          {error && <p role="alert" className="wb-error-text">{error}</p>}
          {conflict && <button className="wb-button secondary" onClick={() => window.location.reload()}>Muat ulang jawaban tersimpan</button>}
          <div className="wb-question-actions">
            <button className="wb-button secondary" disabled={submitting || conflict} onClick={() => move(34)}>Kembali</button>
            <button ref={submitButton} className="wb-button" disabled={submitting || missingCount !== 0 || conflict} onClick={() => setConfirming(true)}>Kirim & lihat hasil<Icon name="arrow"/></button>
          </div>
        </> : <>
          <p className="wb-timeframe">{isDass ? "Ingat kembali seminggu terakhir…" : "Ingat kembali dua minggu terakhir…"}</p>
          <fieldset disabled={status === "saving" || conflict}>
            <legend><h1 ref={heading} tabIndex={-1}>{question.questionText}</h1></legend>
            <p className="wb-question-instruction">{isDass ? props.dassInstructions : props.wemwbsInstructions}</p>
            <div className="wb-answers">{options.map(option => <label className="wb-answer" key={`${question.id}-${option.value}`}>
              <strong>{option.value}</strong><span>{option.label}</span>
              <input type="radio" name={question.id} value={option.value} checked={selected === option.value}
                onChange={() => void save({ questionId: question.id, answerValue: option.value })}/>
            </label>)}</div>
          </fieldset>
          <div className="wb-save-status" role="status" aria-live="polite">
            {(status === "saved" || (saved && status === "idle")) && <Icon name="check"/>}
            {saveStatusLabel(saved && status === "idle" ? "saved" : status)}
          </div>
          {error && <div role="alert"><p className="wb-error-text">{error}</p>
            {conflict ? <button className="wb-button secondary" onClick={() => window.location.reload()}>Muat ulang jawaban tersimpan</button>
              : <button className="wb-button secondary" disabled={status === "saving"} onClick={() => draft && void save(draft)}>Coba simpan lagi</button>}
          </div>}
          <div className="wb-question-actions">
            <button className="wb-button secondary" disabled={index === 0 || dirty || conflict} onClick={() => move(index - 1)}>Sebelumnya</button>
            <button className="wb-button" disabled={!saved || dirty || conflict} onClick={() => move(index + 1)}>
              {index === 34 ? "Tinjau jawaban" : index === 20 ? "Lanjut ke WEMWBS" : "Selanjutnya"}<Icon name="arrow"/>
            </button>
          </div>
          {index !== 34 && <button className="wb-review-link" disabled={dirty || conflict} onClick={() => move(props.questions.length)}>Tinjau semua jawaban ({answeredCount}/35)</button>}
        </>}
      </section>
      <p className="wb-footnote">Ambil jeda kapan pun Anda perlu. Jawaban yang berhasil disimpan tetap tersedia di akun Anda. Hasil tidak dibagikan secara otomatis.</p>
      {review && <Link href="/participant/assessment" className="wb-muted" aria-disabled={submitting} onClick={e => { if (submitting) e.preventDefault(); }}>Tentang asesmen</Link>}
    </main>
    {confirming && <SubmissionConfirmation pending={submitting} onCancel={closeConfirmation} onConfirm={() => void submit()}/>}
  </>;
}
