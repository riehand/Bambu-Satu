// Invoked only inside the existing fresh-container harness, never with a supplied DB URL.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const correction = "20261120000000_psychologist_profiles_integrity";
const read = (name) => readFileSync(`docs/sql/stage2b3/${name}.sql`, "utf8");

export function prepareSharedBaseline(sql) {
  sql(`
    CREATE ROLE chatbot_runtime NOLOGIN;
    CREATE ROLE website_deployer_probe NOLOGIN;
    CREATE ROLE website_runtime_probe NOLOGIN;
    CREATE SCHEMA chatbot;
    CREATE TABLE chatbot._backend_migrations(id text PRIMARY KEY, checksum text NOT NULL);
    INSERT INTO chatbot._backend_migrations VALUES ('synthetic-chatbot-baseline','synthetic-only');
    DO $$ DECLARE name text; BEGIN
      FOREACH name IN ARRAY ARRAY['chat_sessions','checkins','messages','safety_events','user_memories'] LOOP
        EXECUTE format('CREATE TABLE chatbot.%I (id integer PRIMARY KEY, marker text NOT NULL)',name);
        EXECUTE format('INSERT INTO chatbot.%I VALUES (1,%L)',name,'SYNTHETIC ONLY');
      END LOOP;
    END $$;
    GRANT USAGE ON SCHEMA chatbot TO chatbot_runtime;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA chatbot TO chatbot_runtime;
    CREATE TABLE rehearsal.chatbot_before AS
      SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='chatbot';
    -- Model the owner's observed public defaults, not real Supabase configuration.
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
  `);
}

export function rehearseC4AndLedger({ sql, migrate, copyMigrations, run, scratch, migrationNames }) {
  const migration = readFileSync(`prisma/migrations/${correction}/migration.sql`, "utf8");
  const body = migration.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
  const remediation = read("02-ledger-remediation");
  const remediationBody = remediation.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, "");
  const recovery = read("04-ledger-recovery");
  const markers = `SET wellbeing.ledger_approval='reviewed-exact-ledger-only'; SET wellbeing.ledger_owner='postgres'; SET wellbeing.ledger_deployer='website_deployer_probe';`;
  sql(`CREATE TABLE rehearsal.stage2b3_checks(name text PRIMARY KEY, passed boolean NOT NULL CHECK(passed));
    CREATE FUNCTION rehearsal.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Rehearsal assertion: %',label; END IF;
    INSERT INTO rehearsal.stage2b3_checks VALUES(label,true); END $$;
    CREATE TABLE rehearsal.public_before AS SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations';
    INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
      ('00000000-0000-4000-8000-000000008001','c4-1@example.test','{"full_name":"Synthetic C4 One","user_type":"STUDENT","institutional_id":"C40001","phone_number":"08000000000"}'),
      ('00000000-0000-4000-8000-000000008002','c4-2@example.test','{"full_name":"Synthetic C4 Two","user_type":"LECTURER","institutional_id":"C40002","phone_number":"08000000000"}'),
      ('00000000-0000-4000-8000-000000008003','c4-3@example.test','{"full_name":"Synthetic C4 Three","user_type":"STUDENT","institutional_id":"C40003","phone_number":"08000000000"}');
    INSERT INTO public.psychologist_profiles(id,user_id,areas_of_focus,languages,updated_at) VALUES
      ('00000000-0000-4000-8000-000000008010','00000000-0000-4000-8000-000000008001',NULL,NULL,now()),
      ('00000000-0000-4000-8000-000000008010','00000000-0000-4000-8000-000000008002',ARRAY['Sintetis'],ARRAY['Indonesia'],now());
    DO $test$ BEGIN
      BEGIN EXECUTE $migration$${body}$migration$; RAISE EXCEPTION 'correction accepted duplicate IDs';
      EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'C4: duplicate%' THEN RAISE; END IF; END;
      PERFORM rehearsal.assert((SELECT areas_of_focus IS NULL FROM public.psychologist_profiles WHERE user_id='00000000-0000-4000-8000-000000008001'),'C4 duplicate refusal before backfill');
    END $test$;
    UPDATE public.psychologist_profiles SET id='00000000-0000-4000-8000-000000008011' WHERE user_id='00000000-0000-4000-8000-000000008002';
    UPDATE public.psychologist_profiles SET languages=ARRAY['id',NULL] WHERE user_id='00000000-0000-4000-8000-000000008002';
    DO $test$ BEGIN
      BEGIN EXECUTE $migration$${body}$migration$; RAISE EXCEPTION 'correction accepted null elements';
      EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'C4: unsupported%' THEN RAISE; END IF; END;
      PERFORM rehearsal.assert((SELECT areas_of_focus IS NULL FROM public.psychologist_profiles WHERE user_id='00000000-0000-4000-8000-000000008001'),'C4 invalid array refusal before backfill');
    END $test$;
    UPDATE public.psychologist_profiles SET languages=ARRAY['Indonesia'] WHERE user_id='00000000-0000-4000-8000-000000008002';
    CREATE TABLE rehearsal.profiles_before_c4 AS SELECT * FROM public.psychologist_profiles;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public._prisma_migrations TO website_deployer_probe;
    GRANT SELECT(checksum),UPDATE(logs) ON public._prisma_migrations TO anon;
    GRANT SELECT(migration_name) ON public._prisma_migrations TO PUBLIC;
  `);
  writeFileSync(join(scratch,"ledger-precheck.log"), sql(read("01-ledger-precheck")));
  sql(`DO $test$ BEGIN
    BEGIN EXECUTE $hardening$${remediationBody}$hardening$; RAISE EXCEPTION 'hardening accepted missing approval';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Ledger hardening requires%' THEN RAISE; END IF; END;
    PERFORM rehearsal.assert(has_table_privilege('anon','public._prisma_migrations','SELECT'),'approval gate preserved ACL');
    END $test$;`);
  sql(`${markers}
    CREATE ROLE ledger_inherited_probe;
    GRANT SELECT ON public._prisma_migrations TO ledger_inherited_probe;
    GRANT ledger_inherited_probe TO anon;
    DO $test$ BEGIN
      BEGIN EXECUTE $hardening$${remediationBody}$hardening$; RAISE EXCEPTION 'hardening missed inherited access';
      EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Browser effective%' THEN RAISE; END IF; END;
      PERFORM rehearsal.assert(has_table_privilege('authenticated','public._prisma_migrations','INSERT'),'inherited access stops and rolls back all revokes');
    END $test$;
    REVOKE ledger_inherited_probe FROM anon;
    GRANT ledger_inherited_probe TO anon WITH INHERIT FALSE, SET TRUE;
    DO $test$ BEGIN
      BEGIN EXECUTE $hardening$${remediationBody}$hardening$; RAISE EXCEPTION 'hardening missed SET-only path';
      EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Browser SET ROLE%' THEN RAISE; END IF; END;
      PERFORM rehearsal.assert(has_table_privilege('anon','public._prisma_migrations','INSERT'),'SET-only access stops and rolls back all revokes');
    END $test$;
    REVOKE ledger_inherited_probe FROM anon;
  `);
  sql(markers + remediation);
  writeFileSync(join(scratch,"ledger-postcheck.log"), sql(markers + read("03-ledger-postcheck")));
  // Apply an actual pending migration AFTER hardening, through the same Prisma deployer.
  copyMigrations([correction]);
  migrate();
  migrationNames.push(correction);
  run(process.execPath,["node_modules/prisma/build/index.js","migrate","status","--schema",join(scratch,"schema.prisma")]);
  // The isolated database includes intentional Auth/chatbot/rehearsal objects outside Prisma.
  // Preserve drift output for scoped review; never turn it into an executable migration.
  try {
    const drift = run(process.execPath,["node_modules/prisma/build/index.js","migrate","diff","--from-schema-datasource",join(scratch,"schema.prisma"),"--to-schema-datamodel","prisma/schema.prisma","--script"]);
    writeFileSync(join(scratch,"schema-diff-review-only.sql"),drift);
  } catch (error) {
    if (!String(error.diagnostic).includes("P4002") || !String(error.diagnostic).includes("Cross schema references")) throw error;
    writeFileSync(join(scratch,"schema-diff-limitation.txt"), "Prisma 5.22 migrate diff cannot introspect the intentional public.users -> auth.users FK with this single-schema datasource (P4002). No schema/Auth changes made to bypass it. C4 catalogs and runtime tests are checked separately.\n");
  }
  for (const name of migrationNames) {
    const hash = createHash("sha256").update(readFileSync(`prisma/migrations/${name}/migration.sql`)).digest("hex");
    sql(`SELECT rehearsal.assert((SELECT count(*)=1 FROM public._prisma_migrations WHERE migration_name='${name}' AND checksum='${hash}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL),'checksum ${name}');`);
  }
  writeFileSync(join(scratch,"schema-catalog.log"),sql(`
    SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position;
    SELECT conrelid::regclass,conname,contype,convalidated,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid::regclass::text,conname;
    SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname;
    SELECT tgrelid::regclass,tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY tgname;
  `));
  sql(readFileSync("tests/rehearsal/stage2b3-postchecks.sql","utf8"));
  // Exercise narrowly scoped recovery without restoring browser grants.
  sql(`REVOKE UPDATE ON public._prisma_migrations FROM website_deployer_probe;`);
  sql(`SET wellbeing.ledger_recovery_approval='reviewed-deployer-only-recovery'; SET wellbeing.ledger_owner='postgres'; SET wellbeing.ledger_deployer='website_deployer_probe';` + recovery);
  sql(`SELECT rehearsal.assert(has_table_privilege('website_deployer_probe','public._prisma_migrations','UPDATE') AND NOT has_table_privilege('anon','public._prisma_migrations','UPDATE'),'deployer-only recovery');`);
  writeFileSync(join(scratch,"stage2b3-checks.log"),sql("SELECT name,passed FROM rehearsal.stage2b3_checks ORDER BY name;"));
}
