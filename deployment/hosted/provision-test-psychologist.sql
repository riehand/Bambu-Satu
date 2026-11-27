-- PREPARED ONLY. Requires explicit owner approval for this account/role change.
-- Operator psql variables: auth_user_id, expected_email, approved_project_ref.
-- Create/confirm the NEW test account through normal Supabase Auth first.
-- Never execute this file from application startup or migrations.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='3s';
SELECT set_config('wellbeing.provision_target', :'approved_project_ref', true);
SELECT set_config('wellbeing.provision_id', :'auth_user_id', true);
SELECT set_config('wellbeing.provision_email', :'expected_email', true);
DO $provision$
DECLARE target uuid := current_setting('wellbeing.provision_id')::uuid;
BEGIN
 IF current_setting('wellbeing.provision_target') <> 'bofoowyzlnfhwcstlmgp' THEN
  RAISE EXCEPTION 'Wrong approved project';
 END IF;
 -- Check the real connection target separately before executing this file.
 PERFORM 1 FROM auth.users WHERE id=target
  AND lower(email)=lower(current_setting('wellbeing.provision_email'))
  AND email_confirmed_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Confirmed Auth identity required'; END IF;
 PERFORM 1 FROM public.users WHERE id=target AND role='PARTICIPANT' AND is_active
  AND lower(email)=lower(current_setting('wellbeing.provision_email'))
  AND full_name='Psikolog Uji - Nonklinis'
  AND institutional_id='WB-QA-PSY-20261127' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Exact new test profile required; do not repurpose an existing account'; END IF;
 IF EXISTS(SELECT 1 FROM public.assessment_sessions WHERE participant_id=target)
  OR EXISTS(SELECT 1 FROM public.appointments WHERE participant_id=target OR psychologist_id=target)
  OR EXISTS(SELECT 1 FROM public.psychologist_profiles WHERE user_id=target) THEN
  RAISE EXCEPTION 'Test identity must not have assessment, appointment or professional-profile data';
 END IF;
 UPDATE public.users SET role='PSYCHOLOGIST',updated_at=clock_timestamp() WHERE id=target;
END $provision$;
COMMIT;
-- Profile and availability must subsequently be saved through the psychologist UI.
-- No Auth claims, password, RLS, schema or Flutter objects are changed here.
