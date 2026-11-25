import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

type Account = { id: string; email: string; password: string };
const fixturePath = process.env.WELLBEING_BROWSER_FIXTURE;
if (!fixturePath) throw new Error("Explicit isolated local Auth accounts are required");
const { users } = JSON.parse(readFileSync(fixturePath, "utf8")) as { users: Account[] };
const pdfFixturePath = process.env.WELLBEING_PDF_FIXTURE;
if (!pdfFixturePath) throw new Error("A genuine completed PENDING assessment is required");
const pdfFixture = JSON.parse(readFileSync(pdfFixturePath, "utf8")) as { sessionId: string; reportId: string; participantId: string };

async function login(page: Page, account: Account) {
  await page.goto("/auth/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByPlaceholder("Masukkan password Anda").fill(account.password);
  const response = page.waitForResponse(r => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/participant\/dashboard$/);
}

test("Sprint 2 functional PDF generation, storage persistence, and private download", async ({ page, browser }) => {
  // Block any nonlocal external traffic to ensure isolated local rehearsal
  await page.context().route("**/*", route => {
    const host = new URL(route.request().url()).hostname;
    return ["127.0.0.1", "localhost"].includes(host) ? route.continue() : route.abort();
  });

  const { sessionId, reportId } = pdfFixture;
  expect(pdfFixture.participantId).toBe(users[0].id);

  // Step 1: Login as participant owner
  await login(page, users[0]);

  // Step 2: Open completed assessment results page
  // We set up a response listener for the generation POST call before navigating
  const generatePromise = page.waitForResponse(
    r => r.url().includes(`/api/reports/${reportId}/generate`) && r.request().method() === "POST",
    { timeout: 30000 }
  );

  await page.goto(`/participant/assessment/${sessionId}/results`);
  await expect(page.getByRole("heading", { name: "Gambaran perasaan Anda saat ini." })).toBeVisible();
  await expect(page.locator(".wb-report-id")).toContainText(reportId);

  await expect(page.locator(".wb-report-action")).toContainText("PENDING");
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toHaveCount(0);
  await page.getByRole("button", { name: "Buat PDF" }).click();

  // Step 3: Verify generation API response
  const generateResponse = await generatePromise;
  expect([200, 201]).toContain(generateResponse.status());
  const generateJson = await generateResponse.json();
  expect(generateJson).toMatchObject({
    success: true,
    data: {
      status: "GENERATED",
      reportId: reportId,
    },
  });

  // Step 4: UI should transition to show the download button
  const downloadLink = page.getByRole("link", { name: "Unduh laporan PDF" });
  await expect(downloadLink).toBeVisible({ timeout: 15000 });

  // Step 5: Test file download via the UI
  const downloadPromise = page.waitForResponse(
    r => r.url().includes(`/api/reports/${reportId}/download`) && r.request().method() === "GET"
  );
  const filePromise = page.waitForEvent("download");
  await downloadLink.click();
  const downloadResponse = await downloadPromise;
  expect(downloadResponse.status()).toBe(200);
  expect(downloadResponse.headers()["content-type"]).toContain("application/pdf");
  expect(downloadResponse.headers()["content-disposition"]).toContain(`hasil-asesmen-${reportId}.pdf`);
  const downloaded = await filePromise;
  expect(downloaded.suggestedFilename()).toBe(`hasil-asesmen-${reportId}.pdf`);
  const pdfBytes = readFileSync((await downloaded.path())!);
  expect(pdfBytes.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  expect(pdfBytes.toString("utf8", pdfBytes.length - 1024)).toContain("%%EOF");
  expect(pdfBytes.length).toBeGreaterThan(1000);
  writeFileSync(".tmp/phase4-sprint2/download.pdf", pdfBytes);
  expect(downloadResponse.headers()["cache-control"]).toContain("no-store");
  expect(downloadResponse.headers()["x-content-type-options"]).toBe("nosniff");

  // Status message should confirm download started
  await expect(page.locator(".wb-report-action").getByRole("status")).toContainText("Unduhan laporan dimulai.");

  // Step 6: Reload the page; verify reportStatus is now GENERATED on the server side
  await page.reload();
  await expect(page.getByRole("heading", { name: "Gambaran perasaan Anda saat ini." })).toBeVisible();
  // Download button must be immediately visible without going through PENDING
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toBeVisible();
  await expect(page.locator(".wb-report-action")).not.toContainText("Status laporan: PENDING");

  // Step 7: Screenshot evidence
  await page.screenshot({ path: ".tmp/phase4-sprint2/pdf-results.png", fullPage: true });

  // Step 8: Cross-user authorization denial check
  const strangerContext = await browser.newContext({ baseURL: "http://127.0.0.1:55430" });
  await strangerContext.route("**/*", route => {
    const host = new URL(route.request().url()).hostname;
    return ["127.0.0.1", "localhost"].includes(host) ? route.continue() : route.abort();
  });

  try {
    const strangerPage = await strangerContext.newPage();
    await login(strangerPage, users[1]);

    // Stranger tries to download report: must be denied (404/403)
    const strangerDownload = await strangerPage.request.get(`/api/reports/${reportId}/download`);
    expect([403, 404]).toContain(strangerDownload.status());

    // Stranger tries to generate report: must be denied (404/403)
    const strangerGenerate = await strangerPage.request.post(`/api/reports/${reportId}/generate`, { headers: { Origin: "http://127.0.0.1:55430" } });
    expect([403, 404]).toContain(strangerGenerate.status());

    const anonymous = await browser.newContext();
    try {
      expect((await anonymous.request.get(`http://127.0.0.1:55430/api/reports/${reportId}/download`)).status()).toBe(401);
      const publicObject = await anonymous.request.get(`http://127.0.0.1:50243/storage/v1/object/public/assessment-reports/reports/${reportId}.pdf`);
      expect([400, 401, 403, 404]).toContain(publicObject.status());
      expect((await publicObject.body()).subarray(0, 5).toString()).not.toBe("%PDF-");
    } finally { await anonymous.close(); }

    // Record evidence
    writeFileSync(
      ".tmp/phase4-sprint2/browser-evidence.json",
      JSON.stringify(
        {
          status: "PASS",
          auth: "real local GoTrue",
          participantId: users[0].id,
          sessionId,
          reportId,
          reportStatus: "GENERATED",
          objectKey: `reports/${reportId}.pdf`,
          pdfByteLength: pdfBytes.length,
          generateHttpStatus: generateResponse.status(),
          downloadHttpStatus: downloadResponse.status(),
          otherUserDownloadStatus: strangerDownload.status(),
          otherUserGenerateStatus: strangerGenerate.status(),
        },
        null,
        2
      )
    );
  } finally {
    await strangerContext.close();
  }
});
