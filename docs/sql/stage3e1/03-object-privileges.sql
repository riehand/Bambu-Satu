-- PROPOSAL. HOSTED: NOT EXECUTED. Sesi harus sudah memiliki otoritas owner yang direview.
-- Mixed owner (platform + deployer) memerlukan administrator yang berwenang atas keduanya;
-- script tidak memberikan membership atau memindahkan ownership untuk melewati guard.
-- Prasyarat: delapan migrasi applied, snapshot ACL/column ACL/grantor/membership,
-- review bersama Flutter/platform untuk service_role; runtime belum boleh cutover.
-- SET wellbeing.stage3e_objects = 'reviewed-exact-website-objects';
-- Grant runtime di bawah adalah envelope kandidat. TANPA policy RLS baru, workflow
-- tetap ditolak. Script ini sengaja tidak membuat policy permisif atau menonaktifkan RLS.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$
DECLARE item text; obj oid; cols text; r record; target record;
  tables text[] := ARRAY['_prisma_migrations','users','academic_periods','assessment_question_sets','questions',
    'assessment_sessions','assessment_answers','assessment_scores','reports','psychologist_profiles',
    'psychologist_availability','appointments','consultation_sessions','consents','consent_audit_events','consultation_messages'];
  functions text[] := ARRAY['handle_auth_user_created','handle_auth_email_changed','phase2_freeze_question_set',
    'phase2_freeze_question','phase2_guard_answer','phase2_guard_session','phase2_freeze_score',
    'phase3_protect_consent_grant','phase3_protect_consent_audit','guard_consultation_message'];
BEGIN
  IF current_setting('wellbeing.stage3e_objects',true) IS DISTINCT FROM 'reviewed-exact-website-objects' THEN
    RAISE EXCEPTION 'Stage3E object approval required';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','website_runtime','website_deployer','flutter_runtime'))<>6 THEN
    RAISE EXCEPTION 'Stage3E expected roles missing';
  END IF;
  FOREACH item IN ARRAY tables LOOP
    obj := to_regclass(format('public.%I',item));
    IF obj IS NULL THEN RAISE EXCEPTION 'Stage3E missing object %',item; END IF;
    IF EXISTS (SELECT 1 FROM pg_class WHERE oid=obj AND NOT pg_has_role(current_user,relowner,'USAGE')) THEN
      RAISE EXCEPTION 'Stage3E reviewed owner session required for %',item;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) x WHERE c.oid=obj AND x.grantor<>c.relowner)
       OR EXISTS (SELECT 1 FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x
         JOIN pg_class c ON c.oid=a.attrelid WHERE a.attrelid=obj AND x.grantor<>c.relowner) THEN
      RAISE EXCEPTION 'Stage3E unexpected grant chain %',item;
    END IF;
    SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=obj AND attnum>0 AND NOT attisdropped;
    -- users: pertahankan own-profile authenticated columns/policy yang sudah direview.
    IF item='users' THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM service_role,website_runtime,flutter_runtime RESTRICT',item);
      EXECUTE format('REVOKE ALL (%s) ON public.%I FROM service_role,website_runtime,flutter_runtime RESTRICT',cols,item);
    ELSE
      EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role,website_runtime,flutter_runtime RESTRICT',item);
      EXECUTE format('REVOKE ALL (%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role,website_runtime,flutter_runtime RESTRICT',cols,item);
    END IF;
    FOR r IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('service_role','flutter_runtime','website_runtime')
      OR (item<>'users' AND rolname IN ('anon','authenticated')) LOOP
      FOR target IN SELECT oid,rolsuper FROM pg_roles WHERE oid=r.oid OR pg_has_role(r.oid,oid,'USAGE') OR pg_has_role(r.oid,oid,'SET') LOOP
        IF target.rolsuper OR has_table_privilege(target.oid,obj,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
          OR has_any_column_privilege(target.oid,obj,'SELECT,INSERT,UPDATE,REFERENCES') THEN
          RAISE EXCEPTION 'Stage3E effective or SET access remains: % on %',r.rolname,item;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  FOREACH item IN ARRAY functions LOOP
    obj:=to_regprocedure(format('public.%I()',item));
    IF obj IS NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE oid=obj AND NOT pg_has_role(current_user,proowner,'USAGE')) THEN
      RAISE EXCEPTION 'Stage3E function owner review required %',item;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) x WHERE p.oid=obj AND x.grantor<>p.proowner) THEN
      RAISE EXCEPTION 'Stage3E function grant chain review required %',item;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM PUBLIC,anon,authenticated,service_role,website_runtime,flutter_runtime RESTRICT',item);
    FOR r IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','website_runtime','flutter_runtime') LOOP
      FOR target IN SELECT oid,rolsuper FROM pg_roles WHERE oid=r.oid OR pg_has_role(r.oid,oid,'USAGE') OR pg_has_role(r.oid,oid,'SET') LOOP
        IF target.rolsuper OR has_function_privilege(target.oid,obj,'EXECUTE') THEN
          RAISE EXCEPTION 'Stage3E function effective or SET access remains: %',item;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
GRANT SELECT(id,full_name,email,phone_number,role,user_type,institutional_id,is_active,created_at,updated_at) ON public.users TO website_runtime;
-- PostgreSQL row locks memerlukan UPDATE setidaknya satu kolom; tidak memberi role/is_active/password_hash.
-- UPDATE(id) bukan hak lock-only: policy/immutability wajib dirancang sebelum cutover.
GRANT UPDATE(id) ON public.users TO website_runtime;
GRANT SELECT,INSERT ON public.academic_periods TO website_runtime;
GRANT UPDATE(id) ON public.academic_periods TO website_runtime;
GRANT SELECT ON public.assessment_question_sets,public.questions TO website_runtime;
GRANT SELECT,INSERT ON public.psychologist_profiles TO website_runtime;
GRANT UPDATE(professional_title,qualification,education,short_bio,areas_of_focus,consultation_method,consultation_location,languages,updated_at)
  ON public.psychologist_profiles TO website_runtime;
GRANT SELECT,INSERT,UPDATE ON public.assessment_sessions,public.assessment_answers,public.reports,
  public.psychologist_availability,public.appointments,public.consultation_sessions TO website_runtime;
GRANT SELECT,INSERT ON public.assessment_scores,public.consent_audit_events,public.consultation_messages TO website_runtime;
GRANT SELECT,INSERT ON public.consents TO website_runtime;
GRANT UPDATE(revoked_at,expired_at) ON public.consents TO website_runtime;
-- Trigger invoker tetap berjalan melalui tabel; tidak ada direct EXECUTE untuk runtime.
-- Tidak mengubah schema/default ACL/platform role/Storage/chatbot/RLS/trigger definitions.
COMMIT;
