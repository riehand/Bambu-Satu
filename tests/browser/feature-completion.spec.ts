import { expect, test } from "@playwright/test";
const reportId = "00000000-0000-4000-8000-000000000904";
const success = (data: unknown) => ({ success: true, data });

test("privacy shows both consent scopes and revokes the selected grant without cancelling appointments", async ({ page }) => {
  const mutations: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") { mutations.push(path); return route.fulfill({ json: success({ revokedAt: "2030-01-02T02:00:00Z" }) }); }
    const consents = ["APPOINTMENT_REPORT_ACCESS", "STANDALONE_REPORT_ACCESS"].map((consentType, i) => ({ consentId: `grant-${i}`, consentType, reportId, targetUserId: "psychologist", appointmentId: i === 0 ? "appointment" : null, grantedAt: "2030-01-01T02:00:00Z", expiresAt: null, expiredAt: null, revokedAt: null, active: true }));
    await route.fulfill({ json: success(path === "/api/consents" ? consents : path === "/api/appointments/booking-context" ? { canBook: false, latestAssessment: null } : []) });
  });
  await page.goto("/?view=privacy");
  await expect(page.getByText(/Izin janji konsultasi/)).toBeVisible();
  await expect(page.getByText(/Izin mandiri/)).toBeVisible();
  await page.getByRole("button", { name: "Cabut akses", exact: true }).first().click();
  await expect(page.getByRole("status")).toContainText("Persetujuan dicabut");
  expect(mutations).toEqual(["/api/consents/grant-0/revoke"]);
  await expect(page.getByRole("button", { name: "Cabut akses", exact: true })).toHaveCount(1);
});

test("booking sends optional note through the existing API only after explicit consent", async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/psychologists/*/availability?*", route => route.fulfill({ json: success([{ availabilityId: "slot", date: "2030-01-01", sessionType: "MORNING", startTime: "09:00", endTime: "11:00", status: "AVAILABLE" }]) }));
  await page.route("**/api/appointments/booking-context", route => route.fulfill({ json: success({ canBook: true, latestAssessment: { assessmentSessionId: "assessment", reportId, reportStatus: "GENERATED" } }) }));
  await page.route("**/api/appointments", route => { submitted = route.request().postDataJSON(); return route.fulfill({ json: success({ appointmentId: "appointment", status: "CONFIRMED" }) }); });
  await page.goto("/?view=availability");
  await expect(page.getByRole("button", { name: "Pesan sesi" })).toBeDisabled();
  await page.getByRole("textbox", { name: /Catatan untuk psikolog/ }).fill("Catatan sintetis untuk percakapan.");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Pesan sesi" }).click();
  await expect(page.getByRole("status")).toContainText("dikonfirmasi");
  expect(submitted?.participantNote).toBe("Catatan sintetis untuk percakapan.");
  expect(submitted?.reportConsent).toBe(true);
});

test("shared report uses authorized summary and clears it on close or rejected recheck", async ({ page }) => {
  let allowed = true;
  await page.route("**/api/psychologist/appointments", route => route.fulfill({ json: success([{ appointmentId: "appointment", status: "CONFIRMED", scheduledStartAt: "2030-01-01T02:00:00Z", scheduledEndAt: "2030-01-01T04:00:00Z", participant: { fullName: "Peserta Sintetis", userType: "STUDENT" }, reportAccess: { status: "AVAILABLE", reportId } }]) }));
  await page.route(`**/api/reports/${reportId}`, route => route.fulfill(allowed ? { json: success({ id: reportId, assessmentDate: "2029-12-01T02:00:00Z", scores: { depression: { score: 0, category: "NORMAL" }, anxiety: { score: 0, category: "NORMAL" }, stress: { score: 0, category: "NORMAL" }, wemwbs: { score: 42 } } }) } : { status: 403, json: { success: false } }));
  await page.goto("/?view=psychologist-appointments");
  await page.getByRole("button", { name: "Lihat laporan bersama" }).click();
  await expect(page.getByRole("region", { name: "Laporan yang dibagikan" })).toContainText("WEMWBS");
  allowed = false;
  await page.getByRole("button", { name: "Periksa kembali akses" }).click();
  await expect(page.getByRole("alert")).toContainText("izin sudah tidak berlaku");
  await expect(page.getByRole("region", { name: "Laporan yang dibagikan" })).toHaveCount(0);
});

test("admin policy-dependent views explain unavailable actions without creating mutation requests", async ({ page }) => {
  const mutations: string[] = [];
  await page.route("**/api/**", route => { if (route.request().method() !== "GET") mutations.push(route.request().url()); return route.fulfill({ status: 503, json: { success: false, error: { message: "Layanan belum tersedia" } } }); });
  await page.goto("/?view=admin");
  await page.getByRole("button", { name: "Pengguna & peran", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kelola akun, bukan laporan pribadi." })).toBeVisible();
  await page.getByRole("button", { name: "Consent & audit", exact: true }).click();
  await expect(page.getByText(/gateway yang disetujui/)).toBeVisible();
  expect(mutations).toEqual([]);
});

test("admin monitor renders existing operational counts and applies date filters without a clinical payload", async ({ page }) => {
  const queries: string[] = [];
  await page.route("**/api/admin/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/monitor")) { queries.push(url.search); return route.fulfill({ json: success({ activeParticipants: 7, activePsychologists: 2, assessmentsStarted: 8, assessmentsCompleted: 6, appointments: 3, clinicalIndicatorsEnabled: false }) }); }
    return route.fulfill({ status: 503, json: { success: false } });
  });
  await page.goto("/?view=admin");
  await page.getByRole("button", { name: "Lihat statistik layanan", exact: true }).click();
  await expect(page.locator(".admin-kpis dd")).toHaveText(["7", "2", "8", "6", "3"]);
  await page.getByLabel("Dari tanggal", { exact: true }).fill("2030-01-15");
  await page.getByRole("button", { name: "Terapkan filter" }).click();
  await expect.poll(() => queries.at(-1)).toContain("from=2030-01-15");
  expect(queries.every(query => !query.includes("limit=") && !query.includes("periodId="))).toBe(true);
});
