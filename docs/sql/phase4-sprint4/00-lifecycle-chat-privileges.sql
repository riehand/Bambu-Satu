-- TEST ONLY - HOSTED NOT EXECUTED.
-- Apply inside the same transaction as Stage 3E.1D 04-lifecycle and 05-chat.
DO $$
BEGIN
  IF current_database() <> 'wellbeing_phase3_rehearsal'
    OR to_regclass('rehearsal.identity') IS NULL
    OR current_setting('wellbeing.stage3e1d', true) IS DISTINCT FROM 'approved-isolated-prototype'
    OR current_setting('wellbeing.sprint4_marker', true) IS NULL THEN
    RAISE EXCEPTION 'Isolated Sprint 4 database required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM rehearsal.identity WHERE token = current_setting('wellbeing.sprint4_marker')
  ) THEN
    RAISE EXCEPTION 'Sprint 4 fixture marker mismatch';
  END IF;
END
$$;

CREATE ROLE wb_lifecycle NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
CREATE ROLE wb_chat NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;

GRANT USAGE ON SCHEMA public, wb_guard TO wb_lifecycle, wb_chat;
GRANT EXECUTE ON FUNCTION wb_guard.subject(), wb_guard.actor_role(), wb_guard.purpose(),
  wb_guard.d_actor(), wb_guard.d_lock_pair(uuid, uuid), wb_guard.d_lock_appointment(uuid)
  TO wb_lifecycle, wb_chat;
GRANT SELECT (id, role, is_active), UPDATE (id) ON public.users TO wb_lifecycle, wb_chat;
GRANT SELECT, UPDATE (id) ON public.appointments, public.consultation_sessions TO wb_lifecycle, wb_chat;
GRANT SELECT (participant_id, target_user_id) ON public.consents TO wb_chat;

-- Keep the reviewed Sprint 3 predicates and extend only the role lists.
ALTER POLICY wb_d_appointments ON public.appointments TO wb_booking, wb_consent, wb_lifecycle, wb_chat;
ALTER POLICY wb_d_sessions ON public.consultation_sessions TO wb_booking, wb_consent, wb_lifecycle, wb_chat;
ALTER POLICY wb_d_consents ON public.consents TO wb_booking, wb_consent, wb_lifecycle, wb_chat;
ALTER POLICY wb_d_users_read ON public.users TO wb_booking, wb_consent, wb_lifecycle, wb_chat;
ALTER POLICY wb_d_users_lock ON public.users TO wb_booking, wb_consent, wb_lifecycle, wb_chat;
ALTER POLICY wb_d_audit ON public.consent_audit_events TO wb_booking, wb_consent, wb_lifecycle;

GRANT UPDATE (status, completed_at, updated_at) ON public.appointments TO wb_lifecycle;
GRANT UPDATE (status, participant_checked_in_at, psychologist_checked_in_at, started_at, ended_at,
  ended_by, end_reason, updated_at) ON public.consultation_sessions TO wb_lifecycle;
GRANT EXECUTE ON FUNCTION wb_guard.d_expire(uuid) TO wb_lifecycle;
GRANT SELECT, UPDATE (expired_at) ON public.consents TO wb_lifecycle;
GRANT INSERT ON public.consent_audit_events TO wb_lifecycle;

GRANT SELECT, INSERT ON public.consultation_messages TO wb_chat;
CREATE POLICY wb_d_messages ON public.consultation_messages
  FOR ALL TO wb_chat
  USING (EXISTS (
    SELECT 1 FROM public.consultation_sessions s WHERE s.id = consultation_session_id
  ))
  WITH CHECK (
    sender_id = wb_guard.subject() AND EXISTS (
      SELECT 1 FROM public.consultation_sessions s WHERE s.id = consultation_session_id
    )
  );

REVOKE ALL ON TABLE public.consultation_messages FROM website_runtime;
