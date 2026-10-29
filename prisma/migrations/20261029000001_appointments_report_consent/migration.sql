-- Additive Phase 3 appointment and report-consent schema. Do not apply to hosted Supabase without separate approval.
BEGIN;
SET LOCAL search_path = public;

CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');
CREATE TYPE "ConsultationSessionStatus" AS ENUM ('SCHEDULED', 'READY', 'IN_PROGRESS', 'PSYCHOLOGIST_LATE', 'PARTICIPANT_LATE', 'NO_SHOW', 'COMPLETED', 'CLOSED');
CREATE TYPE "ConsultationEndedBy" AS ENUM ('PSYCHOLOGIST', 'SYSTEM');
CREATE TYPE "ConsultationEndReason" AS ENUM ('PSYCHOLOGIST_COMPLETED', 'SCHEDULED_END_REACHED', 'PARTICIPANT_NO_SHOW', 'PSYCHOLOGIST_NO_SHOW');
CREATE TYPE "ConsentType" AS ENUM ('APPOINTMENT_REPORT_ACCESS', 'STANDALONE_REPORT_ACCESS');
CREATE TYPE "ConsentAuditAction" AS ENUM ('GRANTED', 'REVOKED', 'EXPIRED', 'ACCESSED');
CREATE TYPE "ConsentAuditActorType" AS ENUM ('USER', 'SYSTEM');

-- Composite references make owner/report/slot associations database-verifiable too.
ALTER TABLE public.assessment_sessions
  ADD CONSTRAINT assessment_sessions_id_participant_key UNIQUE (id, participant_id);
ALTER TABLE public.reports
  ADD CONSTRAINT reports_id_assessment_session_key UNIQUE (id, assessment_session_id);
ALTER TABLE public.psychologist_availability
  ADD CONSTRAINT psychologist_availability_id_psychologist_key UNIQUE (id, psychologist_id);

CREATE TABLE public.appointments (
  id UUID NOT NULL,
  participant_id UUID NOT NULL,
  psychologist_id UUID NOT NULL,
  assessment_session_id UUID NOT NULL,
  report_id UUID NOT NULL,
  availability_id UUID NOT NULL,
  rescheduled_from_appointment_id UUID,
  participant_note VARCHAR(500),
  status "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
  scheduled_start_at TIMESTAMPTZ(3) NOT NULL,
  scheduled_end_at TIMESTAMPTZ(3) NOT NULL,
  booked_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ(3),
  cancelled_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT appointments_pkey PRIMARY KEY (id),
  CONSTRAINT appointments_time_window_check CHECK (
    scheduled_end_at > scheduled_start_at AND scheduled_end_at = scheduled_start_at + INTERVAL '2 hours'
  ),
  CONSTRAINT appointments_participant_fkey FOREIGN KEY (participant_id)
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT appointments_psychologist_fkey FOREIGN KEY (psychologist_id)
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT appointments_assessment_owner_fkey FOREIGN KEY (assessment_session_id, participant_id)
    REFERENCES public.assessment_sessions(id, participant_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT appointments_report_session_fkey FOREIGN KEY (report_id, assessment_session_id)
    REFERENCES public.reports(id, assessment_session_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT appointments_availability_psychologist_fkey FOREIGN KEY (availability_id, psychologist_id)
    REFERENCES public.psychologist_availability(id, psychologist_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT appointments_rescheduled_from_fkey FOREIGN KEY (rescheduled_from_appointment_id)
    REFERENCES public.appointments(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX appointments_id_scope_key ON public.appointments(id, participant_id, report_id, psychologist_id);
CREATE UNIQUE INDEX appointments_one_active_per_slot_key
  ON public.appointments(availability_id) WHERE status IN ('CONFIRMED', 'IN_PROGRESS');
CREATE INDEX appointments_participant_status_start_idx ON public.appointments(participant_id, status, scheduled_start_at);
CREATE INDEX appointments_psychologist_status_start_idx ON public.appointments(psychologist_id, status, scheduled_start_at);
CREATE INDEX appointments_rescheduled_from_idx ON public.appointments(rescheduled_from_appointment_id);

CREATE TABLE public.consultation_sessions (
  id UUID NOT NULL,
  appointment_id UUID NOT NULL,
  status "ConsultationSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
  scheduled_start_at TIMESTAMPTZ(3) NOT NULL,
  scheduled_end_at TIMESTAMPTZ(3) NOT NULL,
  participant_checked_in_at TIMESTAMPTZ(3),
  psychologist_checked_in_at TIMESTAMPTZ(3),
  started_at TIMESTAMPTZ(3),
  ended_at TIMESTAMPTZ(3),
  ended_by "ConsultationEndedBy",
  end_reason "ConsultationEndReason",
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT consultation_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT consultation_sessions_appointment_key UNIQUE (appointment_id),
  CONSTRAINT consultation_sessions_appointment_fkey FOREIGN KEY (appointment_id)
    REFERENCES public.appointments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT consultation_sessions_time_window_check CHECK (
    scheduled_end_at > scheduled_start_at AND scheduled_end_at = scheduled_start_at + INTERVAL '2 hours'
  )
);

CREATE TABLE public.consents (
  id UUID NOT NULL,
  participant_id UUID NOT NULL,
  assessment_session_id UUID NOT NULL,
  report_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  appointment_id UUID,
  consent_type "ConsentType" NOT NULL,
  purpose TEXT NOT NULL,
  scope JSONB NOT NULL,
  policy_version VARCHAR(80) NOT NULL,
  granted_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ(3),
  expired_at TIMESTAMPTZ(3),
  revoked_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT consents_pkey PRIMARY KEY (id),
  CONSTRAINT consents_type_appointment_check CHECK (
    (consent_type = 'APPOINTMENT_REPORT_ACCESS' AND appointment_id IS NOT NULL AND expires_at IS NOT NULL)
    OR (consent_type = 'STANDALONE_REPORT_ACCESS' AND appointment_id IS NULL AND expires_at IS NULL AND expired_at IS NULL)
  ),
  CONSTRAINT consents_temporal_order_check CHECK (
    (revoked_at IS NULL OR revoked_at >= granted_at)
    AND (expired_at IS NULL OR expired_at >= granted_at)
    AND (expires_at IS NULL OR expires_at > granted_at)
  ),
  CONSTRAINT consents_participant_fkey FOREIGN KEY (participant_id)
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT consents_target_fkey FOREIGN KEY (target_user_id)
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT consents_assessment_owner_fkey FOREIGN KEY (assessment_session_id, participant_id)
    REFERENCES public.assessment_sessions(id, participant_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT consents_report_session_fkey FOREIGN KEY (report_id, assessment_session_id)
    REFERENCES public.reports(id, assessment_session_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT consents_appointment_scope_fkey FOREIGN KEY (appointment_id, participant_id, report_id, target_user_id)
    REFERENCES public.appointments(id, participant_id, report_id, psychologist_id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX consents_active_appointment_scope_key
  ON public.consents(appointment_id, report_id, target_user_id)
  WHERE consent_type = 'APPOINTMENT_REPORT_ACCESS' AND revoked_at IS NULL AND expired_at IS NULL;
CREATE UNIQUE INDEX consents_active_standalone_scope_key
  ON public.consents(participant_id, report_id, target_user_id)
  WHERE consent_type = 'STANDALONE_REPORT_ACCESS' AND revoked_at IS NULL AND expired_at IS NULL;
CREATE INDEX consents_participant_granted_at_idx ON public.consents(participant_id, granted_at);
CREATE INDEX consents_target_report_type_idx ON public.consents(target_user_id, report_id, consent_type);
CREATE INDEX consents_appointment_type_idx ON public.consents(appointment_id, consent_type);

CREATE TABLE public.consent_audit_events (
  id UUID NOT NULL,
  consent_id UUID NOT NULL,
  actor_type "ConsentAuditActorType" NOT NULL,
  actor_user_id UUID,
  action "ConsentAuditAction" NOT NULL,
  occurred_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT consent_audit_events_pkey PRIMARY KEY (id),
  CONSTRAINT consent_audit_events_actor_check CHECK (
    (actor_type = 'USER' AND actor_user_id IS NOT NULL)
    OR (actor_type = 'SYSTEM' AND actor_user_id IS NULL)
  ),
  CONSTRAINT consent_audit_events_consent_fkey FOREIGN KEY (consent_id)
    REFERENCES public.consents(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT consent_audit_events_actor_fkey FOREIGN KEY (actor_user_id)
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX consent_audit_events_consent_time_idx ON public.consent_audit_events(consent_id, occurred_at);

CREATE FUNCTION public.phase3_protect_consent_grant() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Consent grants are historical records and cannot be deleted'; END IF;
  IF ROW(NEW.participant_id, NEW.assessment_session_id, NEW.report_id, NEW.target_user_id, NEW.appointment_id,
         NEW.consent_type, NEW.purpose, NEW.scope, NEW.policy_version, NEW.granted_at, NEW.expires_at, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.participant_id, OLD.assessment_session_id, OLD.report_id, OLD.target_user_id, OLD.appointment_id,
         OLD.consent_type, OLD.purpose, OLD.scope, OLD.policy_version, OLD.granted_at, OLD.expires_at, OLD.created_at)
    THEN RAISE EXCEPTION 'Consent grant scope and policy are immutable'; END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
    THEN RAISE EXCEPTION 'Revoked consent grants cannot be reactivated or changed'; END IF;
  IF OLD.expired_at IS NOT NULL AND NEW.expired_at IS DISTINCT FROM OLD.expired_at
    THEN RAISE EXCEPTION 'Expired consent grants cannot be reactivated or changed'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER phase3_protect_consent_grant BEFORE UPDATE OR DELETE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.phase3_protect_consent_grant();

CREATE FUNCTION public.phase3_protect_consent_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Consent audit events are append-only';
END $$;
CREATE TRIGGER phase3_protect_consent_audit BEFORE UPDATE OR DELETE ON public.consent_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.phase3_protect_consent_audit();

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.appointments, public.consultation_sessions, public.consents, public.consent_audit_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_protect_consent_grant(), public.phase3_protect_consent_audit() FROM PUBLIC, anon, authenticated;

COMMIT;
