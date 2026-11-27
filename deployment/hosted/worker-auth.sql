-- APPROVAL REQUIRED. Additive machine registry + hook, and one guarded Auth function update.
-- No account, credential, registry row, token, Auth hook activation or bucket is created.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres'
 OR current_setting('wellbeing.approved_hosted_ref',true) IS DISTINCT FROM 'bofoowyzlnfhwcstlmgp'
 OR to_regnamespace('wb_machine') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='wb_report_storage')
 THEN RAISE EXCEPTION 'Verified target and reviewed Storage role required'; END IF;
 -- Refuse to overwrite changes made by the shared Auth owner since the baseline.
 IF (SELECT replace(prosrc,E'\r\n',E'\n') FROM pg_proc WHERE oid='public.handle_auth_user_created()'::regprocedure)
 IS DISTINCT FROM replace($baseline$
DECLARE
  meta jsonb := NEW.raw_user_meta_data;
  profile_name text;
  institution text;
  phone text;
  kind text;
BEGIN
  IF NEW.email IS NULL OR length(NEW.email) > 254
     OR jsonb_typeof(meta -> 'full_name') IS DISTINCT FROM 'string'
     OR jsonb_typeof(meta -> 'institutional_id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(meta -> 'phone_number') IS DISTINCT FROM 'string'
     OR jsonb_typeof(meta -> 'user_type') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Valid registration profile fields are required' USING ERRCODE = '23514';
  END IF;
  profile_name := btrim(meta ->> 'full_name');
  institution := btrim(meta ->> 'institutional_id');
  phone := btrim(meta ->> 'phone_number');
  kind := meta ->> 'user_type';
  IF length(profile_name) NOT BETWEEN 2 AND 150
     OR institution !~ '^[A-Za-z0-9.-]{5,40}$'
     OR phone !~ '^\+?[0-9 ()-]{9,25}$'
     OR kind NOT IN ('STUDENT', 'LECTURER') THEN
    RAISE EXCEPTION 'Invalid registration profile' USING ERRCODE = '23514';
  END IF;
  -- No ON CONFLICT/upsert: any failure rolls back the Auth insert too.
  -- role, is_active, email, id and password_hash NEVER come from metadata.
  INSERT INTO public.users (
    id, full_name, email, phone_number, role, user_type, institutional_id,
    is_active, created_at, updated_at
  ) VALUES (
    NEW.id, profile_name, lower(btrim(NEW.email)), phone,
    'PARTICIPANT'::public."Role", kind::public."UserType", institution,
    true, now(), now()
  );
  RETURN NEW;
END;
$baseline$,E'\r\n',E'\n')
 THEN RAISE EXCEPTION 'Auth profile function drift: review before replacement'; END IF;
END $guard$;
CREATE SCHEMA wb_machine;
REVOKE ALL ON SCHEMA wb_machine FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE wb_machine.identities(
 id uuid PRIMARY KEY,
 email text NOT NULL UNIQUE CHECK(email=lower(btrim(email)) AND position('@' in email)>1),
 enabled boolean NOT NULL DEFAULT false
);
-- No Auth FK: reserve an operator-chosen UUID BEFORE creating its Auth identity.
ALTER TABLE wb_machine.identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wb_machine.identities FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA wb_machine TO supabase_auth_admin,wb_report_storage;
GRANT SELECT ON wb_machine.identities TO supabase_auth_admin;
CREATE POLICY wb_machine_auth_read ON wb_machine.identities FOR SELECT TO supabase_auth_admin USING(true);

CREATE FUNCTION wb_machine.access_token_hook(event jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $hook$
DECLARE machine wb_machine.identities; claims jsonb:=event->'claims'; issued bigint;
BEGIN
 SELECT * INTO machine FROM wb_machine.identities WHERE id=(event->>'user_id')::uuid;
 IF NOT FOUND THEN RETURN event; END IF; -- Ordinary users: exact JSON unchanged.
 IF NOT machine.enabled OR claims->>'sub' IS DISTINCT FROM machine.id::text
 OR claims->>'email' IS DISTINCT FROM machine.email
 OR claims->>'iss' IS DISTINCT FROM 'https://bofoowyzlnfhwcstlmgp.supabase.co/auth/v1'
 OR claims->>'aud' IS DISTINCT FROM 'authenticated'
 OR event->>'authentication_method' IS NULL
 OR event->>'authentication_method' NOT IN ('password','token_refresh')
 THEN RAISE EXCEPTION 'Worker authentication denied'; END IF;
 issued:=(claims->>'iat')::bigint;
 IF issued IS NULL OR (claims->>'exp')::bigint IS NULL OR (claims->>'exp')::bigint<=issued
 THEN RAISE EXCEPTION 'Invalid worker token lifetime'; END IF;
 claims:=jsonb_set(claims,'{role}','"wb_report_storage"'::jsonb);
 claims:=jsonb_set(claims,'{exp}',to_jsonb(least((claims->>'exp')::bigint,issued+900)));
 RETURN jsonb_set(event,'{claims}',claims);
END $hook$;
REVOKE ALL ON FUNCTION wb_machine.access_token_hook(jsonb) FROM PUBLIC,anon,authenticated,service_role,wb_report_storage;
GRANT EXECUTE ON FUNCTION wb_machine.access_token_hook(jsonb) TO supabase_auth_admin;

-- Immediate Storage denial when a machine is disabled, even before JWT expiry.
CREATE FUNCTION wb_machine.storage_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $enabled$
 SELECT EXISTS(SELECT 1 FROM wb_machine.identities m
 WHERE m.id::text=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub') AND m.enabled)
$enabled$;
REVOKE ALL ON FUNCTION wb_machine.storage_enabled() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION wb_machine.storage_enabled() TO wb_report_storage;
CREATE POLICY wb_machine_storage_enabled ON storage.objects AS RESTRICTIVE FOR ALL TO wb_report_storage
USING(wb_machine.storage_enabled()) WITH CHECK(wb_machine.storage_enabled());
CREATE POLICY wb_machine_bucket_enabled ON storage.buckets AS RESTRICTIVE FOR ALL TO wb_report_storage
USING(wb_machine.storage_enabled()) WITH CHECK(false);

CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  meta jsonb := NEW.raw_user_meta_data;
  profile_name text;
  institution text;
  phone text;
  kind text;
BEGIN
  -- Only an operator-reserved UUID can bypass the HUMAN profile trigger.
  -- This is not controlled by user_metadata or by a caller-supplied role.
  IF EXISTS (SELECT 1 FROM wb_machine.identities m WHERE m.id=NEW.id) THEN
    IF NOT EXISTS (SELECT 1 FROM wb_machine.identities m WHERE m.id=NEW.id AND m.email=lower(btrim(NEW.email))) THEN
      RAISE EXCEPTION 'Reserved worker identity mismatch';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.email IS NULL OR length(NEW.email) > 254
     OR jsonb_typeof(meta -> 'full_name') IS DISTINCT FROM 'string'
     OR jsonb_typeof(meta -> 'institutional_id') IS DISTINCT FROM 'string'
     OR jsonb_typeof(meta -> 'phone_number') IS DISTINCT FROM 'string'
     OR jsonb_typeof(meta -> 'user_type') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Valid registration profile fields are required' USING ERRCODE = '23514';
  END IF;
  profile_name := btrim(meta ->> 'full_name');
  institution := btrim(meta ->> 'institutional_id');
  phone := btrim(meta ->> 'phone_number');
  kind := meta ->> 'user_type';
  IF length(profile_name) NOT BETWEEN 2 AND 150
     OR institution !~ '^[A-Za-z0-9.-]{5,40}$'
     OR phone !~ '^\+?[0-9 ()-]{9,25}$'
     OR kind NOT IN ('STUDENT', 'LECTURER') THEN
    RAISE EXCEPTION 'Invalid registration profile' USING ERRCODE = '23514';
  END IF;
  -- No ON CONFLICT/upsert: any failure rolls back the Auth insert too.
  -- role, is_active, email, id and password_hash NEVER come from metadata.
  INSERT INTO public.users (
    id, full_name, email, phone_number, role, user_type, institutional_id,
    is_active, created_at, updated_at
  ) VALUES (
    NEW.id, profile_name, lower(btrim(NEW.email)), phone,
    'PARTICIPANT'::public."Role", kind::public."UserType", institution,
    true, now(), now()
  );
  RETURN NEW;
END;
$$;
-- Existing function owner/grants and trigger attachment are preserved by OR REPLACE.
COMMIT;
