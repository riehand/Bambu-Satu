import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

for (const width of [1440,768,390]) {
  for (const part of ["dass","wemwbs"]) {
    test(`${part} confirmed selected answer at ${width}px`, async ({page}) => {
      await page.setViewportSize({width,height:1024});
      await page.route("**/answers",route=>route.fulfill({json:{success:true,data:{saved:1,revision:1}}}));
      await page.goto(`/?view=questionnaire&state=${part === "wemwbs" ? "wemwbs" : "empty"}`);
      await page.getByRole("radio").nth(1).check();
      await expect(page.getByRole("status")).toContainText("Jawaban tersimpan");
      await page.evaluate(()=>document.fonts.ready);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      await mkdir("test-results/phase2",{recursive:true});
      await page.screenshot({path:`test-results/phase2/questionnaire-${part}-saved-${width}.png`,fullPage:true});
    });
  }
}
test("mobile drawer keeps keyboard focus inside and closes with Escape",async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto("/?view=dashboard");
  const menu=page.getByRole("button",{name:"Buka navigasi"});await menu.click();
  await expect(page.getByRole("button",{name:"Tutup menu"})).toBeFocused();
  await page.keyboard.press("Shift+Tab");await expect(page.getByRole("button",{name:"Keluar"})).toBeFocused();
  await page.keyboard.press("Tab");await expect(page.getByRole("button",{name:"Tutup menu"})).toBeFocused();
  await page.keyboard.press("Escape");await expect(menu).toBeFocused();await expect(page.locator(".wb-sidebar")).not.toBeVisible();
});

for(const width of [1440,768,390]) {
  for(const [view,state] of [["dashboard","empty"],["dashboard","populated"],["dashboard","unavailable"],["introduction","empty"],["questionnaire","empty"],["questionnaire","wemwbs"],["results","populated"],["history","empty"]]) {
    test(`${view} ${state} at ${width}px has no horizontal overflow`,async({page})=>{
      await page.setViewportSize({width,height:1024});await page.goto(`/?view=${view}&state=${state}`);
      await expect(page.locator(".wb-app")).toBeVisible();
      await page.evaluate(()=>document.fonts.ready);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      if(view==="questionnaire") { await expect(page.locator("input[type=radio]")).toHaveCount(state==="wemwbs"?5:4); }
      if(width===390 && view==="dashboard") {await page.getByRole("button",{name:"Buka navigasi"}).click();await expect(page.locator(".wb-sidebar")).toBeInViewport();await page.getByRole("button",{name:"Tutup navigasi"}).click();}
      await mkdir("test-results/phase2",{recursive:true});await page.screenshot({path:`test-results/phase2/${view}-${state}-${width}.png`,fullPage:true});
    });
  }
}
test("consent starts unchecked and a confirmed request creates one session",async({page})=>{
  let calls=0;await page.route("**/api/assessment/sessions",async route=>{calls++;expect(route.request().postDataJSON()).toEqual({processingConsent:true});await route.fulfill({json:{success:true,data:{assessmentSessionId:"synthetic-session"}}});});
  await page.goto("/?view=introduction");const consent=page.getByRole("checkbox");await expect(consent).not.toBeChecked();await expect(page.getByRole("button",{name:"Mulai DASS-21"})).toBeDisabled();await consent.check();await page.getByRole("button",{name:"Mulai DASS-21"}).click();await expect(page).toHaveURL(/assessment\/synthetic-session/);expect(calls).toBe(1);
});
test("save status waits for the API and refresh resumes persisted answers",async({page})=>{
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/answers",async route=>{await gate;const body=route.request().postDataJSON();await page.evaluate((body)=>{sessionStorage.setItem("synthetic-answers",JSON.stringify(body.answers));sessionStorage.setItem("synthetic-revision","1");},body);await route.fulfill({json:{success:true,data:{saved:1,revision:1}}});});
  await page.goto("/?view=questionnaire");await page.getByRole("radio").nth(2).check();await expect(page.getByRole("status")).toHaveText("Menyimpan jawaban…");await expect(page.getByRole("button",{name:"Selanjutnya"})).toBeDisabled();release();await expect(page.getByRole("status")).toContainText("Jawaban tersimpan");await expect(page.getByRole("progressbar")).toHaveAttribute("value","1");
  await page.reload();await expect(page.locator(".wb-progress-labels")).toContainText("Pertanyaan 2 dari 21");await page.getByRole("button",{name:"Sebelumnya"}).click();await expect(page.getByRole("radio").nth(2)).toBeChecked();
});
test("failed saves remain visible and can be retried without losing the choice",async({page})=>{
  let calls=0;await page.route("**/answers",async route=>{calls++;await route.fulfill({status:calls===1?503:200,json:calls===1?{error:{message:"Koneksi uji terputus"}}:{success:true,data:{saved:1,revision:1}}});});
  await page.goto("/?view=questionnaire");await page.getByRole("radio").nth(1).check();await expect(page.getByRole("status")).toContainText("belum tersimpan");await expect(page.getByRole("radio").nth(1)).toBeChecked();await expect(page.getByRole("button",{name:"Simpan & lanjut nanti"})).toBeDisabled();await page.getByRole("button",{name:"Coba simpan lagi"}).click();await expect(page.getByRole("status")).toContainText("Jawaban tersimpan");expect(calls).toBe(2);
});
test("conflicting tab revisions require reload instead of overwriting",async({page})=>{
  await page.route("**/answers",route=>route.fulfill({status:409,json:{error:{code:"STALE_REVISION",message:"Jawaban berubah di tab lain."}}}));await page.goto("/?view=questionnaire");await page.getByRole("radio").first().check();await expect(page.getByRole("button",{name:"Muat ulang jawaban tersimpan"})).toBeVisible();await expect(page.getByRole("radio").first()).toBeDisabled();
});
test("keyboard answers, same-session instrument transition, review and final submission",async({page})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  const sessionIds=new Set<string>();let revision=0;
  await page.route("**/answers",route=>{sessionIds.add(route.request().url().split("/").at(-2)!);const body=route.request().postDataJSON();expect(body.expectedRevision).toBe(revision);return route.fulfill({json:{success:true,data:{saved:1,revision:++revision}}});});
  await page.route("**/submit",route=>route.fulfill({json:{success:true,data:{status:"COMPLETED"}}}));
  await page.goto("/?view=questionnaire&state=wemwbs");await page.getByRole("button",{name:"Sebelumnya"}).click();await expect(page.locator(".wb-progress-labels")).toContainText("Pertanyaan 21 dari 21");await page.getByRole("button",{name:"Lanjut ke WEMWBS"}).click();
  for(let i=0;i<14;i++){const radio=page.getByRole("radio").first();await radio.focus();await page.keyboard.press("Space");await expect(page.getByRole("status")).toContainText("Jawaban tersimpan");await page.getByRole("button",{name:i===13?"Tinjau jawaban":"Selanjutnya"}).click();}
  await expect(page.getByRole("heading",{name:"Siap menyelesaikan check-in?"})).toBeVisible();await expect(page.locator(".wb-review-list button")).toHaveCount(35);expect(sessionIds.size).toBe(1);await page.getByRole("button",{name:"Kirim & lihat hasil"}).click();await expect(page).toHaveURL(/\/results$/);expect(errors).toEqual([]);
});
