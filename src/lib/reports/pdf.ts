import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { DASS_CATEGORY_LABELS, type DassCategory } from "@/lib/assessment/scoring/dass21";

export type AssessmentReportPdfData = {
  reportId: string;
  assessmentSessionId: string;
  assessmentDate: string;
  scores: {
    depression: { score: number; category: DassCategory };
    anxiety: { score: number; category: DassCategory };
    stress: { score: number; category: DassCategory };
    wemwbs: { score: number };
  };
};

const TEMPLATE_VERSION = 1;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const FOOTER_HEIGHT = 42;
const ink = rgb(25 / 255, 63 / 255, 53 / 255);
const muted = rgb(99 / 255, 121 / 255, 112 / 255);
const green = rgb(34 / 255, 123 / 255, 85 / 255);
const pale = rgb(243 / 255, 250 / 255, 246 / 255);
const border = rgb(220 / 255, 232 / 255, 225 / 255);

function reportFingerprint(data: AssessmentReportPdfData) {
  const canonical = JSON.stringify({
    templateVersion: TEMPLATE_VERSION,
    reportId: data.reportId,
    assessmentSessionId: data.assessmentSessionId,
    assessmentDate: data.assessmentDate,
    scores: data.scores,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function markerFor(data: AssessmentReportPdfData) {
  return `bambu-satu-report:v${TEMPLATE_VERSION}:${data.reportId}:${reportFingerprint(data)}`;
}

function wrappedLines(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generateAssessmentReportPdf(data: AssessmentReportPdfData) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontDirectory = join(process.cwd(), "public", "fonts");
  const regular = await pdf.embedFont(await readFile(join(fontDirectory, "NotoSans-Regular.ttf")), { subset: true });
  const bold = await pdf.embedFont(await readFile(join(fontDirectory, "NotoSans-Bold.ttf")), { subset: true });
  const pages: PDFPage[] = [];
  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  let cursor = PAGE_HEIGHT - MARGIN;

  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    cursor = PAGE_HEIGHT - MARGIN;
  };
  const ensureRoom = (height: number) => {
    if (cursor - height < MARGIN + FOOTER_HEIGHT) addPage();
  };
  const line = (text: string, size: number, font: PDFFont, color = ink) => {
    ensureRoom(size + 8);
    cursor -= size;
    page.drawText(text, { x: MARGIN, y: cursor, size, font, color });
    cursor -= 8;
  };
  const paragraph = (text: string, size = 10.5, font: PDFFont = regular, color = muted) => {
    const lineHeight = size * 1.45;
    for (const textLine of wrappedLines(text, font, size, PAGE_WIDTH - MARGIN * 2)) {
      ensureRoom(lineHeight);
      cursor -= size;
      page.drawText(textLine, { x: MARGIN, y: cursor, size, font, color });
      cursor -= lineHeight - size;
    }
    cursor -= 7;
  };
  const sectionTitle = (text: string) => {
    ensureRoom(30);
    cursor -= 19;
    page.drawText(text, { x: MARGIN, y: cursor, size: 13, font: bold, color: green });
    cursor -= 11;
  };

  line("Laporan Hasil Asesmen", 21, bold);
  paragraph("Ringkasan hasil dari satu asesmen", 10.5, regular, muted);

  const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(data.assessmentDate));
  ensureRoom(58);
  page.drawRectangle({ x: MARGIN, y: cursor - 48, width: PAGE_WIDTH - MARGIN * 2, height: 48, color: pale, borderColor: border, borderWidth: 0.8 });
  page.drawText(`Tanggal asesmen: ${date} WIB`, { x: MARGIN + 12, y: cursor - 20, size: 10.5, font: regular, color: ink });
  page.drawText(`Referensi laporan: ${data.reportId}`, { x: MARGIN + 12, y: cursor - 38, size: 9.5, font: regular, color: muted });
  cursor -= 64;

  sectionTitle("DASS-21");
  const dimensions = [
    { name: "Depresi", result: data.scores.depression },
    { name: "Kecemasan", result: data.scores.anxiety },
    { name: "Stres", result: data.scores.stress },
  ];
  for (const [index, dimension] of dimensions.entries()) {
    ensureRoom(34);
    const top = cursor;
    page.drawRectangle({ x: MARGIN, y: top - 30, width: PAGE_WIDTH - MARGIN * 2, height: 30, color: index % 2 === 0 ? pale : rgb(1, 1, 1), borderColor: border, borderWidth: 0.5 });
    page.drawText(dimension.name, { x: MARGIN + 10, y: top - 20, size: 10.5, font: bold, color: ink });
    page.drawText(`${dimension.result.score} / 42`, { x: MARGIN + 180, y: top - 20, size: 10.5, font: regular, color: ink });
    page.drawText(DASS_CATEGORY_LABELS[dimension.result.category], { x: MARGIN + 300, y: top - 20, size: 10.5, font: regular, color: green });
    cursor -= 36;
  }
  paragraph("Kategori mengikuti hasil baku DASS-21 yang dihitung pada asesmen ini. Kategori menjelaskan respons kuesioner, bukan diagnosis.");

  sectionTitle("WEMWBS");
  ensureRoom(42);
  page.drawRectangle({ x: MARGIN, y: cursor - 38, width: PAGE_WIDTH - MARGIN * 2, height: 38, color: pale, borderColor: border, borderWidth: 0.8 });
  page.drawText("Skor kesejahteraan", { x: MARGIN + 12, y: cursor - 24, size: 10.5, font: bold, color: ink });
  page.drawText(`${data.scores.wemwbs.score} / 70`, { x: MARGIN + 220, y: cursor - 24, size: 12, font: bold, color: green });
  cursor -= 52;

  sectionTitle("Cara membaca hasil");
  paragraph("DASS-21 terdiri dari tiga dimensi. Skor mentah dari tujuh jawaban pada tiap dimensi dikalikan 2 untuk rentang standar 0 sampai 42. Laporan memakai skor dan kategori yang telah dihitung oleh sistem asesmen.");
  paragraph("WEMWBS menjumlahkan 14 jawaban pada rentang 14 sampai 70. Skor WEMWBS tidak diberi kategori diagnosis dan tidak digabung dengan skor DASS-21.");

  ensureRoom(60);
  page.drawRectangle({ x: MARGIN, y: cursor - 49, width: PAGE_WIDTH - MARGIN * 2, height: 49, color: pale, borderColor: border, borderWidth: 0.8 });
  page.drawText("Penting", { x: MARGIN + 12, y: cursor - 18, size: 10.5, font: bold, color: green });
  const disclaimerLines = wrappedLines("Hasil asesmen ini bukan diagnosis klinis.", regular, 10.5, PAGE_WIDTH - MARGIN * 2 - 24);
  let disclaimerY = cursor - 35;
  for (const text of disclaimerLines) {
    page.drawText(text, { x: MARGIN + 12, y: disclaimerY, size: 10.5, font: regular, color: ink });
    disclaimerY -= 15;
  }

  pages.forEach((current, index) => {
    current.drawLine({ start: { x: MARGIN, y: 35 }, end: { x: PAGE_WIDTH - MARGIN, y: 35 }, thickness: 0.6, color: border });
    current.drawText(`Halaman ${index + 1} dari ${pages.length}`, { x: PAGE_WIDTH - MARGIN - 100, y: 21, size: 8.5, font: regular, color: muted });
  });

  pdf.setTitle("Laporan Hasil Asesmen");
  pdf.setAuthor("Bambu-Satu WellBeing Hub");
  pdf.setSubject(markerFor(data));
  pdf.setCreationDate(new Date(data.assessmentDate));
  pdf.setModificationDate(new Date(data.assessmentDate));
  return pdf.save();
}

export async function isExpectedAssessmentReportPdf(bytes: Uint8Array, data: AssessmentReportPdfData) {
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") return false;
  try {
    const pdf = await PDFDocument.load(bytes);
    return pdf.getPageCount() > 0 && pdf.getSubject() === markerFor(data) && pdf.getTitle() === "Laporan Hasil Asesmen";
  } catch {
    return false;
  }
}
