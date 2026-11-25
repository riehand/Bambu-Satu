import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
type Account = { id: string; email: string; password: string; name?: string };
const file = process.env.WELLBEING_BOOKING_FIXTURE;
if (!file) throw new Error("Explicit isolated Auth fixture required");
const fixture = JSON.parse(readFileSync(file,"utf8")) as { users: Account[]; psychologists: Account[] };
const base = "http://127.0.0.1:55430";
async function login(page: Page, account: Account, role = "participant") {
  await page.goto("/auth/login");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByPlaceholder("Masukkan password Anda").fill(account.password);
  const response = page.waitForResponse(r => r.url().endsWith("/api/auth/login") && r.request().method()==="POST");
  await page.getByRole("button",{ name:"Masuk",exact:true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/${role}/dashboard$`));
}
async function readyReport(page: Page) {
  let context=(await (await page.request.get("/api/appointments/booking-context")).json()).data;
  // A legacy GENERATED row without an attestation is retained, never repaired by a fixture.
  // Complete a new assessment through the actual UI to satisfy the latest-report rule.
  if (!context.latestAssessment || (!context.canBook && context.latestAssessment.reportStatus==="GENERATED")) {
    await page.goto("/participant/assessment");
    await page.getByRole("checkbox").check();
    await page.getByRole("button",{name:"Mulai DASS-21",exact:true}).click();
    for(let i=0;i<35;i++){
      await page.getByRole("radio").nth(i<21?1:2).check();
      await expect(page.getByRole("status")).toContainText("Jawaban tersimpan");
      await page.getByRole("button",{name:i===20?"Lanjut ke WEMWBS":i===34?"Tinjau jawaban":"Selanjutnya",exact:true}).click();
    }
    await page.getByRole("button",{name:"Kirim & lihat hasil"}).click();
    const submitted=page.waitForResponse(r=>r.url().endsWith("/submit")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Ya, kirim asesmen"}).click();
    expect((await submitted).status()).toBe(200);
    context=(await (await page.request.get("/api/appointments/booking-context")).json()).data;
  }
  if(!context.canBook){
    await page.goto(`/participant/assessment/${context.latestAssessment.assessmentSessionId}/results`);
    const generated=page.waitForResponse(r=>r.url().endsWith("/generate")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"Buat PDF",exact:true}).click();
    expect((await generated).status()).toBe(200);
    context=(await (await page.request.get("/api/appointments/booking-context")).json()).data;
  }
  expect(context.canBook).toBe(true);
  return { reportId: context.latestAssessment.reportId as string, assessmentSessionId: context.latestAssessment.assessmentSessionId as string };
}
test("real availability, booking, both dashboards, private PDF and revoke/reconsent", async ({ browser }) => {
  test.setTimeout(300000);
  const contexts = await Promise.all([0,1,2,3].map(async () => {
    const context = await browser.newContext({ baseURL:base });
    await context.route("**/*", route => ["127.0.0.1","localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    return context;
  }));
  const [participant,psychologist,other,unassigned] = await Promise.all(contexts.map(c=>c.newPage()));
  const evidence: Record<string,unknown> = { status:"PARTIAL", auth:"real local GoTrue", hosted:false };
  const record = () => writeFileSync(".tmp/phase4-sprint3/browser-evidence.json",JSON.stringify(evidence,null,2));
  try {
    const counterPath=".tmp/phase4-sprint3/attempt.json";
    const attempt=existsSync(counterPath)?JSON.parse(readFileSync(counterPath,"utf8")).attempt+1:1;
    writeFileSync(counterPath,JSON.stringify({attempt}));
    const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(Date.now()+attempt*86400000));
    evidence.date=date;
    await login(psychologist,fixture.psychologists[0],"psychologist");
    await psychologist.getByLabel("Metode konsultasi",{exact:true}).fill("Tatap muka — ruang uji lokal");
    await psychologist.getByRole("button",{name:"Simpan profil",exact:true}).click();
    await expect(psychologist.getByText("Profil berhasil disimpan.",{exact:true})).toBeVisible();
    await psychologist.locator('input[type="date"]').fill(date);
    const morning=psychologist.locator(".ph-session-row").filter({hasText:"Pagi"}).getByRole("checkbox");
    await expect(morning).toBeEnabled(); await morning.check();
    const save=psychologist.waitForResponse(r=>r.url().endsWith(`/availability/${date}`)&&r.request().method()==="PUT");
    await psychologist.getByRole("button",{name:"Simpan ketersediaan",exact:true}).click();
    expect((await save).status()).toBe(200);
    await psychologist.reload(); await expect(psychologist.getByRole("button",{name:"Simpan ketersediaan",exact:true})).toBeEnabled(); await psychologist.locator('input[type="date"]').fill(date); await expect(morning).toBeChecked();
    evidence.availabilitySavedAfterReload=true; record();
    await login(participant,fixture.users[0]);
    const { reportId,assessmentSessionId }=await readyReport(participant);
    const ownPdf=await participant.request.get(`/api/reports/${reportId}/download`);
    expect(ownPdf.status()).toBe(200);
    const pdfBytes=await ownPdf.body(); expect(pdfBytes.subarray(0,5).toString()).toBe("%PDF-");
    evidence.reportId=reportId; evidence.assessmentSessionId=assessmentSessionId;
    evidence.pdfDigest=createHash("sha256").update(pdfBytes).digest("hex"); record();
    await participant.goto("/participant/psychologists");
    const card=participant.locator(".wb-psychologist-card").filter({hasText:fixture.psychologists[0].name});
    await expect(card).toBeVisible();
    await card.getByRole("link").click();
    await expect(participant.getByRole("heading",{name:fixture.psychologists[0].name,exact:true})).toBeVisible();
    await expect(participant.getByRole("button",{name:"Muat ulang jadwal",exact:true})).toBeEnabled();
    await participant.locator('input[type="date"]').fill(date);
    const row=participant.locator(".wb-availability-row").filter({hasText:"Pagi"});
    await expect(row).toContainText("09:00");
    await expect(row.getByRole("button",{name:"Pesan sesi"})).toBeDisabled();
    const slots=(await (await participant.request.get(`/api/psychologists/${fixture.psychologists[0].id}/availability?date=${date}`)).json()).data;
    const slot=slots.find((s:{sessionType:string})=>s.sessionType==="MORNING"); expect(slot).toBeTruthy();
    const payload={psychologistId:fixture.psychologists[0].id,assessmentSessionId,reportId,availabilityId:slot.availabilityId,reportConsent:true};
    expect((await participant.request.post("/api/appointments",{headers:{Origin:base},data:{...payload,reportConsent:false}})).status()).toBe(403);
    expect((await participant.request.post("/api/appointments",{headers:{Origin:base},data:{...payload,reportId:"00000000-0000-4000-8000-000000000000"}})).status()).toBe(403);
    await participant.getByRole("checkbox").check();
    const booked=participant.waitForResponse(r=>r.url().endsWith("/api/appointments")&&r.request().method()==="POST");
    await row.getByRole("button",{name:"Pesan sesi"}).click();
    const bookedResponse=await booked; expect(bookedResponse.status()).toBe(201);
    const booking=(await bookedResponse.json()).data;
    evidence.booking=booking; evidence.availabilityId=slot.availabilityId; evidence.participantId=fixture.users[0].id; evidence.psychologistId=fixture.psychologists[0].id; record();
    await expect(participant.getByText("Janji konsultasi Anda telah dikonfirmasi.",{exact:false})).toBeVisible();
    await participant.getByRole("link",{name:"Lihat janji konsultasi"}).click();
    const appointment=participant.locator(`[data-appointment-id="${booking.appointmentId}"]`);
    await expect(appointment).toContainText("CONFIRMED"); await participant.reload(); await expect(appointment).toContainText("Akses laporan aktif");
    await expect(appointment).toContainText("09.00");
    await appointment.getByRole("button",{name:"Lihat detail janji"}).click(); await expect(appointment.getByRole("region",{name:"Detail janji"})).toContainText("SCHEDULED");
    await psychologist.reload();
    const assigned=psychologist.locator(`[data-appointment-id="${booking.appointmentId}"]`);
    await expect(assigned).toContainText("CONFIRMED"); await assigned.getByRole("button",{name:"Lihat detail janji"}).click();
    await expect(assigned.getByRole("region",{name:"Detail janji"})).toContainText("SCHEDULED");
    const download=psychologist.waitForEvent("download"); await assigned.getByRole("link",{name:"Unduh laporan PDF"}).click();
    const downloaded=await download; const downloadedBytes=readFileSync((await downloaded.path())!); expect(downloadedBytes).toEqual(pdfBytes);
    writeFileSync(".tmp/phase4-sprint3/psychologist-download.pdf",downloadedBytes);
    const scopedUrl=`/api/reports/${reportId}/download?appointmentId=${booking.appointmentId}`;
    await appointment.getByRole("button",{name:"Cabut persetujuan laporan"}).click(); await expect(appointment).toContainText("Akses laporan tidak aktif");
    const revoked=await psychologist.request.get(scopedUrl); expect(revoked.status()).toBe(404); evidence.revokedDownload=revoked.status(); record();
    await psychologist.reload(); await expect(assigned.getByRole("link",{name:"Unduh laporan PDF"})).toHaveCount(0);
    await appointment.getByRole("checkbox").check(); await appointment.getByRole("button",{name:"Berikan persetujuan baru"}).click(); await expect(appointment).toContainText("Akses laporan aktif");
    await psychologist.reload(); await expect(assigned.getByRole("link",{name:"Unduh laporan PDF"})).toBeVisible();
    const regranted=await psychologist.request.get(scopedUrl); expect(regranted.status()).toBe(200); expect(await regranted.body()).toEqual(pdfBytes);
    evidence.regrantedDownload=200;
    await login(other,fixture.users[1]);
    expect((await other.request.get(`/api/appointments/${booking.appointmentId}`)).status()).toBe(404);
    expect((await other.request.get(scopedUrl)).status()).toBe(404);
    const otherReport=await readyReport(other);
    const otherBooking=await other.request.post("/api/appointments",{headers:{Origin:base},data:{...payload,...otherReport}});
    expect(otherBooking.status()).toBe(409); expect((await otherBooking.json()).error.code).toBe("SLOT_ALREADY_BOOKED");
    evidence.otherParticipantDoubleBooking=409;
    await login(unassigned,fixture.psychologists[1],"psychologist");
    expect((await unassigned.request.get(`/api/appointments/${booking.appointmentId}`)).status()).toBe(404);
    expect((await unassigned.request.get(scopedUrl)).status()).toBe(404);
    const repeat=await participant.request.post("/api/appointments",{headers:{Origin:base},data:payload}); expect(repeat.status()).toBe(409);
    const refreshed=(await (await other.request.get(`/api/psychologists/${payload.psychologistId}/availability?date=${date}`)).json()).data;
    expect(refreshed.some((s:{availabilityId:string})=>s.availabilityId===slot.availabilityId)).toBe(false);
    await psychologist.locator('input[type="date"]').fill(date); await expect(morning).toBeDisabled();
    await expect(psychologist.locator(".ph-session-row").filter({hasText:"Pagi"})).toContainText("Sudah dipesan");
    await participant.screenshot({path:".tmp/phase4-sprint3/participant-appointments.png",fullPage:true});
    await psychologist.screenshot({path:".tmp/phase4-sprint3/psychologist-appointments.png",fullPage:true});
    evidence.status="PASS";evidence.otherParticipantAppointment=404;evidence.unassignedPsychologistAppointment=404;evidence.duplicateOwnerBooking=409;evidence.bookedSlotAbsent=true;record();
  } finally { await Promise.all(contexts.map(c=>c.close())); }
});
