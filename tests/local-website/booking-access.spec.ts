import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const fixturePath=process.env.WELLBEING_BOOKING_FIXTURE;
if(!fixturePath)throw new Error("Explicit local Auth fixture required");
type Account={id:string;email:string;password:string;name?:string};
const fixture=JSON.parse(readFileSync(fixturePath,"utf8")) as {users:Account[];psychologists:Account[]};
const evidence=JSON.parse(readFileSync(".tmp/phase4-sprint3/browser-evidence.json","utf8"));
const base="http://127.0.0.1:55430";
async function login(page:Page,account:Account,role:string){
 await page.goto("/auth/login"); await page.getByLabel("Email",{exact:true}).fill(account.email);await page.getByPlaceholder("Masukkan password Anda").fill(account.password);
 await page.getByRole("button",{name:"Masuk",exact:true}).click();await expect(page).toHaveURL(new RegExp(`/${role}/dashboard$`));
}
test("standalone consent remains independent; directory privacy, inactive identity and private Storage",async({browser})=>{
 test.setTimeout(180000);expect(evidence.status).toBe("PASS");
 const contexts=await Promise.all([0,1,2].map(async()=>{const c=await browser.newContext({baseURL:base});await c.route("**/*",r=>["127.0.0.1","localhost"].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());return c;}));
 const [owner,psych,inactive]=await Promise.all(contexts.map(c=>c.newPage()));
 try{
  await login(owner,fixture.users[0],"participant");await login(psych,fixture.psychologists[0],"psychologist");
  const directory=await owner.request.get("/api/psychologists?page=1&limit=50");expect(directory.status()).toBe(200);const body=await directory.json();
  expect(body.data.some((p:{id:string})=>p.id===fixture.psychologists[0].id)).toBe(true);
  expect(body.data.some((p:{id:string})=>p.id===fixture.psychologists[2].id)).toBe(false);
  for(const person of body.data) expect(Object.keys(person).sort()).toEqual(["id","fullName","professionalTitle","qualification","education","shortBio","areasOfFocus","consultationMethod","consultationLocation","languages"].sort());
  expect((await owner.request.get(`/api/psychologists/${fixture.psychologists[2].id}`)).status()).toBe(404);
  expect((await owner.request.get(`/api/psychologists/${fixture.psychologists[2].id}/availability?date=${evidence.date}`)).status()).toBe(404);
  const inactiveBooking=await owner.request.post("/api/appointments",{headers:{Origin:base},data:{psychologistId:fixture.psychologists[2].id,assessmentSessionId:evidence.assessmentSessionId,reportId:evidence.reportId,availabilityId:evidence.availabilityId,reportConsent:true}});expect(inactiveBooking.status()).toBe(403);
  const wrongScope=await psych.request.get(`/api/reports/${evidence.reportId}/download?appointmentId=00000000-0000-4000-8000-000000000000`);expect(wrongScope.status()).toBe(404);
  const publicObject=await owner.request.get(`http://127.0.0.1:50243/storage/v1/object/public/assessment-reports/reports/${evidence.reportId}.pdf`);expect([400,401,403,404]).toContain(publicObject.status());expect((await publicObject.body()).subarray(0,5).toString()).not.toBe("%PDF-");
  await owner.goto("/participant/appointments");const row=owner.locator(`[data-appointment-id="${evidence.booking.appointmentId}"]`);
  await row.getByRole("button",{name:"Cabut persetujuan laporan"}).click();await expect(row).toContainText("Akses laporan tidak aktif");
  const url=`/api/reports/${evidence.reportId}/download?appointmentId=${evidence.booking.appointmentId}`;
  // Earlier successful rehearsal bookings for this same report cannot authorize this appointment scope.
  expect((await psych.request.get(url)).status()).toBe(404);
  const standalone=owner.locator("section").filter({has:owner.getByRole("heading",{name:"Persetujuan laporan mandiri",exact:true})});
  await standalone.getByRole("combobox").selectOption(fixture.psychologists[0].id);await standalone.getByRole("checkbox").check();
  const activeStandalone=standalone.locator(".wb-consent-row").filter({hasText:evidence.reportId}).filter({has:owner.getByRole("button",{name:"Cabut akses",exact:true})});
  await standalone.getByRole("button",{name:"Berikan akses mandiri"}).click();await expect(activeStandalone).toHaveCount(1);await expect(activeStandalone).toContainText("Aktif");
  await psych.reload();const assigned=psych.locator(`[data-appointment-id="${evidence.booking.appointmentId}"]`);await expect(assigned).toContainText("melalui persetujuan mandiri");
  const independent=await psych.request.get(url);expect(independent.status()).toBe(200);expect((await independent.body()).subarray(0,5).toString()).toBe("%PDF-");
  expect((await psych.request.get(`/api/reports/${evidence.reportId}/download?appointmentId=00000000-0000-4000-8000-000000000000`)).status()).toBe(404);
  await activeStandalone.getByRole("button",{name:"Cabut akses",exact:true}).click();
  expect((await psych.request.get(url)).status()).toBe(404);
  await row.getByRole("checkbox").check();await row.getByRole("button",{name:"Berikan persetujuan baru"}).click();await expect(row).toContainText("Akses laporan aktif");expect((await psych.request.get(url)).status()).toBe(200);
  await inactive.goto("/auth/login");await inactive.getByLabel("Email",{exact:true}).fill(fixture.psychologists[2].email);await inactive.getByPlaceholder("Masukkan password Anda").fill(fixture.psychologists[2].password);
  const denied=inactive.waitForResponse(r=>r.url().endsWith("/api/auth/login")&&r.request().method()==="POST");await inactive.getByRole("button",{name:"Masuk",exact:true}).click();expect((await denied).status()).toBe(403);
  writeFileSync(".tmp/phase4-sprint3/access-evidence.json",JSON.stringify({status:"PASS",directoryPrivateFieldsAbsent:true,inactiveHidden:true,inactiveBooking:403,inactiveLogin:403,publicStorage:publicObject.status(),invalidAppointmentScope:404,standaloneDownload:200,revokedStandaloneDownload:404,regrantedAppointmentDownload:200},null,2));
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});
