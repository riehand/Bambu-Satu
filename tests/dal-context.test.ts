import {afterEach,expect,it,vi} from "vitest";
import {gatewayMode,installLocalRuntime,contextualPrisma,withVerifiedDatabaseRequest} from "@/lib/dal/context";
import type {PrismaClient} from "@prisma/client";
afterEach(()=>vi.unstubAllEnvs());
it("does not enable ordinary development without an explicit isolated runtime fixture",async()=>{
 vi.stubEnv("NODE_ENV","development");vi.stubEnv("WELLBEING_LOCAL_RUNTIME_FILE",undefined);
 await expect(installLocalRuntime("postgresql://website_runtime:synthetic@127.0.0.1:55000/wellbeing_phase3_rehearsal","a".repeat(32),async()=>"signature")).rejects.toThrow("LOCAL_DAL_ONLY");
 expect(gatewayMode()).toBe(false);
});
it("never installs a prototype signer in production even with local configuration",async()=>{
 vi.stubEnv("NODE_ENV","production");await expect(installLocalRuntime("postgresql://website_runtime:synthetic@127.0.0.1:55000/wellbeing_phase3_rehearsal","a".repeat(32),async()=>"signature")).rejects.toThrow("LOCAL_DAL_ONLY");expect(gatewayMode()).toBe(false);
});
it("rejects hosted, owner, deployer and unmarked local configurations without fallback",async()=>{
 for(const url of ["postgresql://website_runtime:synthetic@example.invalid/db","postgresql://postgres:synthetic@127.0.0.1/db","postgresql://website_deployer:synthetic@127.0.0.1/db","postgresql://website_runtime:synthetic@127.0.0.1:55000/wellbeing_phase3_rehearsal"]){await expect(installLocalRuntime(url,"a".repeat(32),async()=>"signature")).rejects.toThrow("LOCAL_DAL_ONLY");}expect(gatewayMode()).toBe(false);
});
it("does not accept a request identity before isolated runtime installation",async()=>{
 const work=vi.fn();await expect(withVerifiedDatabaseRequest({getUser:async()=>({data:{user:{id:"forged",email_confirmed_at:"yes"}},error:null})},work)).rejects.toThrow("REQUEST_BOUNDARY_REQUIRED");expect(work).not.toHaveBeenCalled();
});
it("preserves the legacy client lazily while no proposed runtime is installed",async()=>{
 const count=vi.fn().mockResolvedValue(7),client={user:{count}} as unknown as PrismaClient,legacy=vi.fn(()=>client),proxy=contextualPrisma(legacy);
 expect(legacy).not.toHaveBeenCalled();expect(await proxy.user.count()).toBe(7);expect(count).toHaveBeenCalledOnce();
});
it("never falls back when local website configuration exists but installation is missing",async()=>{
 vi.stubEnv("WELLBEING_LOCAL_RUNTIME_FILE","synthetic-local-fixture.json");
 const legacy=vi.fn(),proxy=contextualPrisma(legacy);
 expect(()=>proxy.user.count()).toThrow("LOCAL_RUNTIME_NOT_INSTALLED");expect(legacy).not.toHaveBeenCalled();
});
