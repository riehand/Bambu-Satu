-- Additive Phase 3 B2 availability schema. Hosted application requires separate approval.
BEGIN;
SET LOCAL search_path = public;

CREATE TYPE "ConsultationSessionType" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');
CREATE TYPE "PsychologistAvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'BOOKED');

CREATE TABLE public.psychologist_availability (
  id UUID NOT NULL,
  psychologist_id UUID NOT NULL,
  availability_date DATE NOT NULL,
  session_type "ConsultationSessionType" NOT NULL,
  status "PsychologistAvailabilityStatus" NOT NULL DEFAULT 'UNAVAILABLE',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT psychologist_availability_pkey PRIMARY KEY (id),
  CONSTRAINT psychologist_availability_psychologist_id_fkey
    FOREIGN KEY (psychologist_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX psychologist_availability_psychologist_date_session_key
  ON public.psychologist_availability(psychologist_id, availability_date, session_type);
CREATE INDEX psychologist_availability_date_status_idx
  ON public.psychologist_availability(availability_date, status);

ALTER TABLE public.psychologist_availability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.psychologist_availability FROM PUBLIC, anon, authenticated;

COMMIT;
