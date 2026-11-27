import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, PrismaClient } from "@prisma/client";
type Auth = { getSession?(): Promise<{data:{session:null|{access_token:string}};error:unknown}>; getUser(jwt?:string): Promise<{data:{user:null|{id:string;email_confirmed_at?:string|null}};error:unknown}> };
type RequestContext={id:string;verifiedAt:number;accessToken?:string};
type TransactionContext={tx:Prisma.TransactionClient;id:string;role:string};
type LocalRuntime={client:PrismaClient;sign:(payload:string,accessToken?:string)=>Promise<string>;audience?:string;hosted?:boolean};
// Next instrumentation, route bundles and RSC bundles must share the same ALS
// and installed client, including across development module reloads.
const globalDal=globalThis as typeof globalThis & {wellbeingLocalDal?: {
 requests:AsyncLocalStorage<RequestContext>;transactions:AsyncLocalStorage<TransactionContext>;local?:LocalRuntime;
}};
const state=globalDal.wellbeingLocalDal??={requests:new AsyncLocalStorage<RequestContext>(),transactions:new AsyncLocalStorage<TransactionContext>()};
const {requests,transactions}=state;
export class DalError extends Error { constructor(public readonly code:string){super(code);} }
export const gatewayMode=()=>state.local!==undefined;
export const hasDatabaseRequest=()=>requests.getStore()!==undefined;
export const inDatabaseTransaction=()=>transactions.getStore()!==undefined;
// Next dev compiles NODE_ENV as development, even when launched by a test.
// The explicit local fixture file permits that case; production remains forbidden.
const localExecutionAllowed=()=>process.env.NODE_ENV==="test"||(process.env.NODE_ENV==="development"&&!!process.env.WELLBEING_LOCAL_RUNTIME_FILE);
// Only the isolated harness or explicit local browser fixture can install this prototype.
export async function installLocalRuntime(urlText:string,marker:string,sign:(payload:string)=>Promise<string>){
 if(!localExecutionAllowed()||state.local)throw new DalError("LOCAL_DAL_ONLY");
 const url=new URL(urlText);
 if(url.protocol!=="postgresql:"||!["127.0.0.1","localhost","[::1]"].includes(url.hostname)||url.username!=="website_runtime"||url.pathname!=="/wellbeing_phase3_rehearsal"||!(/^[a-f0-9]{32}$/).test(marker)||marker!==process.env.PHASE3_REHEARSAL_TOKEN||process.env.PHASE3_REHEARSAL_APPROVED!=="synthetic-local-only"||url.port!==process.env.PHASE3_REHEARSAL_PORT)throw new DalError("LOCAL_DAL_ONLY");
 const client=new PrismaClient({datasources:{db:{url:url.href}},log:[]});
 try{
  const [role]=await client.$queryRaw<Array<{safe:boolean}>>`SELECT session_user='website_runtime' AND NOT(rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb) AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid AND relnamespace='public'::regnamespace) AND NOT EXISTS(SELECT 1 FROM pg_roles t WHERE t.oid<>r.oid AND pg_has_role(r.oid,t.oid,'SET')) AS safe FROM pg_roles r WHERE rolname=session_user`;
  // Marker is verified by the caller's isolated harness; runtime has no rehearsal schema grant.
  if(!role?.safe||marker!==process.env.PHASE3_REHEARSAL_TOKEN)throw new DalError("UNSAFE_RUNTIME");
  state.local={client,sign};
 }catch{await client.$disconnect();throw new DalError("RUNTIME_UNAVAILABLE");}
}
// Only a validated staging bootstrap can install this runtime; no owner fallback.
export async function installHostedRuntime(client:PrismaClient, audience:string, sign:LocalRuntime["sign"]){
 if(state.local || !["staging","hosted"].includes(process.env.WELLBEING_RUNTIME??"") || (process.env.WELLBEING_RUNTIME==="staging" && process.env.VERCEL_ENV==="production") || process.env.WELLBEING_LOCAL_RUNTIME_FILE || !/^wellbeing-(staging|hosted)-[a-z0-9]{20}-v1$/.test(audience)) throw new DalError("STAGING_RUNTIME_REQUIRED");
 state.local={client,sign,audience,hosted:true};
}
const executionAllowed=()=>state.local?.hosted ? ["staging","hosted"].includes(process.env.WELLBEING_RUNTIME??"") && !(process.env.WELLBEING_RUNTIME==="staging" && process.env.VERCEL_ENV==="production") : localExecutionAllowed();
export async function disconnectLocalRuntime(){await state.local?.client.$disconnect();}
export async function withVerifiedDatabaseRequest<T>(auth:Auth,work:()=>Promise<T>){
 if(!state.local||!executionAllowed()||requests.getStore())throw new DalError("REQUEST_BOUNDARY_REQUIRED");
 let accessToken:string|undefined;
 if(state.local.hosted){
  const session=await auth.getSession?.();
  if(session?.error||!session?.data.session?.access_token)throw new DalError("AUTH_REQUIRED");
  accessToken=session.data.session.access_token;
 }
 const {data,error}=await auth.getUser(accessToken);
 if(error||!data.user?.email_confirmed_at)throw new DalError("AUTH_REQUIRED");
 return requests.run({id:data.user.id,verifiedAt:Date.now(),accessToken},work);
}
export function assertDatabaseActor(id:string,role?:string){
 const request=requests.getStore(),tx=transactions.getStore();
 if(!request||request.id!==id||(role&&tx?.role!==role))throw new DalError("FORBIDDEN");
}
export async function databaseTransaction<T>(work:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
 const request=requests.getStore(),nested=transactions.getStore();
 if(!state.local||!executionAllowed()||!request||Date.now()-request.verifiedAt>60000)throw new DalError("VERIFIED_REQUEST_REQUIRED");
 if(nested){if(nested.id!==request.id)throw new DalError("CONTEXT_MISMATCH");return work(nested.tx);}
 const runtime=state.local;
 try { return await runtime.client.$transaction(async tx=>{
  const [binding]=await tx.$queryRaw<Array<{pid:number;tx:string;epoch:bigint}>>`SELECT pg_backend_pid() AS pid,pg_current_xact_id()::text AS tx,floor(extract(epoch FROM clock_timestamp()))::bigint AS epoch`;
  const payload=JSON.stringify({aud:runtime.audience??"wellbeing-local-runtime-v1",sub:request.id,pid:String(binding.pid),tx:binding.tx,iat:Number(binding.epoch),exp:Number(binding.epoch)+30,purpose:"interactive"});
  let mac:string;try{mac=await runtime.sign(payload,request.accessToken);}catch{throw new DalError("SIGNER_UNAVAILABLE");}
  await tx.$queryRaw`SELECT set_config('wellbeing.claim',${payload},true),set_config('wellbeing.mac',${mac},true)`;
  const [identity]=await tx.$queryRaw<Array<{id:string;role:string}>>`SELECT wb_guard.subject() AS id,wb_guard.actor_role() AS role`;
  if(identity.id!==request.id||!identity.role)throw new DalError("ACTIVE_PROFILE_REQUIRED");
  return transactions.run({tx,id:identity.id,role:identity.role},()=>work(tx));
 },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:15000});
 } catch(error) {
  if(error instanceof Error && error.name.startsWith("PrismaClient")){
   // Development diagnostics contain codes only, never SQL, bindings or identity.
   if(process.env.NODE_ENV==="development") console.warn("[WellBeing DAL] Transaction failed", {
    code:error instanceof Prisma.PrismaClientKnownRequestError?error.code:"PRISMA_ERROR",
   });
   const known=["STALE_REVISION","REPORT_NOT_GENERATED","SLOT_NOT_AVAILABLE","SLOT_START_PASSED","CHECK_INS_REQUIRED","CONSULTATION_ALREADY_STARTED","CONSULTATION_WINDOW_ENDED","CONSULTATION_NOT_OPEN","CONSULTATION_TERMINAL","CONSULTATION_INCONSISTENT","CONSULTATION_POLICY_PENDING","CHAT_CLOSED","IDEMPOTENCY_CONFLICT","INVALID_CURSOR"];
   const code=known.find(value=>error.message.includes(value));
   const sqlstate=error instanceof Prisma.PrismaClientKnownRequestError?error.meta?.code:undefined;
   throw new DalError(code??(sqlstate==="42501"?"FORBIDDEN":sqlstate==="23505"?"CONSENT_ALREADY_ACTIVE":"DATABASE_UNAVAILABLE"));
  }
  throw error;
 }
}
// Late-binding proxy ensures even cached imports/delegates cannot escape context.
export function contextualPrisma(legacy:()=>PrismaClient):PrismaClient{
 const getLegacy=()=>{
  if(process.env.WELLBEING_LOCAL_RUNTIME_FILE)throw new DalError("LOCAL_RUNTIME_NOT_INSTALLED");
  return legacy();
 };
 return new Proxy({} as PrismaClient,{get(_target,key:string){
  if(typeof key!=="string")return undefined;
  if(key==="$transaction")return (work:unknown,options?:unknown)=>{
   if(!state.local)return (Reflect.get(getLegacy(),key) as (...args:unknown[])=>unknown).call(getLegacy(),work,options);
   if(typeof work!=="function")throw new DalError("ARRAY_TRANSACTION_UNSUPPORTED");
   return databaseTransaction(work as (tx:Prisma.TransactionClient)=>Promise<unknown>);
  };
  if(key.startsWith("$"))return (...args:unknown[])=>{
   if(!state.local)return Reflect.get(getLegacy(),key).apply(getLegacy(),args);
   if(!["$queryRaw","$executeRaw","$queryRawUnsafe","$executeRawUnsafe"].includes(key))throw new DalError("CLIENT_OPERATION_FORBIDDEN");
   return databaseTransaction(tx=>Reflect.get(tx,key).apply(tx,args));
  };
  return new Proxy({}, {get(_delegate,method:string){return (...args:unknown[])=>{
   if(!state.local){const delegate=Reflect.get(getLegacy(),key);return Reflect.get(delegate,method).apply(delegate,args);}
   return databaseTransaction(tx=>{const delegate=Reflect.get(tx,key);return Reflect.get(delegate,method).apply(delegate,args);});
  };}});
 }});
}
