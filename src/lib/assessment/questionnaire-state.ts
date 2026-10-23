export type Answer = { questionId: string; answerValue: number };
export type QuestionItem = { id: string; instrument: "DASS21" | "WEMWBS"; questionNumber: number; questionText: string };
export function resumeIndex(questions: QuestionItem[], answers: Answer[]) {
  const firstMissing = questions.findIndex(q => !answers.some(a => a.questionId === q.id));
  return firstMissing < 0 ? questions.length : firstMissing;
}
export function replaceAnswer(answers: Answer[], answer: Answer) { return [...answers.filter(a => a.questionId !== answer.questionId), answer]; }
export type SaveStatus = "idle" | "saving" | "saved" | "error";
export function saveStatusLabel(status: SaveStatus) {
  return { idle: "Pilih jawaban yang paling sesuai untuk Anda.", saving: "Menyimpan jawaban…", saved: "Jawaban tersimpan di akun Anda.", error: "Jawaban belum tersimpan. Silakan coba lagi." }[status];
}
