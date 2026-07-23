-- Registration rewrite: separate member/healer flows, enforce email confirmation.
-- Root cause: signUp() was returning immediate session, email confirmation was bypassed.

-- ============================================================
-- 1. ADD email COLUMN TO profiles
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill existing profiles from auth.users (bypass trigger via GUC flag)
-- First update the profile guard to allow GUC-based bypass
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

  IF current_setting('app.email_confirmation_update', true) = 'true' THEN
    return new;
  END IF;

  IF (select auth.uid()) IS NULL OR new.id <> (select auth.uid()) THEN
    RAISE EXCEPTION 'Only the profile owner can update this profile.';
  END IF;

  IF new.profile_type IS DISTINCT FROM old.profile_type
    OR new.professional_verification_status IS DISTINCT FROM old.professional_verification_status
    OR COALESCE(new.account_status, 'active') IS DISTINCT FROM COALESCE(old.account_status, 'active') THEN
    RAISE EXCEPTION 'Account type and status require administrator action.';
  END IF;

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

-- Now backfill
SELECT set_config('app.email_confirmation_update', 'true', true);
UPDATE public.profiles p
SET email = au.email
FROM auth.users au
WHERE p.id = au.id AND p.email IS NULL;
SELECT set_config('app.email_confirmation_update', 'false', true);

-- ============================================================
-- 2. CREATE member_profiles TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.member_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  preferred_language text NOT NULL DEFAULT 'English',
  timezone text,
  location text,
  interests text[] DEFAULT '{}',
  wellness_goals text[] DEFAULT '{}',
  notification_preferences jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. CREATE healer_profiles TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.healer_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  professional_title text NOT NULL DEFAULT '',
  professional_summary text,
  biography text,
  years_experience integer,
  languages text[] NOT NULL DEFAULT '{}',
  location text,
  online_available boolean DEFAULT true,
  in_person_available boolean DEFAULT false,
  qualifications text[] DEFAULT '{}',
  treatment_areas text[] NOT NULL DEFAULT '{}',
  modalities text[] NOT NULL DEFAULT '{}',
  client_populations text[] DEFAULT '{}',
  session_formats text[] DEFAULT '{}',
  profile_visibility text NOT NULL DEFAULT 'public',
  website text,
  social_links jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. RLS FOR member_profiles
-- ============================================================
ALTER TABLE public.member_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members read own member_profile" ON public.member_profiles;
CREATE POLICY "members read own member_profile" ON public.member_profiles
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "members update own member_profile" ON public.member_profiles;
CREATE POLICY "members update own member_profile" ON public.member_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "members insert own member_profile" ON public.member_profiles;
CREATE POLICY "members insert own member_profile" ON public.member_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

-- ============================================================
-- 5. RLS FOR healer_profiles
-- ============================================================
ALTER TABLE public.healer_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "healers read own healer_profile" ON public.healer_profiles;
CREATE POLICY "healers read own healer_profile" ON public.healer_profiles
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "healers update own healer_profile" ON public.healer_profiles;
CREATE POLICY "healers update own healer_profile" ON public.healer_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "healers insert own healer_profile" ON public.healer_profiles;
CREATE POLICY "healers insert own healer_profile" ON public.healer_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));

-- Public can read healer profiles for the directory (only active accounts)
DROP POLICY IF EXISTS "public reads active healer profiles" ON public.healer_profiles;
CREATE POLICY "public reads active healer profiles" ON public.healer_profiles
  FOR SELECT USING (
    profile_visibility = 'public'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = healer_profiles.user_id
        AND p.profile_type = 'healer'
        AND p.account_status = 'active'
    )
  );

-- ============================================================
-- 6. UPDATE handle_new_user() TRIGGER
-- Creates profiles row (email_pending) + role-specific profile from metadata.
-- ============================================================
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
  -- Shared profiles row: account_status = email_pending
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
    'email_pending',
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
    UPDATE public.profiles SET
      professional_title = COALESCE(NULLIF(reg->>'professional_title', ''), profiles.professional_title),
      specialties = COALESCE(array(SELECT jsonb_array_elements_text(reg->'treatment_areas')), profiles.specialties),
      languages = COALESCE(array(SELECT jsonb_array_elements_text(reg->'languages')), profiles.languages),
      years_experience = COALESCE(NULLIF(reg->>'years_experience', '')::integer, profiles.years_experience),
      about = COALESCE(NULLIF(reg->>'professional_summary', ''), profiles.about)
    WHERE id = new.id;
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

-- ============================================================
-- 7. TRIGGER: activate account on email confirmation
-- Uses a GUC flag to bypass the profile update guard.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    PERFORM set_config('app.email_confirmation_update', 'true', true);
    UPDATE public.profiles
    SET account_status = 'active', updated_at = now()
    WHERE id = NEW.id AND account_status = 'email_pending';
    PERFORM set_config('app.email_confirmation_update', 'false', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_email_confirmed ON auth.users;
CREATE TRIGGER on_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_email_confirmed();

-- ============================================================
-- 8. UPDATE is_healer / can_create_content to require active status

-- ============================================================
-- 8. UPDATE is_healer / can_create_content to require active status
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_healer(check_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = check_user
      AND p.profile_type = 'healer'
      AND p.account_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_create_content(check_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = check_user
      AND p.profile_type IN ('healer', 'admin')
      AND p.account_status = 'active'
  );
$$;

-- ============================================================
-- 9. UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_member_profile_timestamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN new.updated_at = now(); RETURN new; END; $$;

DROP TRIGGER IF EXISTS update_member_profile_updated_at ON public.member_profiles;
CREATE TRIGGER update_member_profile_updated_at
  BEFORE UPDATE ON public.member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_member_profile_timestamp();

CREATE OR REPLACE FUNCTION public.update_healer_profile_timestamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN new.updated_at = now(); RETURN new; END; $$;

DROP TRIGGER IF EXISTS update_healer_profile_updated_at ON public.healer_profiles;
CREATE TRIGGER update_healer_profile_updated_at
  BEFORE UPDATE ON public.healer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_healer_profile_timestamp();

-- ============================================================
-- 10. GRANTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON public.member_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.healer_profiles TO authenticated;
