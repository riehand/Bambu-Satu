-- TEST-ONLY PROPOSAL. HOSTED: NOT EXECUTED. Perlu review/approval terpisah.
-- Tidak menerima credential/secret literal; key sintetis dibuat lokal oleh pgcrypto.
BEGIN;
DO $$ BEGIN
  IF current_database()<>'wellbeing_phase3_rehearsal'
    OR current_setting('wellbeing.stage3e1b',true) IS DISTINCT FROM 'approved-isolated-prototype'
    OR to_regclass('rehearsal.identity') IS NULL THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;
CREATE ROLE wb_identity_guard NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
CREATE SCHEMA wb_crypto;
REVOKE ALL ON SCHEMA wb_crypto FROM PUBLIC;
CREATE EXTENSION pgcrypto WITH SCHEMA wb_crypto;
CREATE SCHEMA wb_guard AUTHORIZATION wb_identity_guard;
REVOKE ALL ON SCHEMA wb_guard FROM PUBLIC;
GRANT USAGE ON SCHEMA wb_guard TO website_runtime;
GRANT USAGE ON SCHEMA public,wb_crypto TO wb_identity_guard;
CREATE TABLE wb_guard.signing_key(id boolean PRIMARY KEY CHECK(id), secret bytea NOT NULL);
INSERT INTO wb_guard.signing_key VALUES(true,wb_crypto.gen_random_bytes(32));
ALTER TABLE wb_guard.signing_key OWNER TO wb_identity_guard;
REVOKE ALL ON wb_guard.signing_key FROM PUBLIC,website_runtime;
SET LOCAL ROLE wb_identity_guard;
CREATE FUNCTION wb_guard.subject() RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,wb_guard AS $$
DECLARE payload text:=current_setting('wellbeing.claim',true); mac text:=current_setting('wellbeing.mac',true);
  claim jsonb; actual bytea; supplied bytea; secret_value bytea; diff integer:=0; i integer; epoch_now bigint;
BEGIN
  IF session_user<>'website_runtime' OR payload IS NULL OR length(payload)>2048
    OR mac IS NULL OR mac !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid database identity' USING ERRCODE='42501'; END IF;
  SELECT secret INTO secret_value FROM wb_guard.signing_key WHERE id;
  actual:=wb_crypto.hmac(convert_to(payload,'UTF8'),secret_value,'sha256'); supplied:=decode(mac,'hex');
  FOR i IN 0..31 LOOP diff:=diff | (get_byte(actual,i) # get_byte(supplied,i)); END LOOP;
  IF diff<>0 THEN RAISE EXCEPTION 'Invalid database identity' USING ERRCODE='42501'; END IF;
  claim:=payload::jsonb; epoch_now:=floor(extract(epoch FROM clock_timestamp()))::bigint;
  IF claim->>'aud' IS DISTINCT FROM 'wellbeing-local-runtime-v1'
    OR claim->>'pid' IS DISTINCT FROM pg_backend_pid()::text
    OR claim->>'tx' IS DISTINCT FROM pg_current_xact_id()::text
    OR NOT (claim ?& ARRAY['sub','iat','exp','purpose'])
    OR claim->>'sub' IS NULL OR claim->>'iat' IS NULL
    OR claim->>'exp' IS NULL OR claim->>'purpose' IS NULL
    OR (claim->>'iat')::bigint>epoch_now OR (claim->>'exp')::bigint<=epoch_now
    OR (claim->>'exp')::bigint-(claim->>'iat')::bigint NOT BETWEEN 1 AND 60
    OR claim->>'purpose' NOT IN ('interactive','report-finalize') THEN
    RAISE EXCEPTION 'Invalid database identity' USING ERRCODE='42501';
  END IF;
  RETURN (claim->>'sub')::uuid;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid database identity' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION wb_guard.subject() FROM PUBLIC;
RESET ROLE;
GRANT SELECT(id,full_name,email,phone_number,role,user_type,institutional_id,is_active,created_at,updated_at)
  ON public.users TO wb_identity_guard;
CREATE POLICY wb_guard_own_identity ON public.users FOR SELECT TO wb_identity_guard USING(id=wb_guard.subject());
SET LOCAL ROLE wb_identity_guard;
CREATE FUNCTION wb_guard.actor_role() RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,wb_guard
AS $$ SELECT role::text FROM public.users WHERE id=wb_guard.subject() AND is_active $$;
CREATE FUNCTION wb_guard.own_profile() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object('id',id,'fullName',full_name,'email',email,'phoneNumber',phone_number,
    'role',role,'userType',user_type,'institutionalId',institutional_id,'isActive',is_active)
  INTO result FROM public.users WHERE id=wb_guard.subject() AND is_active;
  IF result IS NULL THEN RAISE EXCEPTION 'Inactive or missing profile' USING ERRCODE='42501'; END IF;
  RETURN result;
END $$;
CREATE FUNCTION wb_guard.purpose() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard AS $$
BEGIN PERFORM wb_guard.subject(); RETURN current_setting('wellbeing.claim')::jsonb->>'purpose'; END $$;
REVOKE ALL ON FUNCTION wb_guard.actor_role(),wb_guard.own_profile(),wb_guard.purpose() FROM PUBLIC;
RESET ROLE;
GRANT EXECUTE ON FUNCTION wb_guard.subject(),wb_guard.actor_role(),wb_guard.own_profile(),wb_guard.purpose() TO website_runtime;
COMMIT;
