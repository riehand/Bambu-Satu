"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Brand, Icon } from "./icons";
import { replaceAnswer, resumeIndex, saveStatusLabel, type Answer, type QuestionItem, type SaveStatus } from "@/lib/assessment/questionnaire-state";

export type QuestionnaireProps = { sessionId: string; initialRevision: number; initialAnswers: Answer[]; questions: QuestionItem[];
  dassInstructions: string; wemwbsInstructions: string; dassOptions: { value: number; label: string }[]; wemwbsOptions: { value: number; label: string }[] };
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
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const question = props.questions[index];
  const review = index === props.questions.length;
  const saved = question ? answers.find(a => a.questionId === question.id) : undefined;
  const selected = draft && question && draft.questionId === question.id ? draft.answerValue : saved?.answerValue;
  const isDass = question?.instrument === "DASS21";
  const options = isDass ? props.dassOptions : props.wemwbsOptions;
  const dirty = status === "saving" || status === "error";

  useEffect(() => {
    if (!dirty && !submitting) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, submitting]);
  useEffect(() => { heading.current?.focus(); }, [index]);

  async function save(answer: Answer) {
    if (busy.current || conflict) return;
    busy.current = true; setDraft(answer); setStatus("saving"); setError("");
    try {
      const response = await fetch(`/api/assessment/sessions/${props.sessionId}/answers`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: revision, answers: [answer] }) });
      const result = await response.json();
      if (!response.ok) {
        if (result.error?.code === "STALE_REVISION") setConflict(true);
        throw new Error(result.error?.message ?? "Jawaban belum tersimpan.");
      }
      setAnswers(current => replaceAnswer(current, answer)); setRevision(result.data.revision); setStatus("saved"); setDraft(null);
    } catch (e) { setStatus("error"); setError(e instanceof Error ? e.message : "Koneksi terputus. Coba simpan lagi."); }
    finally { busy.current = false; }
  }
  function move(next: number) { if (busy.current || dirty) return; setIndex(next); setStatus("idle"); setError(""); }
  async function submit() {
    if (busy.current || answers.length !== 35) return;
    busy.current = true; setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/assessment/sessions/${props.sessionId}/submit`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Asesmen belum berhasil dikirim.");
      router.replace(`/participant/assessment/${props.sessionId}/results`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Periksa koneksi dan coba kirim lagi."); setSubmitting(false); busy.current = false; }
  }
  function leave() { if (!busy.current && !dirty) { router.push("/participant/dashboard"); router.refresh(); } }
  return <>
    <header className="wb-question-header"><Brand/><strong>Check-in pribadi Anda</strong><button className="wb-button secondary" disabled={dirty || submitting} onClick={leave}>Simpan & lanjut nanti</button></header>
    <main className="wb-question-main" id="main-content">
      <div className="wb-progress"><div className="wb-progress-labels"><strong>{review ? "Tinjau jawaban Anda" : isDass ? "Bagian 1 · DASS-21" : "Bagian 2 · WEMWBS"}</strong><span>{review ? "Siap dikirim" : `Pertanyaan ${question.questionNumber} dari ${isDass ? 21 : 14}`}</span></div><progress value={answers.length} max={35} aria-label={`${answers.length} dari 35 jawaban tersimpan`}/><p>{!isDass && !review && "DASS-21 selesai · "}{answers.length} dari 35 jawaban tersimpan</p></div>
      <section className="wb-question-card">
        {review ? <><span className="wb-eyebrow">Satu langkah lagi</span><h1 ref={heading} tabIndex={-1}>Siap menyelesaikan check-in?</h1><p>Periksa kembali jawaban Anda. Setelah dikirim, jawaban tidak dapat diubah. Hasil akan dihitung dan disimpan secara pribadi.</p><div className="wb-review-list">{props.questions.map((q,i) => <button key={q.id} disabled={submitting} onClick={() => move(i)}><strong>{q.instrument === "DASS21" ? "DASS-21" : "WEMWBS"} · {q.questionNumber}</strong><span>{answers.some(a => a.questionId === q.id) ? "Terjawab · Tinjau" : "Belum dijawab"}</span></button>)}</div>{error && <p role="alert" className="wb-error-text">{error}</p>}<div className="wb-question-actions"><button className="wb-button secondary" disabled={submitting} onClick={() => move(34)}>Kembali</button><button className="wb-button" disabled={submitting || answers.length !== 35} onClick={submit}>{submitting ? "Mengirim…" : "Kirim & lihat hasil"}<Icon name="arrow"/></button></div></> : <>
          <p className="wb-timeframe">{isDass ? "Ingat kembali seminggu terakhir…" : "Ingat kembali dua minggu terakhir…"}</p>
          <fieldset disabled={status === "saving" || conflict}><legend><h1 ref={heading} tabIndex={-1}>{question.questionText}</h1></legend><p className="wb-question-instruction">{isDass ? props.dassInstructions : props.wemwbsInstructions}</p><div className="wb-answers">{options.map(option => <label className="wb-answer" key={`${question.id}-${option.value}`}><strong>{option.value}</strong><span>{option.label}</span><input type="radio" name={question.id} value={option.value} checked={selected === option.value} onChange={() => void save({ questionId: question.id, answerValue: option.value })}/></label>)}</div></fieldset>
          <div className="wb-save-status" role="status" aria-live="polite">{(status === "saved" || (saved && status === "idle")) && <Icon name="check"/>}{saveStatusLabel(saved && status === "idle" ? "saved" : status)}</div>
          {error && <div role="alert"><p className="wb-error-text">{error}</p>{conflict ? <button className="wb-button secondary" onClick={() => window.location.reload()}>Muat ulang jawaban tersimpan</button> : <button className="wb-button secondary" disabled={status === "saving"} onClick={() => draft && void save(draft)}>Coba simpan lagi</button>}</div>}
          <div className="wb-question-actions"><button className="wb-button secondary" disabled={index === 0 || dirty} onClick={() => move(index - 1)}>Sebelumnya</button><button className="wb-button" disabled={!saved || dirty || conflict} onClick={() => move(index + 1)}>{index === 34 ? "Tinjau jawaban" : index === 20 ? "Lanjut ke WEMWBS" : "Selanjutnya"}<Icon name="arrow"/></button></div>
        </>}
      </section>
      <p className="wb-footnote">Ambil jeda kapan pun Anda perlu. Jawaban yang berhasil disimpan tetap tersedia di akun Anda. Hasil tidak dibagikan secara otomatis.</p>
      {review && <Link href="/participant/assessment" className="wb-muted" aria-disabled={submitting} onClick={e => { if (submitting) e.preventDefault(); }}>Tentang asesmen</Link>}
    </main>
  </>;
}
