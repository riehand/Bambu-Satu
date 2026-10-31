import { writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { expect, it } from "vitest";
import { generateAssessmentReportPdf, isExpectedAssessmentReportPdf, type AssessmentReportPdfData } from "@/lib/reports/pdf";

const data: AssessmentReportPdfData = {
  reportId: "00000000-0000-4000-8000-000000000701",
  assessmentSessionId: "00000000-0000-4000-8000-000000000702",
  assessmentDate: "2026-10-31T17:00:00.000Z",
  scores: {
    depression: { score: 8, category: "NORMAL" },
    anxiety: { score: 10, category: "MODERATE" },
    stress: { score: 18, category: "MILD" },
    wemwbs: { score: 49 },
  },
};

it("embeds Indonesian Noto Sans fonts and creates a readable single-assessment PDF with the expected report fingerprint", async () => {
  const bytes = await generateAssessmentReportPdf(data);
  const pdf = await PDFDocument.load(bytes);
  expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  expect(pdf.getTitle()).toBe("Laporan Hasil Asesmen");
  expect(pdf.getSubject()).toContain(data.reportId);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  expect(await isExpectedAssessmentReportPdf(bytes, data)).toBe(true);
  expect(await isExpectedAssessmentReportPdf(bytes, { ...data, scores: { ...data.scores, wemwbs: { score: 50 } } })).toBe(false);
  expect(await isExpectedAssessmentReportPdf(bytes.subarray(0, 80), data)).toBe(false);

  const outputPath = process.env.REPORT_PDF_TEST_OUTPUT;
  if (outputPath) await writeFile(outputPath, bytes);
});
