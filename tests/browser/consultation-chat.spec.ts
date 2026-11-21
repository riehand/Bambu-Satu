import { expect, test, type Page } from "@playwright/test";
import type { ConsultationDTO } from "../../src/lib/consultations/service";
import type { ChatMessage, ChatPage } from "../../src/lib/consultations/chat-service";
const id = "00000000-0000-4000-8000-000000000991", secondId = "00000000-0000-4000-8000-000000000992";
const path = `**/api/consultations/${id}/messages*`;
const success = (data: unknown) => ({ success: true, data });
const failure = (message = "Gangguan sintetis") => ({ success: false, error: { message } });
const denied = { allowed: false, code: "DISABLED", reason: "Sudah tercatat." };
function row(appointmentId = id): ConsultationDTO { return {
  appointmentId, appointmentStatus: "IN_PROGRESS", counterpartName: "Nama sintetis",
  scheduledStartAt: "2030-01-01T02:00:00Z", scheduledEndAt: "2030-01-01T04:00:00Z",
  sessionStatus: "IN_PROGRESS", effectiveStatus: "IN_PROGRESS", participantCheckedInAt: "2030-01-01T02:00:00Z", psychologistCheckedInAt: "2030-01-01T02:00:00Z",
  startedAt: "2030-01-01T02:00:00Z", endedAt: null, endedBy: null, endReason: null, history: false,
  actions: { checkIn: denied, start: denied, end: { allowed: true, code: null, reason: null } },
}; }
function message(n: number, body = `Pesan sintetis ${n}`, own = false): ChatMessage { return {
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, body, own,
  createdAt: `2030-01-01T02:00:${String(n).padStart(2, "0")}.000Z`, senderRole: own ? "PARTICIPANT" : "PSYCHOLOGIST", clientMessageId: null,
}; }
function data(items: ChatMessage[] = [], extra: Partial<ChatPage> = {}): ChatPage { return {
  items, nextCursor: null, latestCursor: "latest", canSend: true,
  serverNow: "2030-01-01T02:00:00.000Z", scheduledEndAt: "2030-01-01T04:00:00.000Z", ...extra,
}; }
async function mock(page: Page) {
  const state = { rows: [row()], items: [] as ChatMessage[], commands: [] as { clientMessageId: string; body: string }[], reads: [] as string[] };
  await page.route("**/api/consultations", route => route.fulfill({ json: success({ items: state.rows, serverNow: "2030-01-01T02:00:00.000Z", policyNotice: "Pengujian sintetis." }) }));
  await page.route(path, async route => {
    if (route.request().method() === "POST") {
      const command = route.request().postDataJSON(); state.commands.push(command);
      const sent = { ...message(10, command.body, true), clientMessageId: command.clientMessageId };
      state.items.push(sent);
      return route.fulfill({ json: success({ message: sent, replayed: false }) });
    }
    state.reads.push(route.request().url());
    return route.fulfill({ json: success(data(state.items)) });
  });
  return state;
}
async function open(page: Page, role = "participant") {
  await page.goto(`/?view=consultations&role=${role}`);
  await page.getByRole("button", { name: "Buka chat konsultasi" }).first().click();
}
const input = (page: Page) => page.getByRole("textbox", { name: "Pesan konsultasi" });
test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});

for (const role of ["participant", "psychologist"]) test(`${role} can send one server-confirmed message with WIB and no identity override`, async ({ page }) => {
  const state = await mock(page); state.items = [message(1)];
  await open(page, role); await expect(input(page)).toBeEnabled();
  await expect(page.locator(".chat-peer")).toContainText("09.00.01 WIB");
  await input(page).fill("  Teks sintetis baru  "); await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(page.locator(".chat-own")).toContainText("Teks sintetis baru");
  await expect(page.getByText("Pesan dikonfirmasi server.")).toBeVisible(); await expect(input(page)).toHaveValue("");
  expect(state.commands).toHaveLength(1); expect(Object.keys(state.commands[0]).sort()).toEqual(["body", "clientMessageId"]);
  expect(state.commands[0].body).toBe("Teks sintetis baru"); expect(state.commands[0].clientMessageId).toMatch(/^[a-f0-9-]{36}$/);
});
test("pending load disables editing and empty successful load enables composer", async ({ page }) => {
  await mock(page); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(path, async route => { await gate; await route.fulfill({ json: success(data()) }); });
  await open(page); await expect(page.getByText("Memuat pesan...", { exact: true })).toBeVisible(); await expect(input(page)).toBeDisabled();
  release(); await expect(page.getByText("Belum ada pesan.")).toBeVisible(); await expect(input(page)).toBeEnabled();
});
test("failed load clears stale history, disables input, and retry recovers", async ({ page }) => {
  const state = await mock(page); state.items = [message(1)]; await open(page);
  await expect(page.locator(".consultation-messages li")).toHaveCount(1);
  await page.route(path, route => route.fulfill({ status: 503, json: failure() }), { times: 1 });
  await page.getByRole("button", { name: "Muat ulang pesan" }).click();
  await expect(page.getByRole("alert")).toContainText("Gangguan sintetis"); await expect(input(page)).toBeDisabled();
  await expect(page.locator(".consultation-messages li")).toHaveCount(0);
  await page.getByRole("button", { name: "Muat ulang pesan" }).click(); await expect(input(page)).toBeEnabled();
  await expect(page.locator(".consultation-messages li")).toHaveCount(1);
});
test("uncertain send freezes draft and retry reuses exact idempotency key without duplicates", async ({ page }) => {
  const state = await mock(page); let failed: unknown;
  await page.route(path, async route => {
    if (route.request().method() === "POST" && !failed) { failed = route.request().postDataJSON(); return route.abort("failed"); }
    return route.fallback();
  });
  await open(page); await input(page).fill("Pesan percobaan"); await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Coba kirim ulang" })).toBeEnabled(); await expect(input(page)).toBeDisabled();
  await expect(page.locator(".consultation-messages li")).toHaveCount(0);
  await page.getByRole("button", { name: "Coba kirim ulang" }).click();
  await expect(page.locator(".consultation-messages li")).toHaveCount(1); expect(state.commands).toEqual([failed]);
});
test("pending POST disables duplicate submission and waits for actual server confirmation", async ({ page }) => {
  const state = await mock(page); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
  await page.route(path, async route => {
    if (route.request().method() === "POST") { calls++; await gate; }
    return route.fallback();
  });
  await open(page); await input(page).fill("Belum dikonfirmasi"); await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mengirim...", exact: true })).toBeDisabled();
  await expect(page.getByText("Menunggu konfirmasi server...")).toBeVisible(); await expect(input(page)).toBeDisabled();
  await expect(page.locator(".consultation-messages li")).toHaveCount(0); expect(calls).toBe(1);
  release(); await expect(page.locator(".consultation-messages li")).toHaveCount(1); expect(state.commands).toHaveLength(1);
});
test("lost POST response reconciles committed message from refresh without resending", async ({ page }) => {
  const state = await mock(page); let posts = 0;
  await page.route(path, async route => {
    if (route.request().method() === "POST") {
      posts++; const payload = route.request().postDataJSON();
      state.items = [{ ...message(10, payload.body, true), clientMessageId: payload.clientMessageId }]; return route.abort("failed");
    }
    return route.fallback();
  });
  await open(page); await input(page).fill("Respons hilang"); await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(page.getByText("Pesan dikonfirmasi server.")).toBeVisible(); await expect(input(page)).toHaveValue("");
  await expect(input(page)).toBeEnabled(); await expect(page.locator(".consultation-messages li")).toHaveCount(1); expect(posts).toBe(1);
});
test("send confirmation does not skip a peer message that arrived before the own message", async ({ page }) => {
  const state = await mock(page);
  await page.route(path, route => {
    if (route.request().method() === "POST") state.items.push(message(9, "Pesan rekan sebelum konfirmasi"));
    return route.fallback();
  });
  await open(page); await input(page).fill("Pesan saya"); await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  await expect(page.locator(".consultation-messages li p")).toHaveText(["Pesan rekan sebelum konfirmasi", "Pesan saya"]);
  expect(new URL(state.reads[state.reads.length - 1]).searchParams.get("after")).toBe("latest");
});
test("ending consultation from psychologist dashboard unmounts chat and removes messages", async ({ page }) => {
  const state = await mock(page); state.items = [message(1)];
  await page.route(`**/api/consultations/${id}/end`, route => {
    state.rows[0] = { ...state.rows[0], appointmentStatus: "COMPLETED", sessionStatus: "COMPLETED", effectiveStatus: "COMPLETED", history: true,
      endedAt: "2030-01-01T02:30:00.000Z", endedBy: "PSYCHOLOGIST", endReason: "PSYCHOLOGIST_COMPLETED", actions: { checkIn: denied, start: denied, end: denied } };
    return route.fulfill({ json: success(state.rows[0]) });
  });
  await open(page, "psychologist"); await expect(page.locator(".consultation-messages li")).toHaveCount(1);
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Akhiri konsultasi" }).click();
  await expect(page.getByText(/Chat tidak tersedia:/)).toBeVisible(); await expect(page.locator(".consultation-messages li")).toHaveCount(0); await expect(input(page)).toHaveCount(0);
});
test("history pages merge in stable order and polling uses the latest after cursor", async ({ page }) => {
  await page.clock.install(); const state = await mock(page);
  await page.route(path, route => {
    const query = new URL(route.request().url()).searchParams; state.reads.push(route.request().url());
    const result = query.has("before") ? data([message(1), message(2)]) : query.has("after") ? data([message(4)], { latestCursor: "cursor4" }) : data([message(3)], { nextCursor: "older", latestCursor: "cursor3" });
    return route.fulfill({ json: success(result) });
  });
  await open(page); await page.getByRole("button", { name: "Pesan lebih lama" }).click();
  await expect(page.locator(".consultation-messages li p")).toHaveText(["Pesan sintetis 1", "Pesan sintetis 2", "Pesan sintetis 3"]);
  await page.clock.fastForward(5000); await expect(page.locator(".consultation-messages li")).toHaveCount(4);
  expect(state.reads.some(url => url.includes("before=older"))).toBe(true);
  expect(state.reads.some(url => url.includes("after=cursor3"))).toBe(true);
});
test("reconnect refreshes and close removes content and polling", async ({ page }) => {
  await page.clock.install(); const state = await mock(page); await open(page); await expect(input(page)).toBeEnabled();
  state.items = [message(1)]; await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".consultation-messages li")).toHaveCount(1);
  await page.getByRole("button", { name: "Tutup chat" }).click(); const reads = state.reads.length;
  await page.clock.fastForward(15000); expect(state.reads).toHaveLength(reads); await expect(input(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Buka chat konsultasi" }).click(); await expect(page.locator(".consultation-messages li")).toHaveCount(1);
  await page.reload(); await page.getByRole("button", { name: "Buka chat konsultasi" }).click();
  await expect(page.locator(".consultation-messages li")).toHaveCount(1); expect(state.commands).toEqual([]);
});
test("server closure clears messages and draft and prevents further sending", async ({ page }) => {
  const state = await mock(page); state.items = [message(1)]; await open(page); await input(page).fill("Belum terkirim");
  await page.route(path, route => route.fulfill({ status: 409, json: failure("Konsultasi telah berakhir.") }));
  await page.getByRole("button", { name: "Muat ulang pesan" }).click();
  await expect(page.getByRole("alert")).toContainText("Konsultasi telah berakhir"); await expect(input(page)).toBeDisabled(); await expect(input(page)).toHaveValue("");
  await expect(page.locator(".consultation-messages li")).toHaveCount(0); await expect(page.getByRole("button", { name: "Kirim pesan", exact: true })).toBeDisabled(); expect(state.commands).toEqual([]);
});
test("server-relative expiry closes input and removes history without another fetch", async ({ page }) => {
  await page.clock.install(); await mock(page);
  await page.route(path, route => route.fulfill({ json: success(data([message(1)], { scheduledEndAt: "2030-01-01T02:00:02.000Z" })) }));
  await open(page); await expect(input(page)).toBeEnabled(); await page.clock.fastForward(2100);
  await expect(input(page)).toBeDisabled(); await expect(page.getByRole("alert")).toContainText("Chat ditutup"); await expect(page.locator(".consultation-messages li")).toHaveCount(0);
});
test("production policy rejection presents reason without enabling send", async ({ page }) => {
  await mock(page); await page.route(path, route => route.fulfill({ status: 403, json: failure("Chat produksi menunggu persetujuan privasi dan keamanan institusi.") }));
  await open(page); await expect(page.getByRole("alert")).toContainText("persetujuan privasi"); await expect(input(page)).toBeDisabled();
});
test("completed lifecycle does not fetch chat history", async ({ page }) => {
  const state = await mock(page); state.rows[0].appointmentStatus = "COMPLETED"; state.rows[0].effectiveStatus = "COMPLETED";
  await open(page); await expect(page.getByText(/Chat tidak tersedia:/)).toBeVisible(); expect(state.reads).toEqual([]); await expect(input(page)).toHaveCount(0);
});
test("switching appointments aborts pending old responses without mixing conversations", async ({ page }) => {
  const state = await mock(page); state.rows.push(row(secondId)); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(path, async route => { await gate; await route.fulfill({ json: success(data([message(1, "Percakapan lama")])) }); });
  await page.route(`**/api/consultations/${secondId}/messages*`, route => route.fulfill({ json: success(data([message(2, "Percakapan kedua")])) }));
  await open(page); await expect(page.getByText("Memuat pesan...", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Buka chat konsultasi" }).click(); await expect(page.getByText("Percakapan kedua", { exact: true })).toBeVisible();
  release(); await expect(page.getByText("Percakapan lama", { exact: true })).toHaveCount(0); await expect(input(page)).toBeEnabled();
});
test("plain text is escaped, long content fits mobile, and composer is keyboard accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = await mock(page);
  const html = '<img src=x onerror="alert(1)">'; state.items = [message(1, html), message(2, "x".repeat(2000))];
  await open(page); await expect(page.getByText(html, { exact: true })).toBeVisible(); await expect(page.locator(".consultation-messages img")).toHaveCount(0);
  expect(await input(page).getAttribute("maxlength")).toBe("2000"); await input(page).focus(); await expect(input(page)).toBeFocused();
  await page.keyboard.type("Pesan keyboard"); await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  await expect(page.locator(".chat-own")).toContainText("Pesan keyboard");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
