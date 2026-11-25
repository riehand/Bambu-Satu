-- TEST-ONLY PROPOSAL. HOSTED: NOT EXECUTED. Tetap fail-closed untuk mutasi lintas pihak
-- yang belum mempunyai gateway/validasi DB lengkap. Tidak ada USING(true).
BEGIN;
DO $$ BEGIN
  IF current_database()<>'wellbeing_phase3_rehearsal'
    OR current_setting('wellbeing.stage3e1b',true) IS DISTINCT FROM 'approved-isolated-prototype'
    THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;
-- Own profile saja: jangan membuka kolom email/phone kepada pihak lain melalui row policy.
CREATE POLICY wb_runtime_profile ON public.users FOR SELECT TO website_runtime
USING(id=wb_guard.subject() AND is_active AND wb_guard.actor_role() IS NOT NULL);
-- UPDATE(id) diperlukan lock. Trigger di file 03 menolak semua perubahan isi users.
CREATE POLICY wb_runtime_profile_lock ON public.users FOR UPDATE TO website_runtime
USING(id=wb_guard.subject() AND is_active) WITH CHECK(id=wb_guard.subject() AND is_active);
CREATE POLICY wb_runtime_period ON public.academic_periods FOR SELECT TO website_runtime
USING(status='ACTIVE' AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_runtime_period_lock ON public.academic_periods FOR UPDATE TO website_runtime
USING(status='ACTIVE' AND wb_guard.actor_role()='PARTICIPANT') WITH CHECK(false);
REVOKE INSERT ON public.academic_periods FROM website_runtime;
CREATE POLICY wb_runtime_content ON public.assessment_question_sets FOR SELECT TO website_runtime
USING(is_published AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_runtime_questions ON public.questions FOR SELECT TO website_runtime
USING(is_active AND wb_guard.actor_role()='PARTICIPANT' AND EXISTS
  (SELECT 1 FROM public.assessment_question_sets s WHERE s.id=question_set_id AND s.is_published));
CREATE POLICY wb_runtime_assessment_read ON public.assessment_sessions FOR SELECT TO website_runtime
USING(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_runtime_assessment_insert ON public.assessment_sessions FOR INSERT TO website_runtime
WITH CHECK(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT' AND status='IN_PROGRESS'
  AND completed_at IS NULL AND revision=0 AND processing_consent_version='assessment-processing-id-v1');
CREATE POLICY wb_runtime_assessment_update ON public.assessment_sessions FOR UPDATE TO website_runtime
USING(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT')
WITH CHECK(participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT');
CREATE POLICY wb_runtime_answers ON public.assessment_answers FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject()));
CREATE POLICY wb_runtime_answer_insert ON public.assessment_answers FOR INSERT TO website_runtime
WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject() AND s.status='IN_PROGRESS'));
CREATE POLICY wb_runtime_answer_update ON public.assessment_answers FOR UPDATE TO website_runtime
USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject() AND s.status='IN_PROGRESS'))
WITH CHECK(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject() AND s.status='IN_PROGRESS'));
CREATE POLICY wb_runtime_score_read ON public.assessment_scores FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject()));
-- Score INSERT dipertahankan default-deny: memberi hak INSERT saja mengizinkan pemalsuan
-- official scores lewat SQL langsung. Scoring gateway independently validated diperlukan.
REVOKE INSERT ON public.assessment_scores FROM website_runtime;
CREATE POLICY wb_runtime_report_read ON public.reports FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject()));
-- PENDING metadata hanya untuk sesi sendiri; generated artifact tidak boleh dibuat dari SQL biasa.
CREATE POLICY wb_runtime_report_insert ON public.reports FOR INSERT TO website_runtime
WITH CHECK(status='PENDING' AND file_path_or_object_key IS NULL AND generated_at IS NULL AND EXISTS
  (SELECT 1 FROM public.assessment_sessions s WHERE s.id=assessment_session_id AND s.participant_id=wb_guard.subject()));
-- Finalization belum diberi UPDATE: signature purpose saja bukan attestasi artifact Storage.
REVOKE UPDATE ON public.reports FROM website_runtime;
CREATE POLICY wb_runtime_psychologist_profile ON public.psychologist_profiles FOR ALL TO website_runtime
USING(user_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST')
WITH CHECK(user_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST');
CREATE POLICY wb_runtime_availability ON public.psychologist_availability FOR ALL TO website_runtime
USING(psychologist_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST')
WITH CHECK(psychologist_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST');
-- Operasional milik sendiri boleh dibaca; belum memberi mutation lifecycle/booking.
CREATE POLICY wb_runtime_appointments ON public.appointments FOR SELECT TO website_runtime
USING((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT')
  OR (psychologist_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'));
CREATE POLICY wb_runtime_consultation ON public.consultation_sessions FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.appointments a WHERE a.id=appointment_id));
CREATE POLICY wb_runtime_consent ON public.consents FOR SELECT TO website_runtime
USING((participant_id=wb_guard.subject() AND wb_guard.actor_role()='PARTICIPANT')
  OR (target_user_id=wb_guard.subject() AND wb_guard.actor_role()='PSYCHOLOGIST'));
CREATE POLICY wb_runtime_consent_audit ON public.consent_audit_events FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.consents c WHERE c.id=consent_id AND c.participant_id=wb_guard.subject()));
CREATE POLICY wb_runtime_chat_read ON public.consultation_messages FOR SELECT TO website_runtime
USING(EXISTS(SELECT 1 FROM public.consultation_sessions s JOIN public.appointments a ON a.id=s.appointment_id
  WHERE s.id=consultation_session_id AND s.status='IN_PROGRESS' AND a.status='IN_PROGRESS'
  AND s.started_at IS NOT NULL AND s.ended_at IS NULL AND s.participant_checked_in_at IS NOT NULL
  AND s.psychologist_checked_in_at IS NOT NULL AND clock_timestamp()>=a.scheduled_start_at
  AND clock_timestamp()<a.scheduled_end_at AND clock_timestamp()<s.scheduled_end_at));
-- UPDATE grants untuk locks boleh tetap ada tetapi tidak ada UPDATE policy: tidak ada row
-- yang dapat dikunci/mutasi pada workflow belum direview. Jangan menghitung itu sebagai PASS.
REVOKE INSERT ON public.appointments,public.consultation_sessions,public.consents,
  public.consent_audit_events,public.consultation_messages FROM website_runtime;
COMMIT;
