import {writeFileSync} from "node:fs";
import {join} from "node:path";
import {rehearseSecurity as previousStage} from "./stage3e1d-checks.mjs";
export function rehearseSecurity(options){
 previousStage(options);
 options.verify();
 options.run(process.execPath,["node_modules/vitest/vitest.mjs","run","--config","vitest.stage3e1e.rehearsal.config.ts"]);
 writeFileSync(join(options.scratch,"stage3e1e-result.json"),JSON.stringify({applicationIntegration:"PARTIAL",localServiceTests:"PASS",identityCustody:"BLOCKED",storage:"BLOCKED",hostedExecuted:false},null,2));
}
