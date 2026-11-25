import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";

type Account = { email: string; password: string; name: string };
type Fixture = {
  appointmentId: string;
  reportId: string;
  participant: Account;
  psychologist: Account;
  outsider: Account;
  admin: Account;
};
type Consultation = {
  appointmentId: string;
  appointmentStatus: string;
  sessionStatus: string;
  counterpartName: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  participantCheckedInAt: string | null;
  psychologistCheckedInAt: string | null;
};
type ChatCommand = { clientMessageId: string; body: string };

const base = "http://127.0.0.1:55430";
const output = ".tmp/phase4-sprint4";
const when = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
});

test.afterEach(async ({ browser }) => {
  await Promise.all(browser.contexts().map(context => context.close()));
});

function readFixture(): Fixture {
  const path = process.env.WELLBEING_CONSULTATION_FIXTURE;
  if (!path) throw new Error("An explicit synthetic local consultation fixture is required");
  return JSON.parse(readFileSync(path, "utf8"));
}

async function login(browser: Browser, account: Account, dashboard: string) {
  const context = await browser.newContext({ baseURL: base });
  try {
    await context.route("**/*", route => new URL(route.request().url()).origin === base
      ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill(account.email);
    await page.getByPlaceholder("Masukkan password Anda").fill(account.password);
    const loginResponse = page.waitForResponse(response =>
      response.url() === base + "/api/auth/login" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    expect((await loginResponse).status()).toBe(200);
    await expect(page).toHaveURL(base + dashboard);
    return page;
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function getConsultation(page: Page, appointmentId: string) {
  const response = await page.request.get("/api/consultations");
  expect(response.status()).toBe(200);
  const data = (await response.json()).data as { items: Consultation[]; serverNow: string };
  const item = data.items.find(candidate => candidate.appointmentId === appointmentId);
  if (!item) throw new Error("The assigned consultation is missing");
  return { item, serverNow: Date.parse(data.serverNow) };
}

function cardFor(page: Page, item: Consultation) {
  const dashboard = page.getByRole("region", { name: "Lifecycle konsultasi" });
  const range = `${when.format(new Date(item.scheduledStartAt))} – ${when.format(new Date(item.scheduledEndAt))} WIB`;
  return dashboard.getByRole("article")
    .filter({ has: page.getByRole("heading", { name: item.counterpartName, exact: true }) })
    .filter({ has: page.getByText(range, { exact: true }) });
}

async function action(page: Page, item: Consultation, actionName: string, buttonName: string) {
  const posted = page.waitForResponse(response =>
    response.url() === `${base}/api/consultations/${item.appointmentId}/${actionName}`
      && response.request().method() === "POST");
  await cardFor(page, item).getByRole("button", { name: buttonName, exact: true }).click();
  const response = await posted;
  expect(response.status()).toBe(200);
  return (await response.json()).data as Consultation;
}

const chat = (page: Page) => page.getByRole("region", { name: "Chat konsultasi privat" });

async function send(page: Page, messagesPath: string, body: string) {
  await chat(page).getByLabel("Pesan konsultasi", { exact: true }).fill(body);
  const posted = page.waitForResponse(response =>
    response.url() === base + messagesPath && response.request().method() === "POST");
  await chat(page).getByRole("button", { name: "Kirim pesan", exact: true }).click();
  const response = await posted;
  expect(response.status()).toBe(200);
  const command = response.request().postDataJSON() as ChatCommand;
  const result = (await response.json()).data;
  expect(result.replayed).toBe(false);
  expect(result.message).toMatchObject({ clientMessageId: command.clientMessageId, body });
  await expect(chat(page).getByText(body, { exact: true })).toBeVisible();
  return { command, messageId: result.message.id as string };
}

async function assignedPages(browser: Browser, fixture: Fixture) {
  const participant = await login(browser, fixture.participant, "/participant/dashboard");
  const psychologist = await login(browser, fixture.psychologist, "/psychologist/dashboard");
  await participant.goto("/participant/appointments");
  const first = await getConsultation(participant, fixture.appointmentId);
  const second = await getConsultation(psychologist, fixture.appointmentId);
  expect(first.item.counterpartName).toBe(fixture.psychologist.name);
  expect(second.item.counterpartName).toBe(fixture.participant.name);
  await expect(cardFor(participant, first.item)).toBeVisible();
  await expect(cardFor(psychologist, second.item)).toBeVisible();
  return { participant, psychologist, first, second };
}

test("preflight: both assigned accounts see the same scheduled consultation", async ({ browser }) => {
  const fixture = readFixture();
  const { psychologist, first, second } = await assignedPages(browser, fixture);
  for (const { item } of [first, second]) {
    expect(item.appointmentStatus).toBe("CONFIRMED");
    expect(item.sessionStatus).toBe("SCHEDULED");
    expect(item.participantCheckedInAt).toBeNull();
    expect(item.psychologistCheckedInAt).toBeNull();
  }
  const scopedPdf = `/api/reports/${fixture.reportId}/download?appointmentId=${fixture.appointmentId}`;
  expect((await psychologist.request.get(scopedPdf)).status()).toBe(200);
  const admin = await login(browser, fixture.admin, "/admin/dashboard");
  expect((await admin.request.get("/api/consultations")).status()).toBe(403);
});

test("completes a real consultation with both check-ins, private chat, and closure", async ({ browser }) => {
  const fixture = readFixture();
  const { participant, psychologist, first, second } = await assignedPages(browser, fixture);
  const start = Date.parse(first.item.scheduledStartAt);
  const end = Date.parse(first.item.scheduledEndAt);
  expect(first.serverNow, "PostgreSQL time must be within the scheduled slot").toBeGreaterThanOrEqual(start);
  expect(first.serverNow).toBeLessThan(end);
  expect(first.item.appointmentStatus).toBe("CONFIRMED");
  expect(first.item.sessionStatus).toBe("SCHEDULED");
  expect(first.item.participantCheckedInAt).toBeNull();
  expect(first.item.psychologistCheckedInAt).toBeNull();

  const path = `/api/consultations/${fixture.appointmentId}`;
  const messagesPath = path + "/messages";
  const scopedPdf = `/api/reports/${fixture.reportId}/download?appointmentId=${fixture.appointmentId}`;
  expect((await psychologist.request.get(scopedPdf)).status()).toBe(200);
  mkdirSync(output, { recursive: true });

  const firstCheckIn = await action(participant, first.item, "participant-check-in", "Check-in saya");
  expect(firstCheckIn.participantCheckedInAt).toBeTruthy();
  expect(firstCheckIn.psychologistCheckedInAt).toBeNull();
  await psychologist.reload();
  const leftToCheckIn = (await getConsultation(psychologist, fixture.appointmentId)).item;
  expect(leftToCheckIn.participantCheckedInAt).toEqual(firstCheckIn.participantCheckedInAt);
  await expect(cardFor(psychologist, second.item).getByRole("button", { name: "Mulai konsultasi" })).toBeDisabled();
  const ready = await action(psychologist, second.item, "psychologist-check-in", "Check-in saya");
  expect(ready.sessionStatus).toBe("READY");
  expect(ready.psychologistCheckedInAt).toBeTruthy();
  await expect(cardFor(psychologist, second.item).getByText("Siap dimulai", { exact: true })).toBeVisible();
  await psychologist.screenshot({ path: output + "/ready.png" });

  const inProgress = await action(psychologist, second.item, "start", "Mulai konsultasi");
  expect(inProgress).toMatchObject({ appointmentStatus: "IN_PROGRESS", sessionStatus: "IN_PROGRESS" });
  await participant.reload();
  for (const [page, item] of [[participant, first.item], [psychologist, second.item]] as const) {
    await expect(cardFor(page, item).getByText("Berlangsung", { exact: true })).toBeVisible();
    await cardFor(page, item).getByRole("button", { name: "Buka chat konsultasi" }).click();
  }

  const bodies = ["Halo dari peserta sintetis.", "Pesan diterima oleh psikolog sintetis."];
  const fromParticipant = await send(participant, messagesPath, bodies[0]);
  await chat(psychologist).getByRole("button", { name: "Muat ulang pesan" }).click();
  await expect(chat(psychologist).getByText(bodies[0], { exact: true })).toBeVisible();
  const fromPsychologist = await send(psychologist, messagesPath, bodies[1]);
  await chat(participant).getByRole("button", { name: "Muat ulang pesan" }).click();
  await expect(chat(participant).getByText(bodies[1], { exact: true })).toBeVisible();
  const replay = await participant.request.post(messagesPath, {
    headers: { Origin: base }, data: fromParticipant.command,
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).data).toMatchObject({ replayed: true, message: { id: fromParticipant.messageId } });

  for (const [page, item, role] of [
    [participant, first.item, "participant"], [psychologist, second.item, "psychologist"],
  ] as const) {
    await page.reload();
    await cardFor(page, item).getByRole("button", { name: "Buka chat konsultasi" }).click();
    await expect(chat(page).getByRole("listitem").locator("p")).toHaveText(bodies);
    await page.screenshot({ path: `${output}/${role}-chat.png` });
  }

  const outsider = await login(browser, fixture.outsider, "/participant/dashboard");
  const admin = await login(browser, fixture.admin, "/admin/dashboard");
  const outsiderStatus = (await outsider.request.get(messagesPath)).status();
  const adminStatus = (await admin.request.get(messagesPath)).status();
  expect(outsiderStatus).toBe(403);
  expect(adminStatus).toBe(403);

  psychologist.once("dialog", dialog => dialog.accept());
  const completed = await action(psychologist, second.item, "end", "Akhiri konsultasi");
  expect(completed).toMatchObject({ appointmentStatus: "COMPLETED", sessionStatus: "COMPLETED" });
  await participant.reload();
  for (const [page, item, role] of [
    [participant, first.item, "participant"], [psychologist, second.item, "psychologist"],
  ] as const) {
    expect((await getConsultation(page, item.appointmentId)).item).toMatchObject({
      appointmentStatus: "COMPLETED", sessionStatus: "COMPLETED",
    });
    await expect(cardFor(page, item).getByText("Selesai", { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: `${output}/${role}-completed.png` });
  }
  const afterEnd = [];
  for (const page of [participant, psychologist]) {
    const read = await page.request.get(messagesPath);
    const write = await page.request.post(messagesPath, {
      headers: { Origin: base }, data: { clientMessageId: randomUUID(), body: "Pesan setelah sesi berakhir" },
    });
    expect(read.status()).toBe(409);
    expect(write.status()).toBe(409);
    afterEnd.push({ read: read.status(), write: write.status() });
  }
  const pdfAfterEnd = (await psychologist.request.get(scopedPdf)).status();
  expect(pdfAfterEnd).toBe(404);
  writeFileSync(output + "/browser-evidence.json", JSON.stringify({
    status: "PASS", hosted: false, appointmentId: fixture.appointmentId,
    slot: { start: first.item.scheduledStartAt, end: first.item.scheduledEndAt },
    replayedMessage: fromParticipant.messageId, messages: [fromParticipant.messageId, fromPsychologist.messageId],
    outsiderStatus, adminStatus, afterEnd, pdfAfterEnd,
  }, null, 2));
});
