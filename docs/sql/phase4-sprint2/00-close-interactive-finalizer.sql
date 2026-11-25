-- Local repair only. Preserve the historical migrations and Stage C/F source files.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL
 OR current_setting('wellbeing.stage3e1f',true) IS DISTINCT FROM 'approved-isolated-prototype'
 THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;
REVOKE ALL ON FUNCTION wb_guard.finalize_report(uuid,text) FROM PUBLIC,website_runtime,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION wb_guard.finalize_report(report_id uuid,object_key text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN RAISE EXCEPTION 'STORAGE_ATTESTATION_UNAVAILABLE' USING ERRCODE='42501'; END $$;
COMMIT;
