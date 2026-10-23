-- PREPARED ONLY: obtain explicit approval and reconcile existing identities first.
-- See docs/AUTH-MIGRATION.md. Never run migrate reset/db push on this database.
BEGIN;

DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Supabase auth.users is required; no changes applied';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users p LEFT JOIN auth.users a ON a.id = p.id
    WHERE a.id IS NULL OR lower(btrim(p.email)) IS DISTINCT FROM lower(btrim(a.email))
  ) THEN
    RAISE EXCEPTION 'Reconcile legacy profiles with auth.users IDs and emails before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users a LEFT JOIN public.users p ON p.id = a.id WHERE p.id IS NULL) THEN
    RAISE EXCEPTION 'Existing Auth identities need reviewed profiles before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users GROUP BY lower(btrim(email)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Resolve case-insensitive duplicate profile emails before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users') THEN
    RAISE EXCEPTION 'Review existing users RLS policies before applying this migration';
  END IF;
END $$;

-- Keep legacy hashes intact until the separately approved post-cutover cleanup.
ALTER TABLE public.users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.users ADD CONSTRAINT users_auth_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX users_email_normalized_key ON public.users (lower(btrim(email)));

CREATE FUNCTION public.handle_auth_user_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
$$;
REVOKE ALL ON FUNCTION public.handle_auth_user_created() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER wellbeing_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_created();

-- Supabase updates email only after its email-change verification flow.
-- User-editable metadata updates do not overwrite trusted profile fields.
CREATE FUNCTION public.handle_auth_email_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.users SET email = lower(btrim(NEW.email)), updated_at = now() WHERE id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_auth_email_changed() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER wellbeing_auth_email_changed AFTER UPDATE OF email ON auth.users
  FOR EACH ROW WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_auth_email_changed();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated;
-- Also remove any pre-existing column grants: table REVOKE alone is insufficient.
REVOKE ALL (id, full_name, email, password_hash, phone_number, role, user_type,
  institutional_id, is_active, created_at, updated_at)
  ON public.users FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, full_name, email, phone_number, role, user_type,
  institutional_id, is_active, created_at, updated_at)
  ON public.users TO authenticated;
CREATE POLICY users_read_own_active_profile ON public.users
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id AND is_active = true);
-- No INSERT/UPDATE/DELETE policy or grants. Privileged role assignment is server/DB only.
-- SELECT * is deliberately denied while the legacy hash column exists.
COMMIT;
