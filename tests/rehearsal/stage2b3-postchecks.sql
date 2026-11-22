-- Synthetic Docker database only; invoked by guarded phase3-rehearsal.mjs.
SELECT rehearsal.assert(current_database()='wellbeing_phase3_rehearsal','isolated database identity');
SELECT rehearsal.assert((SELECT count(*)=7 AND bool_and(finished_at IS NOT NULL AND rolled_back_at IS NULL) FROM public._prisma_migrations),'seven successful migrations');
SELECT rehearsal.assert(EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.psychologist_profiles'::regclass AND contype='p' AND conname='psychologist_profiles_pkey' AND convalidated),'C4 validated primary key');
SELECT rehearsal.assert((SELECT indisunique AND indisprimary AND indisvalid FROM pg_index WHERE indexrelid='public.psychologist_profiles_pkey'::regclass),'C4 primary key index');
SELECT rehearsal.assert((SELECT count(*)=2 AND bool_and(attnotnull) FROM pg_attribute WHERE attrelid='public.psychologist_profiles'::regclass AND attname IN ('areas_of_focus','languages')),'C4 arrays NOT NULL');
SELECT rehearsal.assert(NOT EXISTS (
  SELECT 1 FROM rehearsal.profiles_before_c4 b FULL JOIN public.psychologist_profiles p USING(user_id)
  WHERE to_jsonb(p) IS DISTINCT FROM (to_jsonb(b) || jsonb_build_object('areas_of_focus',COALESCE(b.areas_of_focus,ARRAY[]::text[]),'languages',COALESCE(b.languages,ARRAY[]::text[])))
),'C4 preserves profiles and timestamps except null-array backfill');
INSERT INTO public.psychologist_profiles(id,user_id,updated_at) VALUES('00000000-0000-4000-8000-000000008012','00000000-0000-4000-8000-000000008003',now());
SELECT rehearsal.assert((SELECT areas_of_focus='{}'::text[] AND languages='{}'::text[] FROM public.psychologist_profiles WHERE id='00000000-0000-4000-8000-000000008012'),'C4 empty array defaults');
DO $$ BEGIN
  BEGIN UPDATE public.psychologist_profiles SET id='00000000-0000-4000-8000-000000008010' WHERE id='00000000-0000-4000-8000-000000008012'; RAISE EXCEPTION 'duplicate PK accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN UPDATE public.psychologist_profiles SET areas_of_focus=NULL WHERE id='00000000-0000-4000-8000-000000008012'; RAISE EXCEPTION 'NULL areas accepted'; EXCEPTION WHEN not_null_violation THEN NULL; END;
  BEGIN UPDATE public.psychologist_profiles SET languages=NULL WHERE id='00000000-0000-4000-8000-000000008012'; RAISE EXCEPTION 'NULL languages accepted'; EXCEPTION WHEN not_null_violation THEN NULL; END;
  BEGIN UPDATE public.psychologist_profiles SET user_id='00000000-0000-4000-8000-000000008099' WHERE id='00000000-0000-4000-8000-000000008012'; RAISE EXCEPTION 'invalid FK accepted'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  PERFORM rehearsal.assert(true,'C4 duplicate null and foreign-key negatives');
END $$;

SELECT rehearsal.assert(NOT EXISTS (
  (SELECT * FROM rehearsal.public_before EXCEPT SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations')
  UNION ALL
  (SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'_prisma_migrations' EXCEPT SELECT * FROM rehearsal.public_before)
),'other public table owners RLS and ACL unchanged');
SELECT rehearsal.assert(NOT EXISTS (
  (SELECT * FROM rehearsal.chatbot_before EXCEPT SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='chatbot')
  UNION ALL
  (SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='chatbot' EXCEPT SELECT * FROM rehearsal.chatbot_before)
),'chatbot object identity ownership RLS and ACL unchanged');
DO $$ DECLARE name text; count_rows integer; BEGIN
  FOREACH name IN ARRAY ARRAY['chat_sessions','checkins','messages','safety_events','user_memories'] LOOP
    EXECUTE format('SELECT count(*) FROM chatbot.%I WHERE id=1 AND marker=%L',name,'SYNTHETIC ONLY') INTO count_rows;
    IF count_rows<>1 THEN RAISE EXCEPTION 'chatbot fixture changed'; END IF;
  END LOOP;
  PERFORM rehearsal.assert((SELECT count(*)=1 FROM chatbot._backend_migrations WHERE id='synthetic-chatbot-baseline' AND checksum='synthetic-only'),'chatbot data and separate ledger preserved');
END $$;
SELECT rehearsal.assert(NOT EXISTS (
  (SELECT * FROM rehearsal.auth_triggers_before EXCEPT SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal)
  UNION ALL
  (SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal EXCEPT SELECT * FROM rehearsal.auth_triggers_before)
),'Auth trigger definitions preserved');
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('00000000-0000-4000-8000-000000008004','c4-after@example.test','{"full_name":"Synthetic After C4","user_type":"STUDENT","institutional_id":"C40004","phone_number":"08000000000","role":"SUPERADMIN"}');
UPDATE auth.users SET email='c4-after-updated@example.test' WHERE id='00000000-0000-4000-8000-000000008004';
SELECT rehearsal.assert((SELECT role='PARTICIPANT' AND email='c4-after-updated@example.test' FROM public.users WHERE id='00000000-0000-4000-8000-000000008004'),'Auth signup role protection and email sync after C4');
DO $$ BEGIN
  BEGIN INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES('00000000-0000-4000-8000-000000008005','c4-invalid@example.test','{}'); RAISE EXCEPTION 'invalid signup accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM rehearsal.assert(NOT EXISTS(SELECT 1 FROM auth.users WHERE id='00000000-0000-4000-8000-000000008005'),'Auth invalid signup rolls back');
END $$;

DO $$ DECLARE browser text; BEGIN
  FOREACH browser IN ARRAY ARRAY['anon','authenticated','website_runtime_probe'] LOOP
    IF has_table_privilege(browser,'public._prisma_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      OR has_any_column_privilege(browser,'public._prisma_migrations','SELECT,INSERT,UPDATE,REFERENCES') THEN RAISE EXCEPTION 'ledger privilege remains'; END IF;
    EXECUTE format('SET LOCAL ROLE %I',browser);
    BEGIN PERFORM checksum FROM public._prisma_migrations; RAISE EXCEPTION 'ledger SELECT allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN UPDATE public._prisma_migrations SET logs='synthetic' WHERE false; RAISE EXCEPTION 'ledger UPDATE allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN DELETE FROM public._prisma_migrations WHERE false; RAISE EXCEPTION 'ledger DELETE allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN INSERT INTO public._prisma_migrations(id,checksum,migration_name) VALUES('blocked','synthetic','blocked'); RAISE EXCEPTION 'ledger INSERT allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN TRUNCATE public._prisma_migrations; RAISE EXCEPTION 'ledger TRUNCATE allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
  END LOOP;
  PERFORM rehearsal.assert(true,'browser and unprivileged runtime ledger operations denied');
END $$;
BEGIN;
SET LOCAL ROLE website_deployer_probe;
SELECT count(*) FROM public._prisma_migrations;
INSERT INTO public._prisma_migrations(id,checksum,migration_name) VALUES('synthetic-deployer-check','synthetic','synthetic_probe');
UPDATE public._prisma_migrations SET applied_steps_count=1 WHERE id='synthetic-deployer-check';
DELETE FROM public._prisma_migrations WHERE id='synthetic-deployer-check';
COMMIT;
SELECT rehearsal.assert(true,'non-superuser deployer ledger SELECT INSERT UPDATE DELETE');
DO $$ DECLARE allowed boolean; BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000008004',true);
  SELECT count(*)=1 INTO allowed FROM public.users WHERE id='00000000-0000-4000-8000-000000008004';
  RESET ROLE;
  PERFORM rehearsal.assert(allowed,'authenticated own profile policy preserved');
  SET LOCAL ROLE service_role;
  PERFORM id FROM public.reports LIMIT 1;
  RESET ROLE;
  PERFORM rehearsal.assert(true,'RISK service_role retains report access via defaults and BYPASSRLS');
  PERFORM rehearsal.assert((SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname=current_user),'LIMIT application rehearsal uses privileged postgres');
  SET LOCAL ROLE chatbot_runtime;
  BEGIN PERFORM id FROM public.reports LIMIT 1; RAISE EXCEPTION 'chatbot runtime report access allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM id FROM chatbot._backend_migrations;
  RESET ROLE;
  PERFORM rehearsal.assert(true,'synthetic chatbot runtime limited to its own schema');
END $$;
