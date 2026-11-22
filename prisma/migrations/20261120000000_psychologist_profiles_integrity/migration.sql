-- Stage 2B.3 C4. Additive correction; hosted execution requires separate approval.
-- Do not edit the historical profile migration or silently discard invalid rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.psychologist_profiles IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.psychologist_profiles WHERE id IS NULL) THEN
    RAISE EXCEPTION 'C4: NULL profile IDs require manual reconciliation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.psychologist_profiles GROUP BY id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'C4: duplicate profile IDs require manual reconciliation';
  END IF;
  -- Prisma String[] is a one-dimensional, non-null-element list. Whole-column
  -- NULL is safely backfilled below; other unexpected shapes require review.
  IF EXISTS (
    SELECT 1 FROM public.psychologist_profiles p
    WHERE (cardinality(p.areas_of_focus) > 0 AND (array_ndims(p.areas_of_focus) <> 1 OR array_lower(p.areas_of_focus, 1) <> 1))
       OR (cardinality(p.languages) > 0 AND (array_ndims(p.languages) <> 1 OR array_lower(p.languages, 1) <> 1))
       OR EXISTS (SELECT 1 FROM unnest(p.areas_of_focus) AS a(value) WHERE value IS NULL)
       OR EXISTS (SELECT 1 FROM unnest(p.languages) AS a(value) WHERE value IS NULL)
  ) THEN
    RAISE EXCEPTION 'C4: unsupported profile array values require manual reconciliation';
  END IF;
END $$;

UPDATE public.psychologist_profiles
SET areas_of_focus = COALESCE(areas_of_focus, ARRAY[]::TEXT[]),
    languages = COALESCE(languages, ARRAY[]::TEXT[])
WHERE areas_of_focus IS NULL OR languages IS NULL;

ALTER TABLE public.psychologist_profiles
  ADD CONSTRAINT psychologist_profiles_pkey PRIMARY KEY (id),
  ALTER COLUMN areas_of_focus SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN areas_of_focus SET NOT NULL,
  ALTER COLUMN languages SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN languages SET NOT NULL;
-- Existing user FK, unique index, RLS, grants, IDs and timestamps are preserved.
COMMIT;
