import { expect, test, type Page } from "@playwright/test";
const id = "00000000-0000-4000-8000-000000000002", next = "00000000-0000-4000-8000-000000000003";
const ok = (data: unknown) => ({ success: true, data });
const error = (message: string) => ({ success: false, error: { message } });
const period = { id, name: "Periode sintetis", startDate: "2031-01-01", endDate: "2031-06-30", assessmentLimit: 3, status: "INACTIVE" };
const overview = () => ({ activeParticipants: 12, activePsychologists: 2, assessmentsStarted: 5, assessmentsCompleted: 3,
  appointments: [{ status: "CONFIRMED", count: 4 }], consultations: [{ status: "IN_PROGRESS", count: 1 }], availability: [{ status: "AVAILABLE", count: 7 }], activePeriod: { ...period, status: "ACTIVE" }, clinicalIndicatorsEnabled: false });
async function mock(page: Page) {
  const state = { overview: overview(), periods: [period], canCreate: true, nextCursor: null as string | null, requests: [] as string[], writes: [] as unknown[], fail: false };
  await page.route("**/api/admin/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname; state.requests.push(request.url());
    if (request.method() === "POST") { state.writes.push(request.postDataJSON()); return route.fulfill({ json: ok(period) }); }
    if (path.endsWith("overview")) return state.fail ? route.fulfill({ status: 503, json: error("Data operasional belum tersedia.") }) : route.fulfill({ json: ok(state.overview) });
    if (path.endsWith("periods")) return route.fulfill({ json: ok({ items: state.periods, nextCursor: state.nextCursor, canCreate: state.canCreate, activePeriod: null }) });
    if (path.includes("/periods/")) return route.fulfill({ json: ok(period) });
    if (path.endsWith("psychologists")) return route.fulfill({ json: ok({ items: [{ id, name: "Psikolog sintetis", active: false, profile: null, availability: [{ status: "BOOKED", count: 2 }, { status: "AVAILABLE", count: 0 }, { status: "UNAVAILABLE", count: 1 }] }], nextCursor: state.nextCursor }) });
    if (path.endsWith("appointments")) return route.fulfill({ json: ok({ items: [{ status: "CONFIRMED", scheduledStartAt: "2030-01-01T02:00:00.000Z", scheduledEndAt: "2030-01-01T04:00:00.000Z", psychologistName: "Psikolog sintetis", consultationStatus: "SCHEDULED" }], nextCursor: state.nextCursor }) });
    return route.fulfill({ status: 404, json: error("Tidak tersedia") });
  });
  return state;
}
const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Navigasi administrator" }).getByRole("button", { name, exact: true });
test.beforeEach(async ({ page }) => { await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort()); });
test("overview renders actual operational counts and explains disabled clinical indicators", async ({ page }) => {
  await mock(page); await page.goto("/?view=admin");
  await expect(page.getByRole("heading", { name: "Operasional KKA" })).toBeVisible();
  await expect(page.locator(".admin-kpis dd")).toHaveText(["12", "2", "5", "3"]);
  await expect(page.getByRole("table", { name: "Janji berdasarkan status" })).toContainText("Dikonfirmasi");
  await expect(page.locator(".admin-notice")).toContainText("Indikator kesehatan mental dinonaktifkan");
  await expect(page.getByRole("link", { name: /PDF|hasil|chat/i })).toHaveCount(0);
});
test("zero overview displays zero values, no fabricated statistics, and absent active period", async ({ page }) => {
  const state = await mock(page); Object.assign(state.overview, { activeParticipants: 0, activePsychologists: 0, assessmentsStarted: 0, assessmentsCompleted: 0, activePeriod: null });
  await page.goto("/?view=admin"); await expect(page.locator(".admin-kpis dd")).toHaveText(["0", "0", "0", "0"]);
  await expect(page.getByText("Belum ada periode aktif", { exact: true })).toBeVisible();
});
test("loading and failure never expose stale KPIs and manual retry recovers", async ({ page }) => {
  const state = await mock(page); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/overview?*", async route => { await gate; return route.fallback(); }, { times: 1 });
  await page.goto("/?view=admin"); await expect(page.getByText("Memuat data operasional...")).toBeVisible(); await expect(page.locator(".admin-kpis")).toHaveCount(0);
  state.fail = true; release(); await expect(page.getByRole("alert")).toContainText("belum tersedia"); await expect(page.locator(".admin-kpis")).toHaveCount(0);
  state.fail = false; await page.getByRole("button", { name: "Muat ulang data", exact: true }).click(); await expect(page.locator(".admin-kpis dd")).toHaveCount(4);
});
test("date and period filters are applied explicitly and late old responses are discarded", async ({ page }) => {
  const state = await mock(page); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/overview?*", async route => {
    const url = new URL(route.request().url()); state.requests.push(url.href);
    if (url.searchParams.get("from") === "2030-01-01") { await gate; return route.fulfill({ json: ok({ ...overview(), activeParticipants: 999 }) }); }
    return route.fulfill({ json: ok({ ...overview(), activeParticipants: 7 }) });
  });
  await page.goto("/?view=admin"); await page.getByLabel("Dari tanggal").fill("2030-02-01"); await page.getByLabel("Sampai tanggal").fill("2030-02-28");
  await page.getByLabel("Filter periode asesmen").selectOption(id); await page.getByRole("button", { name: "Terapkan filter" }).click();
  await expect(page.locator(".admin-kpis dd").first()).toHaveText("7"); release(); await expect(page.locator(".admin-kpis dd").first()).toHaveText("7");
  expect(state.requests.some(value => value.includes("from=2030-02-01") && value.includes(`periodId=${id}`))).toBe(true);
});
test("period list and details are read-only for historical records with no activation action", async ({ page }) => {
  await mock(page); await page.goto("/?view=admin"); await tab(page, "Periode akademik").click();
  await expect(page.getByRole("table", { name: "Daftar periode akademik" })).toContainText("Nonaktif");
  await page.getByRole("button", { name: "Lihat Periode sintetis" }).click(); await expect(page.getByRole("region", { name: "Detail periode" })).toContainText("1 Jan 2031");
  await expect(page.getByRole("button", { name: /Aktifkan|Nonaktifkan|Ubah kuota/ })).toHaveCount(0);
});
test("period create submits only staged fields once and waits for server confirmation", async ({ page }) => {
  const state = await mock(page); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/admin/periods", async route => { if (route.request().method() === "POST") await gate; return route.fallback(); });
  await page.goto("/?view=admin"); await tab(page, "Periode akademik").click();
  await page.getByLabel("Nama periode", { exact: true }).fill("Persiapan sintetis"); await page.getByLabel("Tanggal mulai", { exact: true }).fill("2031-01-01"); await page.getByLabel("Tanggal akhir", { exact: true }).fill("2031-06-30");
  await page.getByRole("button", { name: "Simpan periode nonaktif" }).click(); await expect(page.getByRole("button", { name: "Menyimpan..." })).toBeDisabled();
  await expect(page.getByText("Periode nonaktif berhasil disimpan.")).toHaveCount(0); release(); await expect(page.getByText("Periode nonaktif berhasil disimpan.")).toBeVisible();
  expect(state.writes).toEqual([{ name: "Persiapan sintetis", startDate: "2031-01-01", endDate: "2031-06-30", assessmentLimit: 3 }]);
});
test("period validation errors keep inputs for correction and allow a successful retry", async ({ page }) => {
  await mock(page); let failed = false;
  await page.route("**/api/admin/periods", route => {
    if (route.request().method() === "POST" && !failed) { failed = true; return route.fulfill({ status: 409, json: error("Rentang bertumpang tindih dengan periode aktif.") }); }
    return route.fallback();
  });
  await page.goto("/?view=admin"); await tab(page, "Periode akademik").click();
  await page.getByLabel("Nama periode", { exact: true }).fill("Periode baru"); await page.getByLabel("Tanggal mulai", { exact: true }).fill("2031-01-01"); await page.getByLabel("Tanggal akhir", { exact: true }).fill("2031-06-30");
  await page.getByRole("button", { name: "Simpan periode nonaktif" }).click(); await expect(page.getByRole("alert")).toContainText("bertumpang tindih");
  await expect(page.getByLabel("Nama periode", { exact: true })).toHaveValue("Periode baru"); await page.getByRole("button", { name: "Simpan periode nonaktif" }).click(); await expect(page.getByText("Periode nonaktif berhasil disimpan.")).toBeVisible();
});
test("production period creation stays unavailable and empty list is explicit", async ({ page }) => {
  const state = await mock(page); state.canCreate = false; state.periods = [];
  await page.goto("/?view=admin"); await tab(page, "Periode akademik").click(); await expect(page.getByText("Belum ada periode pada halaman ini.")).toBeVisible();
  await expect(page.getByText(/Pembuatan periode pada production dinonaktifkan/)).toBeVisible(); await expect(page.getByRole("button", { name: "Simpan periode nonaktif" })).toHaveCount(0);
});
test("period list uses cursor pagination and detail selection resets on a new page", async ({ page }) => {
  const state = await mock(page); state.nextCursor = id;
  await page.goto("/?view=admin"); await tab(page, "Periode akademik").click(); await page.getByRole("button", { name: "Lihat Periode sintetis" }).click();
  state.periods = [{ ...period, id: next, name: "Periode kedua" }]; state.nextCursor = null;
  await page.getByRole("button", { name: "Halaman berikutnya" }).click(); await expect(page.getByRole("table", { name: "Daftar periode akademik" })).toContainText("Periode kedua");
  await expect(page.getByRole("region", { name: "Detail periode" })).toHaveCount(0); expect(state.requests.some(url => url.includes(`cursor=${id}`))).toBe(true);
});
test("psychologist monitoring shows inactive/missing-profile state, slots and filters without role-editing controls", async ({ page }) => {
  const state = await mock(page); await page.goto("/?view=admin"); await tab(page, "Pemantauan psikolog").click();
  const table = page.getByRole("table", { name: "Psikolog dan kapasitas jadwal" }); await expect(table).toContainText("Profil belum dilengkapi"); await expect(table).toContainText("Nonaktif");
  await page.getByLabel("Status akun", { exact: true }).selectOption("false"); await page.getByRole("button", { name: "Terapkan filter" }).click(); await expect(table).toBeVisible();
  expect(state.requests.some(url => url.includes("active=false"))).toBe(true); await expect(page.getByRole("button", { name: /Tambah psikolog|Ubah peran|Aktifkan/ })).toHaveCount(0);
});
test("appointment oversight displays WIB and status filters without participant details or actions", async ({ page }) => {
  const state = await mock(page); await page.goto("/?view=admin"); await tab(page, "Pengawasan janji").click();
  const table = page.getByRole("table", { name: "Jadwal janji konsultasi" }); await expect(table).toContainText("09.00"); await expect(table).toContainText("11.00"); await expect(table).toContainText("Psikolog sintetis");
  await expect(table.getByRole("columnheader")).toHaveText(["Jadwal WIB", "Psikolog", "Status janji", "Status sesi tersimpan"]);
  await page.getByLabel("Status janji", { exact: true }).selectOption("COMPLETED"); await page.getByRole("button", { name: "Terapkan filter" }).click(); await expect(table).toBeVisible();
  expect(state.requests.some(url => url.includes("status=COMPLETED"))).toBe(true); await expect(page.getByRole("button", { name: /Batalkan|Jadwalkan ulang|Buka sesi/ })).toHaveCount(0);
});
test("access denied never renders protected monitoring content", async ({ page }) => {
  await page.route("**/api/admin/**", route => route.fulfill({ status: 403, json: error("Akses administrator aktif diperlukan.") }));
  await page.goto("/?view=admin"); await expect(page.getByText("Akses administrator aktif diperlukan.")).toBeVisible(); await expect(page.locator(".admin-kpis")).toHaveCount(0);
});
test("navigation remains keyboard accessible and mobile content stays within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mock(page); await page.goto("/?view=admin");
  await expect(page.locator(".admin-kpis dd")).toHaveCount(4);
  const button = tab(page, "Pengawasan janji"); await button.focus(); await expect(button).toBeFocused(); await page.keyboard.press("Enter");
  await expect(page.getByRole("table", { name: "Jadwal janji konsultasi" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
