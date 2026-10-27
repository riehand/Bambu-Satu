import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test("loading state announces progress without displaying invented assessment statistics", async ({ page }) => {
  await page.goto("/?view=loading");
  await expect(page.getByRole("status")).toContainText("Menyiapkan ruang wellbeing Anda");
  await expect(page.locator(".wb-skeleton")).toHaveCount(2);
  await expect(page.locator(".wb-score, .wb-quota-stats")).toHaveCount(0);
});

test("dashboard exposes persisted progress and a same-session resume action", async ({ page }) => {
  await page.goto("/?view=dashboard&state=in-progress");
  const progress = page.getByRole("region", { name: "Asesmen tersimpan" });
  await expect(progress).toContainText("23/35 tersimpan");
  await expect(progress.getByRole("progressbar")).toHaveAttribute("value", "23");
  await expect(progress.getByRole("link", { name: "Lanjutkan asesmen" })).toHaveAttribute("href", /assessment\/00000000/);
  await expect(page.getByRole("region", { name: "Kuota asesmen" })).toContainText("Selesai0");
});

test("review warns about missing responses and returns to the selected question", async ({ page }) => {
  await page.goto("/?view=questionnaire");
  await page.getByRole("button", { name: "Tinjau semua jawaban" }).click();
  await expect(page.getByRole("alert")).toContainText("35 pertanyaan yang belum dijawab");
  await expect(page.getByRole("button", { name: "Kirim & lihat hasil" })).toBeDisabled();
  await page.locator(".wb-review-list button").nth(21).click();
  await expect(page.locator(".wb-progress-labels")).toContainText("Pertanyaan 1 dari 14");
  await expect(page.getByRole("radio")).toHaveCount(5);
});

test("review shows the saved option and supports changing it without walking through all items", async ({ page }) => {
  await page.route("**/answers", route => route.fulfill({ json: { success: true, data: { saved: 1, revision: 1 } } }));
  await page.goto("/?view=questionnaire&state=review");
  const first = page.locator(".wb-review-list button").first();
  await expect(first).toContainText("1 · Opsi uji sintetis 1");
  await first.click();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.getByRole("radio").nth(3).check();
  await expect(page.getByRole("status")).toContainText("Jawaban tersimpan");
  await page.getByRole("button", { name: "Tinjau semua jawaban" }).click();
  await expect(first).toContainText("3 · Opsi uji sintetis 3");
});

for (const width of [1440, 390]) {
  test(`review and confirmation at ${width}px, cancel never submits`, async ({ page }) => {
    let submitted = 0;
    await page.route("**/submit", route => { submitted++; return route.fulfill({ json: { success: true } }); });
    await page.setViewportSize({ width, height: 1024 });
    await page.goto("/?view=questionnaire&state=review");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir("test-results/phase2", { recursive: true });
    await page.screenshot({ path: `test-results/phase2/review-${width}.png`, fullPage: true });
    const submit = page.getByRole("button", { name: "Kirim & lihat hasil" });
    await submit.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Periksa lagi" })).toBeFocused();
    await page.screenshot({ path: `test-results/phase2/confirmation-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(submit).toBeFocused();
    await submit.click();
    await page.getByRole("button", { name: "Periksa lagi" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(submitted).toBe(0);
  });
}

test("a stale final review requires reload and cannot be resubmitted blindly", async ({ page }) => {
  await page.route("**/submit", route => {
    expect(route.request().postDataJSON()).toEqual({ expectedRevision: 0 });
    return route.fulfill({ status: 409, json: { error: { code: "STALE_REVISION", message: "Jawaban berubah di tab lain." } } });
  });
  await page.goto("/?view=questionnaire&state=review");
  await page.getByRole("button", { name: "Kirim & lihat hasil" }).click();
  await page.getByRole("button", { name: "Ya, kirim asesmen" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("Jawaban berubah");
  await expect(page.getByRole("button", { name: "Muat ulang jawaban tersimpan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kirim & lihat hasil" })).toBeDisabled();
});

test("a successful status without a persistence acknowledgement never displays Saved", async ({ page }) => {
  await page.route("**/answers", route => route.fulfill({ json: { success: true, data: { saved: 0 } } }));
  await page.goto("/?view=questionnaire");
  await page.getByRole("radio").first().check();
  await expect(page.getByRole("status")).toContainText("belum tersimpan");
  await expect(page.getByRole("button", { name: "Selanjutnya" })).toBeDisabled();
});
