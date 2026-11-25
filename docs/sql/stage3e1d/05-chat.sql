-- TEST ONLY - HOSTED NOT EXECUTED - APPROVAL REQUIRED.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'wellbeing_phase3_rehearsal' OR to_regclass('rehearsal.identity') IS NULL OR current_setting('wellbeing.stage3e1d',true) IS DISTINCT FROM 'approved-isolated-prototype'
 THEN RAISE EXCEPTION 'Isolated rehearsal only'; END IF;
END $$;

-- Existing trigger body remains intact. Deferred firing occurs after definer returns;
-- a constrained trigger owner is required so RLS checks do not silently see zero rows.
ALTER FUNCTION public.guard_consultation_message() OWNER TO wb_chat;
ALTER FUNCTION public.guard_consultation_message() SECURITY DEFINER;
ALTER FUNCTION public.guard_consultation_message() SET search_path=pg_catalog,public,pg_temp;
REVOKE ALL ON FUNCTION public.guard_consultation_message() FROM PUBLIC,website_runtime;
CREATE FUNCTION wb_guard.d_chat_open(target uuid) RETURNS public.consultation_sessions LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE a public.appointments; s public.consultation_sessions; t timestamptz;
BEGIN
 a:=wb_guard.d_lock_appointment(target);
 SELECT * INTO s FROM public.consultation_sessions WHERE appointment_id=a.id;
 t:=clock_timestamp();
 IF s.id IS NULL OR a.status<>'IN_PROGRESS' OR s.status<>'IN_PROGRESS' OR s.started_at IS NULL OR s.ended_at IS NOT NULL OR s.participant_checked_in_at IS NULL OR s.psychologist_checked_in_at IS NULL
 OR s.scheduled_start_at<>a.scheduled_start_at OR s.scheduled_end_at<>a.scheduled_end_at OR t<a.scheduled_start_at OR t>=a.scheduled_end_at THEN RAISE EXCEPTION 'CHAT_CLOSED'; END IF;
 RETURN s;
END $$;
REVOKE ALL ON FUNCTION wb_guard.d_chat_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.d_chat_open(uuid) TO wb_chat;
CREATE FUNCTION wb_guard.send_message(appointment_id uuid,client_id uuid,message_body text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE actor uuid:=wb_guard.d_actor(); s public.consultation_sessions; m public.consultation_messages; normalized text;
BEGIN
 IF client_id IS NULL OR message_body IS NULL OR (SELECT coalesce(sum(CASE WHEN ascii(ch)>65535 THEN 2 ELSE 1 END),0) FROM regexp_split_to_table(message_body,'') AS ch)>2000 THEN RAISE EXCEPTION 'Invalid message' USING ERRCODE='22023'; END IF;
 -- ECMAScript trim whitespace, matching the existing Zod command boundary.
 normalized:=btrim(message_body,E' \t\n\r\f' || chr(11) || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 IF char_length(normalized)=0 THEN RAISE EXCEPTION 'Invalid message' USING ERRCODE='22023'; END IF;
 s:=wb_guard.d_chat_open(appointment_id);
 SELECT * INTO m FROM public.consultation_messages WHERE consultation_session_id=s.id AND sender_id=actor AND client_message_id=client_id;
 IF FOUND THEN
  IF m.body<>normalized THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  PERFORM wb_guard.d_chat_open(appointment_id);
  RETURN jsonb_build_object('id',m.id,'body',m.body,'createdAt',m.created_at,'clientMessageId',m.client_message_id,'replayed',true);
 END IF;
 INSERT INTO public.consultation_messages(id,consultation_session_id,sender_id,client_message_id,body) VALUES(gen_random_uuid(),s.id,actor,client_id,normalized) RETURNING * INTO m;
 RETURN jsonb_build_object('id',m.id,'body',m.body,'createdAt',m.created_at,'clientMessageId',m.client_message_id,'replayed',false);
END $$;
CREATE FUNCTION wb_guard.confirm_message(appointment_id uuid,message_id uuid,client_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE actor uuid:=wb_guard.d_actor();
BEGIN
 -- Scoped acknowledgement only. No post-session body/history retrieval.
 RETURN EXISTS(SELECT 1 FROM public.consultation_messages m JOIN public.consultation_sessions s ON s.id=m.consultation_session_id JOIN public.appointments a ON a.id=s.appointment_id
 WHERE a.id=confirm_message.appointment_id AND m.id=message_id AND m.sender_id=actor AND m.client_message_id=client_id);
END $$;
CREATE FUNCTION wb_guard.read_messages(appointment_id uuid,page_size integer DEFAULT 30,cursor_id uuid DEFAULT NULL,direction text DEFAULT 'before') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,wb_guard,pg_temp AS $$
DECLARE actor uuid:=wb_guard.d_actor(); s public.consultation_sessions; cursor_row public.consultation_messages; items jsonb; more boolean; next_id uuid; latest_id uuid;
BEGIN
 IF page_size IS NULL OR page_size NOT BETWEEN 1 AND 50 OR direction IS NULL OR direction NOT IN ('before','after') THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 s:=wb_guard.d_chat_open(appointment_id);
 IF cursor_id IS NOT NULL THEN
  SELECT * INTO cursor_row FROM public.consultation_messages WHERE id=cursor_id AND consultation_session_id=s.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CURSOR' USING ERRCODE='22023'; END IF;
 END IF;
 WITH candidates AS (
  SELECT m.*,row_number() OVER(ORDER BY CASE WHEN direction='after' THEN m.created_at END ASC,CASE WHEN direction='after' THEN m.id END ASC,CASE WHEN direction='before' THEN m.created_at END DESC,CASE WHEN direction='before' THEN m.id END DESC) AS rn
  FROM public.consultation_messages m WHERE consultation_session_id=s.id AND (cursor_id IS NULL OR (direction='after' AND (m.created_at,m.id)>(cursor_row.created_at,cursor_row.id)) OR (direction='before' AND (m.created_at,m.id)<(cursor_row.created_at,cursor_row.id)))
 ), page AS (SELECT * FROM candidates WHERE rn<=page_size+1)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'body',body,'createdAt',created_at,'own',sender_id=actor,'senderRole',CASE WHEN sender_id=actor THEN wb_guard.actor_role() ELSE CASE WHEN wb_guard.actor_role()='PARTICIPANT' THEN 'PSYCHOLOGIST' ELSE 'PARTICIPANT' END END,'clientMessageId',CASE WHEN sender_id=actor THEN client_message_id END) ORDER BY created_at,id) FILTER(WHERE rn<=page_size),'[]'::jsonb),
 count(*)>page_size,(array_agg(id ORDER BY rn DESC) FILTER(WHERE rn<=page_size))[1],(array_agg(id ORDER BY created_at DESC,id DESC) FILTER(WHERE rn<=page_size))[1]
 INTO items,more,next_id,latest_id FROM page;
 PERFORM wb_guard.d_chat_open(appointment_id); -- recheck wall clock after read
 RETURN jsonb_build_object('items',items,'nextCursor',CASE WHEN more THEN next_id END,'latestCursor',coalesce(latest_id,cursor_id));
END $$;
ALTER FUNCTION wb_guard.send_message(uuid,uuid,text) OWNER TO wb_chat;
REVOKE ALL ON FUNCTION wb_guard.send_message(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.send_message(uuid,uuid,text) TO website_runtime;
ALTER FUNCTION wb_guard.confirm_message(uuid,uuid,uuid) OWNER TO wb_chat;
REVOKE ALL ON FUNCTION wb_guard.confirm_message(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.confirm_message(uuid,uuid,uuid) TO website_runtime;
ALTER FUNCTION wb_guard.read_messages(uuid,integer,uuid,text) OWNER TO wb_chat;
REVOKE ALL ON FUNCTION wb_guard.read_messages(uuid,integer,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wb_guard.read_messages(uuid,integer,uuid,text) TO website_runtime;
COMMIT;
