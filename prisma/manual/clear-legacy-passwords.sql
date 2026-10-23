-- DO NOT EXECUTE without a verified backup, successful cutover, and explicit approval.
-- Clearing a hash cannot be reversed without a backup. The column is retained.
BEGIN;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users p LEFT JOIN auth.users a ON a.id = p.id
    WHERE a.id IS NULL OR a.email_confirmed_at IS NULL
      OR lower(btrim(p.email)) IS DISTINCT FROM lower(btrim(a.email))
  ) THEN
    RAISE EXCEPTION 'Verify every legacy identity and its login/recovery path before hash cleanup';
  END IF;
END $$;
UPDATE public.users SET password_hash = NULL WHERE password_hash IS NOT NULL;
COMMIT;
