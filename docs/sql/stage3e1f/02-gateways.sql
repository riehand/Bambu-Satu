-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.
BEGIN;
DO $$ BEGIN IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL OR current_setting('wellbeing.stage3e1f',true) IS DISTINCT FROM 'approved-isolated-prototype' THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF; END $$;
CREATE FUNCTION wb_pdf.render_data(target uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('reportId',r.id,'assessmentSessionId',s.id,'assessmentDate',s.completed_at,'scores',jsonb_build_object('depression',jsonb_build_object('score',sc.depression_score,'category',sc.depression_category),'anxiety',jsonb_build_object('score',sc.anxiety_score,'category',sc.anxiety_category),'stress',jsonb_build_object('score',sc.stress_score,'category',sc.stress_category),'wemwbs',jsonb_build_object('score',sc.wemwbs_score))) FROM public.reports r JOIN public.assessment_sessions s ON s.id=r.assessment_session_id JOIN public.assessment_scores sc ON sc.assessment_session_id=s.id WHERE r.id=target AND s.status='COMPLETED' AND s.completed_at IS NOT NULL
$$;
CREATE FUNCTION wb_pdf.enqueue(target uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor uuid:=wb_guard.subject(); job uuid;
BEGIN
 IF wb_guard.actor_role() IS DISTINCT FROM 'PARTICIPANT' OR wb_guard.purpose() IS DISTINCT FROM 'interactive' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',target::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.reports r JOIN public.assessment_sessions s ON s.id=r.assessment_session_id WHERE r.id=target AND s.participant_id=actor AND s.status='COMPLETED') OR wb_pdf.render_data(target) IS NULL THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO wb_pdf.jobs(report_id,requested_by) VALUES(target,actor) RETURNING id INTO job;
 RETURN job;
END $$;
CREATE FUNCTION wb_pdf.worker_input(job_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE j wb_pdf.jobs; result jsonb;
BEGIN
 IF session_user<>'wb_pdf_worker' THEN RAISE EXCEPTION 'Worker required' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM wb_pdf.jobs WHERE id=job_id AND expires_at>clock_timestamp();
 IF j.id IS NULL THEN RAISE EXCEPTION 'Job unavailable' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',j.report_id::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=j.requested_by AND is_active AND role='PARTICIPANT') THEN RAISE EXCEPTION 'Inactive owner' USING ERRCODE='42501'; END IF;
 result:=wb_pdf.render_data(j.report_id);
 IF result IS NULL THEN RAISE EXCEPTION 'Report unavailable' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION wb_pdf.authorize(target uuid,appointment_scope uuid DEFAULT NULL,record_access boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
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
  FOR c IN SELECT * FROM public.consents WHERE report_id=target AND participant_id=s.participant_id AND target_user_id=actor AND revoked_at IS NULL AND expired_at IS NULL AND (appointment_scope IS NULL OR appointment_id=appointment_scope) ORDER BY id FOR SHARE LOOP
   IF c.expires_at IS NOT NULL AND c.expires_at<=clock_timestamp() THEN CONTINUE; END IF;
   IF c.appointment_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.appointments a JOIN public.consultation_sessions cs ON cs.appointment_id=a.id WHERE a.id=c.appointment_id AND a.report_id=target AND a.psychologist_id=actor AND a.participant_id=s.participant_id AND a.status IN ('CONFIRMED','IN_PROGRESS') AND a.scheduled_end_at>clock_timestamp() AND cs.status NOT IN ('COMPLETED','CLOSED','NO_SHOW') AND cs.ended_at IS NULL) THEN CONTINUE; END IF;
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
CREATE FUNCTION wb_pdf.download_input(ticket_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t wb_pdf.tickets; meta wb_pdf.artifacts;
BEGIN
 IF session_user<>'wb_pdf_worker' THEN RAISE EXCEPTION 'Worker required' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM wb_pdf.tickets WHERE id=ticket_id AND expires_at>clock_timestamp();
 IF t.id IS NULL THEN RAISE EXCEPTION 'Ticket unavailable' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',t.report_id::text,true);
 SELECT * INTO meta FROM wb_pdf.artifacts WHERE report_id=t.report_id;
 IF meta.report_id IS NULL THEN RAISE EXCEPTION 'Artifact unavailable'; END IF;
 RETURN jsonb_build_object('reportId',t.report_id,'digest',meta.digest,'size',meta.size);
END $$;
CREATE FUNCTION wb_pdf.finalize(payload text,signature text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p jsonb; secret_value bytea; actual bytea; supplied bytea; diff integer:=0; i integer; now_epoch bigint; target uuid; r public.reports; j wb_pdf.jobs; existing wb_pdf.artifacts;
BEGIN
 IF session_user<>'wb_pdf_worker' OR payload IS NULL OR length(payload)>4096 OR signature IS NULL OR signature !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid attestation' USING ERRCODE='42501'; END IF;
 p:=payload::jsonb; SELECT secret INTO secret_value FROM wb_pdf.keys WHERE kid=p->>'kid' AND active;
 IF secret_value IS NULL THEN RAISE EXCEPTION 'Unknown signing key' USING ERRCODE='42501'; END IF;
 actual:=wb_crypto.hmac(convert_to(payload,'UTF8'),secret_value,'sha256'); supplied:=decode(signature,'hex');
 FOR i IN 0..31 LOOP diff:=diff | (get_byte(actual,i) # get_byte(supplied,i)); END LOOP;
 now_epoch:=floor(extract(epoch FROM clock_timestamp()))::bigint;
 IF diff<>0 OR NOT(p ?& ARRAY['kid','reportId','assessmentSessionId','jobId','bucket','key','digest','size','nonce','worker','iss','aud','iat','exp','objectIdentity']) OR p->>'worker' IS DISTINCT FROM 'wb_pdf_worker' OR p->>'iss' IS DISTINCT FROM 'wellbeing-local-pdf-worker' OR p->>'aud' IS DISTINCT FROM 'wellbeing-report-finalization-v1' OR p->>'bucket' IS DISTINCT FROM 'assessment-reports' OR p->>'digest' IS NULL OR p->>'digest' !~ '^[a-f0-9]{64}$' OR (p->>'iat')::bigint>now_epoch OR (p->>'exp')::bigint<=now_epoch OR (p->>'exp')::bigint-(p->>'iat')::bigint NOT BETWEEN 1 AND 60 OR (p->>'size')::integer NOT BETWEEN 100 AND 5242880 THEN RAISE EXCEPTION 'Invalid attestation' USING ERRCODE='42501'; END IF;
 IF p->>'iat' IS NULL OR p->>'exp' IS NULL OR p->>'size' IS NULL OR p->>'nonce' IS NULL THEN RAISE EXCEPTION 'Invalid attestation' USING ERRCODE='42501'; END IF;
 target:=(p->>'reportId')::uuid;
 IF p->>'key' IS DISTINCT FROM 'reports/'||target::text||'.pdf' THEN RAISE EXCEPTION 'Invalid artifact key' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM wb_pdf.jobs WHERE id=(p->>'jobId')::uuid AND report_id=target AND expires_at>clock_timestamp();
 IF j.id IS NULL THEN RAISE EXCEPTION 'Invalid job' USING ERRCODE='42501'; END IF;
 PERFORM set_config('wellbeing.pdf_report',target::text,true);
 SELECT * INTO r FROM public.reports WHERE id=target FOR UPDATE;
 IF r.id IS NULL OR r.assessment_session_id IS DISTINCT FROM (p->>'assessmentSessionId')::uuid OR wb_pdf.render_data(target) IS NULL THEN RAISE EXCEPTION 'Invalid association' USING ERRCODE='42501'; END IF;
 SELECT * INTO existing FROM wb_pdf.artifacts WHERE report_id=target;
 IF existing.report_id IS NOT NULL THEN
  IF r.status='GENERATED' AND existing.digest=p->>'digest' AND existing.size=(p->>'size')::integer AND existing.object_key=p->>'key' THEN RETURN target; END IF;
  RAISE EXCEPTION 'Conflicting attestation' USING ERRCODE='42501';
 END IF;
 IF r.status<>'PENDING' OR r.generated_at IS NOT NULL OR r.file_path_or_object_key IS NOT NULL THEN RAISE EXCEPTION 'Invalid report state' USING ERRCODE='42501'; END IF;
 INSERT INTO wb_pdf.artifacts(report_id,session_id,bucket,object_key,digest,size,nonce,kid,worker,issued_at) VALUES(target,r.assessment_session_id,p->>'bucket',p->>'key',p->>'digest',(p->>'size')::integer,(p->>'nonce')::uuid,p->>'kid',p->>'worker',(p->>'iat')::bigint);
 UPDATE public.reports SET status='GENERATED',file_path_or_object_key=p->>'key',generated_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=target;
 RETURN target;
END $$;
ALTER FUNCTION wb_pdf.enqueue(uuid) OWNER TO wb_pdf_access;
ALTER FUNCTION wb_pdf.authorize(uuid,uuid,boolean) OWNER TO wb_pdf_access;
ALTER FUNCTION wb_pdf.worker_input(uuid) OWNER TO wb_pdf_reader;
ALTER FUNCTION wb_pdf.download_input(uuid) OWNER TO wb_pdf_reader;
ALTER FUNCTION wb_pdf.finalize(text,text) OWNER TO wb_pdf_finalizer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA wb_pdf FROM PUBLIC,anon,authenticated,service_role,website_runtime,wb_pdf_worker;
GRANT EXECUTE ON FUNCTION wb_pdf.render_data(uuid) TO wb_pdf_access,wb_pdf_reader,wb_pdf_finalizer;
GRANT EXECUTE ON FUNCTION wb_pdf.enqueue(uuid),wb_pdf.authorize(uuid,uuid,boolean) TO website_runtime;
GRANT EXECUTE ON FUNCTION wb_pdf.worker_input(uuid),wb_pdf.download_input(uuid),wb_pdf.finalize(text,text) TO wb_pdf_worker;
COMMIT;
