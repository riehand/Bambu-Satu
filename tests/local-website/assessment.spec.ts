import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

type Account = { id: string; email: string; password: string };
const fixturePath = process.env.WELLBEING_BROWSER_FIXTURE;
if (!fixturePath) throw new Error("Explicit isolated local Auth accounts are required");
const { users } = JSON.parse(readFileSync(fixturePath, "utf8")) as { users: Account[] };
async function login(page: Page, account: Account) {
  await page.goto("/auth/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByPlaceholder("Masukkan password Anda").fill(account.password);
  const response = page.waitForResponse(r => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/participant\/dashboard$/);
}

test("real local login, persisted assessment, trusted result, and cross-user denial", async ({ page, browser }) => {
  // No fulfilled/intercepted Auth or assessment responses. Block nonlocal traffic.
  await page.context().route("**/*", route => {
    const host = new URL(route.request().url()).hostname;
    return ["127.0.0.1", "localhost"].includes(host) ? route.continue() : route.abort();
  });
  await page.goto("/participant/dashboard");
  await expect(page).toHaveURL(/\/auth\/login/);
  await login(page, users[0]);
  await expect(page.getByRole("heading", { name: /Sejenak untuk dirimu, Synthetic/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Kuota asesmen" })).toContainText("SYNTHETIC SPRINT 1");
  await page.getByRole("link", { name: "Mulai check-in pribadi" }).click();
  await page.getByRole("checkbox").check();
  const started = page.waitForResponse(r => r.url().endsWith("/api/assessment/sessions") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Mulai DASS-21" }).click();
  const startResponse = await started;
  expect(startResponse.status()).toBe(201);
  const sessionId = (await startResponse.json()).data.assessmentSessionId as string;
  await expect(page).toHaveURL(new RegExp(`/assessment/${sessionId}$`));
  await page.getByRole("radio").nth(1).check();
  await expect(page.getByRole("status")).toContainText("Jawaban tersimpan");
  await page.getByRole("button", { name: "Simpan & lanjut nanti" }).click();
  await expect(page.getByRole("region", { name: "Asesmen tersimpan" })).toContainText("1/35 tersimpan");
  await page.reload();
  const saved = await page.request.get(`/api/assessment/sessions/${sessionId}`);
  expect(saved.status()).toBe(200);
  expect(saved.headers()["cache-control"]).toContain("no-store");
  expect((await saved.json()).data).toMatchObject({ revision: 1, answers: [{ answerValue: 1 }] });
  await page.getByRole("region", { name: "Asesmen tersimpan" }).getByRole("link", { name: "Lanjutkan asesmen" }).click();
  await page.getByRole("button", { name: "Sebelumnya" }).click();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.getByRole("button", { name: "Selanjutnya" }).click();
  for (let i = 1; i < 35; i++) {
    await page.getByRole("radio").nth(i < 21 ? 1 : 2).check();
    await expect(page.getByRole("status")).toContainText("Jawaban tersimpan");
    await page.getByRole("button", { name: i === 20 ? "Lanjut ke WEMWBS" : i === 34 ? "Tinjau jawaban" : "Selanjutnya", exact: true }).click();
  }
  await expect(page.locator(".wb-review-list button")).toHaveCount(35);
  await page.getByRole("button", { name: "Kirim & lihat hasil" }).click();
  const submitted = page.waitForResponse(r => r.url().endsWith(`/sessions/${sessionId}/submit`));
  await page.getByRole("button", { name: "Ya, kirim asesmen" }).click();
  const submitResponse = await submitted;
  expect(submitResponse.status()).toBe(200);
  const result = (await submitResponse.json()).data;
  expect(result.scores).toMatchObject({ depression: { score: 14 }, anxiety: { score: 14 }, stress: { score: 14 }, wemwbs: { score: 42 } });
  await expect(page).toHaveURL(new RegExp(`/assessment/${sessionId}/results$`));
  await expect(page.getByRole("heading", { name: "Gambaran perasaan Anda saat ini." })).toBeVisible();
  await expect(page.locator(".wb-score-number")).toHaveText(["14 / 42", "14 / 42", "14 / 42", "42 / 70"]);
  await expect(page.locator(".wb-report-action")).toContainText("PENDING");
  await expect(page.getByRole("button", { name: /Unduh/ })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".wb-report-action")).toContainText("PENDING");
  await page.screenshot({ path: ".tmp/phase4-sprint1/results.png", fullPage: true });

  const other = await browser.newContext({ baseURL: "http://127.0.0.1:55430" });
  await other.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  try {
    const stranger = await other.newPage();
    await login(stranger, users[1]);
    const denied = await other.request.get(`/api/assessment/sessions/${sessionId}`);
    expect(denied.status()).toBe(404);
    expect(await denied.text()).not.toContain(result.reportId);
    await stranger.goto(`/participant/assessment/${sessionId}/results`);
    await expect(stranger.getByRole("heading", { name: "Gambaran perasaan Anda saat ini." })).toHaveCount(0);
    await expect(stranger.getByText("Sesi asesmen tidak ditemukan.", { exact: true })).toBeVisible();
    writeFileSync(".tmp/phase4-sprint1/browser-evidence.json", JSON.stringify({
      status: "PASS", auth: "real local GoTrue", participantId: users[0].id, sessionId,
      startStatus: startResponse.status(), submitStatus: submitResponse.status(), scores: result.scores,
      reportId: result.reportId, reportStatus: "PENDING", savedAfterReload: true, otherUserStatus: denied.status(),
    }, null, 2));
  } finally { await other.close(); }
});
