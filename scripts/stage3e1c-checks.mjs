import { readFileSync,writeFileSync } from "node:fs";
import { join } from "node:path";
import { rehearseSecurity as previousStage } from "./stage3e1b-checks.mjs";
export function rehearseSecurity(options) {
  previousStage(options);
  const {sql,run,verify,scratch}=options;
  verify();
  for(const file of ["01-scoring","02-projections","03-report-boundary"]) {
    sql("SET wellbeing.stage3e1c='approved-isolated-prototype';"+readFileSync(`docs/sql/stage3e1c/${file}.sql`,"utf8"));
  }
  run(process.execPath,["node_modules/vitest/vitest.mjs","run","--config","vitest.stage3e1c.rehearsal.config.ts"]);
  writeFileSync(join(scratch,"stage3e1c-catalog.log"),sql(`SELECT p.oid::regprocedure,pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl FROM pg_proc p WHERE p.pronamespace='wb_guard'::regnamespace;
    SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;`));
  writeFileSync(join(scratch,"stage3e1c-result.json"),JSON.stringify({localTests:"PASS",scoring:"PASS",projections:"PASS",restrictedAggregates:"PASS",artifactFinalization:"BLOCKED",productionDAL:"BLOCKED",overall:"PARTIAL",hostedExecuted:false},null,2));
}
