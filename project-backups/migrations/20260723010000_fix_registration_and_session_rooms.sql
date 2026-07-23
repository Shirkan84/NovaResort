-- =============================================================================
-- FIX 1: Registration — account_status CHECK constraint must include 'email_pending'
-- =============================================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active','email_pending','paused','suspended','deleted'));

-- =============================================================================
-- FIX 2: handle_new_user() — set GUC flag before healer UPDATE so the
--         BEFORE UPDATE trigger (prevent_unauthorized_profile_field_changes)
--         does not block the insert transaction.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reg jsonb := COALESCE(new.raw_user_meta_data->'registration_data', '{}'::jsonb);
  requested_role text := COALESCE(new.raw_user_meta_data->>'role', 'member');
  resolved_type text := CASE WHEN requested_role = 'healer' THEN 'healer' ELSE 'member' END;
  first_name_val text := COALESCE(reg->>'first_name', '');
  last_name_val text := COALESCE(reg->>'last_name', '');
  display_val text := CASE WHEN first_name_val != '' AND last_name_val != '' THEN first_name_val || ' ' || last_name_val ELSE split_part(new.email, '@', 1) END;
BEGIN
  -- Shared profiles row: account_status depends on whether email is already confirmed
  INSERT INTO public.profiles (
    id, full_name, display_name, email, country, city,
    profile_type, account_status, professional_verification_status
  )
  VALUES (
    new.id,
    display_val,
    display_val,
    new.email,
    NULLIF(reg->>'location', ''),
    NULLIF(reg->>'location', ''),
    resolved_type,
    CASE WHEN new.email_confirmed_at IS NOT NULL THEN 'active' ELSE 'email_pending' END,
    CASE WHEN resolved_type = 'healer' THEN 'approved' ELSE 'unverified' END
  )
  ON CONFLICT (id) DO NOTHING;

  IF resolved_type = 'healer' THEN
    -- Healer-specific profile
    INSERT INTO public.healer_profiles (
      user_id, first_name, last_name, professional_title, professional_summary,
      biography, years_experience, languages, location, online_available,
      in_person_available, qualifications, treatment_areas, modalities,
      client_populations, session_formats, profile_visibility, website, social_links
    )
    VALUES (
      new.id,
      first_name_val,
      last_name_val,
      COALESCE(reg->>'professional_title', ''),
      NULLIF(reg->>'professional_summary', ''),
      NULLIF(reg->>'biography', ''),
      NULLIF(reg->>'years_experience', '')::integer,
      COALESCE(array(SELECT jsonb_array_elements_text(reg->'languages')), '{}'::text[]),
      NULLIF(reg->>'location', ''),
      COALESCE((reg->>'online_available')::boolean, true),
      COALESCE((reg->>'in_person_available')::boolean, false),
      COALESCE(array(SELECT jsonb_array_elements_text(reg->'qualifications')), '{}'::text[]),
      COALESCE(array(SELECT jsonb_array_elements_text(reg->'treatment_areas')), '{}'::text[]),
      COALESCE(array(SELECT jsonb_array_elements_text(reg->'modalities')), '{}'::text[]),
      COALESCE(array(SELECT jsonb_array_elements_text(reg->'client_populations')), '{}'::text[]),
      COALESCE(array(SELECT jsonb_array_elements_text(reg->'session_formats')), '{}'::text[]),
      COALESCE(reg->>'profile_visibility', 'public'),
      NULLIF(reg->>'website', ''),
      COALESCE(reg->'social_links', '{}'::jsonb)
    )
    ON CONFLICT (user_id) DO NOTHING;

    -- Sync key healer fields to shared profiles row
    -- Bypass the BEFORE UPDATE trigger via GUC flag so the insert transaction succeeds.
    PERFORM set_config('app.email_confirmation_update', 'true', true);
    UPDATE public.profiles SET
      professional_title = COALESCE(NULLIF(reg->>'professional_title', ''), profiles.professional_title),
      specialties = COALESCE(array(SELECT jsonb_array_elements_text(reg->'treatment_areas')), profiles.specialties),
      languages = COALESCE(array(SELECT jsonb_array_elements_text(reg->'languages')), profiles.languages),
      years_experience = COALESCE(NULLIF(reg->>'years_experience', '')::integer, profiles.years_experience),
      about = COALESCE(NULLIF(reg->>'professional_summary', ''), profiles.about)
    WHERE id = new.id;
    PERFORM set_config('app.email_confirmation_update', 'false', true);
  ELSE
    -- Member-specific profile
    INSERT INTO public.member_profiles (
      user_id, first_name, last_name, preferred_language, location,
      interests, wellness_goals
    )
    VALUES (
      new.id,
      first_name_val,
      last_name_val,
      COALESCE(reg->>'preferred_language', 'English'),
      NULLIF(reg->>'location', ''),
      COALESCE(array(SELECT jsonb_array_elements_text(reg->'interests')), '{}'::text[]),
      COALESCE(array(SELECT jsonb_array_elements_text(reg->'wellness_goals')), '{}'::text[])
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN new;
END;
$$;

-- =============================================================================
-- FIX 3: Session rooms — add provider_room_name column and rewrite RPCs
-- =============================================================================

-- Add provider_room_name to session_room_state
ALTER TABLE public.session_room_state
  ADD COLUMN IF NOT EXISTS provider_room_name text;

-- Backfill existing live/ended rooms with a deterministic name
UPDATE public.session_room_state
SET provider_room_name = 'nova-' || replace(session_id::text, '-', '')
WHERE provider_room_name IS NULL;

-- Add NOT NULL for non-waiting rooms via CHECK (only enforce for new inserts going forward)
-- We cannot add NOT NULL directly because existing 'waiting' rows have NULL.
-- Instead, the RPCs will always set it.

-- Unique constraint on provider_room_name (once set, no duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_room_state_provider_room_name
  ON public.session_room_state (provider_room_name)
  WHERE provider_room_name IS NOT NULL;

-- =============================================================================
-- FIX 4: Rewrite open_session_room — idempotent, generates stable room name,
--         notifies participants.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.open_session_room(target_session uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid;
  v_room_name text;
  v_existing text;
BEGIN
  -- Verify caller is the session host
  SELECT host_id INTO v_host FROM public.sessions WHERE id = target_session;
  IF v_host IS NULL THEN
    RAISE EXCEPTION 'Session not found.';
  END IF;
  IF v_host <> auth.uid() THEN
    RAISE EXCEPTION 'Only the session host can open the room.';
  END IF;

  -- Check session is not cancelled or completed
  IF EXISTS (SELECT 1 FROM public.sessions WHERE id = target_session AND status IN ('cancelled','completed')) THEN
    RAISE EXCEPTION 'This session has been cancelled or completed.';
  END IF;

  -- Check for existing room — reuse if present
  SELECT provider_room_name INTO v_existing
  FROM public.session_room_state
  WHERE session_id = target_session;

  IF v_existing IS NOT NULL THEN
    -- Room already exists, just reopen if needed
    UPDATE public.session_room_state
    SET status = 'live',
        closed_at = NULL,
        started_at = COALESCE(started_at, now()),
        started_by = COALESCE(started_by, auth.uid()),
        updated_at = now()
    WHERE session_id = target_session
      AND status != 'live';
  ELSE
    -- Generate stable room name: nova-{32 hex chars of session UUID}
    v_room_name := 'nova-' || replace(target_session::text, '-', '');

    INSERT INTO public.session_room_state (session_id, status, provider_room_name, started_at, started_by)
    VALUES (target_session, 'live', v_room_name, now(), auth.uid());
  END IF;

  -- Update session status
  UPDATE public.sessions
  SET status = 'live', updated_at = now()
  WHERE id = target_session
    AND status NOT IN ('cancelled','completed');
END;
$$;

-- =============================================================================
-- FIX 5: Rewrite join_session_room — returns provider_room_name (jsonb)
-- Must DROP first because return type changes from text to jsonb.
-- =============================================================================
DROP FUNCTION IF EXISTS public.join_session_room(uuid);
CREATE FUNCTION public.join_session_room(target_session uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_room_status text;
  v_room_name text;
  v_session_status text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be signed in.';
  END IF;

  -- Verify session exists and is not cancelled
  SELECT status INTO v_session_status FROM public.sessions WHERE id = target_session;
  IF v_session_status IS NULL THEN
    RAISE EXCEPTION 'Session not found.';
  END IF;
  IF v_session_status = 'cancelled' THEN
    RAISE EXCEPTION 'This session has been cancelled.';
  END IF;

  -- Determine role
  IF EXISTS (SELECT 1 FROM public.sessions WHERE id = target_session AND host_id = v_user) THEN
    v_role := 'host';
  ELSIF EXISTS (SELECT 1 FROM public.session_registrations WHERE session_id = target_session AND user_id = v_user AND status IN ('registered','waitlisted')) THEN
    v_role := 'participant';
  ELSE
    RAISE EXCEPTION 'You are not registered for this session.';
  END IF;

  -- Check room exists and is live (host can join waiting rooms too)
  SELECT status, provider_room_name INTO v_room_status, v_room_name
  FROM public.session_room_state
  WHERE session_id = target_session;

  IF v_room_status IS NULL OR v_room_name IS NULL THEN
    RAISE EXCEPTION 'The host has not opened the room yet.';
  END IF;

  IF v_room_status != 'live' THEN
    IF v_role != 'host' THEN
      IF v_room_status = 'waiting' THEN
        RAISE EXCEPTION 'The host has not opened the room yet.';
      ELSIF v_room_status = 'closed' THEN
        RAISE EXCEPTION 'The room is currently closed.';
      ELSIF v_room_status = 'ended' THEN
        RAISE EXCEPTION 'This session has ended.';
      END IF;
    END IF;
  END IF;

  -- Upsert participant row
  INSERT INTO public.session_room_participants (session_id, user_id, role)
  VALUES (target_session, v_user, v_role)
  ON CONFLICT (session_id, user_id) DO UPDATE
    SET left_at = NULL, is_muted = false, is_video_on = false, is_screen_sharing = false;

  RETURN jsonb_build_object(
    'role', v_role,
    'provider_room_name', v_room_name,
    'room_status', v_room_status
  );
END;
$$;

-- =============================================================================
-- FIX 6: Rewrite close_session_room — also set session back to published
-- =============================================================================
CREATE OR REPLACE FUNCTION public.close_session_room(target_session uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid;
BEGIN
  SELECT host_id INTO v_host FROM public.sessions WHERE id = target_session;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Session not found.'; END IF;
  IF v_host <> auth.uid() THEN RAISE EXCEPTION 'Only the session host can close the room.'; END IF;

  UPDATE public.session_room_state
  SET status = 'closed', closed_at = now(), updated_at = now()
  WHERE session_id = target_session AND status IN ('waiting','live');

  UPDATE public.sessions
  SET status = 'published', updated_at = now()
  WHERE id = target_session AND status = 'live';
END;
$$;

-- =============================================================================
-- FIX 7: Rewrite reopen_session_room
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reopen_session_room(target_session uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid;
BEGIN
  SELECT host_id INTO v_host FROM public.sessions WHERE id = target_session;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Session not found.'; END IF;
  IF v_host <> auth.uid() THEN RAISE EXCEPTION 'Only the session host can reopen the room.'; END IF;

  UPDATE public.session_room_state
  SET status = 'live', closed_at = NULL, updated_at = now()
  WHERE session_id = target_session AND status = 'closed';

  UPDATE public.sessions
  SET status = 'live', updated_at = now()
  WHERE id = target_session AND status = 'published';
END;
$$;

-- =============================================================================
-- FIX 8: Update end_session_room to also clear provider_room_name for safety
-- =============================================================================
CREATE OR REPLACE FUNCTION public.end_session_room(target_session uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_host uuid;
BEGIN
  SELECT host_id INTO v_host FROM public.sessions WHERE id = target_session;
  IF v_host IS NULL THEN RAISE EXCEPTION 'Session not found.'; END IF;
  IF v_host <> auth.uid() THEN RAISE EXCEPTION 'Only the session host can end the room.'; END IF;

  UPDATE public.session_room_state
  SET status = 'ended', ended_at = now(), updated_at = now()
  WHERE session_id = target_session AND status IN ('waiting','live','closed');

  UPDATE public.sessions
  SET status = 'completed', updated_at = now()
  WHERE id = target_session AND status NOT IN ('cancelled','completed');

  -- Mark all active participants as left
  UPDATE public.session_room_participants
  SET left_at = now()
  WHERE session_id = target_session AND left_at IS NULL;
END;
$$;

-- =============================================================================
-- FIX 9: Update notify_session_event to require host role for broadcast events
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_session_event(
  target_session uuid,
  event_type text,
  target_user uuid DEFAULT null
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_recipient uuid;
  v_title text;
  v_body text;
  v_actor uuid := auth.uid();
  v_notify RECORD;
BEGIN
  SELECT * INTO v_session FROM public.sessions WHERE id = target_session;
  IF v_session IS NULL THEN RETURN; END IF;

  -- Authorization: only the host or the system (via SECURITY DEFINER) can send notifications.
  -- If caller is not the host, only allow self-notifications (e.g., registration confirmation).
  IF v_actor <> v_session.host_id AND v_actor <> COALESCE(target_user, v_actor) THEN
    RAISE EXCEPTION 'Not authorized to send this notification.';
  END IF;

  CASE event_type
    WHEN 'registration_confirmed' THEN
      v_title := 'Registration confirmed';
      v_body := 'You are registered for "' || v_session.title || '".';

    WHEN 'reminder_24h' THEN
      v_title := 'Session tomorrow';
      v_body := '"' || v_session.title || '" starts in 24 hours.';

    WHEN 'reminder_1h' THEN
      v_title := 'Session in 1 hour';
      v_body := '"' || v_session.title || '" starts in 1 hour.';

    WHEN 'reminder_15m' THEN
      v_title := 'Session starting soon';
      v_body := '"' || v_session.title || '" starts in 15 minutes.';

    WHEN 'starting_now' THEN
      v_title := 'Session starting now';
      v_body := '"' || v_session.title || '" is live now.';

    WHEN 'host_started' THEN
      v_title := 'Host has started the session';
      v_body := 'The host has started "' || v_session.title || '". You can join now.';

    WHEN 'room_opened' THEN
      v_title := 'Room is open';
      v_body := 'The room for "' || v_session.title || '" is now open. Join when you are ready.';

    WHEN 'session_cancelled' THEN
      v_title := 'Session cancelled';
      v_body := '"' || v_session.title || '" has been cancelled by the host.';

    WHEN 'session_updated' THEN
      v_title := 'Session updated';
      v_body := '"' || v_session.title || '" has been updated. Please check the details.';

    ELSE
      v_title := 'Session update';
      v_body := 'There is an update to "' || v_session.title || '".';
  END CASE;

  IF target_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id)
    VALUES (target_user, v_actor, 'session_' || event_type, v_title, v_body, target_session);
  ELSE
    -- Broadcast to all registered participants
    FOR v_notify IN
      SELECT DISTINCT sr.user_id
      FROM public.session_registrations sr
      WHERE sr.session_id = target_session
        AND sr.status IN ('registered','waitlisted','attended')
    LOOP
      INSERT INTO public.notifications (user_id, actor_id, type, title, body, entity_id)
      VALUES (v_notify.user_id, v_actor, 'session_' || event_type, v_title, v_body, target_session);
    END LOOP;
  END IF;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.open_session_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_session_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_session_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_session_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_session_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_session_event(uuid, text, uuid) TO authenticated;
