import { expect, test, type Page } from "@playwright/test";

const date = "2030-01-01";
const psychologistId = "00000000-0000-4000-8000-000000000902";
const assessmentSessionId = "00000000-0000-4000-8000-000000000903";
const reportId = "00000000-0000-4000-8000-000000000904";
const appointmentId = "00000000-0000-4000-8000-000000000905";
const appointmentConsentId = "00000000-0000-4000-8000-000000000906";
const standaloneConsentId = "00000000-0000-4000-8000-000000000907";
const success = (data: unknown) => ({ success: true, data });

const context = success({
  latestAssessment: { assessmentSessionId, completedAt: "2029-12-01T03:00:00Z", reportId, reportStatus: "GENERATED" },
  canBook: true,
});
const appointment = {
  appointmentId, status: "CONFIRMED", scheduledStartAt: `${date}T09:00:00+07:00`, scheduledEndAt: `${date}T11:00:00+07:00`,
  psychologist: { id: psychologistId, fullName: "Psikolog Uji" }, sessionType: "MORNING", reportId, canReconsent: true,
};
const consent = (consentId: string, consentType: "APPOINTMENT_REPORT_ACCESS" | "STANDALONE_REPORT_ACCESS", appointmentRef: string | null, active: boolean, revokedAt: string | null = null) => ({
  consentId, consentType, reportId, targetUserId: psychologistId, appointmentId: appointmentRef,
  grantedAt: "2029-12-01T03:00:00Z", expiresAt: appointmentRef ? `${date}T11:00:00+07:00` : null,
  expiredAt: null, revokedAt, active,
});

async function mockAppointmentCenter(page: Page, consents: unknown[]) {
  await page.route("**/api/appointments", (route) => route.fulfill({ json: success([appointment]) }));
  await page.route("**/api/consents", (route) => route.fulfill({ json: success(consents) }));
  await page.route("**/api/appointments/booking-context", (route) => route.fulfill({ json: context }));
  await page.route("**/api/psychologists*", (route) => route.fulfill({ json: success({ items: [{ id: psychologistId, fullName: "Psikolog Uji" }] }) }));
}

test("participant sees fixed Asia/Jakarta sessions and booking requires fresh unchecked consent", async ({ page }) => {
  let bookingBody: unknown;
  await page.route("**/api/psychologists/*/availability?*", (route) => route.fulfill({ json: success([
    { availabilityId: "morning-slot", date, sessionType: "MORNING", startTime: "09:00", endTime: "11:00", status: "AVAILABLE" },
    { availabilityId: "evening-slot", date, sessionType: "EVENING", startTime: "16:00", endTime: "18:00", status: "AVAILABLE" },
  ]) }));
  await page.route("**/api/appointments/booking-context", (route) => route.fulfill({ json: context }));
  await page.route("**/api/appointments", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    bookingBody = route.request().postDataJSON();
    return route.fulfill({ json: success({ appointmentId, status: "CONFIRMED" }) });
  });

  await page.goto(`/?view=availability&today=${date}`);
  const rows = page.locator(".wb-availability-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("09:00–11:00 WIB");
  await expect(rows.nth(1)).toContainText("Tidak tersedia");
  await expect(rows.nth(2)).toContainText("16:00–18:00 WIB");
  const consentBox = page.getByRole("checkbox");
  await expect(consentBox).not.toBeChecked();
  const book = rows.nth(0).getByRole("button", { name: "Pesan sesi" });
  await expect(book).toBeDisabled();
  await consentBox.check();
  await book.click();
  await expect(page.getByRole("status")).toContainText("telah dikonfirmasi");
  expect(bookingBody).toEqual({ psychologistId, assessmentSessionId, reportId, availabilityId: "morning-slot", reportConsent: true });
  await expect(rows.nth(0)).toContainText("Tidak tersedia");
  await expect(consentBox).not.toBeChecked();
});

test("failed booking leaves the slot visible, reports failure, and resets consent", async ({ page }) => {
  await page.route("**/api/psychologists/*/availability?*", (route) => route.fulfill({ json: success([
    { availabilityId: "morning-slot", date, sessionType: "MORNING", startTime: "09:00", endTime: "11:00", status: "AVAILABLE" },
  ]) }));
  await page.route("**/api/appointments/booking-context", (route) => route.fulfill({ json: context }));
  await page.route("**/api/appointments", (route) => route.fulfill({ status: 409, json: { success: false, error: { message: "Sesi ini baru saja dipesan." } } }));

  await page.goto(`/?view=availability&today=${date}`);
  const consentBox = page.getByRole("checkbox");
  await consentBox.check();
  await page.getByRole("button", { name: "Pesan sesi" }).click();
  await expect(page.getByRole("alert")).toContainText("baru saja dipesan");
  await expect(consentBox).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Pesan sesi" })).toBeDisabled();
});

test("psychologist availability editor saves exactly the three fixed sessions and preserves a booked slot", async ({ page }) => {
  let updateBody: { sessions: Array<{ sessionType: string; available: boolean }> } | undefined;
  await page.route("**/api/psychologist/availability?*", (route) => route.fulfill({ json: success([
    { sessionType: "MORNING", status: "BOOKED" },
    { sessionType: "AFTERNOON", status: "UNAVAILABLE" },
    { sessionType: "EVENING", status: "AVAILABLE" },
  ]) }));
  await page.route(`**/api/psychologist/availability/${date}`, async (route) => {
    updateBody = route.request().postDataJSON();
    return route.fulfill({ json: success([
      { sessionType: "MORNING", status: "BOOKED" },
      { sessionType: "AFTERNOON", status: "AVAILABLE" },
      { sessionType: "EVENING", status: "UNAVAILABLE" },
    ]) });
  });

  await page.goto(`/?view=availability-editor&today=${date}`);
  const checks = page.locator(".ph-session-row input[type=checkbox]");
  await expect(checks).toHaveCount(3);
  await expect(checks.nth(0)).toBeDisabled();
  await checks.nth(1).check();
  await checks.nth(2).uncheck();
  await page.getByRole("button", { name: "Simpan ketersediaan" }).click();
  await expect(page.getByRole("status")).toContainText("berhasil disimpan");
  expect(updateBody).toEqual({ sessions: [
    { sessionType: "MORNING", available: false },
    { sessionType: "AFTERNOON", available: true },
    { sessionType: "EVENING", available: false },
  ] });
});

test("revoking appointment consent leaves the confirmed appointment and separate standalone grant intact", async ({ page }) => {
  await mockAppointmentCenter(page, [
    consent(appointmentConsentId, "APPOINTMENT_REPORT_ACCESS", appointmentId, true),
    consent(standaloneConsentId, "STANDALONE_REPORT_ACCESS", null, true),
  ]);
  await page.route(`**/api/consents/${appointmentConsentId}/revoke`, (route) => route.fulfill({ json: success({ consentId: appointmentConsentId, revokedAt: "2030-01-01T01:00:00Z" }) }));

  await page.goto("/?view=appointments");
  await expect(page.getByText("Status janji: CONFIRMED · Akses laporan aktif")).toBeVisible();
  await page.getByRole("button", { name: "Cabut persetujuan laporan" }).click();
  await expect(page.getByRole("status")).toContainText("Janji konsultasi tetap berjalan");
  await expect(page.getByText("Status janji: CONFIRMED · Akses laporan tidak aktif")).toBeVisible();
  await expect(page.getByText("Psikolog Uji").last()).toBeVisible();
  await expect(page.getByText(`Laporan ${reportId} · Aktif`)).toBeVisible();
});

test("re-consent requires a fresh affirmative choice and sends appointment-scoped consent", async ({ page }) => {
  let reconsentBody: unknown;
  let consentReads = 0;
  await page.route("**/api/appointments", (route) => route.fulfill({ json: success([appointment]) }));
  await page.route("**/api/consents", (route) => {
    consentReads++;
    return route.fulfill({ json: success([consent(appointmentConsentId, "APPOINTMENT_REPORT_ACCESS", appointmentId, consentReads > 1, consentReads > 1 ? null : "2030-01-01T00:00:00Z")]) });
  });
  await page.route("**/api/appointments/booking-context", (route) => route.fulfill({ json: context }));
  await page.route("**/api/psychologists*", (route) => route.fulfill({ json: success({ items: [{ id: psychologistId, fullName: "Psikolog Uji" }] }) }));
  await page.route(`**/api/appointments/${appointmentId}/report-consent`, async (route) => {
    reconsentBody = route.request().postDataJSON();
    return route.fulfill({ json: success({ consentId: "new-grant", consentType: "APPOINTMENT_REPORT_ACCESS", appointmentId }) });
  });

  await page.goto("/?view=appointments");
  const checkbox = page.getByRole("checkbox").first();
  const grant = page.getByRole("button", { name: "Berikan persetujuan baru" });
  await expect(checkbox).not.toBeChecked();
  await expect(grant).toBeDisabled();
  await checkbox.check();
  await grant.click();
  await expect(page.getByRole("status")).toContainText("Persetujuan laporan baru telah dicatat");
  expect(reconsentBody).toEqual({ consent: true });
  await expect(checkbox).not.toBeChecked();
});

test("standalone consent is independently selected and never substitutes for booking consent", async ({ page }) => {
  let standaloneBody: unknown;
  await mockAppointmentCenter(page, [consent(standaloneConsentId, "STANDALONE_REPORT_ACCESS", null, true)]);
  await page.route("**/api/consents/psychologist-report", async (route) => {
    standaloneBody = route.request().postDataJSON();
    return route.fulfill({ json: success({ consentId: "new-standalone", consentType: "STANDALONE_REPORT_ACCESS", appointmentId: null }) });
  });

  await page.goto("/?view=appointments");
  await expect(page.getByText("Status janji: CONFIRMED · Akses laporan tidak aktif")).toBeVisible();
  const checkbox = page.getByRole("checkbox");
  await expect(checkbox).not.toBeChecked();
  await page.getByLabel("Psikolog penerima").selectOption(psychologistId);
  await expect(page.getByRole("button", { name: "Berikan akses mandiri" })).toBeDisabled();
  await checkbox.check();
  await page.getByRole("button", { name: "Berikan akses mandiri" }).click();
  await expect(page.getByRole("status")).toContainText("Akses laporan mandiri diberikan");
  expect(standaloneBody).toEqual({ assessmentSessionId, reportId, psychologistId, consent: true });
});
