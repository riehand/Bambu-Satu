-- SHARED HOSTED: preserve existing users/Auth/Flutter ACL and data. Review exact target before operator execution.
-- psql -X -v ON_ERROR_STOP=1; no application/build invokes this artifact.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_setting('server_version_num')::integer<170000 OR current_database()<>'postgres' OR current_setting('wellbeing.approved_hosted_ref',true) IS DISTINCT FROM 'bofoowyzlnfhwcstlmgp'
 OR to_regclass('auth.users') IS NULL OR to_regnamespace('chatbot') IS NULL
 OR to_regnamespace('wb_guard') IS NOT NULL OR to_regnamespace('wb_pdf') IS NOT NULL
 OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>8
 THEN RAISE EXCEPTION 'Approved target and eight applied migrations required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto' AND n.nspname='extensions')
 THEN RAISE EXCEPTION 'pgcrypto in extensions required; do not relocate platform extensions'; END IF;
END $$;
CREATE ROLE website_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA public TO website_runtime;
DO $$ DECLARE t text; cols text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','academic_periods','assessment_question_sets','questions','assessment_sessions','assessment_answers','assessment_scores','reports','psychologist_profiles','psychologist_availability','appointments','consultation_sessions','consents','consent_audit_events','consultation_messages'] LOOP
  IF t<>'users' OR NOT true THEN EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t); END IF;
  SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid=format('public.%I',t)::regclass AND attnum>0 AND NOT attisdropped;
  IF t='users' THEN
   EXECUTE format('REVOKE ALL ON public.%I FROM website_runtime',t);
   EXECUTE format('REVOKE ALL (%s) ON public.%I FROM website_runtime',cols,t);
  ELSE
   EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role,website_runtime',t);
   EXECUTE format('REVOKE ALL (%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role,website_runtime',cols,t);
  END IF;
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


-- Adapted from docs/sql/stage3e1b/01-identity.sql; source checksum is in manifest.json.
-- TEST-ONLY PROPOSAL. HOSTED: NOT EXECUTED. Perlu review/approval terpisah.
-- Tidak menerima credential/secret literal; key sintetis dibuat lokal oleh pgcrypto.

CREATE ROLE wb_identity_guard NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT wb_identity_guard TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;
CREATE SCHEMA wb_crypto;
REVOKE ALL ON SCHEMA wb_crypto FROM PUBLIC;

CREATE FUNCTION wb_crypto.hmac(bytea,bytea,text) RETURNS bytea LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog AS 'SELECT extensions.hmac($1,$2,$3)';
CREATE FUNCTION wb_crypto.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql VOLATILE STRICT
SET search_path=pg_catalog AS 'SELECT extensions.gen_random_bytes($1)';
GRANT USAGE ON SCHEMA extensions TO wb_identity_guard;

CREATE SCHEMA wb_guard AUTHORIZATION wb_identity_guard;
REVOKE ALL ON SCHEMA wb_guard FROM PUBLIC;
GRANT USAGE ON SCHEMA wb_guard TO website_runtime;
GRANT USAGE ON SCHEMA public,wb_crypto TO wb_identity_guard;
CREATE TABLE wb_guard.signing_key(id boolean PRIMARY KEY CHECK(id), secret bytea NOT NULL);
INSERT INTO wb_guard.signing_key VALUES(true,wb_crypto.gen_random_bytes(32));
ALTER TABLE wb_guard.signing_key OWNER TO wb_identity_guard;
REVOKE ALL ON wb_guard.signing_key FROM PUBLIC,website_runtime;
SET LOCAL ROLE wb_identity_guard;
CREATE FUNCTION wb_guard.subject() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,wb_guard AS $$
DECLARE payload text:=current_setting('wellbeing.claim',true); mac text:=current_setting('wellbeing.mac',true);
  claim jsonb; actual bytea; supplied bytea; secret_value bytea; diff integer:=0; i integer; epoch_now bigint;
BEGIN
  IF session_user<>'website_runtime' OR payload IS NULL OR length(payload)>2048
    OR mac IS NULL OR mac !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid database identity' USING ERRCODE='42501'; END IF;
  SELECT secret INTO secret_value FROM wb_guard.signing_key WHERE id;
  actual:=wb_crypto.hmac(convert_to(payload,'UTF8'),secret_value,'sha256'); supplied:=decode(mac,'hex');
  FOR i IN 0..31 LOOP diff:=diff | (get_byte(actual,i) # get_byte(supplied,i)); END LOOP;
  IF diff<>0 THEN RAISE EXCEPTION 'Invalid database identity' USING ERRCODE='42501'; END IF;
  claim:=payload::jsonb; epoch_now:=floor(extract(epoch FROM clock_timestamp()))::bigint;
  IF claim->>'aud' IS DISTINCT FROM 'wellbeing-hosted-bofoowyzlnfhwcstlmgp-v1'
    OR claim->>'pid' IS DISTINCT FROM pg_backend_pid()::text
    OR claim->>'tx' IS DISTINCT FROM pg_current_xact_id()::text
    OR NOT (claim ?& ARRAY['sub','iat','exp','purpose'])
    OR claim->>'sub' IS NULL OR claim->>'iat' IS NULL
    OR claim->>'exp' IS NULL OR claim->>'purpose' IS NULL
    OR (claim->>'iat')::bigint>epoch_now OR (claim->>'exp')::bigint<=epoch_now
    OR (claim->>'exp')::bigint-(claim->>'iat')::bigint NOT BETWEEN 1 AND 60
    OR claim->>'purpose' NOT IN ('interactive','report-finalize') THEN
    RAISE EXCEPTION 'Invalid database identity' USING ERRCODE='42501';
  END IF;
  RETURN (claim->>'sub')::uuid;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid database identity' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION wb_guard.subject() FROM PUBLIC;
RESET ROLE;
GRANT SELECT(id,full_name,email,phone_number,role,user_type,institutional_id,is_active,created_at,updated_at)
  ON public.users TO wb_identity_guard;
CREATE POLICY wb_guard_own_identity ON public.users FOR SELECT TO wb_identity_guard USING(id=wb_guard.subject());
SET LOCAL ROLE wb_identity_guard;
CREATE FUNCTION wb_guard.actor_role() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,wb_guard
AS $$ SELECT role::text FROM public.users WHERE id=wb_guard.subject() AND is_active $$;
CREATE FUNCTION wb_guard.own_profile() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object('id',id,'fullName',full_name,'email',email,'phoneNumber',phone_number,
    'role',role,'userType',user_type,'institutionalId',institutional_id,'isActive',is_active)
  INTO result FROM public.users WHERE id=wb_guard.subject() AND is_active;
  IF result IS NULL THEN RAISE EXCEPTION 'Inactive or missing profile' USING ERRCODE='42501'; END IF;
  RETURN result;
END $$;
CREATE FUNCTION wb_guard.purpose() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard AS $$
BEGIN PERFORM wb_guard.subject(); RETURN current_setting('wellbeing.claim')::jsonb->>'purpose'; END $$;
REVOKE ALL ON FUNCTION wb_guard.actor_role(),wb_guard.own_profile(),wb_guard.purpose() FROM PUBLIC;
RESET ROLE;
GRANT EXECUTE ON FUNCTION wb_guard.subject(),wb_guard.actor_role(),wb_guard.own_profile(),wb_guard.purpose() TO website_runtime;


-- Adapted from docs/sql/stage3e1b/02-runtime-policies.sql; source checksum is in manifest.json.
-- TEST-ONLY PROPOSAL. HOSTED: NOT EXECUTED. Tetap fail-closed untuk mutasi lintas pihak
-- yang belum mempunyai gateway/validasi DB lengkap. Tidak ada USING(true).

-- Own profile saja: jangan membuka kolom email/phone kepada pihak lain melalui row policy.
CREATE POLICY wb_runtime_profile ON public.users FOR SELECT TO website_runtime
USING(id=wb_guard.subject() AND is_active AND wb_guard.actor_role() IS NOT NULL);
-- UPDATE(id) diperlukan lock. Trigger di file 03 menolak semua perubahan isi users.
CREATE POLICY wb_runtime_profile_lock ON public.users FOR UPDATE TO website_runtime
USING(id=wb_guard.subject() AND is_active) WITH CHECK(id=wb_guard.subject() AND is_active);
CREATE POLICY wb_runtime_period ON public.academic_periods FOR SELECT TO website_runtime
USING(status='ACTIVE' AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_runtime_period_lock ON public.academic_periods FOR UPDATE TO website_runtime
USING(status='ACTIVE' AND wb_guard.actor_role()='PARTICIPANT') WITH CHECK(false);
REVOKE INSERT ON public.academic_periods FROM website_runtime;
CREATE POLICY wb_runtime_content ON public.assessment_question_sets FOR SELECT TO website_runtime
USING(is_published AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_runtime_questions ON public.questions FOR SELECT TO website_runtime
USING(is_active AND wb_guard.actor_role()='PARTICIPANT' AND EXISTS
  (SELECT 1 FROM public.assessment_question_sets s WHERE s.id=question_set_id AND s.is_published));
CREATE POLICY wb_runtime_assessment_read ON public.assessment_sessions FOR SELECT TO website_runtime
USING(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_runtime_assessment_insert ON public.assessment_sessions FOR INSERT TO website_runtime
WITH CHECK(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT' AND status='IN_PROGRESS'
  AND completed_at IS NULL AND revision=0 AND processing_consent_version='assessment-processing-id-v1');
CREATE POLICY wb_runtime_assessment_update ON public.assessment_sessions FOR UPDATE TO website_runtime
USING(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT')
WITH CHECK(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_runtime_answers ON public.assessment_answers FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject()));
CREATE POLICY wb_runtime_answer_insert ON public.assessment_answers FOR INSERT TO website_runtime
WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject() AND s.status='IN_PROGRESS'));
CREATE POLICY wb_runtime_answer_update ON public.assessment_answers FOR UPDATE TO website_runtime
USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject() AND s.status='IN_PROGRESS'))
WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject() AND s.status='IN_PROGRESS'));
CREATE POLICY wb_runtime_score_read ON public.assessment_scores FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject()));
-- Score INSERT dipertahankan default-deny: memberi hak INSERT saja mengizinkan pemalsuan
-- official scores lewat SQL langsung. Scoring gateway independently validated diperlukan.
REVOKE INSERT ON public.assessment_scores FROM website_runtime;
CREATE POLICY wb_runtime_report_read ON public.reports FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject()));
-- PENDING metadata hanya untuk sesi sendiri; generated artifact tidak boleh dibuat dari SQL biasa.
CREATE POLICY wb_runtime_report_insert ON public.reports FOR INSERT TO website_runtime
WITH CHECK(status='PENDING' AND file_path_or_object_key IS NULL AND generated_at IS NULL AND EXISTS
  (SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject()));
-- Finalization belum diberi UPDATE: signature purpose saja bukan attestasi artifact Storage.
REVOKE UPDATE ON public.reports FROM website_runtime;
CREATE POLICY wb_runtime_psychologist_profile ON public.psychologist_profiles FOR ALL TO website_runtime
USING(user_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST')
WITH CHECK(user_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST');
CREATE POLICY wb_runtime_availability ON public.psychologist_availability FOR ALL TO website_runtime
USING(psychologist_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST')
WITH CHECK(psychologist_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST');
-- Operasional milik sendiri boleh dibaca; belum memberi mutation lifecycle/booking.
CREATE POLICY wb_runtime_appointments ON public.appointments FOR SELECT TO website_runtime
USING((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT')
  OR (psychologist_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'));
CREATE POLICY wb_runtime_consultation ON public.consultation_sessions FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.appointments a WHERE a.id=appointment_id));
CREATE POLICY wb_runtime_consent ON public.consents FOR SELECT TO website_runtime
USING((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT')
  OR (target_user_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'));
CREATE POLICY wb_runtime_consent_audit ON public.consent_audit_events FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.consents c WHERE c.id=consent_id AND c.participant_id=wb_guard.subject()));
CREATE POLICY wb_runtime_chat_read ON public.consultation_messages FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.consultation_sessions s JOIN public.appointments a ON a.id=s.appointment_id
  WHERE s.id=consultation_session_id AND s.status='IN_PROGRESS' AND a.status='IN_PROGRESS'
  AND s.started_at IS NOT NULL AND s.ended_at IS NULL AND s.participant_checked_in_at IS NOT NULL
  AND s.psychologist_checked_in_at IS NOT NULL AND clock_timestamp()>=a.scheduled_start_at
  AND clock_timestamp()<a.scheduled_end_at AND clock_timestamp()<s.scheduled_end_at));
-- UPDATE grants untuk locks boleh tetap ada tetapi tidak ada UPDATE policy: tidak ada row
-- yang dapat dikunci/mutasi pada workflow belum direview. Jangan menghitung itu sebagai PASS.
REVOKE INSERT ON public.appointments,public.consultation_sessions,public.consents,
  public.consent_audit_events,public.consultation_messages FROM website_runtime;


-- Adapted from docs/sql/stage3e1b/03-mutation-guards.sql; source checksum is in manifest.json.
-- TEST-ONLY PROPOSAL. HOSTED: NOT EXECUTED. Tambahan guard, tidak rewrite trigger lama.

CREATE FUNCTION wb_guard.protect_runtime_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,wb_guard AS $$
BEGIN
  IF TG_TABLE_NAME='users' THEN
    IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Profile identity is not runtime writable' USING ERRCODE='42501';
    END IF;
  ELSIF TG_TABLE_NAME='assessment_answers' THEN
    IF TG_OP='UPDATE' AND
    (NEW.id,NEW.assessment_session_id,NEW.question_id,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.assessment_session_id,OLD.question_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Answer identity is immutable' USING ERRCODE='42501';
    END IF;
  ELSIF TG_TABLE_NAME='assessment_sessions' THEN
    IF TG_OP='UPDATE' AND
    (NEW.id,NEW.started_at,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.started_at,OLD.created_at) THEN
    RAISE EXCEPTION 'Session identity is immutable' USING ERRCODE='42501';
    END IF;
  ELSIF TG_TABLE_NAME='psychologist_availability' THEN
    IF TG_OP='UPDATE' AND ((NEW.id,NEW.psychologist_id,NEW.availability_date,NEW.session_type,NEW.created_at)
       IS DISTINCT FROM (OLD.id,OLD.psychologist_id,OLD.availability_date,OLD.session_type,OLD.created_at)
       OR (OLD.status='BOOKED' AND NEW IS DISTINCT FROM OLD)) THEN
      RAISE EXCEPTION 'Booked slot or identity immutable' USING ERRCODE='42501';
    END IF;
    IF (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) AND NEW.status='BOOKED' THEN
      RAISE EXCEPTION 'Booking requires reviewed atomic gateway' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION wb_guard.protect_runtime_mutation() FROM PUBLIC,website_runtime;
CREATE TRIGGER wb_guard_profile BEFORE UPDATE ON public.users FOR EACH ROW
WHEN(current_user='website_runtime') EXECUTE FUNCTION wb_guard.protect_runtime_mutation();
CREATE TRIGGER wb_guard_answer BEFORE UPDATE ON public.assessment_answers FOR EACH ROW
WHEN(current_user='website_runtime') EXECUTE FUNCTION wb_guard.protect_runtime_mutation();
CREATE TRIGGER wb_guard_session BEFORE UPDATE ON public.assessment_sessions FOR EACH ROW
WHEN(current_user='website_runtime') EXECUTE FUNCTION wb_guard.protect_runtime_mutation();
CREATE TRIGGER wb_guard_availability BEFORE INSERT OR UPDATE ON public.psychologist_availability FOR EACH ROW
WHEN(current_user='website_runtime') EXECUTE FUNCTION wb_guard.protect_runtime_mutation();


-- Adapted from docs/sql/stage3e1b/04-monitor.sql; source checksum is in manifest.json.
-- TEST-ONLY PROPOSAL. HOSTED: NOT EXECUTED. Tidak memberi SELECT klinis kepada admin runtime.

CREATE ROLE wb_operational_monitor NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT wb_operational_monitor TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;
GRANT USAGE ON SCHEMA public,wb_guard TO wb_operational_monitor;
GRANT EXECUTE ON FUNCTION wb_guard.subject(),wb_guard.actor_role() TO wb_operational_monitor;
GRANT SELECT(role,is_active) ON public.users TO wb_operational_monitor;
GRANT SELECT(status,started_at,completed_at) ON public.assessment_sessions TO wb_operational_monitor;
GRANT SELECT(status,scheduled_start_at) ON public.appointments TO wb_operational_monitor;
CREATE POLICY wb_monitor_users ON public.users FOR SELECT TO wb_operational_monitor USING(wb_guard.actor_role()='SUPERADMIN');
CREATE POLICY wb_monitor_assessments ON public.assessment_sessions FOR SELECT TO wb_operational_monitor USING(wb_guard.actor_role()='SUPERADMIN');
CREATE POLICY wb_monitor_appointments ON public.appointments FOR SELECT TO wb_operational_monitor USING(wb_guard.actor_role()='SUPERADMIN');
CREATE FUNCTION wb_guard.operational_counts(date_from date,date_to date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,wb_guard AS $$
DECLARE result jsonb; from_time timestamptz; to_time timestamptz;
BEGIN
  IF wb_guard.actor_role() IS DISTINCT FROM 'SUPERADMIN' THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  IF date_from IS NULL OR date_to IS NULL OR date_to<date_from OR date_to-date_from>=93 THEN
    RAISE EXCEPTION 'Invalid monitoring range' USING ERRCODE='22023'; END IF;
  from_time:=date_from::timestamp AT TIME ZONE 'Asia/Jakarta';
  to_time:=(date_to+1)::timestamp AT TIME ZONE 'Asia/Jakarta';
  SELECT jsonb_build_object(
    'activeParticipants',(SELECT count(*) FROM public.users WHERE role='PARTICIPANT' AND is_active),
    'activePsychologists',(SELECT count(*) FROM public.users WHERE role='PSYCHOLOGIST' AND is_active),
    'assessmentsStarted',(SELECT count(*) FROM public.assessment_sessions WHERE started_at>=from_time AT TIME ZONE 'UTC' AND started_at<to_time AT TIME ZONE 'UTC'),
    'assessmentsCompleted',(SELECT count(*) FROM public.assessment_sessions WHERE status='COMPLETED' AND completed_at>=from_time AT TIME ZONE 'UTC' AND completed_at<to_time AT TIME ZONE 'UTC'),
    'appointments',(SELECT count(*) FROM public.appointments WHERE scheduled_start_at>=from_time AND scheduled_start_at<to_time),
    'clinicalIndicatorsEnabled',false) INTO result;
  RETURN result;
END $$;
GRANT CREATE ON SCHEMA wb_guard TO wb_operational_monitor;
ALTER FUNCTION wb_guard.operational_counts(date,date) OWNER TO wb_operational_monitor;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_operational_monitor;
REVOKE ALL ON FUNCTION wb_guard.operational_counts(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.operational_counts(date,date) TO website_runtime;


-- Adapted from docs/sql/stage3e1c/01-scoring.sql; source checksum is in manifest.json.
-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.

CREATE ROLE wb_score_gateway NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT wb_score_gateway TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;
GRANT USAGE ON SCHEMA public,wb_guard TO wb_score_gateway;
GRANT EXECUTE ON FUNCTION wb_guard.subject(),wb_guard.actor_role(),wb_guard.purpose() TO wb_score_gateway;
GRANT SELECT(id,role,is_active),UPDATE(id) ON public.users TO wb_score_gateway;
GRANT SELECT,UPDATE(id) ON public.academic_periods TO wb_score_gateway;
GRANT SELECT ON public.assessment_question_sets,public.questions,public.assessment_answers TO wb_score_gateway;
GRANT SELECT,UPDATE(status,completed_at,revision,updated_at) ON public.assessment_sessions TO wb_score_gateway;
GRANT SELECT,INSERT ON public.assessment_scores,public.reports TO wb_score_gateway;
CREATE POLICY wb_score_users ON public.users FOR SELECT TO wb_score_gateway USING(id=wb_guard.subject() AND is_active AND role='PARTICIPANT');
CREATE POLICY wb_score_user_lock ON public.users FOR UPDATE TO wb_score_gateway USING(id=wb_guard.subject() AND is_active AND role='PARTICIPANT') WITH CHECK(false);
CREATE POLICY wb_score_period ON public.academic_periods FOR SELECT TO wb_score_gateway USING(status='ACTIVE' AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_score_period_lock ON public.academic_periods FOR UPDATE TO wb_score_gateway USING(status='ACTIVE') WITH CHECK(false);
CREATE POLICY wb_score_sets ON public.assessment_question_sets FOR SELECT TO wb_score_gateway USING(is_published AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_score_questions ON public.questions FOR SELECT TO wb_score_gateway USING(wb_guard.actor_role()='PARTICIPANT' AND EXISTS(SELECT 1 FROM public.assessment_question_sets q WHERE q.id=question_set_id));
CREATE POLICY wb_score_sessions_read ON public.assessment_sessions FOR SELECT TO wb_score_gateway USING(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_score_sessions_write ON public.assessment_sessions FOR UPDATE TO wb_score_gateway USING(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') WITH CHECK(participant_id=wb_guard.subject() AND status='COMPLETED');
CREATE POLICY wb_score_answers ON public.assessment_answers FOR SELECT TO wb_score_gateway USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id));
CREATE POLICY wb_score_results_read ON public.assessment_scores FOR SELECT TO wb_score_gateway USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id));
CREATE POLICY wb_score_results_insert ON public.assessment_scores FOR INSERT TO wb_score_gateway WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.status='IN_PROGRESS'));
CREATE POLICY wb_score_report_read ON public.reports FOR SELECT TO wb_score_gateway USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id));
CREATE POLICY wb_score_report_insert ON public.reports FOR INSERT TO wb_score_gateway WITH CHECK(status='PENDING' AND file_path_or_object_key IS NULL AND generated_at IS NULL AND EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.status='IN_PROGRESS'));
-- Old invoker trigger comparisons can see NULL for a hidden draft question.
-- Explicit restrictive association policy makes missing/invisible questions fail closed.
CREATE POLICY wb_score_answer_association_insert ON public.assessment_answers AS RESTRICTIVE FOR INSERT TO website_runtime
WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_sessions s JOIN public.questions q ON q.question_set_id=s.question_set_id WHERE s.id=assessment_session_id AND q.id=question_id AND q.is_active));
CREATE POLICY wb_score_answer_association_update ON public.assessment_answers AS RESTRICTIVE FOR UPDATE TO website_runtime
WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_sessions s JOIN public.questions q ON q.question_set_id=s.question_set_id WHERE s.id=assessment_session_id AND q.id=question_id AND q.is_active));
-- Metadata created only by the atomic scoring gateway; no caller-supplied association.
REVOKE INSERT ON public.reports FROM website_runtime;
CREATE FUNCTION wb_guard.submit_assessment(session_id uuid,expected_revision integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE actor uuid; s public.assessment_sessions; q public.assessment_question_sets; p public.academic_periods;
 d integer; a integer; st integer; w integer; report_id uuid;
BEGIN
 actor:=wb_guard.subject();
 IF wb_guard.actor_role() IS DISTINCT FROM 'PARTICIPANT' OR wb_guard.purpose() IS DISTINCT FROM 'interactive'
 THEN RAISE EXCEPTION 'Submission forbidden' USING ERRCODE='42501'; END IF;
 IF session_id IS NULL OR expected_revision IS NULL OR expected_revision<0 THEN RAISE EXCEPTION 'Invalid revision' USING ERRCODE='22023'; END IF;
 -- Same lock order as existing services. Direct answer writes also lock session via old trigger.
 PERFORM id FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inactive actor' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.assessment_sessions WHERE id=session_id AND participant_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='42501'; END IF;
 IF s.status='COMPLETED' THEN
   SELECT r.id INTO report_id FROM public.reports r JOIN public.assessment_scores sc ON sc.assessment_session_id=r.assessment_session_id WHERE r.assessment_session_id=s.id;
   IF report_id IS NULL THEN RAISE EXCEPTION 'Result unavailable'; END IF;
   RETURN report_id;
 END IF;
 IF s.revision<>expected_revision THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT * INTO p FROM public.academic_periods WHERE id=s.academic_period_id AND status='ACTIVE' FOR SHARE;
 IF NOT FOUND OR (SELECT count(*) FROM public.academic_periods WHERE status='ACTIVE')<>1 THEN RAISE EXCEPTION 'Active period unavailable'; END IF;
 IF (SELECT count(*) FROM public.assessment_sessions WHERE participant_id=actor AND academic_period_id=p.id AND status='COMPLETED')>=p.assessment_limit THEN RAISE EXCEPTION 'Quota exceeded'; END IF;
 SELECT * INTO q FROM public.assessment_question_sets WHERE id=s.question_set_id AND is_published;
 IF NOT FOUND OR q.approved_at IS NULL OR nullif(btrim(q.approved_by),'') IS NULL
 OR nullif(btrim(q.dass_source),'') IS NULL OR nullif(btrim(q.wemwbs_licence_reference),'') IS NULL
 OR nullif(btrim(q.translation_reference),'') IS NULL OR nullif(btrim(q.presentation_approval_reference),'') IS NULL
 OR nullif(btrim(q.dass_instructions),'') IS NULL OR nullif(btrim(q.wemwbs_instructions),'') IS NULL
 THEN RAISE EXCEPTION 'Approved content unavailable'; END IF;
 IF jsonb_typeof(q.dass_options)<>'array' OR jsonb_typeof(q.wemwbs_options)<>'array' THEN RAISE EXCEPTION 'Invalid options'; END IF;
 IF (SELECT jsonb_agg(o->'value' ORDER BY ord) FROM jsonb_array_elements(q.dass_options) WITH ORDINALITY AS x(o,ord)) IS DISTINCT FROM '[0,1,2,3]'::jsonb
 OR (SELECT jsonb_agg(o->'value' ORDER BY ord) FROM jsonb_array_elements(q.wemwbs_options) WITH ORDINALITY AS x(o,ord)) IS DISTINCT FROM '[1,2,3,4,5]'::jsonb
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(q.dass_options||q.wemwbs_options) o WHERE jsonb_typeof(o)<>'object' OR jsonb_typeof(o->'label') IS DISTINCT FROM 'string' OR nullif(btrim(o->>'label'),'') IS NULL OR (o-'value'-'label')<>'{}'::jsonb)
 THEN RAISE EXCEPTION 'Invalid scoring options'; END IF;
 -- Historical unique/number/dimension constraints guarantee complete canonical numbering.
 IF (SELECT count(*) FROM public.questions WHERE question_set_id=q.id)<>35
 OR (SELECT count(*) FROM public.questions WHERE question_set_id=q.id AND instrument='DASS21')<>21
 OR EXISTS(SELECT 1 FROM public.questions WHERE question_set_id=q.id AND (NOT is_active OR nullif(btrim(question_text),'') IS NULL))
 OR (SELECT count(*) FROM public.assessment_answers WHERE assessment_session_id=s.id)<>35
 OR (SELECT count(*) FROM public.assessment_answers ans JOIN public.questions item ON item.id=ans.question_id WHERE ans.assessment_session_id=s.id AND item.question_set_id=q.id)<>35
 OR EXISTS(SELECT 1 FROM public.assessment_answers ans JOIN public.questions item ON item.id=ans.question_id WHERE ans.assessment_session_id=s.id AND (item.question_set_id<>q.id OR (item.instrument='DASS21' AND ans.answer_value NOT BETWEEN 0 AND 3) OR (item.instrument='WEMWBS' AND ans.answer_value NOT BETWEEN 1 AND 5)))
 THEN RAISE EXCEPTION 'Incomplete or invalid answers'; END IF;
 SELECT 2*sum(ans.answer_value) FILTER(WHERE item.scoring_dimension='DEPRESSION'),
  2*sum(ans.answer_value) FILTER(WHERE item.scoring_dimension='ANXIETY'),
  2*sum(ans.answer_value) FILTER(WHERE item.scoring_dimension='STRESS'),
  sum(ans.answer_value) FILTER(WHERE item.scoring_dimension='WELLBEING')
 INTO d,a,st,w FROM public.assessment_answers ans JOIN public.questions item ON item.id=ans.question_id
 WHERE ans.assessment_session_id=s.id AND item.question_set_id=q.id;
 -- Exact existing TS thresholds; parity tested across all possible DASS subtotals.
 INSERT INTO public.assessment_scores(id,assessment_session_id,depression_score,depression_category,anxiety_score,anxiety_category,stress_score,stress_category,wemwbs_score,updated_at)
 VALUES(gen_random_uuid(),s.id,d,(CASE WHEN d<=9 THEN 'NORMAL' WHEN d<=13 THEN 'MILD' WHEN d<=20 THEN 'MODERATE' WHEN d<=27 THEN 'SEVERE' ELSE 'EXTREMELY_SEVERE' END)::public."DassCategory",
 a,(CASE WHEN a<=7 THEN 'NORMAL' WHEN a<=9 THEN 'MILD' WHEN a<=14 THEN 'MODERATE' WHEN a<=19 THEN 'SEVERE' ELSE 'EXTREMELY_SEVERE' END)::public."DassCategory",
 st,(CASE WHEN st<=14 THEN 'NORMAL' WHEN st<=18 THEN 'MILD' WHEN st<=25 THEN 'MODERATE' WHEN st<=33 THEN 'SEVERE' ELSE 'EXTREMELY_SEVERE' END)::public."DassCategory",w,clock_timestamp());
 report_id:=gen_random_uuid();
 INSERT INTO public.reports(id,assessment_session_id,status,updated_at) VALUES(report_id,s.id,'PENDING',clock_timestamp());
 UPDATE public.assessment_sessions SET status='COMPLETED',completed_at=clock_timestamp() AT TIME ZONE 'UTC',revision=revision+1,updated_at=clock_timestamp() AT TIME ZONE 'UTC' WHERE id=s.id;
 RETURN report_id;
END $$;
GRANT CREATE ON SCHEMA wb_guard TO wb_score_gateway;
ALTER FUNCTION wb_guard.submit_assessment(uuid,integer) OWNER TO wb_score_gateway;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_score_gateway;
REVOKE ALL ON FUNCTION wb_guard.submit_assessment(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.submit_assessment(uuid,integer) TO website_runtime;


-- Adapted from docs/sql/stage3e1c/02-projections.sql; source checksum is in manifest.json.
-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.

CREATE ROLE wb_display_projection NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT wb_display_projection TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;
GRANT USAGE ON SCHEMA public,wb_guard TO wb_display_projection;
GRANT EXECUTE ON FUNCTION wb_guard.subject(),wb_guard.actor_role() TO wb_display_projection;
GRANT SELECT(id,full_name,role,is_active) ON public.users TO wb_display_projection;
GRANT SELECT(id,participant_id,psychologist_id,status) ON public.appointments TO wb_display_projection;
CREATE POLICY wb_projection_assignment ON public.appointments FOR SELECT TO wb_display_projection USING(
 (participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') OR (psychologist_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'));
CREATE POLICY wb_projection_users ON public.users FOR SELECT TO wb_display_projection USING(is_active AND (
 (role='PSYCHOLOGIST' AND wb_guard.actor_role()='PARTICIPANT') OR
 (role='PARTICIPANT' AND wb_guard.actor_role()='PSYCHOLOGIST' AND EXISTS(SELECT 1 FROM public.appointments a WHERE a.participant_id=users.id AND a.psychologist_id=wb_guard.subject()))));
CREATE FUNCTION wb_guard.psychologist_display(psychologist_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF wb_guard.actor_role() IS DISTINCT FROM 'PARTICIPANT' THEN RAISE EXCEPTION 'Participant required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('id',id,'fullName',full_name,'active',is_active) INTO result FROM public.users WHERE id=psychologist_id AND role='PSYCHOLOGIST' AND is_active;
 RETURN result;
END $$;
CREATE FUNCTION wb_guard.assignment_display(appointment_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE actor uuid:=wb_guard.subject(); actor_role text:=wb_guard.actor_role(); result jsonb;
BEGIN
 IF actor_role NOT IN ('PARTICIPANT','PSYCHOLOGIST') OR actor_role IS NULL THEN RAISE EXCEPTION 'Assigned actor required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('appointmentId',a.id,'status',a.status,'counterpart',jsonb_build_object('id',u.id,'fullName',u.full_name,'active',u.is_active)) INTO result
 FROM public.appointments a JOIN public.users u ON u.id=CASE WHEN actor_role='PARTICIPANT' THEN a.psychologist_id ELSE a.participant_id END
 WHERE a.id=appointment_id AND ((actor_role='PARTICIPANT' AND a.participant_id=actor) OR (actor_role='PSYCHOLOGIST' AND a.psychologist_id=actor)) AND u.is_active;
 RETURN result;
END $$;
GRANT CREATE ON SCHEMA wb_guard TO wb_display_projection;
ALTER FUNCTION wb_guard.psychologist_display(uuid) OWNER TO wb_display_projection;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_display_projection;
GRANT CREATE ON SCHEMA wb_guard TO wb_display_projection;
ALTER FUNCTION wb_guard.assignment_display(uuid) OWNER TO wb_display_projection;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_display_projection;
REVOKE ALL ON FUNCTION wb_guard.psychologist_display(uuid),wb_guard.assignment_display(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.psychologist_display(uuid),wb_guard.assignment_display(uuid) TO website_runtime;


-- Adapted from docs/sql/stage3e1c/03-report-boundary.sql; source checksum is in manifest.json.
-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.

-- Explicit non-operational contract: no worker/attestation authority provisioned yet.
-- No success path, no fake artifact verification, no grant to website_runtime.
CREATE FUNCTION wb_guard.finalize_report(report_id uuid,object_key text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN RAISE EXCEPTION 'STORAGE_ATTESTATION_UNAVAILABLE' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION wb_guard.finalize_report(uuid,text) FROM PUBLIC,website_runtime;


-- Adapted from docs/sql/phase4-sprint3/00-booking-consent-base.sql; source checksum is in manifest.json.
-- Reviewed reuse of Stage D booking/consent only. No lifecycle/chat gateway installation.
-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.

CREATE ROLE wb_booking NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT wb_booking TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;
CREATE ROLE wb_consent NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT wb_consent TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;
GRANT USAGE ON SCHEMA public,wb_guard TO wb_booking,wb_consent;
GRANT EXECUTE ON FUNCTION wb_guard.subject(),wb_guard.actor_role(),wb_guard.purpose() TO wb_booking,wb_consent;
GRANT SELECT(id,role,is_active),UPDATE(id) ON public.users TO wb_booking,wb_consent;
GRANT SELECT,UPDATE(id) ON public.appointments,public.consultation_sessions TO wb_booking,wb_consent;
GRANT SELECT(participant_id,target_user_id) ON public.consents TO wb_booking,wb_consent;
CREATE POLICY wb_d_appointments ON public.appointments FOR ALL TO wb_booking,wb_consent
USING((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') OR (psychologist_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'))
WITH CHECK((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') OR (psychologist_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'));
CREATE POLICY wb_d_sessions ON public.consultation_sessions FOR ALL TO wb_booking,wb_consent
USING(EXISTS(SELECT 1 FROM public.appointments a WHERE a.id=appointment_id)) WITH CHECK(EXISTS(SELECT 1 FROM public.appointments a WHERE a.id=appointment_id));
CREATE POLICY wb_d_consents ON public.consents FOR ALL TO wb_booking,wb_consent
USING((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') OR (target_user_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'))
WITH CHECK((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') OR (target_user_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'));
CREATE POLICY wb_d_users_read ON public.users FOR SELECT TO wb_booking,wb_consent USING(
 id=wb_guard.subject() OR (role='PSYCHOLOGIST' AND wb_guard.actor_role()='PARTICIPANT') OR
 (role='PARTICIPANT' AND wb_guard.actor_role()='PSYCHOLOGIST' AND
 (EXISTS(SELECT 1 FROM public.appointments a WHERE a.participant_id=users.id AND a.psychologist_id=wb_guard.subject()) OR EXISTS(SELECT 1 FROM public.consents c WHERE c.participant_id=users.id AND c.target_user_id=wb_guard.subject()))));
CREATE POLICY wb_d_users_lock ON public.users FOR UPDATE TO wb_booking,wb_consent USING(is_active) WITH CHECK(false);
GRANT SELECT ON public.assessment_sessions,public.reports TO wb_booking,wb_consent;
-- These gateways only need score existence/association, never clinical totals.
GRANT SELECT(id,assessment_session_id) ON public.assessment_scores TO wb_booking,wb_consent;
CREATE POLICY wb_d_assessments ON public.assessment_sessions FOR SELECT TO wb_booking,wb_consent USING(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_d_scores ON public.assessment_scores FOR SELECT TO wb_booking,wb_consent USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id));
CREATE POLICY wb_d_reports ON public.reports FOR SELECT TO wb_booking,wb_consent USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id));
GRANT SELECT,UPDATE(status,updated_at) ON public.psychologist_availability TO wb_booking;
CREATE POLICY wb_d_slot ON public.psychologist_availability FOR ALL TO wb_booking USING(wb_guard.actor_role()='PARTICIPANT' AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=psychologist_id AND u.role='PSYCHOLOGIST' AND u.is_active)) WITH CHECK(status='BOOKED');
GRANT INSERT ON public.appointments,public.consultation_sessions TO wb_booking;
GRANT SELECT,INSERT ON public.consents TO wb_booking,wb_consent;
GRANT SELECT,UPDATE(revoked_at,expired_at) ON public.consents TO wb_consent;
GRANT INSERT ON public.consent_audit_events TO wb_booking,wb_consent;
CREATE POLICY wb_d_audit ON public.consent_audit_events FOR INSERT TO wb_booking,wb_consent WITH CHECK(EXISTS(SELECT 1 FROM public.consents c WHERE c.id=consent_id));
-- Retrieval must use gateway DTO + both-active/window checks, not broad raw message reads.
REVOKE UPDATE,DELETE ON public.appointments,public.consultation_sessions,public.consents,public.consent_audit_events FROM website_runtime;
REVOKE UPDATE(revoked_at,expired_at) ON public.consents FROM website_runtime;
CREATE FUNCTION wb_guard.d_actor() RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE id uuid:=wb_guard.subject();
BEGIN
 IF current_database()<>'postgres' OR wb_guard.actor_role() IS NULL OR wb_guard.actor_role() NOT IN ('PARTICIPANT','PSYCHOLOGIST') OR wb_guard.purpose() IS DISTINCT FROM 'interactive'
 THEN RAISE EXCEPTION 'Gateway forbidden' USING ERRCODE='42501'; END IF;
 RETURN id;
END $$;
CREATE FUNCTION wb_guard.d_lock_pair(participant uuid,psychologist uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
BEGIN
 PERFORM wb_guard.d_actor();
 PERFORM id FROM public.users WHERE id IN (participant,psychologist) ORDER BY id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=participant AND role='PARTICIPANT' AND is_active)
 OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=psychologist AND role='PSYCHOLOGIST' AND is_active)
 THEN RAISE EXCEPTION 'Inactive or invalid parties' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION wb_guard.d_lock_appointment(target uuid) RETURNS public.appointments LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE a public.appointments;
BEGIN
 PERFORM wb_guard.d_actor();
 SELECT * INTO a FROM public.appointments WHERE id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'Appointment unavailable' USING ERRCODE='42501'; END IF;
 PERFORM wb_guard.d_lock_pair(a.participant_id,a.psychologist_id);
 SELECT * INTO a FROM public.appointments WHERE id=target FOR UPDATE;
 PERFORM id FROM public.consultation_sessions WHERE appointment_id=target FOR UPDATE;
 RETURN a;
END $$;
REVOKE ALL ON FUNCTION wb_guard.d_actor(),wb_guard.d_lock_pair(uuid,uuid),wb_guard.d_lock_appointment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.d_actor(),wb_guard.d_lock_pair(uuid,uuid),wb_guard.d_lock_appointment(uuid) TO wb_booking,wb_consent;

-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.

CREATE FUNCTION wb_guard.d_new_consent(participant uuid,assessment uuid,report uuid,psychologist uuid,appointment uuid,deadline timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE result uuid:=gen_random_uuid(); t timestamptz:=clock_timestamp();
BEGIN
 IF wb_guard.d_actor()<>participant OR wb_guard.actor_role()<>'PARTICIPANT' THEN RAISE EXCEPTION 'Consent owner required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.consents(id,participant_id,assessment_session_id,report_id,target_user_id,appointment_id,consent_type,purpose,scope,policy_version,granted_at,expires_at)
 VALUES(result,participant,assessment,report,psychologist,appointment,
 CASE WHEN appointment IS NULL THEN 'STANDALONE_REPORT_ACCESS' ELSE 'APPOINTMENT_REPORT_ACCESS' END::public."ConsentType",
 CASE WHEN appointment IS NULL THEN 'Share the selected assessment report with the selected psychologist independently of an appointment.' ELSE 'Share the selected assessment report with the assigned psychologist for this consultation.' END,
 jsonb_build_object('participantId',participant,'reportId',report,'psychologistId',psychologist,'appointmentId',appointment),'report-sharing-v1',t,deadline);
 INSERT INTO public.consent_audit_events(id,consent_id,actor_type,actor_user_id,action,occurred_at) VALUES(gen_random_uuid(),result,'USER',participant,'GRANTED',t);
 RETURN result;
END $$;
CREATE FUNCTION wb_guard.d_expire(target uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE a public.appointments; s public.consultation_sessions; c public.consents; boundary record; n integer:=0; now_at timestamptz;
BEGIN
 PERFORM wb_guard.d_actor();
 SELECT * INTO a FROM public.appointments WHERE id=target;
 SELECT * INTO s FROM public.consultation_sessions WHERE appointment_id=target;
 IF a.id IS NULL OR s.id IS NULL THEN RAISE EXCEPTION 'Appointment unavailable' USING ERRCODE='42501'; END IF;
 FOR c IN SELECT * FROM public.consents WHERE appointment_id=target AND consent_type='APPOINTMENT_REPORT_ACCESS' AND revoked_at IS NULL AND expired_at IS NULL ORDER BY id FOR UPDATE LOOP
  now_at:=date_trunc('milliseconds',clock_timestamp());
  SELECT * INTO boundary FROM (VALUES
   (c.expires_at,false,1),(a.scheduled_end_at,false,2),(a.cancelled_at,false,3),
   (a.completed_at,s.ended_by='PSYCHOLOGIST',4),
   (CASE WHEN a.status='CANCELLED' AND a.cancelled_at IS NULL THEN a.updated_at END,false,5),
   (CASE WHEN a.status='COMPLETED' AND a.completed_at IS NULL THEN a.updated_at END,s.ended_by='PSYCHOLOGIST',6),
   (CASE WHEN a.status='RESCHEDULED' THEN a.updated_at END,false,7),
   (CASE WHEN a.status='NO_SHOW' THEN coalesce(s.ended_at,s.updated_at,a.updated_at) END,s.ended_by='PSYCHOLOGIST',8),
   (s.ended_at,s.ended_by='PSYCHOLOGIST',9),
   (CASE WHEN s.ended_at IS NULL AND s.status IN ('COMPLETED','CLOSED','NO_SHOW') THEN coalesce(s.updated_at,a.updated_at) END,s.ended_by='PSYCHOLOGIST',10)
  ) AS v(at,by_psychologist,priority) WHERE at>=c.granted_at AND at<=now_at ORDER BY at,priority LIMIT 1;
  IF FOUND THEN
   UPDATE public.consents SET expired_at=boundary.at WHERE id=c.id;
   INSERT INTO public.consent_audit_events(id,consent_id,actor_type,actor_user_id,action,occurred_at)
   VALUES(gen_random_uuid(),c.id,CASE WHEN boundary.by_psychologist THEN 'USER' ELSE 'SYSTEM' END::public."ConsentAuditActorType",CASE WHEN boundary.by_psychologist THEN a.psychologist_id END,'EXPIRED',now_at);
   n:=n+1;
  END IF;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION wb_guard.d_new_consent(uuid,uuid,uuid,uuid,uuid,timestamptz),wb_guard.d_expire(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.d_new_consent(uuid,uuid,uuid,uuid,uuid,timestamptz) TO wb_booking,wb_consent;
GRANT EXECUTE ON FUNCTION wb_guard.d_expire(uuid) TO wb_consent;
CREATE FUNCTION wb_guard.grant_consent(report_id uuid,psychologist_id uuid,appointment_id uuid,affirmative boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE actor uuid:=wb_guard.d_actor(); r public.reports; a public.appointments; s public.consultation_sessions;
BEGIN
 IF wb_guard.actor_role()<>'PARTICIPANT' OR affirmative IS DISTINCT FROM true THEN RAISE EXCEPTION 'Affirmative participant consent required' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.users WHERE id=actor FOR UPDATE;
 PERFORM wb_guard.d_lock_pair(actor,psychologist_id);
 SELECT * INTO r FROM public.reports WHERE id=report_id;
 IF r.id IS NULL OR r.status<>'GENERATED' OR nullif(btrim(r.file_path_or_object_key),'') IS NULL OR r.generated_at IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.assessment_sessions x JOIN public.assessment_scores sc ON sc.assessment_session_id=x.id WHERE x.id=r.assessment_session_id AND x.participant_id=actor AND x.status='COMPLETED') THEN RAISE EXCEPTION 'Generated own report required' USING ERRCODE='42501'; END IF;
 IF appointment_id IS NOT NULL THEN
  a:=wb_guard.d_lock_appointment(appointment_id);
  SELECT * INTO s FROM public.consultation_sessions WHERE consultation_sessions.appointment_id=a.id;
  PERFORM wb_guard.d_expire(a.id);
  IF a.participant_id<>actor OR a.report_id<>r.id OR a.psychologist_id<>psychologist_id OR a.status NOT IN ('CONFIRMED','IN_PROGRESS') OR s.id IS NULL OR s.ended_at IS NOT NULL OR clock_timestamp()>=a.scheduled_end_at THEN RAISE EXCEPTION 'Appointment consent unavailable'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.consents c WHERE c.participant_id=actor AND c.report_id=r.id AND c.target_user_id=psychologist_id AND c.appointment_id IS NOT DISTINCT FROM grant_consent.appointment_id AND c.revoked_at IS NULL AND c.expired_at IS NULL) THEN RAISE EXCEPTION 'CONSENT_ALREADY_ACTIVE' USING ERRCODE='23505'; END IF;
 RETURN wb_guard.d_new_consent(actor,r.assessment_session_id,r.id,psychologist_id,appointment_id,CASE WHEN appointment_id IS NOT NULL THEN a.scheduled_end_at END);
END $$;
CREATE FUNCTION wb_guard.expire_consents(appointment_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
BEGIN
 PERFORM wb_guard.d_lock_appointment(appointment_id);
 RETURN wb_guard.d_expire(appointment_id);
END $$;
CREATE FUNCTION wb_guard.revoke_consent(consent_id uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE actor uuid:=wb_guard.d_actor(); c public.consents; t timestamptz;
BEGIN
 IF wb_guard.actor_role()<>'PARTICIPANT' THEN RAISE EXCEPTION 'Participant required' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.users WHERE id=actor FOR SHARE; PERFORM wb_guard.d_actor();
 SELECT * INTO c FROM public.consents WHERE id=consent_id AND participant_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Consent unavailable' USING ERRCODE='42501'; END IF;
 IF c.appointment_id IS NOT NULL THEN PERFORM wb_guard.d_lock_appointment(c.appointment_id); PERFORM wb_guard.d_expire(c.appointment_id); END IF;
 SELECT * INTO c FROM public.consents WHERE id=consent_id FOR UPDATE;
 IF c.revoked_at IS NOT NULL THEN RETURN c.revoked_at; END IF;
 t:=date_trunc('milliseconds',clock_timestamp());
 UPDATE public.consents SET revoked_at=t WHERE id=c.id;
 INSERT INTO public.consent_audit_events(id,consent_id,actor_type,actor_user_id,action,occurred_at) VALUES(gen_random_uuid(),c.id,'USER',actor,'REVOKED',t);
 RETURN t;
END $$;
-- Authorization proof returns only grant/report identifiers, not private artifact bytes/keys.
CREATE FUNCTION wb_guard.report_access(report_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE actor uuid:=wb_guard.d_actor(); c public.consents; a public.appointments; s public.consultation_sessions; target uuid;
BEGIN
 IF wb_guard.actor_role()<>'PSYCHOLOGIST' THEN RAISE EXCEPTION 'Assigned psychologist required' USING ERRCODE='42501'; END IF;
 FOR target IN SELECT DISTINCT appointment_id FROM public.consents WHERE consents.report_id=report_access.report_id AND target_user_id=actor AND revoked_at IS NULL AND expired_at IS NULL AND appointment_id IS NOT NULL ORDER BY appointment_id LOOP
  PERFORM wb_guard.d_lock_appointment(target); PERFORM wb_guard.d_expire(target);
 END LOOP;
 FOR c IN SELECT * FROM public.consents WHERE consents.report_id=report_access.report_id AND target_user_id=actor AND revoked_at IS NULL AND expired_at IS NULL ORDER BY id FOR UPDATE LOOP
  PERFORM wb_guard.d_lock_pair(c.participant_id,c.target_user_id);
  IF c.appointment_id IS NOT NULL THEN
   SELECT * INTO a FROM public.appointments WHERE id=c.appointment_id;
   SELECT * INTO s FROM public.consultation_sessions WHERE appointment_id=c.appointment_id;
   IF a.status NOT IN ('CONFIRMED','IN_PROGRESS') OR s.id IS NULL OR s.ended_at IS NOT NULL OR s.status IN ('COMPLETED','CLOSED','NO_SHOW') OR clock_timestamp()>=least(c.expires_at,a.scheduled_end_at) THEN CONTINUE; END IF;
  END IF;
  INSERT INTO public.consent_audit_events(id,consent_id,actor_type,actor_user_id,action) VALUES(gen_random_uuid(),c.id,'USER',actor,'ACCESSED');
  RETURN c.id;
 END LOOP;
 RETURN NULL;
END $$;
GRANT CREATE ON SCHEMA wb_guard TO wb_consent;
ALTER FUNCTION wb_guard.grant_consent(uuid,uuid,uuid,boolean) OWNER TO wb_consent;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_consent;
REVOKE ALL ON FUNCTION wb_guard.grant_consent(uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.grant_consent(uuid,uuid,uuid,boolean) TO website_runtime;
GRANT CREATE ON SCHEMA wb_guard TO wb_consent;
ALTER FUNCTION wb_guard.expire_consents(uuid) OWNER TO wb_consent;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_consent;
REVOKE ALL ON FUNCTION wb_guard.expire_consents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.expire_consents(uuid) TO website_runtime;
GRANT CREATE ON SCHEMA wb_guard TO wb_consent;
ALTER FUNCTION wb_guard.revoke_consent(uuid) OWNER TO wb_consent;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_consent;
REVOKE ALL ON FUNCTION wb_guard.revoke_consent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.revoke_consent(uuid) TO website_runtime;
GRANT CREATE ON SCHEMA wb_guard TO wb_consent;
ALTER FUNCTION wb_guard.report_access(uuid) OWNER TO wb_consent;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_consent;
REVOKE ALL ON FUNCTION wb_guard.report_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.report_access(uuid) TO website_runtime;


-- Adapted from docs/sql/phase4-sprint2/00-close-interactive-finalizer.sql; source checksum is in manifest.json.
-- Local repair only. Preserve the historical migrations and Stage C/F source files.

REVOKE ALL ON FUNCTION wb_guard.finalize_report(uuid,text) FROM PUBLIC,website_runtime,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION wb_guard.finalize_report(report_id uuid,object_key text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN RAISE EXCEPTION 'STORAGE_ATTESTATION_UNAVAILABLE' USING ERRCODE='42501'; END $$;


-- Adapted from docs/sql/phase4-sprint2/01-authorities.sql; source checksum is in manifest.json.
-- Sprint 2 reviewed local adaptation of the preserved Stage F draft. Not a hosted migration.
-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.

CREATE ROLE wb_pdf_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE wb_pdf_reader NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT wb_pdf_reader TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;
CREATE ROLE wb_pdf_finalizer NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT wb_pdf_finalizer TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;
CREATE ROLE wb_pdf_access NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT wb_pdf_access TO CURRENT_USER WITH INHERIT TRUE, SET TRUE;
CREATE SCHEMA wb_pdf;
REVOKE ALL ON SCHEMA wb_pdf FROM PUBLIC;
GRANT USAGE ON SCHEMA wb_pdf TO website_runtime,wb_pdf_worker,wb_pdf_reader,wb_pdf_finalizer,wb_pdf_access;
GRANT USAGE ON SCHEMA public,wb_guard TO wb_pdf_reader,wb_pdf_finalizer,wb_pdf_access;
GRANT USAGE ON SCHEMA wb_crypto TO wb_pdf_finalizer;
CREATE TABLE wb_pdf.keys(kid text PRIMARY KEY,secret bytea NOT NULL,active boolean NOT NULL DEFAULT true);
INSERT INTO wb_pdf.keys VALUES('hosted-v1',wb_crypto.gen_random_bytes(32),true);
CREATE TABLE wb_pdf.jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid NOT NULL REFERENCES public.reports(id),requested_by uuid NOT NULL REFERENCES public.users(id),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes');
CREATE TABLE wb_pdf.artifacts(report_id uuid PRIMARY KEY REFERENCES public.reports(id),session_id uuid NOT NULL,bucket text NOT NULL CHECK(bucket='assessment-reports'),object_key text NOT NULL,digest text NOT NULL CHECK(digest ~ '^[a-f0-9]{64}$'),size integer NOT NULL CHECK(size BETWEEN 100 AND 5242880),nonce uuid UNIQUE NOT NULL,kid text NOT NULL,worker text NOT NULL,issued_at bigint NOT NULL,finalized_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE wb_pdf.tickets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid NOT NULL REFERENCES public.reports(id),actor_id uuid NOT NULL,expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 seconds');
REVOKE ALL ON ALL TABLES IN SCHEMA wb_pdf FROM PUBLIC,anon,authenticated,service_role,website_runtime,wb_pdf_worker;
ALTER TABLE wb_pdf.keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_pdf.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_pdf.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wb_pdf.tickets ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON wb_pdf.keys TO wb_pdf_finalizer;
CREATE POLICY key_read ON wb_pdf.keys FOR SELECT TO wb_pdf_finalizer USING(session_user='wb_pdf_worker');
GRANT SELECT,INSERT ON wb_pdf.jobs,wb_pdf.tickets TO wb_pdf_access;
GRANT SELECT ON wb_pdf.jobs,wb_pdf.tickets TO wb_pdf_reader;
GRANT SELECT ON wb_pdf.jobs TO wb_pdf_finalizer;
GRANT SELECT,INSERT ON wb_pdf.artifacts TO wb_pdf_finalizer;
GRANT SELECT ON wb_pdf.artifacts TO wb_pdf_reader,wb_pdf_access;
CREATE POLICY job_access ON wb_pdf.jobs TO wb_pdf_access USING(session_user='website_runtime') WITH CHECK(requested_by=wb_guard.subject());
CREATE POLICY job_reader ON wb_pdf.jobs FOR SELECT TO wb_pdf_reader,wb_pdf_finalizer USING(session_user='wb_pdf_worker');
CREATE POLICY ticket_access ON wb_pdf.tickets TO wb_pdf_access USING(session_user='website_runtime') WITH CHECK(actor_id=wb_guard.subject());
CREATE POLICY ticket_read ON wb_pdf.tickets FOR SELECT TO wb_pdf_reader USING(session_user='wb_pdf_worker');
CREATE POLICY artifact_write ON wb_pdf.artifacts TO wb_pdf_finalizer USING(session_user='wb_pdf_worker') WITH CHECK(session_user='wb_pdf_worker');
CREATE POLICY artifact_read ON wb_pdf.artifacts FOR SELECT TO wb_pdf_reader,wb_pdf_access USING(report_id=nullif(current_setting('wellbeing.pdf_report',true),'')::uuid);
GRANT EXECUTE ON FUNCTION wb_guard.subject(),wb_guard.actor_role(),wb_guard.purpose() TO wb_pdf_access;
GRANT SELECT ON public.reports,public.assessment_sessions,public.assessment_scores TO wb_pdf_reader,wb_pdf_finalizer,wb_pdf_access;
GRANT UPDATE(status,file_path_or_object_key,generated_at,updated_at) ON public.reports TO wb_pdf_finalizer;
GRANT SELECT(id,role,is_active),UPDATE(id) ON public.users TO wb_pdf_reader,wb_pdf_access;
GRANT SELECT(id,role,is_active) ON public.users TO wb_pdf_finalizer;
CREATE POLICY pdf_reports ON public.reports FOR SELECT TO wb_pdf_reader,wb_pdf_finalizer,wb_pdf_access USING(id=nullif(current_setting('wellbeing.pdf_report',true),'')::uuid);
CREATE POLICY pdf_sessions ON public.assessment_sessions FOR SELECT TO wb_pdf_reader,wb_pdf_finalizer,wb_pdf_access USING(EXISTS(SELECT 1 FROM public.reports r WHERE r.assessment_session_id=assessment_sessions.id));
CREATE POLICY pdf_scores ON public.assessment_scores FOR SELECT TO wb_pdf_reader,wb_pdf_finalizer,wb_pdf_access USING(EXISTS(SELECT 1 FROM public.reports r WHERE r.assessment_session_id=assessment_scores.assessment_session_id));
CREATE POLICY pdf_finalize ON public.reports FOR UPDATE TO wb_pdf_finalizer USING(id=nullif(current_setting('wellbeing.pdf_report',true),'')::uuid) WITH CHECK(status='GENERATED' AND file_path_or_object_key='reports/'||id::text||'.pdf');
CREATE POLICY pdf_users ON public.users FOR SELECT TO wb_pdf_reader,wb_pdf_access,wb_pdf_finalizer USING(id=nullif(current_setting('wellbeing.pdf_actor',true),'')::uuid OR EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.participant_id=users.id));
CREATE POLICY pdf_user_lock ON public.users FOR UPDATE TO wb_pdf_access USING(is_active AND (id=wb_guard.subject() OR EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.participant_id=users.id))) WITH CHECK(false);
GRANT SELECT,UPDATE(id) ON public.consents TO wb_pdf_access;
GRANT SELECT ON public.appointments,public.consultation_sessions TO wb_pdf_access;
GRANT INSERT ON public.consent_audit_events TO wb_pdf_access;
CREATE POLICY pdf_consents ON public.consents FOR SELECT TO wb_pdf_access USING(report_id=nullif(current_setting('wellbeing.pdf_report',true),'')::uuid AND target_user_id=wb_guard.subject());
CREATE POLICY pdf_consent_lock ON public.consents FOR UPDATE TO wb_pdf_access USING(report_id=nullif(current_setting('wellbeing.pdf_report',true),'')::uuid AND target_user_id=wb_guard.subject()) WITH CHECK(false);
CREATE POLICY pdf_appointments ON public.appointments FOR SELECT TO wb_pdf_access USING(report_id=nullif(current_setting('wellbeing.pdf_report',true),'')::uuid AND psychologist_id=wb_guard.subject());
CREATE POLICY pdf_consultations ON public.consultation_sessions FOR SELECT TO wb_pdf_access USING(EXISTS(SELECT 1 FROM public.appointments a WHERE a.id=appointment_id));
CREATE POLICY pdf_audit ON public.consent_audit_events FOR INSERT TO wb_pdf_access WITH CHECK(actor_user_id=wb_guard.subject() AND action='ACCESSED' AND EXISTS(SELECT 1 FROM public.consents c WHERE c.id=consent_id));


-- Adapted from docs/sql/phase4-sprint2/02-gateways.sql; source checksum is in manifest.json.
-- Sprint 2 reviewed local adaptation of the preserved Stage F draft. Not a hosted migration.
-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.

CREATE FUNCTION wb_pdf.render_data(target uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('reportId',r.id,'assessmentSessionId',s.id,'assessmentDate',to_char(s.completed_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'scores',jsonb_build_object('depression',jsonb_build_object('score',sc.depression_score,'category',sc.depression_category),'anxiety',jsonb_build_object('score',sc.anxiety_score,'category',sc.anxiety_category),'stress',jsonb_build_object('score',sc.stress_score,'category',sc.stress_category),'wemwbs',jsonb_build_object('score',sc.wemwbs_score))) FROM public.reports r JOIN public.assessment_sessions s ON s.id=r.assessment_session_id JOIN public.assessment_scores sc ON sc.assessment_session_id=s.id WHERE r.id=target AND s.status='COMPLETED' AND s.completed_at IS NOT NULL
$$;
CREATE FUNCTION wb_pdf.enqueue(target uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=wb_guard.subject(); job uuid;
BEGIN
 IF wb_guard.actor_role() IS DISTINCT FROM 'PARTICIPANT' OR wb_guard.purpose() IS DISTINCT FROM 'interactive' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',target::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.reports r JOIN public.assessment_sessions s ON s.id=r.assessment_session_id WHERE r.id=target AND s.participant_id=actor AND s.status='COMPLETED') OR wb_pdf.render_data(target) IS NULL THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO wb_pdf.jobs(report_id,requested_by) VALUES(target,actor) RETURNING id INTO job;
 RETURN job;
END $$;
CREATE FUNCTION wb_pdf.worker_input(job_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE j wb_pdf.jobs; result jsonb;
BEGIN
 IF session_user<>'wb_pdf_worker' THEN RAISE EXCEPTION 'Worker required' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM wb_pdf.jobs WHERE id=job_id AND expires_at>clock_timestamp();
 IF j.id IS NULL THEN RAISE EXCEPTION 'Job unavailable' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',j.report_id::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=j.requested_by AND is_active AND role='PARTICIPANT') THEN RAISE EXCEPTION 'Inactive owner' USING ERRCODE='42501'; END IF;
 result:=wb_pdf.render_data(j.report_id);
 IF result IS NULL THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION wb_pdf.authorize(target uuid,appointment_scope uuid DEFAULT NULL,record_access boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=wb_guard.subject(); role_name text:=wb_guard.actor_role(); r public.reports; s public.assessment_sessions; c public.consents; allowed boolean:=false; ticket uuid; meta wb_pdf.artifacts;
BEGIN
 IF role_name NOT IN ('PARTICIPANT','PSYCHOLOGIST') OR role_name IS NULL OR wb_guard.purpose() IS DISTINCT FROM 'interactive' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',target::text,true); PERFORM set_config('wellbeing.pdf_actor',actor::text,true);
 SELECT * INTO r FROM public.reports WHERE id=target;
 SELECT * INTO s FROM public.assessment_sessions WHERE id=r.assessment_session_id;
 IF s.id IS NULL OR s.status<>'COMPLETED' OR wb_pdf.render_data(target) IS NULL THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.users WHERE id IN(actor,s.participant_id) ORDER BY id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=s.participant_id AND is_active AND role='PARTICIPANT') OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND is_active) THEN RAISE EXCEPTION 'Inactive actor' USING ERRCODE='42501'; END IF;
 IF role_name='PARTICIPANT' THEN allowed:=s.participant_id=actor;
 ELSE
  FOR c IN SELECT * FROM public.consents WHERE report_id=target AND participant_id=s.participant_id AND target_user_id=actor AND revoked_at IS NULL AND expired_at IS NULL AND (appointment_scope IS NULL OR appointment_id=appointment_scope) ORDER BY id FOR SHARE LOOP
   IF c.assessment_session_id<>s.id OR (c.consent_type='STANDALONE_REPORT_ACCESS' AND (c.appointment_id IS NOT NULL OR c.expires_at IS NOT NULL)) OR (c.consent_type='APPOINTMENT_REPORT_ACCESS' AND (c.appointment_id IS NULL OR c.expires_at IS NULL)) THEN CONTINUE; END IF;
   IF c.expires_at IS NOT NULL AND c.expires_at<=clock_timestamp() THEN CONTINUE; END IF;
   IF c.appointment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.appointments a JOIN public.consultation_sessions cs ON cs.appointment_id=a.id WHERE a.id=c.appointment_id AND a.report_id=target AND a.assessment_session_id=s.id AND a.psychologist_id=actor AND a.participant_id=s.participant_id AND a.status IN ('CONFIRMED','IN_PROGRESS') AND a.scheduled_end_at>clock_timestamp() AND cs.status NOT IN ('COMPLETED','CLOSED','NO_SHOW') AND cs.ended_at IS NULL) THEN CONTINUE; END IF;
   allowed:=true;
   IF record_access THEN INSERT INTO public.consent_audit_events(id,consent_id,actor_type,actor_user_id,action) VALUES(gen_random_uuid(),c.id,'USER',actor,'ACCESSED'); END IF;
   EXIT;
  END LOOP;
 END IF;
 IF NOT allowed THEN RAISE EXCEPTION 'Report access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO meta FROM wb_pdf.artifacts WHERE report_id=target;
 IF r.status<>'GENERATED' OR r.generated_at IS NULL OR r.file_path_or_object_key IS DISTINCT FROM 'reports/'||target::text||'.pdf' OR meta.report_id IS NULL THEN RAISE EXCEPTION 'REPORT_NOT_GENERATED'; END IF;
 IF NOT record_access THEN INSERT INTO wb_pdf.tickets(report_id,actor_id) VALUES(target,actor) RETURNING id INTO ticket; END IF;
 RETURN jsonb_build_object('data',wb_pdf.render_data(target),'generatedAt',r.generated_at,'digest',meta.digest,'size',meta.size,'ticket',ticket);
END $$;
CREATE FUNCTION wb_pdf.download_input(ticket_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t wb_pdf.tickets; meta wb_pdf.artifacts;
BEGIN
 IF session_user<>'wb_pdf_worker' THEN RAISE EXCEPTION 'Worker required' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM wb_pdf.tickets WHERE id=ticket_id AND expires_at>clock_timestamp();
 IF t.id IS NULL THEN RAISE EXCEPTION 'Ticket unavailable' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',t.report_id::text,true);
 SELECT * INTO meta FROM wb_pdf.artifacts WHERE report_id=t.report_id;
 IF meta.report_id IS NULL THEN RAISE EXCEPTION 'Artifact unavailable'; END IF;
 RETURN jsonb_build_object('reportId',t.report_id,'digest',meta.digest,'size',meta.size);
END $$;
CREATE FUNCTION wb_pdf.finalize(payload text,signature text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p jsonb; secret_value bytea; actual bytea; supplied bytea; diff integer:=0; i integer; now_epoch bigint; target uuid; r public.reports; j wb_pdf.jobs; existing wb_pdf.artifacts;
BEGIN
 IF session_user<>'wb_pdf_worker' OR payload IS NULL OR length(payload)>4096 OR signature IS NULL OR signature !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid attestation' USING ERRCODE='42501'; END IF;
 p:=payload::jsonb; SELECT secret INTO secret_value FROM wb_pdf.keys WHERE kid=p->>'kid' AND active;
 IF secret_value IS NULL THEN RAISE EXCEPTION 'Unknown signing key' USING ERRCODE='42501'; END IF;
 actual:=wb_crypto.hmac(convert_to(payload,'UTF8'),secret_value,'sha256'); supplied:=decode(signature,'hex');
 FOR i IN 0..31 LOOP diff:=diff | (get_byte(actual,i) # get_byte(supplied,i)); END LOOP;
 now_epoch:=floor(extract(epoch FROM clock_timestamp()))::bigint;
 IF diff<>0 OR NOT(p ?& ARRAY['kid','reportId','assessmentSessionId','jobId','bucket','key','digest','size','nonce','worker','iss','aud','iat','exp','objectIdentity']) OR p->>'worker' IS DISTINCT FROM 'wb_pdf_worker' OR p->>'iss' IS DISTINCT FROM 'wellbeing-hosted-bofoowyzlnfhwcstlmgp-pdf-worker' OR p->>'aud' IS DISTINCT FROM 'wellbeing-report-finalization-v1' OR p->>'bucket' IS DISTINCT FROM 'assessment-reports' OR p->>'digest' IS NULL OR p->>'digest' !~ '^[a-f0-9]{64}$' OR (p->>'iat')::bigint>now_epoch OR (p->>'exp')::bigint<=now_epoch OR (p->>'exp')::bigint-(p->>'iat')::bigint NOT BETWEEN 1 AND 60 OR (p->>'size')::integer NOT BETWEEN 100 AND 5242880 THEN RAISE EXCEPTION 'Invalid attestation' USING ERRCODE='42501'; END IF;
 IF p->>'iat' IS NULL OR p->>'exp' IS NULL OR p->>'size' IS NULL OR p->>'nonce' IS NULL THEN RAISE EXCEPTION 'Invalid attestation' USING ERRCODE='42501'; END IF;
 target:=(p->>'reportId')::uuid;
 IF p->>'key' IS DISTINCT FROM 'reports/'||target::text||'.pdf' THEN RAISE EXCEPTION 'Invalid artifact key' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM wb_pdf.jobs WHERE id=(p->>'jobId')::uuid AND report_id=target AND expires_at>clock_timestamp();
 IF j.id IS NULL THEN RAISE EXCEPTION 'Invalid job' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',target::text,true);
 SELECT * INTO r FROM public.reports WHERE id=target FOR UPDATE;
 IF r.id IS NULL OR r.assessment_session_id IS DISTINCT FROM (p->>'assessmentSessionId')::uuid OR wb_pdf.render_data(target) IS NULL OR p->>'objectIdentity' IS DISTINCT FROM p->>'digest' OR NOT EXISTS(SELECT 1 FROM public.assessment_sessions s JOIN public.users u ON u.id=s.participant_id WHERE s.id=r.assessment_session_id AND s.participant_id=j.requested_by AND u.is_active AND u.role='PARTICIPANT') THEN RAISE EXCEPTION 'Invalid association' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM wb_pdf.artifacts WHERE report_id=target;
 IF existing.report_id IS NOT NULL THEN
  IF r.status='GENERATED' AND existing.digest=p->>'digest' AND existing.size=(p->>'size')::integer AND existing.object_key=p->>'key' THEN RETURN target; END IF;
  RAISE EXCEPTION 'Conflicting attestation' USING ERRCODE='42501';
 END IF;
 IF r.status<>'PENDING' OR r.generated_at IS NOT NULL OR r.file_path_or_object_key IS NOT NULL THEN RAISE EXCEPTION 'Invalid report state' USING ERRCODE='42501'; END IF;
 INSERT INTO wb_pdf.artifacts(report_id,session_id,bucket,object_key,digest,size,nonce,kid,worker,issued_at) VALUES(target,r.assessment_session_id,p->>'bucket',p->>'key',p->>'digest',(p->>'size')::integer,(p->>'nonce')::uuid,p->>'kid',p->>'worker',(p->>'iat')::bigint);
 UPDATE public.reports SET status='GENERATED',file_path_or_object_key=p->>'key',generated_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=target;
 RETURN target;
END $$;
GRANT CREATE ON SCHEMA wb_pdf TO wb_pdf_access;
ALTER FUNCTION wb_pdf.enqueue(uuid) OWNER TO wb_pdf_access;
REVOKE CREATE ON SCHEMA wb_pdf FROM wb_pdf_access;
GRANT CREATE ON SCHEMA wb_pdf TO wb_pdf_access;
ALTER FUNCTION wb_pdf.authorize(uuid,uuid,boolean) OWNER TO wb_pdf_access;
REVOKE CREATE ON SCHEMA wb_pdf FROM wb_pdf_access;
GRANT CREATE ON SCHEMA wb_pdf TO wb_pdf_reader;
ALTER FUNCTION wb_pdf.worker_input(uuid) OWNER TO wb_pdf_reader;
REVOKE CREATE ON SCHEMA wb_pdf FROM wb_pdf_reader;
GRANT CREATE ON SCHEMA wb_pdf TO wb_pdf_reader;
ALTER FUNCTION wb_pdf.download_input(uuid) OWNER TO wb_pdf_reader;
REVOKE CREATE ON SCHEMA wb_pdf FROM wb_pdf_reader;
GRANT CREATE ON SCHEMA wb_pdf TO wb_pdf_finalizer;
ALTER FUNCTION wb_pdf.finalize(text,text) OWNER TO wb_pdf_finalizer;
REVOKE CREATE ON SCHEMA wb_pdf FROM wb_pdf_finalizer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA wb_pdf FROM PUBLIC,anon,authenticated,service_role,website_runtime,wb_pdf_worker;
GRANT EXECUTE ON FUNCTION wb_pdf.render_data(uuid) TO wb_pdf_access,wb_pdf_reader,wb_pdf_finalizer;
GRANT EXECUTE ON FUNCTION wb_pdf.enqueue(uuid),wb_pdf.authorize(uuid,uuid,boolean) TO website_runtime;
GRANT EXECUTE ON FUNCTION wb_pdf.worker_input(uuid),wb_pdf.download_input(uuid),wb_pdf.finalize(text,text) TO wb_pdf_worker;


-- Adapted from docs/sql/phase4-sprint3/01-read-projections.sql; source checksum is in manifest.json.
-- Local-only additive projections. Existing booking/consent mutations are unchanged.

-- Reuse the existing NOLOGIN, NOBYPASSRLS display role. No new user-table grant to website_runtime.
GRANT SELECT(user_type) ON public.users TO wb_display_projection;
GRANT SELECT(user_id,professional_title,qualification,education,short_bio,areas_of_focus,consultation_method,consultation_location,languages) ON public.psychologist_profiles TO wb_display_projection;
GRANT SELECT(id,psychologist_id,availability_date,session_type,status) ON public.psychologist_availability TO wb_display_projection;
GRANT SELECT(assessment_session_id,report_id,availability_id,scheduled_start_at,scheduled_end_at,booked_at,participant_note) ON public.appointments TO wb_display_projection;
GRANT SELECT(id,appointment_id,status,participant_checked_in_at,psychologist_checked_in_at,started_at,ended_at,ended_by,end_reason) ON public.consultation_sessions TO wb_display_projection;
GRANT SELECT(id,participant_id,status,completed_at) ON public.assessment_sessions TO wb_display_projection;
GRANT SELECT(assessment_session_id) ON public.assessment_scores TO wb_display_projection;
GRANT SELECT(id,assessment_session_id,status,generated_at,file_path_or_object_key) ON public.reports TO wb_display_projection;
GRANT SELECT(id,participant_id,target_user_id,report_id,assessment_session_id,appointment_id,consent_type,revoked_at,expired_at,expires_at) ON public.consents TO wb_display_projection;
GRANT USAGE ON SCHEMA wb_pdf TO wb_display_projection;
GRANT SELECT(report_id) ON wb_pdf.artifacts TO wb_display_projection;
CREATE POLICY sprint3_identity ON public.users FOR SELECT TO wb_display_projection USING(
 id=wb_guard.subject() OR EXISTS(SELECT 1 FROM public.appointments a WHERE users.id IN(a.participant_id,a.psychologist_id)));
CREATE POLICY sprint3_profiles ON public.psychologist_profiles FOR SELECT TO wb_display_projection USING(EXISTS(SELECT 1 FROM public.users u WHERE u.id=user_id AND u.role='PSYCHOLOGIST'));
CREATE POLICY sprint3_slots ON public.psychologist_availability FOR SELECT TO wb_display_projection USING(
 (status='AVAILABLE' AND wb_guard.actor_role()='PARTICIPANT' AND EXISTS(SELECT 1 FROM public.users u WHERE u.id=psychologist_id AND u.role='PSYCHOLOGIST' AND u.is_active))
 OR EXISTS(SELECT 1 FROM public.appointments a WHERE a.availability_id=psychologist_availability.id));
CREATE POLICY sprint3_sessions ON public.consultation_sessions FOR SELECT TO wb_display_projection USING(EXISTS(SELECT 1 FROM public.appointments a WHERE a.id=appointment_id));
CREATE POLICY sprint3_assessments ON public.assessment_sessions FOR SELECT TO wb_display_projection USING(EXISTS(SELECT 1 FROM public.appointments a WHERE a.assessment_session_id=assessment_sessions.id AND a.participant_id=assessment_sessions.participant_id));
CREATE POLICY sprint3_scores ON public.assessment_scores FOR SELECT TO wb_display_projection USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id));
CREATE POLICY sprint3_reports ON public.reports FOR SELECT TO wb_display_projection USING(EXISTS(SELECT 1 FROM public.appointments a WHERE a.report_id=reports.id AND a.assessment_session_id=reports.assessment_session_id));
CREATE POLICY sprint3_artifacts ON wb_pdf.artifacts FOR SELECT TO wb_display_projection USING(EXISTS(SELECT 1 FROM public.reports r WHERE r.id=report_id));
CREATE POLICY sprint3_consents ON public.consents FOR SELECT TO wb_display_projection USING(
 (participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') OR (target_user_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'));

CREATE FUNCTION wb_guard.psychologist_directory(target uuid DEFAULT NULL,focus text DEFAULT NULL,lang text DEFAULT NULL,page_number integer DEFAULT 1,page_size integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF wb_guard.actor_role() IS DISTINCT FROM 'PARTICIPANT' THEN RAISE EXCEPTION 'Participant required' USING ERRCODE='42501'; END IF;
 IF page_number<1 OR page_number>100000 OR page_size<1 OR page_size>50 THEN RAISE EXCEPTION 'Invalid pagination'; END IF;
 WITH filtered AS (SELECT u.id,u.full_name,p.professional_title,p.qualification,p.education,p.short_bio,p.areas_of_focus,p.consultation_method,p.consultation_location,p.languages FROM public.users u LEFT JOIN public.psychologist_profiles p ON p.user_id=u.id
 WHERE u.role='PSYCHOLOGIST' AND u.is_active AND (target IS NULL OR u.id=target) AND (focus IS NULL OR focus=ANY(p.areas_of_focus)) AND (lang IS NULL OR lang=ANY(p.languages))),
 items AS (SELECT * FROM filtered ORDER BY full_name,id OFFSET (page_number-1)*page_size LIMIT page_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'fullName',full_name,'professionalTitle',professional_title,'qualification',qualification,'education',education,'shortBio',short_bio,'areasOfFocus',coalesce(areas_of_focus,ARRAY[]::text[]),'consultationMethod',consultation_method,'consultationLocation',consultation_location,'languages',coalesce(languages,ARRAY[]::text[])) ORDER BY full_name,id) FROM items),'[]'::jsonb),'page',page_number,'limit',page_size,'total',(SELECT count(*) FROM filtered)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION wb_guard.public_slots(target uuid,first_date date,last_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF wb_guard.actor_role() IS DISTINCT FROM 'PARTICIPANT' THEN RAISE EXCEPTION 'Participant required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=target AND role='PSYCHOLOGIST' AND is_active) THEN RETURN NULL; END IF;
 IF first_date IS NULL OR last_date IS NULL OR last_date<first_date OR last_date-first_date>31 THEN RAISE EXCEPTION 'Invalid range'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'date',availability_date,'sessionType',session_type,'status',status) ORDER BY availability_date,session_type),'[]'::jsonb) INTO result
 FROM public.psychologist_availability WHERE psychologist_id=target AND status='AVAILABLE' AND availability_date BETWEEN first_date AND last_date
 AND ((availability_date+CASE session_type WHEN 'MORNING' THEN time '09:00' WHEN 'AFTERNOON' THEN time '13:00' WHEN 'EVENING' THEN time '16:00' END) AT TIME ZONE 'Asia/Jakarta')>clock_timestamp();
 RETURN result;
END $$;
CREATE FUNCTION wb_guard.appointment_views(target uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb; role_name text:=wb_guard.actor_role();
BEGIN
 IF role_name IS NULL OR role_name NOT IN('PARTICIPANT','PSYCHOLOGIST') THEN RAISE EXCEPTION 'Party required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'appointmentId',a.id,'status',a.status,'scheduledStartAt',to_char(a.scheduled_start_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'scheduledEndAt',to_char(a.scheduled_end_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'bookedAt',to_char(a.booked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'participantNote',a.participant_note,'participant',jsonb_build_object('fullName',p.full_name,'userType',p.user_type),
 'psychologist',jsonb_build_object('id',q.id,'fullName',q.full_name),'consultationMethod',pr.consultation_method,'sessionType',v.session_type,
 'assessmentDate',CASE WHEN g.id IS NOT NULL THEN to_char(s.completed_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
 'consultationSession',CASE WHEN cs.id IS NULL THEN NULL ELSE jsonb_build_object('id',cs.id,'status',cs.status,'participantCheckedInAt',to_char(cs.participant_checked_in_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'psychologistCheckedInAt',to_char(cs.psychologist_checked_in_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'startedAt',to_char(cs.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'endedAt',to_char(cs.ended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'endedBy',cs.ended_by,'endReason',cs.end_reason) END,
 'canReconsent',a.status IN('CONFIRMED','IN_PROGRESS') AND cs.id IS NOT NULL AND cs.ended_at IS NULL AND cs.status NOT IN('COMPLETED','CLOSED','NO_SHOW') AND clock_timestamp()<a.scheduled_end_at,
 'reportAccess',CASE WHEN g.id IS NULL THEN jsonb_build_object('status',CASE WHEN EXISTS(SELECT 1 FROM public.consents c WHERE c.appointment_id=a.id AND c.target_user_id=a.psychologist_id AND c.revoked_at IS NULL AND (c.expired_at IS NOT NULL OR c.expires_at<=clock_timestamp() OR a.scheduled_end_at<=clock_timestamp())) THEN 'CONSENT_EXPIRED' ELSE 'CONSENT_UNAVAILABLE' END)
 WHEN NOT(p.is_active AND q.is_active AND s.status='COMPLETED' AND s.completed_at IS NOT NULL AND EXISTS(SELECT 1 FROM public.assessment_scores sc WHERE sc.assessment_session_id=s.id) AND r.status='GENERATED' AND r.generated_at IS NOT NULL AND r.file_path_or_object_key='reports/'||r.id::text||'.pdf' AND EXISTS(SELECT 1 FROM wb_pdf.artifacts ar WHERE ar.report_id=r.id)) THEN jsonb_build_object('status','REPORT_UNAVAILABLE')
 ELSE jsonb_build_object('status','AVAILABLE','reportId',r.id,'consentType',g.consent_type) END
 ) || CASE WHEN role_name='PARTICIPANT' THEN jsonb_build_object('reportId',a.report_id,'assessmentSessionId',a.assessment_session_id) ELSE '{}'::jsonb END ORDER BY a.scheduled_start_at,a.id),'[]'::jsonb) INTO result
 FROM public.appointments a JOIN public.users p ON p.id=a.participant_id JOIN public.users q ON q.id=a.psychologist_id
 LEFT JOIN public.psychologist_profiles pr ON pr.user_id=q.id
 JOIN public.psychologist_availability v ON v.id=a.availability_id
 LEFT JOIN public.consultation_sessions cs ON cs.appointment_id=a.id
 LEFT JOIN public.assessment_sessions s ON s.id=a.assessment_session_id AND s.participant_id=a.participant_id
 LEFT JOIN public.reports r ON r.id=a.report_id AND r.assessment_session_id=s.id
 LEFT JOIN LATERAL (SELECT c.id,c.consent_type FROM public.consents c WHERE c.participant_id=a.participant_id AND c.target_user_id=a.psychologist_id AND c.report_id=a.report_id AND c.assessment_session_id=a.assessment_session_id AND c.revoked_at IS NULL AND c.expired_at IS NULL
 AND ((c.consent_type='STANDALONE_REPORT_ACCESS' AND c.appointment_id IS NULL AND c.expires_at IS NULL)
 OR (c.consent_type='APPOINTMENT_REPORT_ACCESS' AND c.appointment_id=a.id AND c.expires_at>clock_timestamp() AND a.status IN('CONFIRMED','IN_PROGRESS') AND a.scheduled_end_at>clock_timestamp() AND cs.id IS NOT NULL AND cs.ended_at IS NULL AND cs.status NOT IN('COMPLETED','CLOSED','NO_SHOW')))
 ORDER BY CASE WHEN c.consent_type='APPOINTMENT_REPORT_ACCESS' THEN 0 ELSE 1 END,c.id LIMIT 1) g ON true
 WHERE target IS NULL OR a.id=target;
 RETURN result;
END $$;
GRANT CREATE ON SCHEMA wb_guard TO wb_display_projection;
ALTER FUNCTION wb_guard.psychologist_directory(uuid,text,text,integer,integer) OWNER TO wb_display_projection;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_display_projection;
GRANT CREATE ON SCHEMA wb_guard TO wb_display_projection;
ALTER FUNCTION wb_guard.public_slots(uuid,date,date) OWNER TO wb_display_projection;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_display_projection;
GRANT CREATE ON SCHEMA wb_guard TO wb_display_projection;
ALTER FUNCTION wb_guard.appointment_views(uuid) OWNER TO wb_display_projection;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_display_projection;
REVOKE ALL ON FUNCTION wb_guard.psychologist_directory(uuid,text,text,integer,integer),wb_guard.public_slots(uuid,date,date),wb_guard.appointment_views(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION wb_guard.psychologist_directory(uuid,text,text,integer,integer),wb_guard.public_slots(uuid,date,date),wb_guard.appointment_views(uuid) TO website_runtime;


-- Adapted from docs/sql/phase4-sprint3/02-booking-artifact.sql; source checksum is in manifest.json.
-- Local integration: require Sprint 2 attestation in the existing atomic booking gateway.

CREATE FUNCTION wb_guard.booking_report_ready(target uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF wb_guard.actor_role() IS DISTINCT FROM 'PARTICIPANT' THEN RAISE EXCEPTION 'Participant required' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',target::text,true);
 RETURN EXISTS(SELECT 1 FROM public.reports r JOIN public.assessment_sessions s ON s.id=r.assessment_session_id JOIN wb_pdf.artifacts ar ON ar.report_id=r.id WHERE r.id=target AND s.participant_id=wb_guard.subject() AND s.status='COMPLETED' AND r.status='GENERATED' AND r.generated_at IS NOT NULL AND r.file_path_or_object_key='reports/'||r.id::text||'.pdf');
END $$;
GRANT CREATE ON SCHEMA wb_guard TO wb_pdf_access;
ALTER FUNCTION wb_guard.booking_report_ready(uuid) OWNER TO wb_pdf_access;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_pdf_access;
REVOKE ALL ON FUNCTION wb_guard.booking_report_ready(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION wb_guard.booking_report_ready(uuid) TO website_runtime,wb_booking;
CREATE OR REPLACE FUNCTION wb_guard.book_appointment(psychologist_id uuid,assessment_id uuid,report_id uuid,slot_id uuid,affirmative boolean,note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE actor uuid:=wb_guard.d_actor(); latest public.assessment_sessions; r public.reports; slot public.psychologist_availability;
 start_at timestamptz; end_at timestamptz; now_at timestamptz; appointment uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); consent uuid;
BEGIN
 IF wb_guard.actor_role()<>'PARTICIPANT' OR affirmative IS DISTINCT FROM true THEN RAISE EXCEPTION 'Explicit participant consent required' USING ERRCODE='42501'; END IF;
 IF char_length(note)>500 THEN RAISE EXCEPTION 'Invalid note' USING ERRCODE='22023'; END IF;
 PERFORM id FROM public.users WHERE id=actor FOR UPDATE;
 PERFORM wb_guard.d_lock_pair(actor,psychologist_id);
 SELECT * INTO latest FROM public.assessment_sessions WHERE participant_id=actor AND status='COMPLETED' ORDER BY completed_at DESC,id DESC LIMIT 1;
 SELECT * INTO r FROM public.reports WHERE id=report_id AND assessment_session_id=latest.id;
 IF latest.id IS NULL OR latest.id IS DISTINCT FROM assessment_id OR latest.completed_at IS NULL OR r.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.assessment_scores WHERE assessment_session_id=latest.id) THEN RAISE EXCEPTION 'ASSESSMENT_REPORT_NOT_LATEST' USING ERRCODE='42501'; END IF;
 IF r.status<>'GENERATED' OR r.generated_at IS NULL OR nullif(btrim(r.file_path_or_object_key),'') IS NULL THEN RAISE EXCEPTION 'REPORT_NOT_GENERATED'; END IF;
 IF NOT wb_guard.booking_report_ready(report_id) THEN RAISE EXCEPTION 'REPORT_NOT_GENERATED'; END IF;
 SELECT * INTO slot FROM public.psychologist_availability WHERE id=slot_id FOR UPDATE;
 IF slot.id IS NULL OR slot.psychologist_id IS DISTINCT FROM psychologist_id OR slot.status<>'AVAILABLE' THEN RAISE EXCEPTION 'SLOT_NOT_AVAILABLE'; END IF;
 start_at:=(slot.availability_date+CASE slot.session_type WHEN 'MORNING' THEN time '09:00' WHEN 'AFTERNOON' THEN time '13:00' WHEN 'EVENING' THEN time '16:00' END) AT TIME ZONE 'Asia/Jakarta';
 end_at:=start_at+interval '2 hours'; now_at:=clock_timestamp();
 IF start_at IS NULL OR start_at<=now_at THEN RAISE EXCEPTION 'SLOT_START_PASSED'; END IF;
 UPDATE public.psychologist_availability SET status='BOOKED',updated_at=now_at WHERE id=slot.id;
 INSERT INTO public.appointments(id,participant_id,psychologist_id,assessment_session_id,report_id,availability_id,participant_note,status,scheduled_start_at,scheduled_end_at,booked_at,updated_at)
 VALUES(appointment,actor,psychologist_id,latest.id,r.id,slot.id,nullif(note,''),'CONFIRMED',start_at,end_at,now_at,now_at);
 INSERT INTO public.consultation_sessions(id,appointment_id,status,scheduled_start_at,scheduled_end_at,updated_at) VALUES(session,appointment,'SCHEDULED',start_at,end_at,now_at);
 consent:=wb_guard.d_new_consent(actor,latest.id,r.id,psychologist_id,appointment,end_at);
 RETURN jsonb_build_object('appointmentId',appointment,'consultationSessionId',session,'consentId',consent,'status','CONFIRMED','scheduledStartAt',start_at,'scheduledEndAt',end_at);
END $$;
GRANT CREATE ON SCHEMA wb_guard TO wb_booking;
ALTER FUNCTION wb_guard.book_appointment(uuid,uuid,uuid,uuid,boolean,text) OWNER TO wb_booking;
REVOKE CREATE ON SCHEMA wb_guard FROM wb_booking;
REVOKE ALL ON FUNCTION wb_guard.book_appointment(uuid,uuid,uuid,uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.book_appointment(uuid,uuid,uuid,uuid,boolean,text) TO website_runtime;


-- Adapted from docs/sql/phase4-sprint3/03-report-scope.sql; source checksum is in manifest.json.
-- Standalone grants remain independent, but a supplied appointment scope must be assigned.

CREATE OR REPLACE FUNCTION wb_pdf.authorize(target uuid,appointment_scope uuid DEFAULT NULL,record_access boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=wb_guard.subject(); role_name text:=wb_guard.actor_role(); r public.reports; s public.assessment_sessions; c public.consents; allowed boolean:=false; ticket uuid; meta wb_pdf.artifacts;
BEGIN
 IF role_name NOT IN ('PARTICIPANT','PSYCHOLOGIST') OR role_name IS NULL OR wb_guard.purpose() IS DISTINCT FROM 'interactive' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',target::text,true); PERFORM set_config('wellbeing.pdf_actor',actor::text,true);
 SELECT * INTO r FROM public.reports WHERE id=target;
 SELECT * INTO s FROM public.assessment_sessions WHERE id=r.assessment_session_id;
 IF s.id IS NULL OR s.status<>'COMPLETED' OR wb_pdf.render_data(target) IS NULL THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE='42501'; END IF;
 PERFORM id FROM public.users WHERE id IN(actor,s.participant_id) ORDER BY id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=s.participant_id AND is_active AND role='PARTICIPANT') OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=actor AND is_active) THEN RAISE EXCEPTION 'Inactive actor' USING ERRCODE='42501'; END IF;
 IF role_name='PARTICIPANT' THEN allowed:=s.participant_id=actor;
 ELSE
  IF appointment_scope IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.appointments a WHERE a.id=appointment_scope AND a.psychologist_id=actor AND a.participant_id=s.participant_id AND a.report_id=target AND a.assessment_session_id=s.id) THEN RAISE EXCEPTION 'Appointment scope denied' USING ERRCODE='42501'; END IF;
  FOR c IN SELECT * FROM public.consents WHERE report_id=target AND participant_id=s.participant_id AND target_user_id=actor AND revoked_at IS NULL AND expired_at IS NULL AND (appointment_scope IS NULL OR appointment_id=appointment_scope OR (consent_type='STANDALONE_REPORT_ACCESS' AND appointment_id IS NULL)) ORDER BY id FOR SHARE LOOP
   IF c.assessment_session_id<>s.id OR (c.consent_type='STANDALONE_REPORT_ACCESS' AND (c.appointment_id IS NOT NULL OR c.expires_at IS NOT NULL)) OR (c.consent_type='APPOINTMENT_REPORT_ACCESS' AND (c.appointment_id IS NULL OR c.expires_at IS NULL)) THEN CONTINUE; END IF;
   IF c.expires_at IS NOT NULL AND c.expires_at<=clock_timestamp() THEN CONTINUE; END IF;
   IF c.appointment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.appointments a JOIN public.consultation_sessions cs ON cs.appointment_id=a.id WHERE a.id=c.appointment_id AND a.report_id=target AND a.assessment_session_id=s.id AND a.psychologist_id=actor AND a.participant_id=s.participant_id AND a.status IN ('CONFIRMED','IN_PROGRESS') AND a.scheduled_end_at>clock_timestamp() AND cs.status NOT IN ('COMPLETED','CLOSED','NO_SHOW') AND cs.ended_at IS NULL) THEN CONTINUE; END IF;
   allowed:=true;
   IF record_access THEN INSERT INTO public.consent_audit_events(id,consent_id,actor_type,actor_user_id,action) VALUES(gen_random_uuid(),c.id,'USER',actor,'ACCESSED'); END IF;
   EXIT;
  END LOOP;
 END IF;
 IF NOT allowed THEN RAISE EXCEPTION 'Report access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO meta FROM wb_pdf.artifacts WHERE report_id=target;
 IF r.status<>'GENERATED' OR r.generated_at IS NULL OR r.file_path_or_object_key IS DISTINCT FROM 'reports/'||target::text||'.pdf' OR meta.report_id IS NULL THEN RAISE EXCEPTION 'REPORT_NOT_GENERATED'; END IF;
 IF NOT record_access THEN INSERT INTO wb_pdf.tickets(report_id,actor_id) VALUES(target,actor) RETURNING id INTO ticket; END IF;
 RETURN jsonb_build_object('data',wb_pdf.render_data(target),'generatedAt',r.generated_at,'digest',meta.digest,'size',meta.size,'ticket',ticket);
END $$;

-- Neither test identity nor local signer is usable. Random independent secrets
-- must be transferred privately to signer and PDF worker by the approved operator.
GRANT USAGE ON SCHEMA extensions TO wb_pdf_finalizer;
REVOKE ALL ON public.consultation_messages FROM website_runtime;
-- No lifecycle/chat gateways are installed in this bundle.
REVOKE wb_identity_guard FROM CURRENT_USER;
REVOKE wb_operational_monitor FROM CURRENT_USER;
REVOKE wb_score_gateway FROM CURRENT_USER;
REVOKE wb_display_projection FROM CURRENT_USER;
REVOKE wb_booking FROM CURRENT_USER;
REVOKE wb_consent FROM CURRENT_USER;
REVOKE wb_pdf_reader FROM CURRENT_USER;
REVOKE wb_pdf_finalizer FROM CURRENT_USER;
REVOKE wb_pdf_access FROM CURRENT_USER;
COMMIT;
