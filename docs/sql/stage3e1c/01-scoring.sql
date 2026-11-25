-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL
 OR current_setting('wellbeing.stage3e1c',true) IS DISTINCT FROM 'approved-isolated-prototype'
 THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;

CREATE ROLE wb_score_gateway NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
GRANT USAGE ON SCHEMA public,wb_guard TO wb_score_gateway;
GRANT EXECUTE ON FUNCTION wb_guard.subject(),wb_guard.actor_role(),wb_guard.purpose() TO wb_score_gateway;
GRANT SELECT(id,role,is_active),UPDATE(id) ON public.users TO wb_score_gateway;
GRANT SELECT,UPDATE(id) ON public.academic_periods TO wb_score_gateway;
GRANT SELECT ON public.assessment_question_sets,public.questions,public.assessment_answers TO wb_score_gateway;
GRANT SELECT,UPDATE(status,completed_at,revision,updated_at) ON public.assessment_sessions TO wb_score_gateway;
GRANT SELECT,INSERT ON public.assessment_scores,public.reports TO wb_score_gateway;
CREATE POLICY wb_score_users ON public.users FOR SELECT TO wb_score_gateway USING(id=wb_guard.subject() AND is_active AND role='PARTICIPANT');
CREATE POLICY wb_score_user_lock ON public.users FOR UPDATE TO wb_score_gateway USING(id=wb_guard.subject() AND is_active AND role='PARTICIPANT') WITH CHECK(false);
CREATE POLICY wb_score_period ON public.academic_periods FOR SELECT TO wb_score_gateway USING(status='ACTIVE' AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_score_period_lock ON public.academic_periods FOR UPDATE TO wb_score_gateway USING(status='ACTIVE') WITH CHECK(false);
CREATE POLICY wb_score_sets ON public.assessment_question_sets FOR SELECT TO wb_score_gateway USING(is_published AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_score_questions ON public.questions FOR SELECT TO wb_score_gateway USING(wb_guard.actor_role()='PARTICIPANT' AND EXISTS(SELECT 1 FROM public.assessment_question_sets q WHERE q.id=question_set_id));
CREATE POLICY wb_score_sessions_read ON public.assessment_sessions FOR SELECT TO wb_score_gateway USING(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_score_sessions_write ON public.assessment_sessions FOR UPDATE TO wb_score_gateway USING(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT') WITH CHECK(participant_id=wb_guard.subject() AND status='COMPLETED');
CREATE POLICY wb_score_answers ON public.assessment_answers FOR SELECT TO wb_score_gateway USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id));
CREATE POLICY wb_score_results_read ON public.assessment_scores FOR SELECT TO wb_score_gateway USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id));
CREATE POLICY wb_score_results_insert ON public.assessment_scores FOR INSERT TO wb_score_gateway WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.status='IN_PROGRESS'));
CREATE POLICY wb_score_report_read ON public.reports FOR SELECT TO wb_score_gateway USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id));
CREATE POLICY wb_score_report_insert ON public.reports FOR INSERT TO wb_score_gateway WITH CHECK(status='PENDING' AND file_path_or_object_key IS NULL AND generated_at IS NULL AND EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.status='IN_PROGRESS'));
-- Old invoker trigger comparisons can see NULL for a hidden draft question.
-- Explicit restrictive association policy makes missing/invisible questions fail closed.
CREATE POLICY wb_score_answer_association_insert ON public.assessment_answers AS RESTRICTIVE FOR INSERT TO website_runtime
WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_sessions s JOIN public.questions q ON q.question_set_id=s.question_set_id WHERE s.id=assessment_session_id AND q.id=question_id AND q.is_active));
CREATE POLICY wb_score_answer_association_update ON public.assessment_answers AS RESTRICTIVE FOR UPDATE TO website_runtime
WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_sessions s JOIN public.questions q ON q.question_set_id=s.question_set_id WHERE s.id=assessment_session_id AND q.id=question_id AND q.is_active));
-- Metadata created only by the atomic scoring gateway; no caller-supplied association.
REVOKE INSERT ON public.reports FROM website_runtime;
CREATE FUNCTION wb_guard.submit_assessment(session_id uuid,expected_revision integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE actor uuid; s public.assessment_sessions; q public.assessment_question_sets; p public.academic_periods;
 d integer; a integer; st integer; w integer; report_id uuid;
BEGIN
 actor:=wb_guard.subject();
 IF wb_guard.actor_role() IS DISTINCT FROM 'PARTICIPANT' OR wb_guard.purpose() IS DISTINCT FROM 'interactive'
 THEN RAISE EXCEPTION 'Submission forbidden' USING ERRCODE='42501'; END IF;
 IF session_id IS NULL OR expected_revision IS NULL OR expected_revision<0 THEN RAISE EXCEPTION 'Invalid revision' USING ERRCODE='22023'; END IF;
 -- Same lock order as existing services. Direct answer writes also lock session via old trigger.
 PERFORM id FROM public.users WHERE id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inactive actor' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.assessment_sessions WHERE id=session_id AND participant_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='42501'; END IF;
 IF s.status='COMPLETED' THEN
   SELECT r.id INTO report_id FROM public.reports r JOIN public.assessment_scores sc ON sc.assessment_session_id=r.assessment_session_id WHERE r.assessment_session_id=s.id;
   IF report_id IS NULL THEN RAISE EXCEPTION 'Result unavailable'; END IF;
   RETURN report_id;
 END IF;
 IF s.revision<>expected_revision THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT * INTO p FROM public.academic_periods WHERE id=s.academic_period_id AND status='ACTIVE' FOR SHARE;
 IF NOT FOUND OR (SELECT count(*) FROM public.academic_periods WHERE status='ACTIVE')<>1 THEN RAISE EXCEPTION 'Active period unavailable'; END IF;
 IF (SELECT count(*) FROM public.assessment_sessions WHERE participant_id=actor AND academic_period_id=p.id AND status='COMPLETED')>=p.assessment_limit THEN RAISE EXCEPTION 'Quota exceeded'; END IF;
 SELECT * INTO q FROM public.assessment_question_sets WHERE id=s.question_set_id AND is_published;
 IF NOT FOUND OR q.approved_at IS NULL OR nullif(btrim(q.approved_by),'') IS NULL
 OR nullif(btrim(q.dass_source),'') IS NULL OR nullif(btrim(q.wemwbs_licence_reference),'') IS NULL
 OR nullif(btrim(q.translation_reference),'') IS NULL OR nullif(btrim(q.presentation_approval_reference),'') IS NULL
 OR nullif(btrim(q.dass_instructions),'') IS NULL OR nullif(btrim(q.wemwbs_instructions),'') IS NULL
 THEN RAISE EXCEPTION 'Approved content unavailable'; END IF;
 IF jsonb_typeof(q.dass_options)<>'array' OR jsonb_typeof(q.wemwbs_options)<>'array' THEN RAISE EXCEPTION 'Invalid options'; END IF;
 IF (SELECT jsonb_agg(o->'value' ORDER BY ord) FROM jsonb_array_elements(q.dass_options) WITH ORDINALITY AS x(o,ord)) IS DISTINCT FROM '[0,1,2,3]'::jsonb
 OR (SELECT jsonb_agg(o->'value' ORDER BY ord) FROM jsonb_array_elements(q.wemwbs_options) WITH ORDINALITY AS x(o,ord)) IS DISTINCT FROM '[1,2,3,4,5]'::jsonb
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(q.dass_options||q.wemwbs_options) o WHERE jsonb_typeof(o)<>'object' OR jsonb_typeof(o->'label') IS DISTINCT FROM 'string' OR nullif(btrim(o->>'label'),'') IS NULL OR (o-'value'-'label')<>'{}'::jsonb)
 THEN RAISE EXCEPTION 'Invalid scoring options'; END IF;
 -- Historical unique/number/dimension constraints guarantee complete canonical numbering.
 IF (SELECT count(*) FROM public.questions WHERE question_set_id=q.id)<>35
 OR (SELECT count(*) FROM public.questions WHERE question_set_id=q.id AND instrument='DASS21')<>21
 OR EXISTS(SELECT 1 FROM public.questions WHERE question_set_id=q.id AND (NOT is_active OR nullif(btrim(question_text),'') IS NULL))
 OR (SELECT count(*) FROM public.assessment_answers WHERE assessment_session_id=s.id)<>35
 OR (SELECT count(*) FROM public.assessment_answers ans JOIN public.questions item ON item.id=ans.question_id WHERE ans.assessment_session_id=s.id AND item.question_set_id=q.id)<>35
 OR EXISTS(SELECT 1 FROM public.assessment_answers ans JOIN public.questions item ON item.id=ans.question_id WHERE ans.assessment_session_id=s.id AND (item.question_set_id<>q.id OR (item.instrument='DASS21' AND ans.answer_value NOT BETWEEN 0 AND 3) OR (item.instrument='WEMWBS' AND ans.answer_value NOT BETWEEN 1 AND 5)))
 THEN RAISE EXCEPTION 'Incomplete or invalid answers'; END IF;
 SELECT 2*sum(ans.answer_value) FILTER(WHERE item.scoring_dimension='DEPRESSION'),
  2*sum(ans.answer_value) FILTER(WHERE item.scoring_dimension='ANXIETY'),
  2*sum(ans.answer_value) FILTER(WHERE item.scoring_dimension='STRESS'),
  sum(ans.answer_value) FILTER(WHERE item.scoring_dimension='WELLBEING')
 INTO d,a,st,w FROM public.assessment_answers ans JOIN public.questions item ON item.id=ans.question_id
 WHERE ans.assessment_session_id=s.id AND item.question_set_id=q.id;
 -- Exact existing TS thresholds; parity tested across all possible DASS subtotals.
 INSERT INTO public.assessment_scores(id,assessment_session_id,depression_score,depression_category,anxiety_score,anxiety_category,stress_score,stress_category,wemwbs_score,updated_at)
 VALUES(gen_random_uuid(),s.id,d,(CASE WHEN d<=9 THEN 'NORMAL' WHEN d<=13 THEN 'MILD' WHEN d<=20 THEN 'MODERATE' WHEN d<=27 THEN 'SEVERE' ELSE 'EXTREMELY_SEVERE' END)::public."DassCategory",
 a,(CASE WHEN a<=7 THEN 'NORMAL' WHEN a<=9 THEN 'MILD' WHEN a<=14 THEN 'MODERATE' WHEN a<=19 THEN 'SEVERE' ELSE 'EXTREMELY_SEVERE' END)::public."DassCategory",
 st,(CASE WHEN st<=14 THEN 'NORMAL' WHEN st<=18 THEN 'MILD' WHEN st<=25 THEN 'MODERATE' WHEN st<=33 THEN 'SEVERE' ELSE 'EXTREMELY_SEVERE' END)::public."DassCategory",w,clock_timestamp());
 report_id:=gen_random_uuid();
 INSERT INTO public.reports(id,assessment_session_id,status,updated_at) VALUES(report_id,s.id,'PENDING',clock_timestamp());
 UPDATE public.assessment_sessions SET status='COMPLETED',completed_at=clock_timestamp() AT TIME ZONE 'UTC',revision=revision+1,updated_at=clock_timestamp() AT TIME ZONE 'UTC' WHERE id=s.id;
 RETURN report_id;
END $$;
ALTER FUNCTION wb_guard.submit_assessment(uuid,integer) OWNER TO wb_score_gateway;
REVOKE ALL ON FUNCTION wb_guard.submit_assessment(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.submit_assessment(uuid,integer) TO website_runtime;
COMMIT;
