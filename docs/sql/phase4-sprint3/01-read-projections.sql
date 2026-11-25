-- Local-only additive projections. Existing booking/consent mutations are unchanged.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL
 OR current_setting('wellbeing.sprint3',true) IS DISTINCT FROM 'approved-isolated-local'
 THEN RAISE EXCEPTION 'Isolated local database required'; END IF;
END $$;
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
ALTER FUNCTION wb_guard.psychologist_directory(uuid,text,text,integer,integer) OWNER TO wb_display_projection;
ALTER FUNCTION wb_guard.public_slots(uuid,date,date) OWNER TO wb_display_projection;
ALTER FUNCTION wb_guard.appointment_views(uuid) OWNER TO wb_display_projection;
REVOKE ALL ON FUNCTION wb_guard.psychologist_directory(uuid,text,text,integer,integer),wb_guard.public_slots(uuid,date,date),wb_guard.appointment_views(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION wb_guard.psychologist_directory(uuid,text,text,integer,integer),wb_guard.public_slots(uuid,date,date),wb_guard.appointment_views(uuid) TO website_runtime;
COMMIT;
