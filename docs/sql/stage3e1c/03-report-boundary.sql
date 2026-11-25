-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL
 OR current_setting('wellbeing.stage3e1c',true) IS DISTINCT FROM 'approved-isolated-prototype'
 THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;

-- Explicit non-operational contract: no worker/attestation authority provisioned yet.
-- No success path, no fake artifact verification, no grant to website_runtime.
CREATE FUNCTION wb_guard.finalize_report(report_id uuid,object_key text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN RAISE EXCEPTION 'STORAGE_ATTESTATION_UNAVAILABLE' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION wb_guard.finalize_report(uuid,text) FROM PUBLIC,website_runtime;
COMMIT;
