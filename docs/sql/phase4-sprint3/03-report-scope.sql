-- Standalone grants remain independent, but a supplied appointment scope must be assigned.
BEGIN;
DO $$ BEGIN IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL OR current_setting('wellbeing.sprint3',true) IS DISTINCT FROM 'approved-isolated-local' THEN RAISE EXCEPTION 'Isolated local database required'; END IF; END $$;
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
COMMIT;
