-- =============================================
-- HEALER PLATFORM PHASE 2
-- Adds new tables for followers, saves, reviews,
-- availability, profile views + missing profile columns
-- =============================================

-- 1. ADD MISSING COLUMNS TO PROFILES
-- =============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS online_available boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS in_person_available boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS certifications text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS session_price numeric DEFAULT 0 CHECK (session_price >= 0),
  ADD COLUMN IF NOT EXISTS social_instagram_url text,
  ADD COLUMN IF NOT EXISTS social_facebook_url text,
  ADD COLUMN IF NOT EXISTS social_youtube_url text;

-- 2. CREATE HEALER FOLLOWERS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.healer_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  healer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(healer_id, follower_id),
  CHECK (healer_id <> follower_id)
);

ALTER TABLE public.healer_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "healer_followers_visible_to_both"
  ON public.healer_followers
  FOR SELECT
  TO authenticated
  USING (healer_id = auth.uid() OR follower_id = auth.uid());

CREATE POLICY "users_follow_healers"
  ON public.healer_followers
  FOR INSERT
  TO authenticated
  WITH CHECK (follower_id = auth.uid());

CREATE POLICY "users_unfollow_healers"
  ON public.healer_followers
  FOR DELETE
  TO authenticated
  USING (follower_id = auth.uid());

-- 3. CREATE SAVED HEALERS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.saved_healers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  healer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, healer_id),
  CHECK (user_id <> healer_id)
);

ALTER TABLE public.saved_healers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_saved_healers"
  ON public.saved_healers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_save_healers"
  ON public.saved_healers
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_unsave_healers"
  ON public.saved_healers
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 4. CREATE HEALER REVIEWS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.healer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  healer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  content text,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'reported')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(healer_id, reviewer_id, session_id)
);

ALTER TABLE public.healer_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_public_read"
  ON public.healer_reviews
  FOR SELECT
  TO authenticated
  USING (status = 'active');

CREATE POLICY "healers_view_own_reviews"
  ON public.healer_reviews
  FOR SELECT
  TO authenticated
  USING (healer_id = auth.uid());

CREATE POLICY "users_create_reviews"
  ON public.healer_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

CREATE POLICY "users_update_own_reviews"
  ON public.healer_reviews
  FOR UPDATE
  TO authenticated
  USING (reviewer_id = auth.uid())
  WITH CHECK (reviewer_id = auth.uid());

CREATE POLICY "users_delete_own_reviews"
  ON public.healer_reviews
  FOR DELETE
  TO authenticated
  USING (reviewer_id = auth.uid());

-- 5. CREATE HEALER AVAILABILITY TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.healer_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  healer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

ALTER TABLE public.healer_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "availability_public_read"
  ON public.healer_availability
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "healers_manage_own_availability"
  ON public.healer_availability
  FOR ALL
  TO authenticated
  USING (healer_id = auth.uid())
  WITH CHECK (healer_id = auth.uid());

-- 6. CREATE PROFILE VIEWS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "healers_view_own_stats"
  ON public.profile_views
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "system_log_profile_views"
  ON public.profile_views
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 7. ADD INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_healer_followers_healer ON public.healer_followers(healer_id);
CREATE INDEX IF NOT EXISTS idx_healer_followers_follower ON public.healer_followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_saved_healers_user ON public.saved_healers(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_healers_healer ON public.saved_healers(healer_id);
CREATE INDEX IF NOT EXISTS idx_healer_reviews_healer ON public.healer_reviews(healer_id);
CREATE INDEX IF NOT EXISTS idx_healer_reviews_reviewer ON public.healer_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_healer_availability_healer ON public.healer_availability(healer_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_profile ON public.profile_views(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_at ON public.profile_views(viewed_at);

-- 8. CREATE RPC FUNCTIONS
-- =============================================

-- Toggle follow/unfollow a healer
CREATE OR REPLACE FUNCTION public.toggle_follow_healer(target_healer uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_follower uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_follower IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_follower = target_healer THEN RAISE EXCEPTION 'Cannot follow yourself'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.healer_followers
    WHERE healer_id = target_healer AND follower_id = v_follower
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.healer_followers
    WHERE healer_id = target_healer AND follower_id = v_follower;
    RETURN false;
  ELSE
    INSERT INTO public.healer_followers (healer_id, follower_id)
    VALUES (target_healer, v_follower);
    RETURN true;
  END IF;
END;
$$;

-- Get follower count for a healer
CREATE OR REPLACE FUNCTION public.get_healer_follower_count(target_healer uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint FROM public.healer_followers WHERE healer_id = target_healer;
$$;

-- Check if current user follows a healer
CREATE OR REPLACE FUNCTION public.is_following_healer(target_healer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.healer_followers
    WHERE healer_id = target_healer AND follower_id = auth.uid()
  );
$$;

-- Toggle save/unsave a healer
CREATE OR REPLACE FUNCTION public.toggle_save_healer(target_healer uuid)
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
    SELECT 1 FROM public.saved_healers
    WHERE healer_id = target_healer AND user_id = v_user
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.saved_healers
    WHERE healer_id = target_healer AND user_id = v_user;
    RETURN false;
  ELSE
    INSERT INTO public.saved_healers (user_id, healer_id)
    VALUES (v_user, target_healer);
    RETURN true;
  END IF;
END;
$$;

-- Check if current user saved a healer
CREATE OR REPLACE FUNCTION public.is_saved_healer(target_healer uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.saved_healers
    WHERE healer_id = target_healer AND user_id = auth.uid()
  );
$$;

-- Get healer review stats
CREATE OR REPLACE FUNCTION public.get_healer_review_stats(target_healer uuid)
RETURNS TABLE (avg_rating numeric, review_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ROUND(AVG(rating)::numeric, 1) as avg_rating,
    COUNT(*)::bigint as review_count
  FROM public.healer_reviews
  WHERE healer_id = target_healer AND status = 'active';
$$;

-- Get healer reviews with reviewer info
CREATE OR REPLACE FUNCTION public.get_healer_reviews(
  target_healer uuid,
  page_limit integer DEFAULT 10,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  rating integer,
  title text,
  content text,
  created_at timestamptz,
  reviewer_name text,
  reviewer_avatar text,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH reviews AS (
    SELECT
      r.id, r.rating, r.title, r.content, r.created_at,
      p.full_name as reviewer_name,
      p.avatar_url as reviewer_avatar,
      COUNT(*) OVER() as total_count
    FROM public.healer_reviews r
    JOIN public.profiles p ON p.id = r.reviewer_id
    WHERE r.healer_id = target_healer AND r.status = 'active'
    ORDER BY r.created_at DESC
    LIMIT page_limit OFFSET page_offset
  )
  SELECT * FROM reviews;
$$;

-- Log a profile view
CREATE OR REPLACE FUNCTION public.log_profile_view(target_profile uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_profile = auth.uid() THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profile_views pv
    WHERE pv.profile_id = target_profile AND pv.viewer_id = auth.uid()
      AND pv.viewed_at > now() - interval '24 hours'
  ) THEN
    INSERT INTO public.profile_views (profile_id, viewer_id)
    VALUES (target_profile, auth.uid());
  END IF;
END;
$$;

-- Get profile view count
CREATE OR REPLACE FUNCTION public.get_profile_view_count(target_profile uuid, days integer DEFAULT 30)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint
  FROM public.profile_views
  WHERE profile_id = target_profile
    AND viewed_at > now() - (days || ' days')::interval;
$$;

-- Get healer dashboard stats
CREATE OR REPLACE FUNCTION public.get_healer_dashboard_stats(target_healer uuid)
RETURNS TABLE (
  follower_count bigint,
  review_count bigint,
  avg_rating numeric,
  profile_view_count bigint,
  session_count bigint,
  total_registrations bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::bigint FROM public.healer_followers WHERE healer_id = target_healer),
    (SELECT COUNT(*)::bigint FROM public.healer_reviews WHERE healer_id = target_healer AND status = 'active'),
    (SELECT ROUND(AVG(rating)::numeric, 1) FROM public.healer_reviews WHERE healer_id = target_healer AND status = 'active'),
    (SELECT COUNT(*)::bigint FROM public.profile_views WHERE profile_id = target_healer AND viewed_at > now() - interval '30 days'),
    (SELECT COUNT(*)::bigint FROM public.sessions WHERE host_id = target_healer AND status NOT IN ('cancelled', 'draft')),
    (SELECT COUNT(*)::bigint FROM public.session_registrations sr
     JOIN public.sessions s ON s.id = sr.session_id
     WHERE s.host_id = target_healer AND sr.status IN ('registered', 'attended'));
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.toggle_follow_healer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_healer_follower_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_following_healer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_save_healer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_saved_healer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_healer_review_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_healer_reviews(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_profile_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_view_count(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_healer_dashboard_stats(uuid) TO authenticated;
