-- =============================================
-- MEMBER EXPERIENCE PHASE 3
-- Saved sessions, dashboard RPCs, recommendations,
-- wellness journey, continue listening
-- =============================================

-- 1. CREATE SAVED SESSIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.saved_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, session_id)
);

ALTER TABLE public.saved_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_saved_sessions"
  ON public.saved_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_save_sessions"
  ON public.saved_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_unsave_sessions"
  ON public.saved_sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_saved_sessions_user ON public.saved_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_sessions_session ON public.saved_sessions(session_id);

-- 2. TOGGLE SAVE SESSION
-- =============================================

CREATE OR REPLACE FUNCTION public.toggle_save_session(target_session uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.saved_sessions
    WHERE session_id = target_session AND user_id = v_user
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.saved_sessions
    WHERE session_id = target_session AND user_id = v_user;
    RETURN false;
  ELSE
    INSERT INTO public.saved_sessions (user_id, session_id)
    VALUES (v_user, target_session);
    RETURN true;
  END IF;
END;
$$;

-- 3. CHECK IF SESSION IS SAVED
-- =============================================

CREATE OR REPLACE FUNCTION public.is_saved_session(target_session uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.saved_sessions
    WHERE session_id = target_session AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.toggle_save_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_saved_session(uuid) TO authenticated;

-- 4. GET MY SESSIONS (registrations with session details)
-- =============================================

CREATE OR REPLACE FUNCTION public.get_my_sessions(
  status_filter text DEFAULT 'all',
  page_limit integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  session_id uuid,
  registration_status text,
  registered_at timestamptz,
  session_title text,
  session_description text,
  session_category text,
  session_language text,
  session_starts_at timestamptz,
  session_ends_at timestamptz,
  session_status text,
  session_type text,
  session_capacity integer,
  session_price numeric,
  session_cover_url text,
  host_name text,
  host_avatar text,
  host_id uuid,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_regs AS (
    SELECT
      sr.id, sr.session_id, sr.status as registration_status, sr.created_at as registered_at,
      COUNT(*) OVER() as total_count
    FROM public.session_registrations sr
    WHERE sr.user_id = auth.uid()
      AND (status_filter = 'all' OR sr.status = status_filter)
    ORDER BY sr.created_at DESC
    LIMIT page_limit OFFSET page_offset
  )
  SELECT
    mr.id, mr.session_id, mr.registration_status, mr.registered_at,
    s.title, s.description, s.category, s.language,
    s.starts_at, s.ends_at, s.status, s.session_type,
    s.capacity, s.price, s.cover_image_url,
    coalesce(nullif(p.display_name,''), p.full_name, 'Host'),
    p.avatar_url,
    s.host_id,
    mr.total_count
  FROM my_regs mr
  JOIN public.sessions s ON s.id = mr.session_id
  LEFT JOIN public.profiles p ON p.id = s.host_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_sessions(text, integer, integer) TO authenticated;

-- 5. GET CONTINUE LISTENING (episodes with progress)
-- =============================================

CREATE OR REPLACE FUNCTION public.get_continue_listening(
  page_limit integer DEFAULT 10
)
RETURNS TABLE (
  episode_id uuid,
  episode_title text,
  episode_duration integer,
  position_seconds integer,
  completion_pct numeric,
  updated_at timestamptz,
  podcast_id uuid,
  podcast_title text,
  podcast_cover text,
  podcast_category text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pp.episode_id,
    e.title as episode_title,
    pp.duration_seconds as episode_duration,
    pp.position_seconds,
    CASE WHEN pp.duration_seconds > 0
      THEN round((pp.position_seconds::numeric / pp.duration_seconds) * 100, 1)
      ELSE 0
    END as completion_pct,
    pp.updated_at,
    p.id as podcast_id,
    p.title as podcast_title,
    p.cover_image_url as podcast_cover,
    p.category as podcast_category
  FROM public.podcast_progress pp
  JOIN public.podcast_episodes e ON e.id = pp.episode_id
  JOIN public.podcasts p ON p.id = e.podcast_id
  WHERE pp.user_id = auth.uid()
    AND pp.position_seconds > 0
    AND pp.position_seconds < pp.duration_seconds - 10
    AND e.deleted_at IS NULL
    AND e.status = 'published'
    AND p.status = 'published'
  ORDER BY pp.updated_at DESC
  LIMIT page_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_continue_listening(integer) TO authenticated;

-- 6. GET SAVED SESSIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.get_saved_sessions(
  page_limit integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  save_id uuid,
  session_id uuid,
  saved_at timestamptz,
  session_title text,
  session_category text,
  session_language text,
  session_starts_at timestamptz,
  session_status text,
  session_type text,
  session_price numeric,
  session_cover_url text,
  host_name text,
  host_avatar text,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH saved AS (
    SELECT ss.id as save_id, ss.session_id, ss.created_at as saved_at,
           COUNT(*) OVER() as total_count
    FROM public.saved_sessions ss
    WHERE ss.user_id = auth.uid()
    ORDER BY ss.created_at DESC
    LIMIT page_limit OFFSET page_offset
  )
  SELECT
    sv.save_id, sv.session_id, sv.saved_at,
    s.title, s.category, s.language,
    s.starts_at, s.status, s.session_type, s.price, s.cover_image_url,
    coalesce(nullif(p.display_name,''), p.full_name, 'Host'),
    p.avatar_url,
    sv.total_count
  FROM saved sv
  JOIN public.sessions s ON s.id = sv.session_id
  LEFT JOIN public.profiles p ON p.id = s.host_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_saved_sessions(integer, integer) TO authenticated;

-- 7. GET MEMBER DASHBOARD STATS
-- =============================================

CREATE OR REPLACE FUNCTION public.get_member_stats(target_user uuid DEFAULT null)
RETURNS TABLE (
  sessions_registered bigint,
  sessions_completed bigint,
  sessions_upcoming bigint,
  podcasts_followed bigint,
  episodes_saved bigint,
  connections_count bigint,
  healers_followed bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := coalesce(target_user, auth.uid());
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::bigint FROM public.session_registrations WHERE user_id = v_user AND status IN ('registered','attended')),
    (SELECT COUNT(*)::bigint FROM public.session_registrations sr JOIN public.sessions s ON s.id = sr.session_id WHERE sr.user_id = v_user AND s.status = 'completed'),
    (SELECT COUNT(*)::bigint FROM public.session_registrations sr JOIN public.sessions s ON s.id = sr.session_id WHERE sr.user_id = v_user AND s.status IN ('published','live') AND s.starts_at > now()),
    (SELECT COUNT(*)::bigint FROM public.podcast_follows WHERE user_id = v_user),
    (SELECT COUNT(*)::bigint FROM public.podcast_episode_saves WHERE user_id = v_user),
    (SELECT COUNT(*)::bigint FROM public.friendships WHERE status = 'accepted' AND (requester_id = v_user OR addressee_id = v_user)),
    (SELECT COUNT(*)::bigint FROM public.healer_followers WHERE follower_id = v_user);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_stats(uuid) TO authenticated;

-- 8. GET RECOMMENDED PODCASTS (by category match to interests)
-- =============================================

CREATE OR REPLACE FUNCTION public.get_recommended_podcasts(
  page_limit integer DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  title text,
  short_description text,
  cover_image_url text,
  category text,
  language text,
  follower_count bigint,
  episode_count bigint,
  total_plays bigint,
  creator_name text,
  creator_avatar text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH member_interests AS (
    SELECT interests, languages FROM public.profiles WHERE id = auth.uid()
  ),
  followed_categories AS (
    SELECT DISTINCT p.category
    FROM public.podcast_follows pf
    JOIN public.podcasts p ON p.id = pf.podcast_id
    WHERE pf.user_id = auth.uid() AND p.category IS NOT NULL
  ),
  scored AS (
    SELECT
      p.id, p.title, p.short_description, p.cover_image_url,
      p.category, p.language, p.creator_id,
      pr.full_name as creator_full_name,
      pr.display_name as creator_display_name,
      pr.avatar_url as creator_avatar_url,
      (SELECT COUNT(*)::bigint FROM public.podcast_follows pf2 WHERE pf2.podcast_id = p.id) as follower_count,
      (SELECT COUNT(*)::bigint FROM public.podcast_episodes pe WHERE pe.podcast_id = p.id AND pe.status = 'published') as episode_count,
      0::bigint as total_plays,
      CASE
        WHEN p.category IN (SELECT category FROM followed_categories) THEN 3
        WHEN p.category = ANY(SELECT unnest(interests) FROM member_interests) THEN 2
        WHEN p.language = ANY(SELECT unnest(languages) FROM member_interests) THEN 1
        ELSE 0
      END as relevance_score
    FROM public.podcasts p
    LEFT JOIN public.profiles pr ON pr.id = p.creator_id
    WHERE p.status = 'published'
      AND p.creator_id <> auth.uid()
      AND NOT EXISTS (SELECT 1 FROM public.podcast_follows pf WHERE pf.podcast_id = p.id AND pf.user_id = auth.uid())
  )
  SELECT
    s.id, s.title, s.short_description, s.cover_image_url,
    s.category, s.language, s.follower_count, s.episode_count, s.total_plays,
    coalesce(nullif(s.creator_display_name,''), s.creator_full_name, 'Creator'),
    s.creator_avatar_url
  FROM scored s
  WHERE s.relevance_score > 0
  ORDER BY s.relevance_score DESC, s.total_plays DESC
  LIMIT page_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_recommended_podcasts(integer) TO authenticated;

-- 9. GET SAVED HEALERS LIST (with profile data)
-- =============================================

CREATE OR REPLACE FUNCTION public.get_saved_healers_list(
  page_limit integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  save_id uuid,
  healer_id uuid,
  saved_at timestamptz,
  full_name text,
  display_name text,
  avatar_url text,
  professional_title text,
  specialties text[],
  country text,
  online boolean,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH saved AS (
    SELECT sh.id as save_id, sh.healer_id, sh.created_at as saved_at,
           COUNT(*) OVER() as total_count
    FROM public.saved_healers sh
    WHERE sh.user_id = auth.uid()
    ORDER BY sh.created_at DESC
    LIMIT page_limit OFFSET page_offset
  )
  SELECT
    sv.save_id, sv.healer_id, sv.saved_at,
    p.full_name, p.display_name, p.avatar_url,
    p.professional_title, p.specialties, p.country, p.online,
    sv.total_count
  FROM saved sv
  JOIN public.profiles p ON p.id = sv.healer_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_saved_healers_list(integer, integer) TO authenticated;

-- 10. GET FOLLOWED HEALERS LIST
-- =============================================

CREATE OR REPLACE FUNCTION public.get_followed_healers_list(
  page_limit integer DEFAULT 20,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  follower_id uuid,
  healer_id uuid,
  followed_at timestamptz,
  full_name text,
  display_name text,
  avatar_url text,
  professional_title text,
  specialties text[],
  country text,
  online boolean,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH followed AS (
    SELECT hf.id as follower_id, hf.healer_id, hf.created_at as followed_at,
           COUNT(*) OVER() as total_count
    FROM public.healer_followers hf
    WHERE hf.follower_id = auth.uid()
    ORDER BY hf.created_at DESC
    LIMIT page_limit OFFSET page_offset
  )
  SELECT
    f.follower_id, f.healer_id, f.followed_at,
    p.full_name, p.display_name, p.avatar_url,
    p.professional_title, p.specialties, p.country, p.online,
    f.total_count
  FROM followed f
  JOIN public.profiles p ON p.id = f.healer_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_followed_healers_list(integer, integer) TO authenticated;
