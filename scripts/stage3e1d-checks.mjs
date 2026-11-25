import { readFileSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { rehearseSecurity as previousStage } from "./stage3e1c-checks.mjs";
export function rehearseSecurity(options) {
  previousStage({...options,run(command,args,...rest){
    if(args.includes("vitest.stage3e1b.rehearsal.config.ts")) {
      // Earlier suites leave active synthetic grants. B's blocker test inserts a
      // replacement grant and requires the previous fixture to be inactive.
      // Preserve B's source/assertions; normalize only isolated synthetic data.
      options.verify();
      options.sql("UPDATE public.consents SET revoked_at=clock_timestamp() WHERE participant_id='00000000-0000-4000-8000-000000009702'::uuid AND revoked_at IS NULL AND expired_at IS NULL;");
      writeFileSync(join(options.scratch,"stage3e1d-fixture-normalization.txt"),"Before unchanged Stage B tests: revoke leftover synthetic participant 9702 grants to satisfy replacement fixture precondition. No hosted execution.\n");
    }
    return options.run(command,args,...rest);
  }});
  const {sql,run,verify,scratch}=options;
  verify();
  sql("CREATE TABLE rehearsal.stage3e1d_chatbot_before AS SELECT c.oid,c.relname,c.relowner,c.relacl::text AS acl,c.relrowsecurity FROM pg_class c WHERE c.relnamespace='chatbot'::regnamespace;");
  for(const file of ["01-privileges","02-consent","03-booking","04-lifecycle","05-chat"]) {
    sql("SET wellbeing.stage3e1d='approved-isolated-prototype';"+readFileSync(`docs/sql/stage3e1d/${file}.sql`,"utf8"));
  }
  run(process.execPath,["node_modules/vitest/vitest.mjs","run","--config","vitest.stage3e1d.rehearsal.config.ts"]);
  writeFileSync(join(scratch,"stage3e1d-catalog.log"),sql(`SELECT p.oid::regprocedure,pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl FROM pg_proc p WHERE p.pronamespace='wb_guard'::regnamespace;
    SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;`));
  writeFileSync(join(scratch,"stage3e1d-result.json"),JSON.stringify({localTests:"PASS",booking:"PASS",consent:"PASS",lifecycle:"PASS",chat:"PASS",artifactFinalization:"BLOCKED",productionDAL:"BLOCKED",overall:"PARTIAL",hostedExecuted:false},null,2));
}
