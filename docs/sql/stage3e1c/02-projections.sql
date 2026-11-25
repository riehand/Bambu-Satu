-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL
 OR current_setting('wellbeing.stage3e1c',true) IS DISTINCT FROM 'approved-isolated-prototype'
 THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;

CREATE ROLE wb_display_projection NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
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
ALTER FUNCTION wb_guard.psychologist_display(uuid) OWNER TO wb_display_projection;
ALTER FUNCTION wb_guard.assignment_display(uuid) OWNER TO wb_display_projection;
REVOKE ALL ON FUNCTION wb_guard.psychologist_display(uuid),wb_guard.assignment_display(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.psychologist_display(uuid),wb_guard.assignment_display(uuid) TO website_runtime;
COMMIT;
