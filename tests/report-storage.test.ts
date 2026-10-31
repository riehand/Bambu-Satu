import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), from: vi.fn(), upload: vi.fn(), download: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { downloadReportObject, reportObjectKeyFor, ReportStorageError, uploadReportObject } from "@/lib/reports/storage";

const reportId = "00000000-0000-4000-8000-000000000501";
const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49]);

beforeEach(() => {
  vi.resetAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://synthetic.supabase.test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_synthetic_only";
  mocks.createClient.mockReturnValue({ storage: { from: mocks.from } });
  mocks.from.mockReturnValue({ upload: mocks.upload, download: mocks.download });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.download.mockResolvedValue({ data: new Blob([pdfBytes]), error: null });
});

it("derives only the deterministic report path and uploads create-only to the private bucket", async () => {
  expect(reportObjectKeyFor(reportId)).toBe(`reports/${reportId}.pdf`);
  await uploadReportObject(reportId, pdfBytes);
  expect(mocks.from).toHaveBeenCalledWith("assessment-reports");
  expect(mocks.upload).toHaveBeenCalledWith(`reports/${reportId}.pdf`, pdfBytes, {
    contentType: "application/pdf", cacheControl: "0", upsert: false,
  });
  expect(mocks.createClient).toHaveBeenCalledWith("https://synthetic.supabase.test", "sb_secret_synthetic_only", expect.any(Object));
});

it("derives the read-back path internally and rejects arbitrary object paths", async () => {
  await expect(downloadReportObject(reportId)).resolves.toEqual(pdfBytes);
  expect(mocks.download).toHaveBeenCalledWith(`reports/${reportId}.pdf`);
  await expect(downloadReportObject("reports/arbitrary.pdf")).rejects.toBeInstanceOf(ReportStorageError);
  expect(mocks.download).toHaveBeenCalledTimes(1);
});

it("classifies Storage create conflicts without leaking provider details", async () => {
  mocks.upload.mockResolvedValueOnce({ error: { statusCode: "409", message: "internal storage detail" } });
  await expect(uploadReportObject(reportId, pdfBytes)).rejects.toMatchObject({ kind: "conflict", message: "conflict" });
});
