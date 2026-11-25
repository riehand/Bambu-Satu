-- TEST-ONLY PROPOSAL. HOSTED: NOT EXECUTED. Tambahan guard, tidak rewrite trigger lama.
BEGIN;
DO $$ BEGIN
  IF current_database()<>'wellbeing_phase3_rehearsal'
    OR current_setting('wellbeing.stage3e1b',true) IS DISTINCT FROM 'approved-isolated-prototype'
    THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;
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
COMMIT;
