-- ============================================================
-- PHASE 7: ANALYTICS, WELLNESS JOURNEY & ACHIEVEMENTS
-- ============================================================
-- Creates: analytics_events, activity_streaks, wellness_journey,
--          achievement_definitions, member_achievements,
--          listening_time_daily
-- RPCs: track_analytics_event, get_member_analytics,
--        get_wellness_journey, get_learning_analytics,
--        get_achievements, check_and_award_achievements,
--        get_daily_streak, get_healer_analytics, get_podcast_analytics
-- ============================================================

-- ============================================================
-- 1. ANALYTICS EVENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_entity ON analytics_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC);

-- ============================================================
-- 2. ACTIVITY STREAKS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_streaks (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_date date NOT NULL DEFAULT CURRENT_DATE,
  podcast_minutes integer NOT NULL DEFAULT 0,
  session_attended boolean NOT NULL DEFAULT false,
  community_action boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS idx_streaks_user_date ON activity_streaks(user_id, activity_date DESC);

-- ============================================================
-- 3. WELLNESS JOURNEY TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wellness_journey (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_type text NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  entity_type text,
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wellness_journey_user ON wellness_journey(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wellness_journey_type ON wellness_journey(user_id, entry_type, created_at DESC);

-- ============================================================
-- 4. ACHIEVEMENT DEFINITIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  icon_name text NOT NULL DEFAULT 'Award',
  category text NOT NULL DEFAULT 'general',
  tier text NOT NULL DEFAULT 'bronze',
  points integer NOT NULL DEFAULT 10,
  requirement_type text NOT NULL,
  requirement_value integer NOT NULL DEFAULT 1,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. MEMBER ACHIEVEMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.member_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES achievement_definitions(id),
  earned_at timestamptz NOT NULL DEFAULT now(),
  progress integer NOT NULL DEFAULT 0,
  notified boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_member_achievements_user ON member_achievements(user_id, earned_at DESC);

-- ============================================================
-- 6. LISTENING TIME DAILY TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listening_time_daily (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  listen_date date NOT NULL DEFAULT CURRENT_DATE,
  total_minutes integer NOT NULL DEFAULT 0,
  episodes_completed integer NOT NULL DEFAULT 0,
  unique_podcasts integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, listen_date)
);

CREATE INDEX IF NOT EXISTS idx_listening_daily_user ON listening_time_daily(user_id, listen_date DESC);

-- ============================================================
-- 7. RLS POLICIES
-- ============================================================

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wellness_journey ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listening_time_daily ENABLE ROW LEVEL SECURITY;

-- analytics_events: users can insert their own, read their own
DROP POLICY IF EXISTS "analytics_insert_own" ON analytics_events;
CREATE POLICY "analytics_insert_own" ON analytics_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "analytics_read_own" ON analytics_events;
CREATE POLICY "analytics_read_own" ON analytics_events
  FOR SELECT USING (user_id = auth.uid());

-- activity_streaks: users read/write own
DROP POLICY IF EXISTS "streaks_all_own" ON activity_streaks;
CREATE POLICY "streaks_all_own" ON activity_streaks
  FOR ALL USING (user_id = auth.uid());

-- wellness_journey: users read/write own
DROP POLICY IF EXISTS "journey_insert_own" ON wellness_journey;
CREATE POLICY "journey_insert_own" ON wellness_journey
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "journey_read_own" ON wellness_journey;
CREATE POLICY "journey_read_own" ON wellness_journey
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "journey_delete_own" ON wellness_journey;
CREATE POLICY "journey_delete_own" ON wellness_journey
  FOR DELETE USING (user_id = auth.uid());

-- member_achievements: users read own
DROP POLICY IF EXISTS "achievements_read_own" ON member_achievements;
CREATE POLICY "achievements_read_own" ON member_achievements
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "achievements_insert_own" ON member_achievements;
CREATE POLICY "achievements_insert_own" ON member_achievements
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "achievements_update_own" ON member_achievements;
CREATE POLICY "achievements_update_own" ON member_achievements
  FOR UPDATE USING (user_id = auth.uid());

-- listening_time_daily: users read/write own
DROP POLICY IF EXISTS "listening_all_own" ON listening_time_daily;
CREATE POLICY "listening_all_own" ON listening_time_daily
  FOR ALL USING (user_id = auth.uid());

-- achievement_definitions: everyone can read
DROP POLICY IF EXISTS "achievements_defs_read_all" ON achievement_definitions;
CREATE POLICY "achievements_defs_read_all" ON achievement_definitions
  FOR SELECT USING (true);

-- Grants
GRANT SELECT, INSERT ON analytics_events TO authenticated;
GRANT ALL ON activity_streaks TO authenticated;
GRANT SELECT, INSERT, DELETE ON wellness_journey TO authenticated;
GRANT SELECT, INSERT, UPDATE ON member_achievements TO authenticated;
GRANT ALL ON listening_time_daily TO authenticated;
GRANT SELECT ON achievement_definitions TO authenticated;

-- ============================================================
-- 8. SEED ACHIEVEMENT DEFINITIONS
-- ============================================================

INSERT INTO achievement_definitions (id, title, description, icon_name, category, tier, points, requirement_type, requirement_value, is_hidden) VALUES
-- Listening achievements
('first_listen', 'First Steps', 'Listen to your first podcast episode', 'Headphones', 'listening', 'bronze', 10, 'total_plays', 1, false),
('podcast_explorer', 'Podcast Explorer', 'Listen to 5 different podcasts', 'Compass', 'listening', 'bronze', 20, 'unique_podcasts', 5, false),
('podcast_connoisseur', 'Podcast Connoisseur', 'Listen to 20 different podcasts', 'Glasses', 'listening', 'silver', 50, 'unique_podcasts', 20, false),
('night_owl', 'Night Owl', 'Accumulate 1 hour of listening', 'Moon', 'listening', 'bronze', 15, 'total_listening_minutes', 60, false),
('deep_listener', 'Deep Listener', 'Accumulate 5 hours of listening', 'Ear', 'listening', 'silver', 40, 'total_listening_minutes', 300, false),
('audio_master', 'Audio Master', 'Accumulate 25 hours of listening', 'Volume2', 'listening', 'gold', 100, 'total_listening_minutes', 1500, false),
('episode_finisher', 'Episode Finisher', 'Complete 10 episodes', 'CheckCircle', 'listening', 'bronze', 25, 'episodes_completed', 10, false),
('binge_listener', 'Binge Listener', 'Complete 50 episodes', 'ListChecks', 'listening', 'silver', 75, 'episodes_completed', 50, false),

-- Session achievements
('first_session', 'First Session', 'Attend your first live session', 'Video', 'sessions', 'bronze', 15, 'sessions_attended', 1, false),
('regular_attendee', 'Regular Attendee', 'Attend 5 sessions', 'CalendarCheck', 'sessions', 'bronze', 25, 'sessions_attended', 5, false),
('session_enthusiast', 'Session Enthusiast', 'Attend 15 sessions', 'Flame', 'sessions', 'silver', 60, 'sessions_attended', 15, false),
('session_master', 'Session Master', 'Attend 30 sessions', 'Trophy', 'sessions', 'gold', 120, 'sessions_attended', 30, false),

-- Community achievements
('first_like', 'First Like', 'Like your first podcast episode', 'Heart', 'community', 'bronze', 5, 'total_likes', 1, false),
('social_butterfly', 'Social Butterfly', 'Like 20 podcast episodes', 'Users', 'community', 'bronze', 20, 'total_likes', 20, false),
('first_follow', 'First Follow', 'Follow your first healer', 'UserPlus', 'community', 'bronze', 10, 'total_follows', 1, false),
('collector', 'Collector', 'Save 10 items (sessions, healers, episodes)', 'Bookmark', 'community', 'bronze', 25, 'total_saves', 10, false),
('hoarder', 'Hoarder', 'Save 30 items', 'Archive', 'community', 'silver', 60, 'total_saves', 30, false),

-- Streak achievements
('streak_3', '3-Day Streak', 'Be active for 3 consecutive days', 'Zap', 'streak', 'bronze', 15, 'streak_days', 3, false),
('streak_7', 'Week Warrior', 'Be active for 7 consecutive days', 'Zap', 'streak', 'silver', 40, 'streak_days', 7, false),
('streak_30', 'Monthly Master', 'Be active for 30 consecutive days', 'Crown', 'streak', 'gold', 150, 'streak_days', 30, false),

-- Wellness journey milestones
('journey_started', 'Journey Begins', 'Start your wellness journey', 'Sparkles', 'journey', 'bronze', 10, 'journey_entries', 1, false),
('journey_5', 'Growing Path', 'Complete 5 wellness activities', 'Sprout', 'journey', 'bronze', 20, 'journey_entries', 5, false),
('journey_25', 'Wellness Warrior', 'Complete 25 wellness activities', 'TreePine', 'journey', 'silver', 75, 'journey_entries', 25, false),
('journey_100', 'Zen Master', 'Complete 100 wellness activities', 'Mountain', 'journey', 'gold', 250, 'journey_entries', 100, false),

-- Special achievements
('early_bird', 'Early Bird', 'Join a session before 8 AM', 'Sunrise', 'special', 'bronze', 15, 'early_sessions', 1, true),
('night_session', 'Night Session', 'Join a session after 9 PM', 'Sunset', 'special', 'bronze', 15, 'late_sessions', 1, true),
('multi_category', 'Multi-Category', 'Try 3 different wellness categories', 'LayoutGrid', 'special', 'silver', 40, 'unique_categories', 3, false),
('wellness_explorer', 'Wellness Explorer', 'Try all wellness categories', 'Globe', 'special', 'gold', 100, 'unique_categories', 12, true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 9. TRACK ANALYTICS EVENT
-- ============================================================

CREATE OR REPLACE FUNCTION public.track_analytics_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.analytics_events (user_id, event_type, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_event_type, p_entity_type, p_entity_id, p_metadata);
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_analytics_event(text, text, uuid, jsonb) TO authenticated;

-- ============================================================
-- 10. RECORD DAILY LISTENING TIME
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_daily_listening(
  p_episode_id uuid,
  p_minutes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_podcast_id uuid;
  v_is_completed boolean;
BEGIN
  SELECT podcast_id INTO v_podcast_id
  FROM public.podcast_episodes WHERE id = p_episode_id;

  SELECT EXISTS(
    SELECT 1 FROM public.podcast_listens pl
    WHERE pl.episode_id = p_episode_id AND pl.user_id = auth.uid()
      AND pl.completed_at IS NOT NULL
  ) INTO v_is_completed;

  INSERT INTO public.listening_time_daily (user_id, listen_date, total_minutes, episodes_completed, unique_podcasts)
  VALUES (auth.uid(), CURRENT_DATE, p_minutes, CASE WHEN v_is_completed THEN 1 ELSE 0 END, 1)
  ON CONFLICT (user_id, listen_date) DO UPDATE SET
    total_minutes = listening_time_daily.total_minutes + p_minutes,
    episodes_completed = listening_time_daily.episodes_completed + CASE WHEN v_is_completed THEN 1 ELSE 0 END,
    unique_podcasts = (SELECT COUNT(DISTINCT pe.podcast_id)
                       FROM public.podcast_listens pl2
                       JOIN public.podcast_episodes pe ON pe.id = pl2.episode_id
                       WHERE pl2.user_id = auth.uid()
                         AND pl2.created_at::date = CURRENT_DATE);

  -- Update activity streak
  INSERT INTO public.activity_streaks (user_id, activity_date, podcast_minutes)
  VALUES (auth.uid(), CURRENT_DATE, p_minutes)
  ON CONFLICT (user_id, activity_date) DO UPDATE SET
    podcast_minutes = activity_streaks.podcast_minutes + p_minutes;

  -- Log wellness journey entry for significant listening
  IF p_minutes >= 10 THEN
    INSERT INTO public.wellness_journey (user_id, entry_type, title, description, category, entity_type, entity_id, points)
    VALUES (auth.uid(), 'listening', 'Listened to ' || p_minutes || ' minutes', 'Podcast listening session', 'listening', 'episode', p_episode_id, LEAST(p_minutes, 30));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_daily_listening(uuid, integer) TO authenticated;

-- ============================================================
-- 11. RECORD SESSION ATTENDANCE (with journey entry)
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_session_attendance_with_journey(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT id, title, category, host_id INTO v_session
  FROM public.sessions WHERE id = p_session_id;

  -- Log wellness journey
  INSERT INTO public.wellness_journey (user_id, entry_type, title, description, category, entity_type, entity_id, points)
  VALUES (auth.uid(), 'session', 'Attended: ' || v_session.title, 'Live session participation', v_session.category, 'session', p_session_id, 25);

  -- Update activity streak
  INSERT INTO public.activity_streaks (user_id, activity_date, session_attended)
  VALUES (auth.uid(), CURRENT_DATE, true)
  ON CONFLICT (user_id, activity_date) DO UPDATE SET session_attended = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_session_attendance_with_journey(uuid) TO authenticated;

-- ============================================================
-- 12. GET MEMBER ANALYTICS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_member_analytics(
  p_user_id uuid DEFAULT NULL,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := COALESCE(p_user_id, auth.uid());
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'listening', jsonb_build_object(
      'total_minutes', COALESCE((SELECT SUM(total_minutes) FROM public.listening_time_daily WHERE user_id = v_user AND listen_date > CURRENT_DATE - p_days), 0),
      'total_plays', COALESCE((SELECT COUNT(*) FROM public.podcast_listens WHERE user_id = v_user AND created_at > now() - (p_days || ' days')::interval), 0),
      'episodes_completed', COALESCE((SELECT COUNT(DISTINCT episode_id) FROM public.podcast_listens WHERE user_id = v_user AND completed_at IS NOT NULL AND created_at > now() - (p_days || ' days')::interval), 0),
      'unique_podcasts', COALESCE((SELECT COUNT(DISTINCT pe.podcast_id) FROM public.podcast_listens pl JOIN public.podcast_episodes pe ON pe.id = pl.episode_id WHERE pl.user_id = v_user AND pl.created_at > now() - (p_days || ' days')::interval), 0),
      'daily_minutes', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('date', listen_date, 'minutes', total_minutes, 'episodes', episodes_completed) ORDER BY listen_date)
        FROM public.listening_time_daily WHERE user_id = v_user AND listen_date > CURRENT_DATE - p_days
      ), '[]'::jsonb)
    ),
    'sessions', jsonb_build_object(
      'registered', COALESCE((SELECT COUNT(*) FROM public.session_registrations WHERE user_id = v_user AND created_at > now() - (p_days || ' days')::interval), 0),
      'attended', COALESCE((SELECT COUNT(*) FROM public.session_registrations WHERE user_id = v_user AND status = 'attended'), 0),
      'upcoming', COALESCE((SELECT COUNT(*) FROM public.session_registrations sr JOIN public.sessions s ON s.id = sr.session_id WHERE sr.user_id = v_user AND s.starts_at > now()), 0),
      'liked_sessions', COALESCE((SELECT COUNT(*) FROM public.session_likes WHERE user_id = v_user), 0)
    ),
    'community', jsonb_build_object(
      'saved_sessions', COALESCE((SELECT COUNT(*) FROM public.saved_sessions WHERE user_id = v_user), 0),
      'saved_healers', COALESCE((SELECT COUNT(*) FROM public.saved_healers WHERE user_id = v_user), 0),
      'saved_episodes', COALESCE((SELECT COUNT(*) FROM public.podcast_episode_saves WHERE user_id = v_user), 0),
      'followed_podcasts', COALESCE((SELECT COUNT(*) FROM public.podcast_follows WHERE user_id = v_user), 0),
      'followed_healers', COALESCE((SELECT COUNT(*) FROM public.healer_followers WHERE follower_id = v_user), 0),
      'episode_reactions', COALESCE((SELECT COUNT(*) FROM public.podcast_reactions WHERE user_id = v_user), 0),
      'comments', COALESCE((SELECT COUNT(*) FROM public.podcast_comments WHERE user_id = v_user), 0)
    ),
    'streak', jsonb_build_object(
      'current', (
        SELECT COUNT(*)::int FROM (
          SELECT activity_date FROM public.activity_streaks
          WHERE user_id = v_user AND activity_date <= CURRENT_DATE
          ORDER BY activity_date DESC
          LIMIT 100
        ) s
        WHERE s.activity_date = CURRENT_DATE - (s.row_number - 1)
      ),
      'longest', (
        SELECT COALESCE(MAX(streak_len), 0)::int FROM (
          SELECT user_id, activity_date,
            activity_date - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_date) as grp
          FROM public.activity_streaks WHERE user_id = v_user
        ) grouped
        GROUP BY grp
        ORDER BY COUNT(*) DESC LIMIT 1
      )
    ),
    'wellness_points', COALESCE((SELECT SUM(points) FROM public.wellness_journey WHERE user_id = v_user), 0),
    'achievement_count', COALESCE((SELECT COUNT(*) FROM public.member_achievements WHERE user_id = v_user), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_analytics(uuid, integer) TO authenticated;

-- ============================================================
-- 13. GET WELLNESS JOURNEY
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_wellness_journey(
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  entry_type text,
  title text,
  description text,
  category text,
  entity_type text,
  entity_id uuid,
  points integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT wj.id, wj.entry_type, wj.title, wj.description, wj.category,
         wj.entity_type, wj.entity_id, wj.points, wj.created_at
  FROM public.wellness_journey wj
  WHERE wj.user_id = COALESCE(p_user_id, auth.uid())
  ORDER BY wj.created_at DESC
  LIMIT LEAST(p_limit, 50) OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_wellness_journey(uuid, integer, integer) TO authenticated;

-- ============================================================
-- 14. GET LEARNING ANALYTICS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_learning_analytics(
  p_user_id uuid DEFAULT NULL,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  RETURN jsonb_build_object(
    'top_categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('category', cat, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT pe.category, COUNT(*) as cnt
        FROM public.podcast_listens pl
        JOIN public.podcast_episodes pe ON pe.id = pl.episode_id
        WHERE pl.user_id = v_user AND pl.created_at > now() - (p_days || ' days')::interval
          AND pe.category IS NOT NULL
        GROUP BY pe.category
        LIMIT 5
      ) cats
    ), '[]'::jsonb),
    'listening_by_weekday', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('weekday', dow, 'minutes', mins) ORDER BY mins DESC)
      FROM (
        SELECT EXTRACT(DOW FROM listen_date)::int as dow, SUM(total_minutes) as mins
        FROM public.listening_time_daily
        WHERE user_id = v_user AND listen_date > CURRENT_DATE - p_days
        GROUP BY dow
      ) wd
    ), '[]'::jsonb),
    'top_episodes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('title', title, 'podcast', ptitle, 'duration', dur))
      FROM (
        SELECT e.title as title, p.title as ptitle, pl.listen_duration_seconds as dur
        FROM public.podcast_listens pl
        JOIN public.podcast_episodes e ON e.id = pl.episode_id
        JOIN public.podcasts p ON p.id = e.podcast_id
        WHERE pl.user_id = v_user AND pl.completed_at IS NOT NULL
        ORDER BY pl.created_at DESC LIMIT 5
      ) eps
    ), '[]'::jsonb),
    'categories_explored', COALESCE((
      SELECT COUNT(DISTINCT category)
      FROM (
        SELECT pe.category FROM public.podcast_listens pl
        JOIN public.podcast_episodes pe ON pe.id = pl.episode_id
        WHERE pl.user_id = v_user AND pe.category IS NOT NULL
        UNION
        SELECT s.category FROM public.session_registrations sr
        JOIN public.sessions s ON s.id = sr.session_id
        WHERE sr.user_id = v_user
      ) all_cats
    ), 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_learning_analytics(uuid, integer) TO authenticated;

-- ============================================================
-- 15. GET ACHIEVEMENTS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_achievements(
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id text,
  title text,
  description text,
  icon_name text,
  category text,
  tier text,
  points integer,
  requirement_type text,
  requirement_value integer,
  is_hidden boolean,
  earned boolean,
  earned_at timestamptz,
  progress integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ad.id, ad.title, ad.description, ad.icon_name, ad.category,
    ad.tier, ad.points, ad.requirement_type, ad.requirement_value, ad.is_hidden,
    (ma.user_id IS NOT NULL) as earned,
    ma.earned_at,
    COALESCE(ma.progress, 0) as progress
  FROM public.achievement_definitions ad
  LEFT JOIN public.member_achievements ma ON ma.achievement_id = ad.id AND ma.user_id = COALESCE(p_user_id, auth.uid())
  WHERE ad.is_hidden = false OR ma.user_id IS NOT NULL
  ORDER BY ad.category, ad.points;
$$;

GRANT EXECUTE ON FUNCTION public.get_achievements(uuid) TO authenticated;

-- ============================================================
-- 16. CHECK AND AWARD ACHIEVEMENTS
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_and_award_achievements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_def RECORD;
  v_current_value integer := 0;
  v_already_earned boolean;
  v_earned jsonb := '[]'::jsonb;
BEGIN
  FOR v_def IN SELECT * FROM public.achievement_definitions LOOP
    -- Check if already earned
    SELECT EXISTS(
      SELECT 1 FROM public.member_achievements
      WHERE user_id = v_user AND achievement_id = v_def.id
    ) INTO v_already_earned;

    CONTINUE WHEN v_already_earned;

    -- Calculate current progress based on requirement type
    CASE v_def.requirement_type
      WHEN 'total_plays' THEN
        SELECT COUNT(*)::int INTO v_current_value FROM public.podcast_listens WHERE user_id = v_user;
      WHEN 'unique_podcasts' THEN
        SELECT COUNT(DISTINCT pe.podcast_id)::int INTO v_current_value
        FROM public.podcast_listens pl JOIN public.podcast_episodes pe ON pe.id = pl.episode_id WHERE pl.user_id = v_user;
      WHEN 'total_listening_minutes' THEN
        SELECT COALESCE(SUM(total_minutes), 0)::int INTO v_current_value FROM public.listening_time_daily WHERE user_id = v_user;
      WHEN 'episodes_completed' THEN
        SELECT COUNT(DISTINCT episode_id)::int INTO v_current_value
        FROM public.podcast_listens WHERE user_id = v_user AND completed_at IS NOT NULL;
      WHEN 'sessions_attended' THEN
        SELECT COUNT(*)::int INTO v_current_value
        FROM public.session_registrations WHERE user_id = v_user AND status = 'attended';
      WHEN 'total_likes' THEN
        SELECT COUNT(*)::int INTO v_current_value FROM public.podcast_reactions WHERE user_id = v_user;
      WHEN 'total_follows' THEN
        SELECT COUNT(*)::int INTO v_current_value FROM public.healer_followers WHERE follower_id = v_user;
      WHEN 'total_saves' THEN
        SELECT (
          (SELECT COUNT(*) FROM public.saved_sessions WHERE user_id = v_user) +
          (SELECT COUNT(*) FROM public.saved_healers WHERE user_id = v_user) +
          (SELECT COUNT(*) FROM public.podcast_episode_saves WHERE user_id = v_user)
        )::int INTO v_current_value;
      WHEN 'streak_days' THEN
        SELECT COUNT(*)::int INTO v_current_value FROM (
          SELECT activity_date FROM public.activity_streaks
          WHERE user_id = v_user AND activity_date <= CURRENT_DATE
          ORDER BY activity_date DESC LIMIT 100
        ) s WHERE s.activity_date = CURRENT_DATE - (s.row_number - 1);
      WHEN 'journey_entries' THEN
        SELECT COUNT(*)::int INTO v_current_value FROM public.wellness_journey WHERE user_id = v_user;
      WHEN 'unique_categories' THEN
        SELECT COUNT(DISTINCT category)::int INTO v_current_value FROM (
          SELECT pe.category FROM public.podcast_listens pl
          JOIN public.podcast_episodes pe ON pe.id = pl.episode_id
          WHERE pl.user_id = v_user AND pe.category IS NOT NULL
          UNION
          SELECT s.category FROM public.session_registrations sr
          JOIN public.sessions s ON s.id = sr.session_id WHERE sr.user_id = v_user
        ) cats WHERE category IS NOT NULL;
      WHEN 'early_sessions' THEN
        SELECT COUNT(*)::int INTO v_current_value
        FROM public.session_registrations sr
        JOIN public.sessions s ON s.id = sr.session_id
        WHERE sr.user_id = v_user AND EXTRACT(HOUR FROM s.starts_at) < 8;
      WHEN 'late_sessions' THEN
        SELECT COUNT(*)::int INTO v_current_value
        FROM public.session_registrations sr
        JOIN public.sessions s ON s.id = sr.session_id
        WHERE sr.user_id = v_user AND EXTRACT(HOUR FROM s.starts_at) >= 21;
      ELSE
        v_current_value := 0;
    END CASE;

    -- Award if threshold met
    IF v_current_value >= v_def.requirement_value THEN
      INSERT INTO public.member_achievements (user_id, achievement_id, progress)
      VALUES (v_user, v_def.id, v_current_value)
      ON CONFLICT (user_id, achievement_id) DO NOTHING;

      v_earned := v_earned || jsonb_build_object(
        'id', v_def.id, 'title', v_def.title, 'description', v_def.description,
        'icon_name', v_def.icon_name, 'tier', v_def.tier, 'points', v_def.points
      );
    ELSE
      -- Update progress for partially completed achievements
      INSERT INTO public.member_achievements (user_id, achievement_id, progress)
      VALUES (v_user, v_def.id, v_current_value)
      ON CONFLICT (user_id, achievement_id) DO UPDATE SET progress = EXCLUDED.progress;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('newly_earned', v_earned, 'count', jsonb_array_length(v_earned));
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_award_achievements() TO authenticated;

-- ============================================================
-- 17. GET DAILY STREAK
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_daily_streak()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_current integer;
  v_longest integer;
  v_today_active boolean;
BEGIN
  -- Check if today is active
  SELECT EXISTS(SELECT 1 FROM public.activity_streaks WHERE user_id = v_user AND activity_date = CURRENT_DATE)
  INTO v_today_active;

  -- Calculate current streak
  SELECT COUNT(*)::int INTO v_current FROM (
    SELECT activity_date FROM public.activity_streaks
    WHERE user_id = v_user AND activity_date <= CURRENT_DATE
    ORDER BY activity_date DESC LIMIT 100
  ) s WHERE s.activity_date = CURRENT_DATE - (s.row_number - 1);

  -- Calculate longest streak
  SELECT COALESCE(MAX(streak_len), 0)::int INTO v_longest FROM (
    SELECT COUNT(*) as streak_len FROM (
      SELECT activity_date,
        activity_date - ROW_NUMBER() OVER (ORDER BY activity_date) as grp
      FROM public.activity_streaks WHERE user_id = v_user
    ) grouped
    GROUP BY grp
  ) streaks;

  RETURN jsonb_build_object(
    'current_streak', v_current,
    'longest_streak', v_longest,
    'today_active', v_today_active,
    'total_active_days', (SELECT COUNT(*)::int FROM public.activity_streaks WHERE user_id = v_user)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_streak() TO authenticated;

-- ============================================================
-- 18. GET HEALER ANALYTICS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_healer_analytics(
  p_healer_id uuid DEFAULT NULL,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_healer uuid := COALESCE(p_healer_id, auth.uid());
BEGIN
  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'followers', (SELECT COUNT(*)::int FROM public.healer_followers WHERE healer_id = v_healer),
      'profile_views', (SELECT COUNT(*)::int FROM public.profile_views WHERE profile_id = v_healer AND viewed_at > now() - (p_days || ' days')::interval),
      'avg_rating', (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.healer_reviews WHERE healer_id = v_healer AND status = 'active'),
      'review_count', (SELECT COUNT(*)::int FROM public.healer_reviews WHERE healer_id = v_healer AND status = 'active'),
      'new_followers', (SELECT COUNT(*)::int FROM public.healer_followers WHERE healer_id = v_healer AND created_at > now() - (p_days || ' days')::interval)
    ),
    'sessions', jsonb_build_object(
      'total', (SELECT COUNT(*)::int FROM public.sessions WHERE host_id = v_healer AND status NOT IN ('cancelled', 'draft')),
      'upcoming', (SELECT COUNT(*)::int FROM public.sessions WHERE host_id = v_healer AND status = 'published' AND starts_at > now()),
      'total_registrations', (SELECT COUNT(*)::int FROM public.session_registrations sr
        JOIN public.sessions s ON s.id = sr.session_id WHERE s.host_id = v_healer AND sr.status IN ('registered', 'attended')),
      'attended', (SELECT COUNT(*)::int FROM public.session_registrations sr
        JOIN public.sessions s ON s.id = sr.session_id WHERE s.host_id = v_healer AND sr.status = 'attended'),
      'total_revenue', (SELECT COALESCE(SUM(s.price), 0)::numeric FROM public.session_registrations sr
        JOIN public.sessions s ON s.id = sr.session_id WHERE s.host_id = v_healer AND sr.status IN ('registered', 'attended') AND s.price > 0)
    ),
    'podcasts', jsonb_build_object(
      'total', (SELECT COUNT(*)::int FROM public.podcasts WHERE creator_id = v_healer),
      'total_episodes', (SELECT COUNT(*)::int FROM public.podcast_episodes pe
        JOIN public.podcasts p ON p.id = pe.podcast_id WHERE p.creator_id = v_healer),
      'total_plays', (SELECT COUNT(*)::int FROM public.podcast_listens pl
        JOIN public.podcast_episodes pe ON pe.id = pl.episode_id
        JOIN public.podcasts p ON p.id = pe.podcast_id WHERE p.creator_id = v_healer),
      'total_followers', (SELECT COALESCE(SUM(p.follower_count), 0)::int FROM public.podcasts p WHERE p.creator_id = v_healer),
      'plays_last_30_days', (SELECT COUNT(*)::int FROM public.podcast_listens pl
        JOIN public.podcast_episodes pe ON pe.id = pl.episode_id
        JOIN public.podcasts p ON p.id = pe.podcast_id WHERE p.creator_id = v_healer AND pl.created_at > now() - (p_days || ' days')::interval)
    ),
    'engagement', jsonb_build_object(
      'total_reactions', (SELECT COUNT(*)::int FROM public.podcast_reactions pr
        JOIN public.podcast_episodes pe ON pe.id = pr.episode_id
        JOIN public.podcasts p ON p.id = pe.podcast_id WHERE p.creator_id = v_healer),
      'total_comments', (SELECT COUNT(*)::int FROM public.podcast_comments pc
        JOIN public.podcast_episodes pe ON pe.id = pc.episode_id
        JOIN public.podcasts p ON p.id = pe.podcast_id WHERE p.creator_id = v_healer)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_healer_analytics(uuid, integer) TO authenticated;

-- ============================================================
-- 19. GET PODCAST ANALYTICS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_podcast_analytics(
  p_podcast_id uuid,
  p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'total_plays', (SELECT COUNT(*)::int FROM public.podcast_listens pl
      JOIN public.podcast_episodes pe ON pe.id = pl.episode_id WHERE pe.podcast_id = p_podcast_id),
    'plays_last_30_days', (SELECT COUNT(*)::int FROM public.podcast_listens pl
      JOIN public.podcast_episodes pe ON pe.id = pl.episode_id
      WHERE pe.podcast_id = p_podcast_id AND pl.created_at > now() - (p_days || ' days')::interval),
    'total_listeners', (SELECT COUNT(DISTINCT pl.user_id)::int FROM public.podcast_listens pl
      JOIN public.podcast_episodes pe ON pe.id = pl.episode_id WHERE pe.podcast_id = p_podcast_id),
    'total_followers', (SELECT COUNT(*)::int FROM public.podcast_follows WHERE podcast_id = p_podcast_id),
    'episode_count', (SELECT COUNT(*)::int FROM public.podcast_episodes WHERE podcast_id = p_podcast_id AND status = 'published'),
    'avg_listen_duration', (SELECT COALESCE(ROUND(AVG(pl.listen_duration_seconds)::numeric, 0), 0)::int FROM public.podcast_listens pl
      JOIN public.podcast_episodes pe ON pe.id = pl.episode_id WHERE pe.podcast_id = p_podcast_id AND pl.listen_duration_seconds > 0),
    'completion_rate', (SELECT CASE WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(COUNT(CASE WHEN pl.completed_at IS NOT NULL THEN 1 END)::numeric / COUNT(*)::numeric * 100, 1)
      END FROM public.podcast_listens pl
      JOIN public.podcast_episodes pe ON pe.id = pl.episode_id WHERE pe.podcast_id = p_podcast_id),
    'daily_plays', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', d, 'plays', COALESCE(pc, 0)) ORDER BY d)
      FROM (
        SELECT gs::date as d, 0 as pc
        FROM generate_series(CURRENT_DATE - p_days, CURRENT_DATE, '1 day') gs
      ) dates
      LEFT JOIN (
        SELECT pl.created_at::date as d, COUNT(*) as pc
        FROM public.podcast_listens pl
        JOIN public.podcast_episodes pe ON pe.id = pl.episode_id
        WHERE pe.podcast_id = p_podcast_id AND pl.created_at > now() - (p_days || ' days')::interval
        GROUP BY pl.created_at::date
      ) plays ON plays.d = dates.d
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_podcast_analytics(uuid, integer) TO authenticated;

-- ============================================================
-- 20. RECORD COMMUNITY ACTION (for streak/journey)
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_community_action(
  p_action_type text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update activity streak
  INSERT INTO public.activity_streaks (user_id, activity_date, community_action)
  VALUES (auth.uid(), CURRENT_DATE, true)
  ON CONFLICT (user_id, activity_date) DO UPDATE SET community_action = true;

  -- Log journey entry for significant actions
  IF p_action_type IN ('follow', 'save_session', 'save_healer', 'like', 'comment') THEN
    INSERT INTO public.wellness_journey (user_id, entry_type, title, category, entity_type, entity_id, points)
    VALUES (auth.uid(), 'community', p_action_type, 'community', p_entity_type, p_entity_id,
      CASE p_action_type
        WHEN 'follow' THEN 5
        WHEN 'save_session' THEN 5
        WHEN 'save_healer' THEN 5
        WHEN 'like' THEN 2
        WHEN 'comment' THEN 3
        ELSE 1
      END);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_community_action(text, text, uuid) TO authenticated;
