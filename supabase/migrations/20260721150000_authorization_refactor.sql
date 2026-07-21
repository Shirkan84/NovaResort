-- Authorization refactor: Two account types (member, healer) with no approval gate.
-- Healers can create events and podcasts immediately after registration.
-- Approval-related columns are kept but not used for authorization.

-- ============================================================
-- 1. NORMALIZE EXISTING DATA
-- ============================================================

-- Set profile_type = 'healer' for all profiles that were previously approved professionals
-- with one of the old healer role types.
UPDATE public.profiles
SET profile_type = 'healer'
WHERE professional_verification_status = 'approved'
  AND profile_type IN ('therapist', 'coach', 'mindfulness_teacher', 'wellness_professional', 'community_facilitator');

-- ============================================================
-- 2. UPDATE CHECK CONSTRAINTS
-- ============================================================

-- profiles.profile_type: only member, healer, admin
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profile_type_check
  CHECK (profile_type IN ('member', 'healer', 'admin'));

-- ============================================================
-- 3. HELPER FUNCTIONS
-- ============================================================

-- Simple role check: is the user a healer?
CREATE OR REPLACE FUNCTION public.is_healer(check_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = check_user
      AND p.profile_type = 'healer'
      AND COALESCE(p.account_status, 'active') = 'active'
  );
$$;

-- Can this user create content (events, podcasts)?
CREATE OR REPLACE FUNCTION public.can_create_content(check_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = check_user
      AND p.profile_type IN ('healer', 'admin')
      AND COALESCE(p.account_status, 'active') = 'active'
  );
$$;

-- Keep is_approved_professional working but now it just checks profile_type (no approval gate)
CREATE OR REPLACE FUNCTION public.is_approved_professional(check_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.can_create_content(check_user);
$$;

-- Keep is_approved_podcast_creator working but now it just checks profile_type
CREATE OR REPLACE FUNCTION public.is_approved_podcast_creator(check_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.can_create_content(check_user);
$$;

-- Update profile_is_approved_professional to match
CREATE OR REPLACE FUNCTION public.profile_is_approved_professional(
  pt text,
  vs text,
  ast text DEFAULT 'active'
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(ast, 'active') = 'active'
    AND pt IN ('healer', 'admin');
$$;

-- Revoke and grant
REVOKE ALL ON FUNCTION public.is_healer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_create_content(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_healer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_content(uuid) TO authenticated;

-- ============================================================
-- 4. UPDATE handle_new_user() TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  application jsonb := COALESCE(new.raw_user_meta_data->'healer_application', '{}'::jsonb);
  wants_healer boolean := COALESCE(new.raw_user_meta_data->>'requested_profile_type', new.raw_user_meta_data->>'profile_type') = 'healer';
  resolved_type text := CASE WHEN wants_healer THEN 'healer' ELSE 'member' END;
BEGIN
  INSERT INTO public.profiles (
    id, full_name, display_name, country, city, profile_type, professional_title,
    professional_verification_status, about, specialties, years_experience, languages,
    professional_website, linkedin_url
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(application->>'country', new.raw_user_meta_data->>'country'),
    NULLIF(application->>'city', ''),
    resolved_type,
    NULLIF(application->>'professional_title', ''),
    CASE WHEN wants_healer THEN 'approved' ELSE 'unverified' END,
    CASE WHEN wants_healer THEN COALESCE(application->>'biography', '') ELSE '' END,
    COALESCE(array(SELECT jsonb_array_elements_text(application->'specialties')), '{}'::text[]),
    NULLIF(application->>'years_experience', '')::integer,
    COALESCE(array(SELECT jsonb_array_elements_text(application->'languages')), '{}'::text[]),
    NULLIF(application->>'website', ''),
    NULLIF(application->>'linkedin', '')
  )
  ON CONFLICT (id) DO NOTHING;

  IF wants_healer THEN
    INSERT INTO public.healer_applications (
      user_id, status, professional_title, specialties, biography, education, certifications,
      document_names, years_experience, languages, country, city, professional_website,
      linkedin_url, professional_license, insurance_accepted, session_availability, session_types
    )
    VALUES (
      new.id,
      'approved',
      COALESCE(application->>'professional_title', ''),
      COALESCE(array(SELECT jsonb_array_elements_text(application->'specialties')), '{}'::text[]),
      COALESCE(application->>'biography', ''),
      COALESCE(application->'education', '[]'::jsonb),
      COALESCE(application->'certifications', '[]'::jsonb),
      COALESCE(array(SELECT jsonb_array_elements_text(application->'document_names')), '{}'::text[]),
      COALESCE(NULLIF(application->>'years_experience', '')::integer, 0),
      COALESCE(array(SELECT jsonb_array_elements_text(application->'languages')), '{}'::text[]),
      COALESCE(application->>'country', new.raw_user_meta_data->>'country', ''),
      NULLIF(application->>'city', ''),
      NULLIF(application->>'website', ''),
      NULLIF(application->>'linkedin', ''),
      COALESCE(application->'professional_license', '{}'::jsonb),
      COALESCE(array(SELECT jsonb_array_elements_text(application->'insurance_accepted')), '{}'::text[]),
      COALESCE(NULLIF(application->>'session_availability', ''), 'online'),
      COALESCE(array(SELECT jsonb_array_elements_text(application->'session_types')), '{}'::text[])
    )
    ON CONFLICT (user_id) DO UPDATE SET
      status = 'approved',
      professional_title = excluded.professional_title,
      specialties = excluded.specialties,
      biography = excluded.biography,
      education = excluded.education,
      certifications = excluded.certifications,
      document_names = excluded.document_names,
      years_experience = excluded.years_experience,
      languages = excluded.languages,
      country = excluded.country,
      city = excluded.city,
      professional_website = excluded.professional_website,
      linkedin_url = excluded.linkedin_url,
      professional_license = excluded.professional_license,
      insurance_accepted = excluded.insurance_accepted,
      session_availability = excluded.session_availability,
      session_types = excluded.session_types,
      updated_at = now();
  END IF;
  RETURN new;
END;
$$;

-- ============================================================
-- 5. UPDATE PROFILE TRIGGER - allow healers to edit their fields
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_profile_field_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_is_admin() THEN
    return new;
  END IF;

  IF (select auth.uid()) IS NULL OR new.id <> (select auth.uid()) THEN
    RAISE EXCEPTION 'Only the profile owner can update this profile.';
  END IF;

  -- Users cannot change their own profile_type or account_status
  IF new.profile_type IS DISTINCT FROM old.profile_type
    OR new.professional_verification_status IS DISTINCT FROM old.professional_verification_status
    OR COALESCE(new.account_status, 'active') IS DISTINCT FROM COALESCE(old.account_status, 'active') THEN
    RAISE EXCEPTION 'Account type and status require administrator action.';
  END IF;

  -- Healers can edit their own professional fields; members cannot
  IF NOT public.can_create_content(old.id)
    AND (
      new.professional_title IS DISTINCT FROM old.professional_title
      OR COALESCE(new.specialties, '{}'::text[]) IS DISTINCT FROM COALESCE(old.specialties, '{}'::text[])
      OR new.years_experience IS DISTINCT FROM old.years_experience
      OR new.availability IS DISTINCT FROM old.availability
      OR new.professional_website IS DISTINCT FROM old.professional_website
      OR new.linkedin_url IS DISTINCT FROM old.linkedin_url
    ) THEN
    RAISE EXCEPTION 'Professional profile fields are only editable for healer accounts.';
  END IF;

  RETURN new;
END;
$$;

-- ============================================================
-- 6. UPDATE RLS POLICIES - PODCASTS
-- ============================================================

-- Podcasts: creators create their own
DROP POLICY IF EXISTS "approved creators create podcasts" ON public.podcasts;
CREATE POLICY "approved creators create podcasts" ON public.podcasts
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = (select auth.uid()) AND public.can_create_content((select auth.uid())));

-- Podcasts: creators update their own
DROP POLICY IF EXISTS "creators update own podcasts" ON public.podcasts;
CREATE POLICY "creators update own podcasts" ON public.podcasts
  FOR UPDATE TO authenticated
  USING (creator_id = (select auth.uid()) AND public.can_create_content((select auth.uid())))
  WITH CHECK (creator_id = (select auth.uid()) AND public.can_create_content((select auth.uid())));

-- Podcast tags: content creators can manage
DROP POLICY IF EXISTS "approved creators manage tags" ON public.podcast_tags;
CREATE POLICY "approved creators manage tags" ON public.podcast_tags
  FOR INSERT TO authenticated
  WITH CHECK (public.can_create_content((select auth.uid())));

-- Episodes: creators insert their own
DROP POLICY IF EXISTS "creators insert own episodes" ON public.podcast_episodes;
CREATE POLICY "creators insert own episodes" ON public.podcast_episodes
  FOR INSERT TO authenticated
  WITH CHECK (creator_id = (select auth.uid()) AND public.can_create_content((select auth.uid())));

-- Episodes: creators update their own
DROP POLICY IF EXISTS "creators update own episodes" ON public.podcast_episodes;
CREATE POLICY "creators update own episodes" ON public.podcast_episodes
  FOR UPDATE TO authenticated
  USING (creator_id = (select auth.uid()) AND public.can_create_content((select auth.uid())))
  WITH CHECK (creator_id = (select auth.uid()) AND public.can_create_content((select auth.uid())));

-- Podcast groups: creators manage
DROP POLICY IF EXISTS "creators manage podcast groups" ON public.podcast_groups;
CREATE POLICY "creators manage podcast groups" ON public.podcast_groups
  FOR ALL TO authenticated
  USING (creator_id = (select auth.uid()))
  WITH CHECK (creator_id = (select auth.uid()) AND public.can_create_content((select auth.uid())));

-- ============================================================
-- 7. UPDATE RLS POLICIES - SESSIONS
-- ============================================================

-- Sessions: healers create their own
DROP POLICY IF EXISTS "users create own sessions" ON public.sessions;
CREATE POLICY "users create own sessions" ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (host_id = (select auth.uid()) AND starts_at > now() AND public.can_create_content((select auth.uid())));

-- Sessions: healers update their own
DROP POLICY IF EXISTS "hosts update own sessions" ON public.sessions;
CREATE POLICY "hosts update own sessions" ON public.sessions
  FOR UPDATE TO authenticated
  USING (host_id = (select auth.uid()) AND public.can_create_content((select auth.uid())))
  WITH CHECK (host_id = (select auth.uid()) AND public.can_create_content((select auth.uid())));

-- ============================================================
-- 8. UPDATE STORAGE POLICIES
-- ============================================================

-- Podcast covers upload
DROP POLICY IF EXISTS "podcast creators upload covers" ON storage.objects;
CREATE POLICY "podcast creators upload covers" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'podcast-covers'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
    AND public.can_create_content((select auth.uid())));

-- Podcast audio upload
DROP POLICY IF EXISTS "podcast creators upload audio" ON storage.objects;
CREATE POLICY "podcast creators upload audio" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'podcast-audio'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
    AND public.can_create_content((select auth.uid())));

-- ============================================================
-- 9. UPDATE PROFILES RLS
-- ============================================================

-- Simplified profile update policy (no more verification_status check)
DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK (
    (select auth.uid()) = id
    AND profile_type = public.current_account_type()
    AND COALESCE(account_status, 'active') = 'active'
  );

-- ============================================================
-- 10. GRANT TABLE PERMISSIONS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcasts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_episodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_tag_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_follows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_episode_saves TO authenticated;
GRANT SELECT, INSERT ON public.podcast_listens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_reactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.podcast_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.podcast_group_members TO authenticated;
GRANT SELECT, INSERT ON public.podcast_reports TO authenticated;
