// TEST ONLY. Bukan DAL produksi atau JWT Supabase verifier.
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { assertPhase3RehearsalEnvironment } from "../../scripts/phase3-safety.mjs";
assertPhase3RehearsalEnvironment();
type VerifiedAuth = { getUser(): Promise<{data:{user:null|{id:string;email_confirmed_at?:string|null}};error:unknown}> };
type Context={id:string;purpose:"interactive"|"report-finalize";verifiedAt:number};
const request=new AsyncLocalStorage<Context>();
const url=new URL(process.env.DATABASE_URL!);url.username="website_runtime";
url.searchParams.set("connection_limit","2");
export const runtimeConnection=new PrismaClient({datasources:{db:{url:url.href}},log:[]});
let key:Buffer|undefined;
// Fixture owner memasok secret sekali dalam proses test; tidak pernah ke output/env/file.
export function provisionSyntheticSigner(secret:Buffer){ if(key)throw new Error("Signer already provisioned"); key=Buffer.from(secret); }
export async function withVerifiedAuth<T>(auth:VerifiedAuth,work:()=>Promise<T>,purpose:Context["purpose"]="interactive") {
  const {data,error}=await auth.getUser();
  if(error||!data.user?.email_confirmed_at)throw new Error("AUTH_REQUIRED");
  const context:Context={id:data.user.id,purpose,verifiedAt:Date.now()};
  return request.run(context,work);
}
type Options={maxWait?:number;timeout?:number;isolationLevel?:Prisma.TransactionIsolationLevel};
export async function signedTransaction<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>,options:Options={}) {
  const context=request.getStore();
  if(!context||!key||Date.now()-context.verifiedAt>60000)throw new Error("VERIFIED_REQUEST_REQUIRED");
  return runtimeConnection.$transaction(async tx=>{
    const [binding]=await tx.$queryRaw<Array<{pid:number;tx:string;epoch:bigint}>>`SELECT pg_backend_pid() AS pid,pg_current_xact_id()::text AS tx,floor(extract(epoch FROM clock_timestamp()))::bigint AS epoch`;
    const payload=JSON.stringify({aud:"wellbeing-local-runtime-v1",sub:context.id,pid:String(binding.pid),tx:binding.tx,iat:Number(binding.epoch),exp:Number(binding.epoch)+30,purpose:context.purpose});
    const mac=createHmac("sha256",key!).update(payload).digest("hex");
    await tx.$queryRaw`SELECT set_config('wellbeing.claim',${payload},true),set_config('wellbeing.mac',${mac},true)`;
    const [identity]=await tx.$queryRaw<Array<{id:string;role:string|null}>>`SELECT wb_guard.subject() AS id,wb_guard.actor_role() AS role`;
    if(identity.id!==context.id||!identity.role)throw new Error("ACTIVE_PROFILE_REQUIRED");
    return work(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000,...options});
}
// Service $transaction tetap transaksi nyata, bukan nested callback yang di-flatten.
// Query standalone mendapat transaksi sendiri dengan subject terverifikasi yang sama.
// Array transaction ditolak: jangan mengeksekusi promise di luar boundary diam-diam.
export const scopedPrisma=new Proxy({} as PrismaClient,{
  get(_target,property:string){
    if(property==="$transaction")return (work:unknown,options?:Options)=>{
      if(typeof work!=="function")throw new Error("ARRAY_TRANSACTION_REQUIRES_REVIEW");
      return signedTransaction(work as (tx:Prisma.TransactionClient)=>Promise<unknown>,options);
    };
    if(property.startsWith("$"))return (...args:unknown[])=>signedTransaction(tx=>{
      const fn=Reflect.get(tx,property) as (...values:unknown[])=>Promise<unknown>;
      return fn.apply(tx,args);
    });
    return new Proxy({}, {get(_delegate,method:string){return (...args:unknown[])=>signedTransaction(tx=>{
      const delegate=Reflect.get(tx,property);
      return Reflect.get(delegate,method).apply(delegate,args);
    });}});
  },
});
