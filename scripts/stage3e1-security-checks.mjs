import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertPhase3RehearsalEnvironment } from "./phase3-safety.mjs";

const proposal = name => readFileSync(`docs/sql/stage3e1/${name}.sql`, "utf8");

export function rehearseSecurity({ sql, run, env, scratch, container, verify }) {
  assertPhase3RehearsalEnvironment(env);
  verify();
  const identityGuard = `DO $$ BEGIN IF current_database()<>'wellbeing_stage3e1_deployer'
    OR (SELECT token FROM rehearsal.identity) IS DISTINCT FROM '${env.PHASE3_REHEARSAL_TOKEN}'
    THEN RAISE EXCEPTION 'Isolated clone identity mismatch'; END IF; END $$;`;
  const cloneSql = input => {
    verify();
    return run("docker", ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "wellbeing_stage3e1_deployer"], identityGuard + input);
  };
  writeFileSync(join(scratch,"stage3e1-preflight.log"), sql(proposal("01-preflight")));
  sql("SET wellbeing.stage3e_roles='reviewed-new-dedicated-roles';" + proposal("02-role-proposal"));
  // Password acak invocation, tidak ditulis dalam SQL proposal/log/URL evidence.
  for (const role of ["website_runtime","website_deployer","flutter_runtime","anon","authenticated","service_role"]) {
    sql(`ALTER ROLE ${role} LOGIN PASSWORD '${env.POSTGRES_PASSWORD}';`);
  }
  cloneSql(`
    GRANT USAGE,CREATE ON SCHEMA public TO website_deployer;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public._prisma_migrations TO website_deployer;
    GRANT REFERENCES(id) ON public.users TO website_deployer;
    CREATE TABLE rehearsal.deployer_baseline_constraints AS
      SELECT conrelid,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE connamespace IN ('public'::regnamespace,'auth'::regnamespace,'chatbot'::regnamespace);
  `);
  const url = new URL(env.DATABASE_URL);
  url.username = "website_deployer";
  url.pathname = "/wellbeing_stage3e1_deployer";
  const deployerEnv = { ...env, DATABASE_URL: url.href, DIRECT_URL: url.href };
  // Migrate deploy menjalankan ENAM pending migration sebagai login non-superuser.
  verify();
  const deploy = run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", join(scratch,"schema.prisma")], undefined, deployerEnv);
  const status = run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "status", "--schema", join(scratch,"schema.prisma")], undefined, deployerEnv);
  writeFileSync(join(scratch,"stage3e1-deployer.log"), (deploy+status).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi,"[REDACTED_DATABASE_URL]"));
  writeFileSync(join(scratch,"stage3e1-deployer-catalog.log"), cloneSql(`
    SELECT migration_name,checksum,finished_at IS NOT NULL AS finished FROM public._prisma_migrations ORDER BY migration_name;
    SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relacl FROM pg_class c
      WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY c.relname;
  `));
  // Minimal known Flutter fixtures only; never a hosted schema or data contract claim.
  sql(`GRANT USAGE ON SCHEMA chatbot TO flutter_runtime;
    GRANT SELECT,INSERT,UPDATE,DELETE ON chatbot.messages,chatbot.user_memories,chatbot.safety_events TO flutter_runtime;
    GRANT SELECT ON chatbot._backend_migrations TO flutter_runtime;
    CREATE TABLE rehearsal.stage3e1_constraints_before AS
      SELECT conrelid,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE connamespace IN ('public'::regnamespace,'auth'::regnamespace,'chatbot'::regnamespace);
    CREATE TABLE rehearsal.stage3e1_defaults_before AS SELECT * FROM pg_default_acl;
    CREATE TABLE rehearsal.stage3e1_functions_before AS SELECT oid,proowner,prosrc,prosecdef,proconfig FROM pg_proc
      WHERE pronamespace IN ('public'::regnamespace,'auth'::regnamespace);
  `);
  // Suite menguji proposal gagal/rollback, exposure sebelum revoke, dan role nyata.
  run(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.stage3e1.rehearsal.config.ts"]);
  // Mixed ownership di clone juga direview: platform mengerjakan ACL, deployer DDL.
  cloneSql("SET wellbeing.stage3e_objects='reviewed-exact-website-objects';" + proposal("03-object-privileges"));
  verify();
  run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "status", "--schema", join(scratch,"schema.prisma")], undefined, deployerEnv);
  run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", join(scratch,"schema.prisma")], undefined, deployerEnv);
  writeFileSync(join(scratch,"stage3e1-deployer-postflight.log"), cloneSql(proposal("04-verification")));
  writeFileSync(join(scratch,"stage3e1-verification.log"), sql(proposal("04-verification")));
  writeFileSync(join(scratch,"stage3e1-postflight.log"), sql(proposal("01-preflight")));
  writeFileSync(join(scratch,"stage3e1-result.json"), JSON.stringify({
    securityExperiment: "PASS", runtimeWorkflow: "INCOMPLETE_RLS_AUTHORIZATION_REQUIRED",
    deployerPendingMigrations: 6, privilegedWorkflowTests: 43, hostedExecuted: false,
    fullSupabaseAuth: false, storageTested: false, backupRestoreTested: false,
  },null,2));
}
