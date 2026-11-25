import { readFileSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { rehearseSecurity as previousStage } from "./stage3e1-security-checks.mjs";
import { assertPhase3RehearsalEnvironment } from "./phase3-safety.mjs";
export function rehearseSecurity(options) {
  previousStage(options);
  const {sql,run,env,verify,scratch}=options;
  assertPhase3RehearsalEnvironment(env); verify();
  for(const file of ["01-identity","02-runtime-policies","03-mutation-guards","04-monitor"]) {
    sql("SET wellbeing.stage3e1b='approved-isolated-prototype';"+readFileSync(`docs/sql/stage3e1b/${file}.sql`,"utf8"));
  }
  run(process.execPath,["node_modules/vitest/vitest.mjs","run","--config","vitest.stage3e1b.rehearsal.config.ts"]);
  writeFileSync(join(scratch,"stage3e1b-catalog.log"),sql(`
    SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies ORDER BY 1,2,3;
    SELECT p.oid::regprocedure,pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl
      FROM pg_proc p WHERE p.pronamespace='wb_guard'::regnamespace;
    SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolcanlogin
      FROM pg_roles WHERE rolname IN ('website_runtime','wb_identity_guard','wb_operational_monitor');
  `));
  writeFileSync(join(scratch,"stage3e1b-result.json"),JSON.stringify({
    securityTests:"PASS",runtimeAcceptance:"PARTIAL",hostedExecuted:false,
    blockers:["assessment score gateway","report Storage attestation","cross-party column-safe profile access","atomic booking/consent/lifecycle write gateways","production DAL integration"],
  },null,2));
}
