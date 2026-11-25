-- Local integration: require Sprint 2 attestation in the existing atomic booking gateway.
BEGIN;
DO $$ BEGIN IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL OR current_setting('wellbeing.sprint3',true) IS DISTINCT FROM 'approved-isolated-local' THEN RAISE EXCEPTION 'Isolated local database required'; END IF; END $$;
CREATE FUNCTION wb_guard.booking_report_ready(target uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF wb_guard.actor_role() IS DISTINCT FROM 'PARTICIPANT' THEN RAISE EXCEPTION 'Participant required' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',target::text,true);
 RETURN EXISTS(SELECT 1 FROM public.reports r JOIN public.assessment_sessions s ON s.id=r.assessment_session_id JOIN wb_pdf.artifacts ar ON ar.report_id=r.id WHERE r.id=target AND s.participant_id=wb_guard.subject() AND s.status='COMPLETED' AND r.status='GENERATED' AND r.generated_at IS NOT NULL AND r.file_path_or_object_key='reports/'||r.id::text||'.pdf');
END $$;
ALTER FUNCTION wb_guard.booking_report_ready(uuid) OWNER TO wb_pdf_access;
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
ALTER FUNCTION wb_guard.book_appointment(uuid,uuid,uuid,uuid,boolean,text) OWNER TO wb_booking;
REVOKE ALL ON FUNCTION wb_guard.book_appointment(uuid,uuid,uuid,uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.book_appointment(uuid,uuid,uuid,uuid,boolean,text) TO website_runtime;
COMMIT;
