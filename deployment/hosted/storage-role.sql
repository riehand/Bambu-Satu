-- PROPOSAL ONLY. Requires metadata review, issuer decision and explicit approval.
-- Not invoked by app/build/gateway generator. Does not create a bucket or token.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF current_setting('wellbeing.approved_hosted_ref',true) IS DISTINCT FROM 'bofoowyzlnfhwcstlmgp'
    OR current_database() <> 'postgres'
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='wb_report_storage')
    OR EXISTS (SELECT 1 FROM storage.buckets WHERE id='assessment-reports')
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity)
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='storage.buckets'::regclass AND relrowsecurity)
  THEN RAISE EXCEPTION 'First-time reviewed target required'; END IF;
END $$;
CREATE ROLE wb_report_storage NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
-- No membership in anon/authenticated/service_role; no password/login.
GRANT wb_report_storage TO authenticator WITH INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA storage TO wb_report_storage;
GRANT SELECT,INSERT ON storage.objects TO wb_report_storage;
GRANT SELECT ON storage.buckets TO wb_report_storage;

-- Restrictive fences also bound any existing permissive policies for PUBLIC.
-- Other buckets/roles retain their existing policies; no grants are added to them.
CREATE POLICY wb_reports_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO PUBLIC
USING (bucket_id <> 'assessment-reports' OR current_user='wb_report_storage')
WITH CHECK (bucket_id <> 'assessment-reports' OR current_user='wb_report_storage');
CREATE POLICY wb_reports_bucket_boundary ON storage.buckets AS RESTRICTIVE FOR ALL TO PUBLIC
USING (id <> 'assessment-reports' OR current_user='wb_report_storage')
WITH CHECK (id <> 'assessment-reports' OR current_user='wb_report_storage');

CREATE POLICY wb_storage_scope ON storage.objects AS RESTRICTIVE FOR ALL TO wb_report_storage
USING (bucket_id='assessment-reports' AND name ~ '^reports/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$')
WITH CHECK (bucket_id='assessment-reports' AND name ~ '^reports/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$');
CREATE POLICY wb_storage_read ON storage.objects FOR SELECT TO wb_report_storage
USING (bucket_id='assessment-reports');
CREATE POLICY wb_storage_create ON storage.objects FOR INSERT TO wb_report_storage
WITH CHECK (bucket_id='assessment-reports');
CREATE POLICY wb_storage_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO wb_report_storage
USING (false) WITH CHECK (false);
CREATE POLICY wb_storage_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO wb_report_storage
USING (false);
CREATE POLICY wb_storage_bucket_scope ON storage.buckets AS RESTRICTIVE FOR ALL TO wb_report_storage
USING (id='assessment-reports' AND NOT public) WITH CHECK (false);
CREATE POLICY wb_storage_bucket_read ON storage.buckets FOR SELECT TO wb_report_storage
USING (id='assessment-reports' AND NOT public);
CREATE POLICY wb_storage_bucket_no_delete ON storage.buckets AS RESTRICTIVE FOR DELETE TO wb_report_storage
USING (false);
-- Table owner/service_role bypass RLS; this proposal does NOT limit their secrets.
-- Existing restrictive policies may still deny worker access: do not remove them.
COMMIT;
