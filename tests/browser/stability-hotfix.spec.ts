import { expect, test, type Page } from "@playwright/test";

type SyntheticRequest = {
  url: string;
  method: string;
  body: unknown;
  aborted: boolean;
  respond: (status: number, data: unknown, headers: Record<string, string>) => void;
  fail: () => void;
};

declare global {
  interface Window { hotfixRequests: SyntheticRequest[] }
}

const dateA = "2030-01-01";
const dateB = "2030-01-02";
const reportA = "00000000-0000-4000-8000-000000000950";
const reportB = "00000000-0000-4000-8000-000000000951";
const success = (data: unknown) => ({ success: true, data });
const slots = (morning: string, afternoon = "UNAVAILABLE", evening = "UNAVAILABLE") => [
  { sessionType: "MORNING", status: morning },
  { sessionType: "AFTERNOON", status: afternoon },
  { sessionType: "EVENING", status: evening },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.hotfixRequests = [];
    window.fetch = (input, init) => {
      const url = String(input);
      if (!url.startsWith("/api/psychologist/availability") && !url.startsWith("/api/reports/")) return originalFetch(input, init);
      return new Promise<Response>((resolve, reject) => {
        const request: SyntheticRequest = {
          url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null,
          aborted: init?.signal?.aborted ?? false,
          respond: (status, data, headers) => resolve(new Response(JSON.stringify(data), { status, headers })),
          fail: () => reject(new TypeError("Synthetic network failure")),
        };
        // Intentionally deliver responses even after abort: cleanup must also ignore late results.
        init?.signal?.addEventListener("abort", () => { request.aborted = true; });
        window.hotfixRequests.push(request);
      });
    };
  });
});

async function requests(page: Page, count: number) {
  await expect.poll(() => page.evaluate(() => window.hotfixRequests.length)).toBe(count);
}

async function respond(page: Page, index: number, data: unknown, status = 200, headers: Record<string, string> = {}) {
  await page.evaluate(({ index, data, status, headers }) => window.hotfixRequests[index].respond(status, data, headers), { index, data, status, headers });
}

async function requestData(page: Page, index: number) {
  return page.evaluate((index) => {
    const { url, method, body, aborted } = window.hotfixRequests[index];
    return { url, method, body, aborted };
  }, index);
}

test("availability loads and saves the selected date once while preserving BOOKED slots", async ({ page }) => {
  await page.goto(`/?view=availability-editor&today=${dateA}`);
  await requests(page, 1);
  const save = page.getByRole("button", { name: "Simpan ketersediaan" });
  const checks = page.getByRole("checkbox");
  await expect(save).toBeDisabled();
  for (const check of await checks.all()) await expect(check).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Memuat jadwal");
  await respond(page, 0, success(slots("BOOKED", "UNAVAILABLE", "AVAILABLE")));
  await expect(checks.nth(0)).toBeDisabled();
  await checks.nth(1).check();
  await checks.nth(2).uncheck();
  await save.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await requests(page, 2);
  await expect(page.getByLabel("Tanggal")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Menyimpan…" })).toBeDisabled();
  for (const check of await checks.all()) await expect(check).toBeDisabled();
  expect(await requestData(page, 1)).toMatchObject({ url: `/api/psychologist/availability/${dateA}`, method: "PUT", body: { sessions: [
    { sessionType: "MORNING", available: false }, { sessionType: "AFTERNOON", available: true }, { sessionType: "EVENING", available: false },
  ] } });
  await respond(page, 1, success(slots("BOOKED", "AVAILABLE")));
  await expect(page.getByRole("status")).toContainText("berhasil disimpan");
  await expect(save).toBeEnabled();
  await expect(checks.nth(0)).toBeDisabled();
  await expect(page.locator(".ph-session-row").nth(0)).toContainText("09:00–11:00 WIB");
});

test("failed date load clears old slots and blocks saving until retry loads that date", async ({ page }) => {
  await page.goto(`/?view=availability-editor&today=${dateA}`);
  await requests(page, 1);
  await respond(page, 0, success(slots("AVAILABLE")));
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await page.getByLabel("Tanggal").fill(dateB);
  await requests(page, 2);
  await expect(page.getByLabel("Tanggal")).toBeFocused();
  const save = page.getByRole("button", { name: "Simpan ketersediaan" });
  for (const check of await page.getByRole("checkbox").all()) {
    await expect(check).not.toBeChecked();
    await expect(check).toBeDisabled();
  }
  await expect(save).toBeDisabled();
  await respond(page, 1, { success: false }, 503);
  await expect(page.getByRole("status")).toContainText("Jadwal belum dapat dimuat");
  await expect(save).toBeDisabled();
  await save.evaluate((button: HTMLButtonElement) => button.click());
  await requests(page, 2);
  await page.getByRole("button", { name: "Muat ulang jadwal" }).click();
  await requests(page, 3);
  await expect(save).toBeDisabled();
  expect((await requestData(page, 2)).url).toBe(`/api/psychologist/availability?date=${dateB}`);
  await respond(page, 2, success(slots("UNAVAILABLE", "UNAVAILABLE", "AVAILABLE")));
  await expect(save).toBeEnabled();
  await save.click();
  await requests(page, 4);
  expect(await requestData(page, 3)).toMatchObject({ url: `/api/psychologist/availability/${dateB}`, method: "PUT", body: { sessions: [
    { sessionType: "MORNING", available: false }, { sessionType: "AFTERNOON", available: false }, { sessionType: "EVENING", available: true },
  ] } });
  await respond(page, 3, success(slots("UNAVAILABLE", "UNAVAILABLE", "AVAILABLE")));
  await expect(page.getByRole("status")).toContainText("berhasil disimpan");
});

test("rapid date switching including A-B-A ignores late success and failure responses", async ({ page }) => {
  await page.goto(`/?view=availability-editor&today=${dateA}`);
  await requests(page, 1);
  await page.getByLabel("Tanggal").fill(dateB);
  await requests(page, 2);
  await page.getByLabel("Tanggal").fill("2030-01-03");
  await requests(page, 3);
  await page.getByLabel("Tanggal").fill(dateA);
  await requests(page, 4);
  await respond(page, 3, success(slots("UNAVAILABLE", "UNAVAILABLE", "AVAILABLE")));
  await expect(page.getByRole("checkbox").nth(2)).toBeChecked();
  await respond(page, 1, success(slots("AVAILABLE")));
  await respond(page, 2, { success: false }, 503);
  await respond(page, 0, success(slots("BOOKED", "AVAILABLE")));
  for (const index of [0, 1, 2]) expect((await requestData(page, index)).aborted).toBe(true);
  await expect(page.getByRole("checkbox").nth(0)).not.toBeChecked();
  await expect(page.getByRole("checkbox").nth(0)).toBeEnabled();
  await expect(page.getByRole("checkbox").nth(2)).toBeChecked();
  await expect(page.getByRole("button", { name: "Muat ulang jadwal" })).toHaveCount(0);
  await page.getByRole("button", { name: "Simpan ketersediaan" }).click();
  await requests(page, 5);
  expect(await requestData(page, 4)).toMatchObject({ url: `/api/psychologist/availability/${dateA}`, body: { sessions: [
    { sessionType: "MORNING", available: false }, { sessionType: "AFTERNOON", available: false }, { sessionType: "EVENING", available: true },
  ] } });
});

test("failed save requires fresh slots and an empty date cannot load or save", async ({ page }) => {
  await page.goto(`/?view=availability-editor&today=${dateA}`);
  await requests(page, 1);
  await respond(page, 0, success(slots("AVAILABLE")));
  await page.getByRole("button", { name: "Simpan ketersediaan" }).click();
  await requests(page, 2);
  await page.evaluate(() => window.hotfixRequests[1].fail());
  await expect(page.getByRole("status")).toContainText("belum berhasil disimpan");
  await expect(page.getByRole("button", { name: "Simpan ketersediaan" })).toBeDisabled();
  await page.getByRole("button", { name: "Muat ulang jadwal" }).click();
  await requests(page, 3);
  await respond(page, 2, success(slots("BOOKED")));
  await expect(page.getByRole("checkbox").first()).toBeDisabled();
  await page.getByLabel("Tanggal").fill("");
  await expect(page.getByRole("status")).toContainText("Pilih tanggal");
  await expect(page.getByRole("button", { name: "Simpan ketersediaan" })).toBeDisabled();
  await requests(page, 3);
});

test("pending PDF requests once under Strict Mode and rerenders, then exposes download", async ({ page }) => {
  await page.goto("/?view=report-download");
  await requests(page, 1);
  await expect(page.getByRole("status")).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("status")).toContainText("Sedang memproses");
  await page.getByRole("button", { name: "Render ulang" }).click();
  await requests(page, 1);
  expect(await requestData(page, 0)).toMatchObject({ url: `/api/reports/${reportA}/generate`, method: "POST" });
  await respond(page, 0, success({ status: "GENERATED" }));
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toHaveAttribute("href", `/api/reports/${reportA}/download`);
  await page.getByRole("button", { name: "Render ulang" }).click();
  await requests(page, 1);
});

test("PDF Retry-After countdown blocks early retry and dispatches only one retry", async ({ page }) => {
  await page.clock.install();
  await page.goto("/?view=report-download");
  await requests(page, 1);
  await respond(page, 0, { success: false }, 429, { "Retry-After": "7" });
  const retry = page.getByRole("button", { name: "Coba lagi", exact: true });
  await expect(page.getByRole("status")).toContainText("7 detik");
  await expect(retry).toBeDisabled();
  await retry.evaluate((button: HTMLButtonElement) => button.click());
  await page.clock.runFor(6_000);
  await expect(retry).toBeDisabled();
  await requests(page, 1);
  await page.clock.runFor(1_000);
  await expect(retry).toBeEnabled();
  await retry.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await page.clock.runFor(1);
  await requests(page, 2);
  await expect(page.getByRole("status")).toHaveAttribute("aria-busy", "true");
  await respond(page, 1, success({ status: "GENERATED" }));
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toBeVisible();
});

for (const failure of ["network", "invalid-header", "short-header"] as const) {
  test(`PDF ${failure} retains feedback and a finite retry delay`, async ({ page }) => {
    await page.clock.install();
    await page.goto("/?view=report-download");
    await requests(page, 1);
    if (failure === "network") await page.evaluate(() => window.hotfixRequests[0].fail());
    else await respond(page, 0, { success: false }, 503, { "Retry-After": failure === "short-header" ? "1" : "Infinity" });
    const seconds = failure === "short-header" ? 5 : 10;
    await expect(page.getByRole("status")).toContainText("Asesmen dan skor Anda tetap tersimpan");
    await expect(page.getByRole("status")).toContainText(`${seconds} detik`);
    const retry = page.getByRole("button", { name: "Coba lagi", exact: true });
    await expect(retry).toBeDisabled();
    await page.clock.runFor(seconds * 1000);
    await expect(retry).toBeEnabled();
    await retry.click();
    await page.clock.runFor(1);
    await requests(page, 2);
    await respond(page, 1, success({ status: "GENERATED" }));
    await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toBeVisible();
  });
}

test("PDF report identity resets state and ignores an older request finishing later", async ({ page }) => {
  await page.goto("/?view=report-download");
  await requests(page, 1);
  await page.getByRole("button", { name: "Laporan B", exact: true }).click();
  await requests(page, 2);
  expect((await requestData(page, 0)).aborted).toBe(true);
  await respond(page, 0, success({ status: "GENERATED" }));
  await expect(page.getByRole("status")).toContainText("Sedang memproses");
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toHaveCount(0);
  await respond(page, 1, success({ status: "GENERATED" }));
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toHaveAttribute("href", `/api/reports/${reportB}/download`);
  await page.getByRole("button", { name: "Laporan A", exact: true }).click();
  await requests(page, 3);
  await expect(page.getByRole("status")).toContainText("Sedang memproses");
});

test("PDF status props are authoritative and unmount ignores late failures", async ({ page }) => {
  await page.goto("/?view=report-download&state=generated");
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toBeVisible();
  await requests(page, 0);
  await page.getByRole("button", { name: "Status PENDING", exact: true }).click();
  await requests(page, 1);
  await page.getByRole("button", { name: "Status GENERATED", exact: true }).click();
  expect((await requestData(page, 0)).aborted).toBe(true);
  await respond(page, 0, { success: false }, 503);
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba lagi", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Status PENDING", exact: true }).click();
  await requests(page, 2);
  await page.getByRole("button", { name: "Tutup laporan", exact: true }).click();
  expect((await requestData(page, 1)).aborted).toBe(true);
  await page.evaluate(() => window.hotfixRequests[1].fail());
  await expect(page.locator(".wb-report-action")).toHaveCount(0);
  await page.getByRole("button", { name: "Tampilkan laporan", exact: true }).click();
  await requests(page, 3);
  await respond(page, 2, success({ status: "GENERATED" }));
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toBeVisible();
});

test("PDF changing identity or unmounting during cooldown clears the old retry state", async ({ page }) => {
  await page.clock.install();
  await page.goto("/?view=report-download");
  await requests(page, 1);
  await respond(page, 0, { success: false }, 503, { "Retry-After": "30" });
  await expect(page.getByRole("button", { name: "Coba lagi", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Laporan B", exact: true }).click();
  await page.clock.runFor(1);
  await requests(page, 2);
  await expect(page.getByRole("status")).toContainText("Sedang memproses");
  await expect(page.getByRole("button", { name: "Coba lagi", exact: true })).toHaveCount(0);
  await respond(page, 1, { success: false }, 503, { "Retry-After": "5" });
  await expect(page.getByRole("status")).toContainText("5 detik");
  await page.getByRole("button", { name: "Tutup laporan", exact: true }).click();
  await page.clock.runFor(30_000);
  await requests(page, 2);
  await expect(page.locator(".wb-report-action")).toHaveCount(0);
  await page.getByRole("button", { name: "Tampilkan laporan", exact: true }).click();
  await page.clock.runFor(1);
  await requests(page, 3);
  await respond(page, 2, success({ status: "GENERATED" }));
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toHaveAttribute("href", `/api/reports/${reportB}/download`);
});
