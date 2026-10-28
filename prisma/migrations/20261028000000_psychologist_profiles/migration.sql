BEGIN;

CREATE TABLE public.psychologist_profiles (
  id UUID NOT NULL,
  user_id UUID NOT NULL UNIQUE,
  professional_title TEXT,
  qualification TEXT,
  education TEXT,
  short_bio TEXT,
  areas_of_focus TEXT[] DEFAULT ARRAY[]::TEXT[],
  consultation_method TEXT,
  consultation_location TEXT,
  languages TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT psychologist_profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE public.psychologist_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.psychologist_profiles FROM PUBLIC, anon, authenticated;

COMMIT;
