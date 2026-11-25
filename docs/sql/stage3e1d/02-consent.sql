-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL OR current_setting('wellbeing.stage3e1d',true) IS DISTINCT FROM 'approved-isolated-prototype'
 THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;

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
GRANT EXECUTE ON FUNCTION wb_guard.d_expire(uuid) TO wb_consent,wb_lifecycle;
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
ALTER FUNCTION wb_guard.grant_consent(uuid,uuid,uuid,boolean) OWNER TO wb_consent;
REVOKE ALL ON FUNCTION wb_guard.grant_consent(uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.grant_consent(uuid,uuid,uuid,boolean) TO website_runtime;
ALTER FUNCTION wb_guard.expire_consents(uuid) OWNER TO wb_consent;
REVOKE ALL ON FUNCTION wb_guard.expire_consents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.expire_consents(uuid) TO website_runtime;
ALTER FUNCTION wb_guard.revoke_consent(uuid) OWNER TO wb_consent;
REVOKE ALL ON FUNCTION wb_guard.revoke_consent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.revoke_consent(uuid) TO website_runtime;
ALTER FUNCTION wb_guard.report_access(uuid) OWNER TO wb_consent;
REVOKE ALL ON FUNCTION wb_guard.report_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.report_access(uuid) TO website_runtime;
COMMIT;
