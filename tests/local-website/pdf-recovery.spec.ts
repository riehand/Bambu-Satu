import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

test("real Storage interruption preserves PENDING, then retry generates a private PDF", async ({ page }) => {
  if (process.env.WELLBEING_STORAGE_FAILURE_APPROVED !== "isolated-local-only") throw new Error("Explicit approval for local fault injection required");
  const { users } = JSON.parse(readFileSync(process.env.WELLBEING_BROWSER_FIXTURE!, "utf8"));
  const fixture = JSON.parse(readFileSync(process.env.WELLBEING_PDF_FAILURE_FIXTURE!, "utf8"));
  const generated = JSON.parse(readFileSync(".tmp/phase4-sprint2/browser-evidence.json", "utf8"));
  const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", windowsHide: true, timeout: 30000 });
  const dockerContext = JSON.parse(docker("context", "inspect"))[0];
  expect(dockerContext.Endpoints.docker.Host).toMatch(/^npipe:\/\/\/\/\.\/pipe\//);
  const inspect = () => {
    const c = JSON.parse(docker("inspect", "wb-sprint1-storage"))[0];
    expect(c.Config.Labels["wellbeing.sprint"]).toBe("phase4-sprint1");
    expect(Object.keys(c.NetworkSettings.Networks)).toEqual(["wb-sprint1-loopback"]);
    for (const ports of Object.values(c.HostConfig.PortBindings) as Array<Array<{ HostIp: string }> | null>) {
      for (const binding of ports ?? []) expect(binding.HostIp).toBe("127.0.0.1");
    }
    expect(c.Mounts.map((m: { Name: string }) => m.Name)).toEqual(["supabase_storage_supabase-d55e136c4b"]);
    return c;
  };
  expect(inspect().State.Running).toBe(true);
  await page.context().route("**/*", r => ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await page.goto("/auth/login");
  await page.getByLabel("Email", { exact: true }).fill(users[0].email);
  await page.getByPlaceholder("Masukkan password Anda").fill(users[0].password);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(/participant\/dashboard$/);
  await page.goto(`/participant/assessment/${fixture.sessionId}/results`);
  await expect(page.locator(".wb-report-action")).toContainText("PENDING");
  docker("stop", "--time", "5", "wb-sprint1-storage");
  try {
    const failed = page.waitForResponse(r => r.url().endsWith(`/reports/${fixture.reportId}/generate`));
    await page.getByRole("button", { name: "Buat PDF" }).click();
    expect((await failed).status()).toBe(503);
    await expect(page.locator(".wb-report-action")).toContainText("Laporan belum dapat disiapkan");
    await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toHaveCount(0);
    const session = await page.request.get(`/api/assessment/sessions/${fixture.sessionId}`);
    expect((await session.json()).data).toMatchObject({ status: "COMPLETED", report: { status: "PENDING" } });
    const missing = await page.request.get(`/api/reports/${generated.reportId}/download`);
    expect(missing.status()).toBe(503);
    expect(missing.headers()["content-type"]).not.toContain("application/pdf");
  } finally {
    inspect(); // Check identity, mount and loopback binding again before restart.
    docker("start", "wb-sprint1-storage");
  }
  await expect.poll(() => inspect().State.Health?.Status, { timeout: 30000 }).toBe("healthy");
  await expect(page.getByRole("button", { name: "Coba lagi", exact: true })).toBeEnabled({ timeout: 30000 });
  const retried = page.waitForResponse(r => r.url().endsWith(`/reports/${fixture.reportId}/generate`));
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  expect((await retried).status()).toBe(200);
  await expect(page.getByRole("link", { name: "Unduh laporan PDF" })).toBeVisible();
  const saved = await page.request.get(`/api/assessment/sessions/${fixture.sessionId}`);
  expect((await saved.json()).data).toMatchObject({ report: { status: "GENERATED" } });
  writeFileSync(".tmp/phase4-sprint2/recovery-evidence.json", JSON.stringify({ status: "PASS", reportId: fixture.reportId,
    offlineGenerate: 503, offlineDownload: 503, persistedDuringFailure: "PENDING", retryGenerate: 200, persistedAfterRetry: "GENERATED" }, null, 2));
});
