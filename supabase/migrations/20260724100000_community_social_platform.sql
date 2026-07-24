-- Phase 6: Community & Social Platform
-- Migration: 20260724100000_community_social_platform.sql
-- Tables: profile_reports, notification_preferences, podcast_comment_edits (audit)
-- RPCs: get_community_feed, toggle_episode_reaction, get_episode_reaction_counts,
--        edit_podcast_comment, delete_podcast_comment, report_profile,
--        get_notification_preferences, update_notification_preference

BEGIN;

-- ============================================================
-- 1. ACTIVITY FEED (derive from existing tables, no new table)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_community_feed(
  p_user_id uuid DEFAULT auth.uid(),
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(fed), '[]'::jsonb) INTO v_result
  FROM (
    (SELECT jsonb_build_object(
      'type', 'session',
      'id', s.id,
      'title', s.title,
      'description', LEFT(s.description, 200),
      'category', s.category,
      'starts_at', s.starts_at,
      'status', s.status,
      'host_name', p.full_name,
      'host_avatar', p.avatar_url,
      'host_id', s.host_id,
      'cover_image_url', s.cover_image_url,
      'created_at', s.created_at
    ) AS fed,
    s.created_at AS sort_date
    FROM sessions s
    JOIN healer_followers hf ON hf.healer_id = s.host_id AND hf.follower_id = p_user_id
    JOIN profiles p ON p.id = s.host_id
    WHERE s.status IN ('published', 'live', 'registration_closed', 'completed')
      AND s.visibility = 'public'
      AND s.created_at > now() - interval '30 days'
    ORDER BY s.created_at DESC
    LIMIT 10)

    UNION ALL

    (SELECT jsonb_build_object(
      'type', 'episode',
      'id', pe.id,
      'podcast_id', pe.podcast_id,
      'title', pe.title,
      'description', LEFT(COALESCE(pe.description, ''), 200),
      'podcast_title', pod.title,
      'category', pod.category,
      'audio_duration_seconds', pe.audio_duration_seconds,
      'cover_image_url', pod.cover_image_url,
      'created_at', pe.created_at
    ) AS fed,
    pe.created_at AS sort_date
    FROM podcast_episodes pe
    JOIN podcast_follows pf ON pf.podcast_id = pe.podcast_id AND pf.user_id = p_user_id
    JOIN podcasts pod ON pod.id = pe.podcast_id
    WHERE pe.status = 'published'
      AND pe.created_at > now() - interval '30 days'
    ORDER BY pe.created_at DESC
    LIMIT 10)

    UNION ALL

    (SELECT jsonb_build_object(
      'type', 'healer',
      'id', p.id,
      'title', p.full_name,
      'professional_title', p.professional_title,
      'specialties', p.specialties,
      'avatar_url', p.avatar_url,
      'country', p.country,
      'created_at', p.created_at
    ) AS fed,
    p.created_at AS sort_date
    FROM profiles p
    WHERE p.profile_type = 'healer'
      AND p.account_status = 'active'
      AND p.professional_verification_status = 'approved'
      AND p.visibility != 'private'
      AND p.created_at > now() - interval '30 days'
    ORDER BY p.created_at DESC
    LIMIT 10)

    ORDER BY sort_date DESC
    LIMIT p_limit OFFSET p_offset
  ) sub;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 2. PODCAST REACTIONS: toggle + count
-- ============================================================

-- Toggle a reaction on a podcast episode (like unlike)
CREATE OR REPLACE FUNCTION public.toggle_episode_reaction(
  p_episode_id uuid,
  p_reaction text DEFAULT 'heart'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing record;
  v_removed boolean := false;
BEGIN
  -- Check if user already has this reaction
  SELECT * INTO v_existing
  FROM podcast_reactions
  WHERE episode_id = p_episode_id AND user_id = auth.uid() AND reaction = p_reaction;

  IF FOUND THEN
    DELETE FROM podcast_reactions
    WHERE episode_id = p_episode_id AND user_id = auth.uid() AND reaction = p_reaction;
    v_removed := true;
  ELSE
    INSERT INTO podcast_reactions (episode_id, user_id, reaction)
    VALUES (p_episode_id, auth.uid(), p_reaction)
    ON CONFLICT (episode_id, user_id, reaction) DO NOTHING;
  END IF;

  -- Return updated counts
  RETURN (
    SELECT COALESCE(jsonb_build_object(
      'removed', v_removed,
      'user_reactions', COALESCE((
        SELECT jsonb_agg(reaction)
        FROM podcast_reactions
        WHERE episode_id = p_episode_id AND user_id = auth.uid()
      ), '[]'::jsonb),
      'reaction_counts', COALESCE((
        SELECT jsonb_object_agg(reaction, cnt)
        FROM (
          SELECT reaction, COUNT(*) AS cnt
          FROM podcast_reactions
          WHERE episode_id = p_episode_id
          GROUP BY reaction
        ) sub
      ), '{}'::jsonb)
    ), '{}'::jsonb)
  );
END;
$$;

-- Get reaction counts and user's reactions for an episode
CREATE OR REPLACE FUNCTION public.get_episode_reactions(p_episode_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_build_object(
    'user_reactions', COALESCE((
      SELECT jsonb_agg(reaction)
      FROM podcast_reactions
      WHERE episode_id = p_episode_id AND user_id = auth.uid()
    ), '[]'::jsonb),
    'reaction_counts', COALESCE((
      SELECT jsonb_object_agg(reaction, cnt)
      FROM (
        SELECT reaction, COUNT(*) AS cnt
        FROM podcast_reactions
        WHERE episode_id = p_episode_id
        GROUP BY reaction
      ) sub
    ), '{}'::jsonb)
  ), '{}'::jsonb);
$$;

-- ============================================================
-- 3. PODCAST COMMENTS: edit + delete
-- ============================================================

-- Add edited_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'podcast_comments' AND column_name = 'edited_at'
  ) THEN
    ALTER TABLE podcast_comments ADD COLUMN edited_at timestamptz;
  END IF;
END $$;

-- Edit own comment
CREATE OR REPLACE FUNCTION public.edit_podcast_comment(
  p_comment_id uuid,
  p_body text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE podcast_comments
  SET body = p_body, edited_at = now()
  WHERE id = p_comment_id AND user_id = auth.uid();
$$;

-- Delete own comment (soft delete by setting body to empty)
CREATE OR REPLACE FUNCTION public.delete_podcast_comment(p_comment_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM podcast_comments
  WHERE id = p_comment_id AND user_id = auth.uid();
$$;

-- ============================================================
-- 4. PROFILE REPORTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profile_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, reporter_id)
);

ALTER TABLE profile_reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_create_profile_reports' AND tablename = 'profile_reports') THEN
    CREATE POLICY users_create_profile_reports ON profile_reports
      FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_view_own_profile_reports' AND tablename = 'profile_reports') THEN
    CREATE POLICY users_view_own_profile_reports ON profile_reports
      FOR SELECT TO authenticated USING (reporter_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'admins_manage_profile_reports' AND tablename = 'profile_reports') THEN
    CREATE POLICY admins_manage_profile_reports ON profile_reports
      FOR ALL TO authenticated USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND profile_type = 'admin')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profile_reports_profile ON profile_reports(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_reports_reporter ON profile_reports(reporter_id);

-- Report a profile
CREATE OR REPLACE FUNCTION public.report_profile(
  p_profile_id uuid,
  p_reason text,
  p_details text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO profile_reports (profile_id, reporter_id, reason, details)
  VALUES (p_profile_id, auth.uid(), p_reason, p_details)
  ON CONFLICT (profile_id, reporter_id) DO UPDATE
  SET reason = p_reason, details = p_details, created_at = now();
$$;

-- ============================================================
-- 5. NOTIFICATION PREFERENCES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  comment_notifications boolean NOT NULL DEFAULT true,
  reaction_notifications boolean NOT NULL DEFAULT true,
  follow_notifications boolean NOT NULL DEFAULT true,
  session_reminders boolean NOT NULL DEFAULT true,
  message_notifications boolean NOT NULL DEFAULT true,
  announcement_notifications boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_manage_own_notif_prefs' AND tablename = 'notification_preferences') THEN
    CREATE POLICY users_manage_own_notif_prefs ON notification_preferences
      FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Get user notification preferences (create default row if not exists)
CREATE OR REPLACE FUNCTION public.get_notification_preferences(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefs record;
BEGIN
  INSERT INTO notification_preferences (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_prefs
  FROM notification_preferences
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'comment_notifications', v_prefs.comment_notifications,
    'reaction_notifications', v_prefs.reaction_notifications,
    'follow_notifications', v_prefs.follow_notifications,
    'session_reminders', v_prefs.session_reminders,
    'message_notifications', v_prefs.message_notifications,
    'announcement_notifications', v_prefs.announcement_notifications
  );
END;
$$;

-- Update a single notification preference
CREATE OR REPLACE FUNCTION public.update_notification_preference(
  p_key text,
  p_value boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notification_preferences (user_id) VALUES (auth.uid())
  ON CONFLICT (user_id) DO NOTHING;

  IF p_key = 'comment_notifications' THEN
    UPDATE notification_preferences SET comment_notifications = p_value, updated_at = now() WHERE user_id = auth.uid();
  ELSIF p_key = 'reaction_notifications' THEN
    UPDATE notification_preferences SET reaction_notifications = p_value, updated_at = now() WHERE user_id = auth.uid();
  ELSIF p_key = 'follow_notifications' THEN
    UPDATE notification_preferences SET follow_notifications = p_value, updated_at = now() WHERE user_id = auth.uid();
  ELSIF p_key = 'session_reminders' THEN
    UPDATE notification_preferences SET session_reminders = p_value, updated_at = now() WHERE user_id = auth.uid();
  ELSIF p_key = 'message_notifications' THEN
    UPDATE notification_preferences SET message_notifications = p_value, updated_at = now() WHERE user_id = auth.uid();
  ELSIF p_key = 'announcement_notifications' THEN
    UPDATE notification_preferences SET announcement_notifications = p_value, updated_at = now() WHERE user_id = auth.uid();
  END IF;
END;
$$;

-- ============================================================
-- 6. SESSION LIKES (like unlike sessions)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.session_likes (
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

ALTER TABLE session_likes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_manage_own_session_likes' AND tablename = 'session_likes') THEN
    CREATE POLICY users_manage_own_session_likes ON session_likes
      FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_likes_session ON session_likes(session_id);
CREATE INDEX IF NOT EXISTS idx_session_likes_user ON session_likes(user_id);

-- Toggle session like
CREATE OR REPLACE FUNCTION public.toggle_session_like(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_removed boolean := false;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM session_likes WHERE session_id = p_session_id AND user_id = auth.uid()
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM session_likes WHERE session_id = p_session_id AND user_id = auth.uid();
    v_removed := true;
  ELSE
    INSERT INTO session_likes (session_id, user_id) VALUES (p_session_id, auth.uid());
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'removed', v_removed,
      'liked', NOT v_removed,
      'like_count', COUNT(*)
    )
    FROM session_likes WHERE session_id = p_session_id
  );
END;
$$;

-- Check if user liked a session
CREATE OR REPLACE FUNCTION public.is_session_liked(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM session_likes WHERE session_id = p_session_id AND user_id = auth.uid()
  );
$$;

COMMIT;
