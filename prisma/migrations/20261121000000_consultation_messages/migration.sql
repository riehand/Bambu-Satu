-- Stage 3B: website-owned text chat. Hosted execution requires separate approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.consultation_messages (
  id UUID NOT NULL PRIMARY KEY,
  consultation_session_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  client_message_id UUID NOT NULL,
  body VARCHAR(2000) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT consultation_messages_session_fkey FOREIGN KEY (consultation_session_id)
    REFERENCES public.consultation_sessions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT consultation_messages_sender_fkey FOREIGN KEY (sender_id)
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT consultation_messages_body_check CHECK (char_length(body) BETWEEN 1 AND 2000 AND body ~ '[^[:space:]]'),
  CONSTRAINT consultation_messages_idempotency_key UNIQUE (consultation_session_id, sender_id, client_message_id)
);
CREATE INDEX consultation_messages_session_order_idx ON public.consultation_messages(consultation_session_id, created_at, id);

CREATE FUNCTION public.guard_consultation_message() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE appointment_ref uuid; a public.appointments%ROWTYPE; s public.consultation_sessions%ROWTYPE; last_time timestamptz;
BEGIN
  SELECT appointment_id INTO appointment_ref FROM public.consultation_sessions WHERE id=NEW.consultation_session_id;
  -- Same appointment -> session lock order as lifecycle completion/reconciliation.
  SELECT * INTO a FROM public.appointments WHERE id=appointment_ref FOR UPDATE;
  SELECT * INTO s FROM public.consultation_sessions WHERE id=NEW.consultation_session_id FOR UPDATE;
  IF a.id IS NULL OR s.id IS NULL OR s.appointment_id<>a.id
    OR a.status<>'IN_PROGRESS' OR s.status<>'IN_PROGRESS' OR s.ended_at IS NOT NULL OR s.started_at IS NULL
    OR s.participant_checked_in_at IS NULL OR s.psychologist_checked_in_at IS NULL
    OR a.scheduled_start_at<>s.scheduled_start_at OR a.scheduled_end_at<>s.scheduled_end_at
    OR clock_timestamp()<a.scheduled_start_at OR clock_timestamp()>=a.scheduled_end_at THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CHAT_WINDOW_CLOSED';
  END IF;
  IF NEW.sender_id NOT IN (a.participant_id,a.psychologist_id)
    OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=a.participant_id AND role='PARTICIPANT' AND is_active)
    OR NOT EXISTS (SELECT 1 FROM public.users WHERE id=a.psychologist_id AND role='PSYCHOLOGIST' AND is_active) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CHAT_SENDER_DENIED';
  END IF;
  IF TG_WHEN='BEFORE' THEN
    SELECT created_at INTO last_time FROM public.consultation_messages WHERE consultation_session_id=s.id ORDER BY created_at DESC,id DESC LIMIT 1;
    -- A later insert must sort after a cursor already observed, even within one millisecond.
    NEW.created_at := greatest(date_trunc('milliseconds',clock_timestamp()),last_time + interval '1 millisecond');
  END IF;
  IF NEW.created_at>=a.scheduled_end_at THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CHAT_WINDOW_CLOSED';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consultation_message_before_insert BEFORE INSERT ON public.consultation_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_consultation_message();
-- Recheck wall time immediately before transaction commit: waiting after INSERT
-- must not let a transaction cross scheduled end with an accepted message.
CREATE CONSTRAINT TRIGGER consultation_message_commit_guard AFTER INSERT ON public.consultation_messages
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_consultation_message();

ALTER TABLE public.consultation_messages ENABLE ROW LEVEL SECURITY;
-- No Data API policies. Explicitly remove creator defaults, including service_role.
REVOKE ALL ON TABLE public.consultation_messages FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_consultation_message() FROM PUBLIC, anon, authenticated, service_role;
DO $$ DECLARE browser record; target record;
BEGIN
  FOR browser IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
    IF has_table_privilege(browser.oid,'public.consultation_messages','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
      OR has_any_column_privilege(browser.oid,'public.consultation_messages','SELECT,INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION 'Unexpected effective chat privileges; review inherited/default grants before migration';
    END IF;
    FOR target IN SELECT oid FROM pg_roles WHERE oid<>browser.oid AND pg_has_role(browser.oid,oid,'SET') LOOP
      IF has_table_privilege(target.oid,'public.consultation_messages','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(target.oid,'public.consultation_messages','SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Unexpected SET ROLE chat privileges; review membership before migration';
      END IF;
    END LOOP;
  END LOOP;
END $$;
-- Owner/postgres remains privileged: production requires separate runtime/deployer
-- credentials and custody review. No role/default ACL/platform changes here.
COMMIT;
