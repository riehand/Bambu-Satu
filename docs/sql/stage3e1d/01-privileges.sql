-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL OR current_setting('wellbeing.stage3e1d',true) IS DISTINCT FROM 'approved-isolated-prototype'
 THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;
CREATE ROLE wb_booking NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE wb_consent NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE wb_lifecycle NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE ROLE wb_chat NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA public,wb_guard TO wb_booking,wb_consent,wb_lifecycle,wb_chat;
GRANT EXECUTE ON FUNCTION wb_guard.subject(),wb_guard.actor_role(),wb_guard.purpose() TO wb_booking,wb_consent,wb_lifecycle,wb_chat;
GRANT SELECT(id,role,is_active),UPDATE(id) ON public.users TO wb_booking,wb_consent,wb_lifecycle,wb_chat;
GRANT SELECT,UPDATE(id) ON public.appointments,public.consultation_sessions TO wb_booking,wb_consent,wb_lifecycle,wb_chat;
GRANT SELECT(participant_id,target_user_id) ON public.consents TO wb_booking,wb_consent,wb_lifecycle,wb_chat;
CREATE POLICY wb_d_appointments ON public.appointments FOR ALL TO wb_booking,wb_consent,wb_lifecycle,wb_chat
USING((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') OR (psychologist_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'))
WITH CHECK((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') OR (psychologist_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'));
CREATE POLICY wb_d_sessions ON public.consultation_sessions FOR ALL TO wb_booking,wb_consent,wb_lifecycle,wb_chat
USING(EXISTS(SELECT 1 FROM public.appointments a WHERE a.id=appointment_id)) WITH CHECK(EXISTS(SELECT 1 FROM public.appointments a WHERE a.id=appointment_id));
CREATE POLICY wb_d_consents ON public.consents FOR ALL TO wb_booking,wb_consent,wb_lifecycle,wb_chat
USING((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') OR (target_user_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'))
WITH CHECK((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') OR (target_user_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'));
CREATE POLICY wb_d_users_read ON public.users FOR SELECT TO wb_booking,wb_consent,wb_lifecycle,wb_chat USING(
 id=wb_guard.subject() OR (role='PSYCHOLOGIST' AND wb_guard.actor_role()='PARTICIPANT') OR
 (role='PARTICIPANT' AND wb_guard.actor_role()='PSYCHOLOGIST' AND
 (EXISTS(SELECT 1 FROM public.appointments a WHERE a.participant_id=users.id AND a.psychologist_id=wb_guard.subject()) OR EXISTS(SELECT 1 FROM public.consents c WHERE c.participant_id=users.id AND c.target_user_id=wb_guard.subject()))));
CREATE POLICY wb_d_users_lock ON public.users FOR UPDATE TO wb_booking,wb_consent,wb_lifecycle,wb_chat USING(is_active) WITH CHECK(false);
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
GRANT SELECT,UPDATE(revoked_at,expired_at) ON public.consents TO wb_consent,wb_lifecycle;
GRANT INSERT ON public.consent_audit_events TO wb_booking,wb_consent,wb_lifecycle;
CREATE POLICY wb_d_audit ON public.consent_audit_events FOR INSERT TO wb_booking,wb_consent,wb_lifecycle WITH CHECK(EXISTS(SELECT 1 FROM public.consents c WHERE c.id=consent_id));
GRANT UPDATE(status,completed_at,updated_at) ON public.appointments TO wb_lifecycle;
GRANT UPDATE(status,participant_checked_in_at,psychologist_checked_in_at,started_at,ended_at,ended_by,end_reason,updated_at) ON public.consultation_sessions TO wb_lifecycle;
GRANT SELECT,INSERT ON public.consultation_messages TO wb_chat;
CREATE POLICY wb_d_messages ON public.consultation_messages FOR ALL TO wb_chat USING(EXISTS(SELECT 1 FROM public.consultation_sessions s WHERE s.id=consultation_session_id)) WITH CHECK(sender_id=wb_guard.subject() AND EXISTS(SELECT 1 FROM public.consultation_sessions s WHERE s.id=consultation_session_id));
-- Retrieval must use gateway DTO + both-active/window checks, not broad raw message reads.
REVOKE SELECT ON public.consultation_messages FROM website_runtime;
REVOKE UPDATE,DELETE ON public.appointments,public.consultation_sessions,public.consents,public.consent_audit_events,public.consultation_messages FROM website_runtime;
REVOKE UPDATE(revoked_at,expired_at) ON public.consents FROM website_runtime;
CREATE FUNCTION wb_guard.d_actor() RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE id uuid:=wb_guard.subject();
BEGIN
 IF current_database()<>'wellbeing_phase3_rehearsal' OR wb_guard.actor_role() IS NULL OR wb_guard.actor_role() NOT IN ('PARTICIPANT','PSYCHOLOGIST') OR wb_guard.purpose() IS DISTINCT FROM 'interactive'
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
GRANT EXECUTE ON FUNCTION wb_guard.d_actor(),wb_guard.d_lock_pair(uuid,uuid),wb_guard.d_lock_appointment(uuid) TO wb_booking,wb_consent,wb_lifecycle,wb_chat;
COMMIT;
