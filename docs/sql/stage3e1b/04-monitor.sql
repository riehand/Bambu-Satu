-- TEST-ONLY PROPOSAL. HOSTED: NOT EXECUTED. Tidak memberi SELECT klinis kepada admin runtime.
BEGIN;
DO $$ BEGIN
  IF current_database()<>'wellbeing_phase3_rehearsal'
    OR current_setting('wellbeing.stage3e1b',true) IS DISTINCT FROM 'approved-isolated-prototype'
    THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;
CREATE ROLE wb_operational_monitor NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
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
ALTER FUNCTION wb_guard.operational_counts(date,date) OWNER TO wb_operational_monitor;
REVOKE ALL ON FUNCTION wb_guard.operational_counts(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.operational_counts(date,date) TO website_runtime;
COMMIT;
