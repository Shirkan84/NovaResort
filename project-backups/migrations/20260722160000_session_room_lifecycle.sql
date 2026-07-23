-- Extend session room lifecycle: add 'closed' status and open/close/reopen RPCs.

-- 1. Update CHECK constraint to allow 'closed' status
ALTER TABLE public.session_room_state DROP CONSTRAINT IF EXISTS session_room_state_status_check;
ALTER TABLE public.session_room_state ADD CONSTRAINT session_room_state_status_check CHECK (status IN ('waiting','live','closed','ended'));

-- 2. Add closed_at column
ALTER TABLE public.session_room_state ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- 3. open_session_room — idempotent: creates room state if missing, sets to live
CREATE OR REPLACE FUNCTION public.open_session_room(target_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_host uuid;
BEGIN
  SELECT host_id INTO v_host FROM public.sessions WHERE id = target_session;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_host <> auth.uid() THEN RAISE EXCEPTION 'Only the host can open the room'; END IF;

  INSERT INTO public.session_room_state (session_id, status, started_at, started_by)
  VALUES (target_session, 'live', now(), auth.uid())
  ON CONFLICT (session_id) DO UPDATE
    SET status = 'live', started_at = COALESCE(session_room_state.started_at, now()),
        started_by = COALESCE(session_room_state.started_by, auth.uid()),
        closed_at = NULL, updated_at = now();

  UPDATE public.sessions SET status = 'live', updated_at = now() WHERE id = target_session AND status NOT IN ('completed','cancelled');
END; $$;

-- 4. close_session_room — sets status to closed
CREATE OR REPLACE FUNCTION public.close_session_room(target_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_host uuid;
BEGIN
  SELECT host_id INTO v_host FROM public.sessions WHERE id = target_session;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_host <> auth.uid() THEN RAISE EXCEPTION 'Only the host can close the room'; END IF;

  UPDATE public.session_room_state SET status = 'closed', closed_at = now(), updated_at = now()
  WHERE session_id = target_session AND status IN ('waiting','live');

  UPDATE public.sessions SET status = 'published', updated_at = now()
  WHERE id = target_session AND status = 'live';
END; $$;

-- 5. reopen_session_room — sets status back to live from closed
CREATE OR REPLACE FUNCTION public.reopen_session_room(target_session uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_host uuid;
BEGIN
  SELECT host_id INTO v_host FROM public.sessions WHERE id = target_session;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF v_host <> auth.uid() THEN RAISE EXCEPTION 'Only the host can reopen the room'; END IF;

  UPDATE public.session_room_state SET status = 'live', closed_at = NULL, updated_at = now()
  WHERE session_id = target_session AND status = 'closed';

  UPDATE public.sessions SET status = 'live', updated_at = now()
  WHERE id = target_session AND status NOT IN ('completed','cancelled');
END; $$;

-- 6. Revoke from public, grant to authenticated
REVOKE EXECUTE ON FUNCTION public.open_session_room(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.open_session_room(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.close_session_room(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.close_session_room(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.reopen_session_room(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reopen_session_room(uuid) TO authenticated;
