-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL OR current_setting('wellbeing.stage3e1d',true) IS DISTINCT FROM 'approved-isolated-prototype'
 THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;

-- Development-only transition matrix; no late/no-show/cancel/reschedule/reopen policy.
CREATE FUNCTION wb_guard.transition_consultation(appointment_id uuid,action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE actor uuid:=wb_guard.d_actor(); role_name text:=wb_guard.actor_role(); a public.appointments; s public.consultation_sessions; t timestamptz;
BEGIN
 IF action IS NULL OR action NOT IN ('participant-check-in','psychologist-check-in','start','end') THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 IF (action='participant-check-in' AND role_name<>'PARTICIPANT') OR (action<>'participant-check-in' AND role_name<>'PSYCHOLOGIST') THEN RAISE EXCEPTION 'Forbidden action' USING ERRCODE='42501'; END IF;
 a:=wb_guard.d_lock_appointment(appointment_id);
 SELECT * INTO s FROM public.consultation_sessions WHERE consultation_sessions.appointment_id=a.id;
 IF s.id IS NULL OR s.scheduled_start_at<>a.scheduled_start_at OR s.scheduled_end_at<>a.scheduled_end_at OR a.scheduled_end_at-a.scheduled_start_at<>interval '2 hours'
 OR (a.status='IN_PROGRESS' AND (s.status<>'IN_PROGRESS' OR s.started_at IS NULL OR s.ended_at IS NOT NULL OR s.participant_checked_in_at IS NULL OR s.psychologist_checked_in_at IS NULL))
 OR (a.status='CONFIRMED' AND (s.started_at IS NOT NULL OR s.ended_at IS NOT NULL OR s.status NOT IN ('SCHEDULED','READY','PARTICIPANT_LATE','PSYCHOLOGIST_LATE') OR (s.status='READY' AND (s.participant_checked_in_at IS NULL OR s.psychologist_checked_in_at IS NULL)))) THEN RAISE EXCEPTION 'CONSULTATION_INCONSISTENT'; END IF;
 IF action='end' AND a.status='COMPLETED' AND s.status='COMPLETED' AND s.ended_at IS NOT NULL AND s.ended_by='PSYCHOLOGIST' AND s.end_reason='PSYCHOLOGIST_COMPLETED' THEN
  RETURN jsonb_build_object('appointmentId',a.id,'status',s.status,'endedAt',s.ended_at);
 END IF;
 IF action='end' THEN PERFORM id FROM public.consents WHERE consents.appointment_id=a.id AND revoked_at IS NULL AND expired_at IS NULL ORDER BY id FOR UPDATE; END IF;
 t:=clock_timestamp();
 IF a.status NOT IN ('CONFIRMED','IN_PROGRESS') OR s.ended_at IS NOT NULL OR s.status IN ('COMPLETED','CLOSED','NO_SHOW') THEN RAISE EXCEPTION 'CONSULTATION_TERMINAL'; END IF;
 IF t>=a.scheduled_end_at THEN RAISE EXCEPTION 'CONSULTATION_WINDOW_ENDED'; END IF;
 IF t<a.scheduled_start_at THEN RAISE EXCEPTION 'CONSULTATION_NOT_OPEN'; END IF;
 IF s.status IN ('PARTICIPANT_LATE','PSYCHOLOGIST_LATE') THEN RAISE EXCEPTION 'CONSULTATION_POLICY_PENDING'; END IF;
 IF action='start' THEN
  IF s.started_at IS NOT NULL THEN RAISE EXCEPTION 'CONSULTATION_ALREADY_STARTED'; END IF;
  IF s.participant_checked_in_at IS NULL OR s.psychologist_checked_in_at IS NULL THEN RAISE EXCEPTION 'CHECK_INS_REQUIRED'; END IF;
  UPDATE public.consultation_sessions SET status='IN_PROGRESS',started_at=t,updated_at=t WHERE id=s.id;
  UPDATE public.appointments SET status='IN_PROGRESS',updated_at=t WHERE id=a.id;
 ELSIF action='end' THEN
  IF s.status<>'IN_PROGRESS' THEN RAISE EXCEPTION 'CONSULTATION_NOT_STARTED'; END IF;
  UPDATE public.consultation_sessions SET status='COMPLETED',ended_at=t,ended_by='PSYCHOLOGIST',end_reason='PSYCHOLOGIST_COMPLETED',updated_at=t WHERE id=s.id;
  UPDATE public.appointments SET status='COMPLETED',completed_at=t,updated_at=t WHERE id=a.id;
  PERFORM wb_guard.d_expire(a.id);
 ELSE
  IF (action='participant-check-in' AND s.participant_checked_in_at IS NULL) OR (action='psychologist-check-in' AND s.psychologist_checked_in_at IS NULL) THEN
   IF s.status='IN_PROGRESS' THEN RAISE EXCEPTION 'CONSULTATION_ALREADY_STARTED'; END IF;
   UPDATE public.consultation_sessions SET participant_checked_in_at=CASE WHEN action='participant-check-in' THEN t ELSE participant_checked_in_at END,psychologist_checked_in_at=CASE WHEN action='psychologist-check-in' THEN t ELSE psychologist_checked_in_at END,updated_at=t WHERE id=s.id;
   UPDATE public.consultation_sessions SET status=CASE WHEN participant_checked_in_at IS NOT NULL AND psychologist_checked_in_at IS NOT NULL THEN 'READY' ELSE 'SCHEDULED' END::public."ConsultationSessionStatus" WHERE id=s.id;
  END IF;
 END IF;
 SELECT * INTO s FROM public.consultation_sessions WHERE id=s.id;
 RETURN jsonb_build_object('appointmentId',a.id,'status',s.status,'participantCheckedInAt',s.participant_checked_in_at,'psychologistCheckedInAt',s.psychologist_checked_in_at,'startedAt',s.started_at,'endedAt',s.ended_at);
END $$;
ALTER FUNCTION wb_guard.transition_consultation(uuid,text) OWNER TO wb_lifecycle;
REVOKE ALL ON FUNCTION wb_guard.transition_consultation(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.transition_consultation(uuid,text) TO website_runtime;
COMMIT;
