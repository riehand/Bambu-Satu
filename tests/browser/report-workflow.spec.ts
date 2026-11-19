import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";

type Transfer = { url: string; aborted: boolean; respond: (status: number, bytes: number[], headers: Record<string, string>) => void; fail: () => void };
declare global {
  interface Window { reportTransfers: Transfer[]; reportUrls: { created: string[]; revoked: string[] } }
}
const reportA = "00000000-0000-4000-8000-000000000950";
const reportB = "00000000-0000-4000-8000-000000000951";
let pdf: number[];

test.beforeAll(async () => {
  const document = await PDFDocument.create();
  document.addPage().drawText("SYNTHETIC REPORT - NO PARTICIPANT DATA");
  pdf = Array.from(await document.save());
});
test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.addInitScript(() => {
    window.reportTransfers = [];
    window.reportUrls = { created: [], revoked: [] };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const url = create(blob); window.reportUrls.created.push(url); return url; };
    URL.revokeObjectURL = (url) => { window.reportUrls.revoked.push(url); revoke(url); };
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(input);
      if (!url.startsWith("/api/reports/") || !url.includes("/download")) return original(input, init);
      return new Promise<Response>((resolve, reject) => {
        const transfer: Transfer = {
          url, aborted: init?.signal?.aborted ?? false,
          respond: (status, bytes, headers) => resolve(new Response(new Uint8Array(bytes).buffer, { status, headers })),
          fail: () => reject(new TypeError("synthetic network failure")),
        };
        // Deliver late responses even after abort to exercise the component's guard.
        init?.signal?.addEventListener("abort", () => { transfer.aborted = true; });
        window.reportTransfers.push(transfer);
      });
    };
  });
});

async function count(page: Page, n: number) {
  await expect.poll(() => page.evaluate(() => window.reportTransfers.length)).toBe(n);
}
async function respond(page: Page, index: number, status = 200, bytes = pdf, contentType = "application/pdf") {
  await page.evaluate(({ index, status, bytes, contentType }) => window.reportTransfers[index].respond(status, bytes, {
    "Content-Type": contentType, "Content-Disposition": 'attachment; filename="laporan-sintetis.pdf"',
  }), { index, status, bytes, contentType });
}
async function finishDownload(page: Page, index: number) {
  const waiting = page.waitForEvent("download");
  await respond(page, index);
  const download = await waiting;
  expect(download.suggestedFilename()).toBe("laporan-sintetis.pdf");
  expect(Array.from(await readFile((await download.path())!))).toEqual(pdf);
  await expect(page.getByRole("status")).toContainText("Unduhan laporan dimulai");
}

test("participant downloads a validated PDF with its server filename and releases its Blob URL", async ({ page }) => {
  await page.clock.install();
  await page.goto("/?view=report-download&state=generated");
  const link = page.getByRole("link", { name: "Unduh laporan PDF" });
  await link.focus();
  await page.keyboard.press("Enter");
  await count(page, 1);
  await expect(page.getByRole("link", { name: "Mengunduh laporan…" })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("status")).toContainText("Menyiapkan unduhan");
  await finishDownload(page, 0);
  expect(page.url()).toContain("view=report-download");
  await page.clock.fastForward(60_000);
  expect(await page.evaluate(() => window.reportUrls.revoked)).toEqual(await page.evaluate(() => window.reportUrls.created));
});

for (const failure of ["missing artifact", "denied consent", "expired session", "network", "JSON success", "corrupted PDF"]) {
  test(`participant handles ${failure} without navigating to JSON and can retry`, async ({ page }) => {
    await page.goto("/?view=report-download&state=generated");
    await page.getByRole("link", { name: "Unduh laporan PDF" }).click();
    await count(page, 1);
    if (failure === "network") await page.evaluate(() => window.reportTransfers[0].fail());
    else if (failure === "JSON success") await respond(page, 0, 200, Array.from(new TextEncoder().encode('{"private":"never display this"}')), "application/json");
    else if (failure === "corrupted PDF") await respond(page, 0, 200, Array.from(new TextEncoder().encode("%PDF-truncated")));
    else await respond(page, 0, failure === "denied consent" ? 403 : failure === "expired session" ? 401 : 503, [], "application/json");
    await expect(page.getByRole("status")).toContainText(failure === "denied consent" ? "Persetujuan mungkin" : failure === "expired session" ? "Silakan masuk kembali" : "belum dapat diunduh");
    expect(page.url()).toContain("view=report-download");
    await expect(page.locator("body")).not.toContainText("never display this");
    expect(await page.evaluate(() => window.reportUrls.created.length)).toBe(0);
    await page.getByRole("link", { name: "Coba unduh lagi" }).click();
    await count(page, 2);
    await finishDownload(page, 1);
  });
}

test("duplicate clicks make one request, and unmount aborts and ignores a late download response", async ({ page }) => {
  await page.goto("/?view=report-download&state=generated");
  await page.getByRole("link", { name: "Unduh laporan PDF" }).evaluate((link: HTMLAnchorElement) => { link.click(); link.click(); });
  await count(page, 1);
  await page.getByRole("button", { name: "Tutup laporan" }).click();
  expect(await page.evaluate(() => window.reportTransfers[0].aborted)).toBe(true);
  await respond(page, 0);
  expect(await page.evaluate(() => window.reportUrls.created)).toEqual([]);
  await page.getByRole("button", { name: "Tampilkan laporan" }).click();
  await page.getByRole("link", { name: "Unduh laporan PDF" }).click();
  await count(page, 2);
  await finishDownload(page, 1);
  await page.getByRole("button", { name: "Tutup laporan" }).click();
  expect(await page.evaluate(() => window.reportUrls.revoked)).toEqual(await page.evaluate(() => window.reportUrls.created));
});

test("changing reportId resets download feedback and ignores the previous report response", async ({ page }) => {
  await page.goto("/?view=report-download&state=generated");
  await page.getByRole("link", { name: "Unduh laporan PDF" }).click();
  await count(page, 1);
  await page.getByRole("button", { name: "Laporan B" }).click();
  expect(await page.evaluate(() => window.reportTransfers[0].aborted)).toBe(true);
  await respond(page, 0);
  expect(await page.evaluate(() => window.reportUrls.created)).toEqual([]);
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toHaveAttribute("href", `/api/reports/${reportB}/download`);
  await page.getByRole("link", { name: "Unduh laporan PDF" }).click();
  await count(page, 2);
  expect(await page.evaluate(() => window.reportTransfers[1].url)).toBe(`/api/reports/${reportB}/download`);
  await finishDownload(page, 1);
});

test("changing reportStatus to PENDING cancels an old download and retains generation-to-download behavior", async ({ page }) => {
  await page.route("**/api/reports/*/generate", (route) => route.fulfill({ json: { success: true, data: { reportId: reportA, status: "GENERATED" } } }));
  await page.goto("/?view=report-download&state=generated");
  await page.getByRole("link", { name: "Unduh laporan PDF" }).click();
  await count(page, 1);
  await page.getByRole("button", { name: "Status PENDING", exact: true }).click();
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toBeVisible();
  expect(await page.evaluate(() => window.reportTransfers[0].aborted)).toBe(true);
  await respond(page, 0);
  expect(await page.evaluate(() => window.reportUrls.created)).toEqual([]);
  await page.getByRole("link", { name: "Unduh laporan PDF" }).click();
  await count(page, 2);
  await finishDownload(page, 1);
});

test("psychologist sees explicit consent states and downloads only through an appointment-scoped action", async ({ page }) => {
  const access = [
    { status: "AVAILABLE", reportId: reportA, consentType: "APPOINTMENT_REPORT_ACCESS" },
    { status: "CONSENT_UNAVAILABLE" }, { status: "CONSENT_EXPIRED" }, { status: "REPORT_UNAVAILABLE" },
    { status: "AVAILABLE", reportId: reportB, consentType: "STANDALONE_REPORT_ACCESS" },
  ];
  await page.route("**/api/psychologist/appointments", (route) => route.fulfill({ json: { success: true, data: access.map((reportAccess, index) => ({
    appointmentId: `00000000-0000-4000-8000-00000000090${index}`, status: "CONFIRMED", scheduledStartAt: "2030-01-01T02:00:00Z", scheduledEndAt: "2030-01-01T04:00:00Z",
    participantNote: null, assessmentDate: "2029-12-30T00:00:00Z", sessionType: "MORNING", participant: { fullName: `Peserta sintetis ${index}`, userType: "STUDENT" }, reportAccess,
  })) } }));
  await page.goto("/?view=psychologist-appointments");
  const cards = page.locator(".ph-appointment");
  await expect(cards).toHaveCount(5);
  await expect(cards.nth(0)).toContainText("Akses laporan tersedia");
  await expect(cards.nth(1)).toContainText("belum tersedia atau telah dicabut");
  await expect(cards.nth(2)).toContainText("telah berakhir");
  await expect(cards.nth(3)).toContainText("Laporan belum tersedia");
  await expect(cards.nth(4)).toContainText("persetujuan mandiri");
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toHaveCount(2);
  await cards.nth(0).getByRole("link", { name: "Unduh laporan PDF" }).click();
  await count(page, 1);
  expect(await page.evaluate(() => window.reportTransfers[0].url)).toBe(`/api/reports/${reportA}/download?appointmentId=00000000-0000-4000-8000-000000000900`);
  // Consent can change after list discovery: display the server's denial safely.
  await respond(page, 0, 403, [], "application/json");
  await expect(cards.nth(0).getByRole("status")).toContainText("Akses laporan tidak tersedia");
  expect(await page.evaluate(() => window.reportUrls.created)).toEqual([]);
  await cards.nth(0).getByRole("link", { name: "Coba unduh lagi" }).click();
  await count(page, 2);
  const waiting = page.waitForEvent("download");
  await respond(page, 1);
  expect((await waiting).suggestedFilename()).toBe("laporan-sintetis.pdf");
  await expect(cards.nth(0).getByRole("status")).toContainText("Unduhan laporan dimulai");
});
