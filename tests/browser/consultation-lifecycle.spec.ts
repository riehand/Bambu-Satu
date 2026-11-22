import { expect, test, type Page } from "@playwright/test";
import type { ConsultationDTO, ConsultationList } from "../../src/lib/consultations/service";
const id = "00000000-0000-4000-8000-000000000991";
const allowed = { allowed: true, code: null, reason: null };
const denied = (reason: string) => ({ allowed: false, code: "DISABLED", reason });
function fixture(): ConsultationDTO { return {
  appointmentId: id, appointmentStatus: "CONFIRMED", counterpartName: "Nama sintetis",
  scheduledStartAt: "2030-01-01T02:00:00Z", scheduledEndAt: "2030-01-01T04:00:00Z",
  sessionStatus: "SCHEDULED", effectiveStatus: "SCHEDULED", participantCheckedInAt: null, psychologistCheckedInAt: null,
  startedAt: null, endedAt: null, endedBy: null, endReason: null, history: false,
  actions: { checkIn: allowed, start: denied("Peserta dan psikolog harus check-in terlebih dahulu."), end: denied("Konsultasi belum dimulai.") },
}; }
const success = (data: unknown) => ({ success: true, data });
async function mock(page: Page, row = fixture()) {
  const state = { row, requests: [] as string[] };
  await page.route("**/api/consultations", route => route.fulfill({ json: success({ items: [state.row], serverNow: "2030-01-01T02:00:00Z", policyNotice: "Kebijakan sementara pengembangan." } satisfies ConsultationList) }));
  await page.route(`**/api/consultations/${id}/*`, async route => {
    expect(route.request().postDataJSON()).toEqual({});
    const action = new URL(route.request().url()).pathname.split("/").pop()!;
    state.requests.push(action);
    if (action === "participant-check-in") state.row.participantCheckedInAt = "2030-01-01T02:01:00Z";
    if (action === "psychologist-check-in") state.row.psychologistCheckedInAt = "2030-01-01T02:02:00Z";
    if (action.endsWith("check-in")) {
      state.row.actions.checkIn = denied("Check-in Anda sudah tercatat.");
      if (state.row.participantCheckedInAt && state.row.psychologistCheckedInAt) { state.row.sessionStatus = "READY"; state.row.effectiveStatus = "READY"; state.row.actions.start = allowed; }
    }
    if (action === "start") {
      state.row.appointmentStatus = "IN_PROGRESS"; state.row.sessionStatus = "IN_PROGRESS"; state.row.effectiveStatus = "IN_PROGRESS";
      state.row.startedAt = "2030-01-01T02:03:00Z"; state.row.actions.start = denied("Konsultasi sudah dimulai."); state.row.actions.end = allowed;
    }
    if (action === "end") {
      state.row.appointmentStatus = "COMPLETED"; state.row.sessionStatus = "COMPLETED"; state.row.effectiveStatus = "COMPLETED";
      state.row.endedAt = "2030-01-01T02:30:00Z"; state.row.endedBy = "PSYCHOLOGIST"; state.row.endReason = "PSYCHOLOGIST_COMPLETED";
      state.row.history = true; state.row.actions.end = denied("Konsultasi telah ditutup dan tidak dapat diubah.");
    }
    return route.fulfill({ json: success(state.row) });
  });
  return state;
}
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});
test("participant sees Jakarta schedule, upcoming session and server-confirmed own check-in", async ({ page }) => {
  const state = await mock(page); await page.goto("/?view=consultations");
  await expect(page.getByRole("heading", { name: "Konsultasi mendatang dan berlangsung" })).toBeVisible();
  await expect(page.locator(".consultation-entry")).toContainText("09.00"); await expect(page.locator(".consultation-entry")).toContainText("11.00");
  await page.getByRole("button", { name: "Check-in saya" }).click();
  await expect(page.getByRole("button", { name: "Check-in saya" })).toBeDisabled();
  await expect(page.getByText("Check-in telah tercatat.", { exact: true })).toBeVisible();
  expect(state.requests).toEqual(["participant-check-in"]); await expect(page.getByRole("button", { name: "Mulai konsultasi" })).toHaveCount(0);
});
test("psychologist checks in, starts, confirms early end, and sees history timestamps", async ({ page }) => {
  const row = fixture(); row.participantCheckedInAt = "2030-01-01T02:01:00Z";
  const state = await mock(page, row); await page.goto("/?view=consultations&role=psychologist");
  await expect(page.getByRole("button", { name: "Mulai konsultasi" })).toBeDisabled();
  await page.getByRole("button", { name: "Check-in saya" }).click();
  await expect(page.getByText("Siap dimulai", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mulai konsultasi" }).click();
  await expect(page.locator(".consultation-times")).toContainText("09.03");
  page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("button", { name: "Akhiri konsultasi" }).click(); expect(state.requests).not.toContain("end");
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Akhiri konsultasi" }).click();
  await expect(page.getByText("Konsultasi selesai.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Akhiri konsultasi" })).toBeDisabled();
  await expect(page.locator(".consultation-group").filter({ has: page.getByRole("heading", { name: "Riwayat konsultasi", exact: true }) })).toContainText("09.30");
  expect(state.requests).toEqual(["psychologist-check-in", "start", "end"]);
});
test("authorized refresh observes the other party without inventing a transition", async ({ page }) => {
  const state = await mock(page); await page.goto("/?view=consultations");
  await expect(page.locator(".consultation-entry")).toBeVisible();
  state.row.psychologistCheckedInAt = "2030-01-01T02:04:00Z";
  await page.getByRole("button", { name: "Muat ulang status" }).click();
  await expect(page.locator(".consultation-times")).toContainText("09.04"); expect(state.requests).toEqual([]);
});
test("pending request disables actions and double click cannot submit twice", async ({ page }) => {
  const state = await mock(page); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**/api/consultations/${id}/participant-check-in`, async route => {
    state.requests.push("check-in"); await gate; await route.fulfill({ json: success(state.row) });
  });
  await page.goto("/?view=consultations"); await page.getByRole("button", { name: "Check-in saya" }).click();
  await expect(page.getByText("Menyimpan perubahan konsultasi...")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check-in saya" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Muat ulang status" })).toBeDisabled();
  expect(state.requests).toHaveLength(1); release();
});
test("stale conflict blocks further writes until a successful refresh", async ({ page }) => {
  await mock(page); await page.route(`**/api/consultations/${id}/participant-check-in`, route => route.fulfill({ status: 409, json: { success: false, error: { message: "Status sesi berubah." } } }));
  await page.goto("/?view=consultations"); await page.getByRole("button", { name: "Check-in saya" }).click();
  await expect(page.getByRole("alert")).toContainText("Status sesi berubah"); await expect(page.getByRole("button", { name: "Check-in saya" })).toBeDisabled();
  await page.getByRole("button", { name: "Muat ulang status" }).click(); await expect(page.getByRole("button", { name: "Check-in saya" })).toBeEnabled();
});
test("failed initial load offers retry and successful recovery", async ({ page }) => {
  await mock(page); await page.route("**/api/consultations", route => route.fulfill({ status: 503, json: { success: false } }), { times: 1 });
  await page.goto("/?view=consultations"); await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Muat ulang status" }).click(); await expect(page.getByRole("button", { name: "Check-in saya" })).toBeEnabled();
});
test("elapsed effective status preserves stored state and does not claim no-show or scheduler completion", async ({ page }) => {
  const row = fixture(); row.history = true; row.effectiveStatus = "WINDOW_ENDED";
  row.actions.checkIn = denied("Waktu konsultasi telah berakhir.");
  await mock(page, row); await page.goto("/?view=consultations");
  await expect(page.getByText("Waktu jadwal berakhir", { exact: true })).toBeVisible();
  await expect(page.locator(".consultation-entry")).toContainText("Status tersimpan: Terjadwal");
  await expect(page.getByRole("button", { name: "Check-in saya" })).toBeDisabled();
});
test("mobile layout fits the viewport and action buttons are keyboard accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mock(page); await page.goto("/?view=consultations");
  const checkIn = page.getByRole("button", { name: "Check-in saya" }); await expect(checkIn).toBeVisible();
  await checkIn.focus(); await expect(checkIn).toBeFocused(); await page.keyboard.press("Enter"); await expect(checkIn).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
