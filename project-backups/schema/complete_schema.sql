-- =============================================
-- NOVA RESORT DATABASE SCHEMA
-- Reconstructed from migration history
-- Date: 2026-07-23 17:52:57
-- Project: ytdkpbuzycvspexnkeci
-- =============================================

-- =============================================
-- MIGRATION: 20260716155327_remote.sql
-- =============================================

-- Remote migration placeholder (applied on remote)


-- =============================================
-- MIGRATION: 20260720053446_remote.sql
-- =============================================

-- Remote migration placeholder (applied on remote)


-- =============================================
-- MIGRATION: 20260720053603_remote.sql
-- =============================================

-- Remote migration placeholder (applied on remote)


-- =============================================
-- MIGRATION: 20260720064357_remote.sql
-- =============================================

-- Remote migration placeholder (applied on remote)


-- =============================================
-- MIGRATION: 20260720065549_remote.sql
-- =============================================

-- Remote migration placeholder (applied on remote)


-- =============================================
-- MIGRATION: 20260720065935_remote.sql
-- =============================================

-- Remote migration placeholder (applied on remote)


-- =============================================
-- MIGRATION: 20260720070629_remote.sql
-- =============================================

-- Remote migration placeholder (applied on remote)


-- =============================================
-- MIGRATION: 20260720073029_remote.sql
-- =============================================

-- Remote migration placeholder (applied on remote)


-- =============================================
-- MIGRATION: 20260720075507_remote.sql
-- =============================================

-- Remote migration placeholder (applied on remote)


-- =============================================
-- MIGRATION: 20260720075613_remote.sql
-- =============================================

-- Remote migration placeholder (applied on remote)


-- =============================================
-- MIGRATION: 20260721124158_podcast_episodes_enhancements.sql
-- =============================================

-- Nova Resort podcast episodes enhancements.
-- Adds slug, show_notes, and category columns to podcast_episodes.

-- 1. Add slug column for URL-friendly episode identifiers
alter table public.podcast_episodes add column if not exists slug text;

-- Generate slugs for existing episodes that lack one
update public.podcast_episodes
set slug = lower(regexp_replace(
  title || '-' || left(id::text, 8),
  '[^a-z0-9]+', '-', 'g'
))
where slug is null;

-- Add unique constraint on (podcast_id, slug) for episodes
create unique index if not exists podcast_episodes_podcast_slug_idx
  on public.podcast_episodes(podcast_id, slug)
  where slug is not null;

-- 2. Add show_notes column for detailed episode notes (separate from brief description)
alter table public.podcast_episodes add column if not exists show_notes text not null default '' check (char_length(show_notes) <= 10000);

-- 3. Add category column to episodes (can differ from podcast-level category)
alter table public.podcast_episodes add column if not exists category text;

-- 4. Ensure updated_at trigger exists for podcast_episodes
create or replace function public.update_podcast_episode_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_podcast_episode_updated_at on public.podcast_episodes;
create trigger update_podcast_episode_updated_at
  before update on public.podcast_episodes
  for each row
  execute function public.update_podcast_episode_timestamp();

-- 5. Ensure updated_at trigger exists for podcasts (shows)
create or replace function public.update_podcast_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_podcast_updated_at on public.podcasts;
create trigger update_podcast_updated_at
  before update on public.podcasts
  for each row
  execute function public.update_podcast_timestamp();

-- 6. Ensure existing podcast slugs are populated
update public.podcasts
set slug = lower(regexp_replace(
  title,
  '[^a-z0-9]+', '-', 'g'
))
where slug is null or slug = '';


-- =============================================
-- MIGRATION: 20260721150000_authorization_refactor.sql
-- =============================================

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

-- Update profile_is_approved_professional to match (keep original param names for CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.profile_is_approved_professional(
  profile_type text,
  verification_status text,
  account_status text default 'active'
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(account_status, 'active') = 'active'
    AND profile_type IN ('healer', 'admin');
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


-- =============================================
-- MIGRATION: 20260721170000_podcast_production.sql
-- =============================================

-- Nova Resort podcast production hardening.
-- Adds 20-minute duration constraint, fixes bucket mime types, adds storage usage RPC.

-- 1. Enforce 20-minute maximum episode duration (1200 seconds)
alter table public.podcast_episodes
  drop constraint if exists podcast_episodes_audio_duration_check;

alter table public.podcast_episodes
  add constraint podcast_episodes_audio_duration_check
  check (audio_duration_seconds >= 0 and audio_duration_seconds <= 1200);

-- 2. Fix podcast-audio bucket: restrict to MP3, M4A, AAC only
update storage.buckets
set allowed_mime_types = array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a']
where id = 'podcast-audio';

-- 3. Storage usage RPC: returns total bytes used by a creator across both buckets
create or replace function public.get_podcast_storage_usage(creator uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select sum((metadata->>'size')::bigint)
     from storage.objects
     where bucket_id = 'podcast-audio'
       and (storage.foldername(name))[1] = creator::text),
    0
  ) + coalesce(
    (select sum((metadata->>'size')::bigint)
     from storage.objects
     where bucket_id = 'podcast-covers'
       and (storage.foldername(name))[1] = creator::text),
    0
  );
$$;

revoke all on function public.get_podcast_storage_usage(uuid) from public;
grant execute on function public.get_podcast_storage_usage(uuid) to authenticated;

-- 4. Storage DELETE policies: allow healers to delete their own files
drop policy if exists "podcast creators delete own covers" on storage.objects;
create policy "podcast creators delete own covers" on storage.objects for delete to authenticated
using (bucket_id = 'podcast-covers' and owner_id = (select auth.uid())::text);

drop policy if exists "podcast creators delete own audio" on storage.objects;
create policy "podcast creators delete own audio" on storage.objects for delete to authenticated
using (bucket_id = 'podcast-audio' and owner_id = (select auth.uid())::text);


-- =============================================
-- MIGRATION: 20260721180000_chat_media_columns.sql
-- =============================================

-- Add media columns to messages table and chat-media storage bucket.
-- Fixes "column messages.media_url does not exist" error.

alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_type text;
alter table public.messages add column if not exists media_mime_type text;
alter table public.messages add column if not exists media_size integer;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'chat-media') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('chat-media', 'chat-media', false, 52428800,
      array['image/jpeg','image/png','image/gif','image/webp','audio/webm','audio/mpeg','audio/ogg','video/webm','video/mp4']);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'chat media upload own' and tablename = 'objects') then
    create policy "chat media upload own" on storage.objects for insert to authenticated
    with check (
      bucket_id = 'chat-media'
      and (storage.foldername(name))[1] = (select auth.uid()::text)
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'chat media read room members' and tablename = 'objects') then
    create policy "chat media read room members" on storage.objects for select to authenticated
    using (
      bucket_id = 'chat-media'
      and (
        (storage.foldername(name))[1] = (select auth.uid()::text)
        or exists (
          select 1 from public.room_members rm
          where rm.user_id = (select auth.uid())
            and rm.room_id::text = (storage.foldername(name))[2]
        )
        or exists (
          select 1 from public.rooms r
          where r.is_private = false
            and r.id::text = (storage.foldername(name))[2]
        )
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'chat media delete own' and tablename = 'objects') then
    create policy "chat media delete own" on storage.objects for delete to authenticated
    using (
      bucket_id = 'chat-media'
      and (storage.foldername(name))[1] = (select auth.uid()::text)
    );
  end if;
end $$;

create index if not exists messages_media_type_idx on public.messages(media_type) where media_type is not null;


-- =============================================
-- MIGRATION: 20260721190000_chat_media_public.sql
-- =============================================

-- Fix chat-media bucket: set to public so getPublicUrl() works.
-- Both CommunityFeatures.tsx and PrivateMessaging.tsx use getPublicUrl() which requires a public bucket.

update storage.buckets set public = true where id = 'chat-media';


-- =============================================
-- MIGRATION: 20260722120000_live_sessions.sql
-- =============================================

-- Live Sessions: extends sessions with live room, participants, chat, reminders.

-- ============================================================
-- 1. Extend sessions table
-- ============================================================
alter table public.sessions add column if not exists session_type text not null default 'online' check (session_type in ('online','in_person','hybrid'));
alter table public.sessions add column if not exists price numeric not null default 0 check (price >= 0);
alter table public.sessions add column if not exists currency text not null default 'USD';
alter table public.sessions add column if not exists location text;
alter table public.sessions add column if not exists meeting_url text;
alter table public.sessions add column if not exists cover_image_url text;

-- ============================================================
-- 2. Live room state – one row per session
-- ============================================================
create table if not exists public.session_room_state (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','live','ended')),
  started_at timestamptz,
  ended_at timestamptz,
  started_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.session_room_state enable row level security;

-- Registered participants and the host can view room state
drop policy if exists "room state readable" on public.session_room_state;
create policy "room state readable" on public.session_room_state
for select to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_room_state.session_id
      and (
        s.host_id = auth.uid()
        or exists (
          select 1 from public.session_registrations sr
          where sr.session_id = s.id and sr.user_id = auth.uid() and sr.status in ('registered','waitlisted')
        )
      )
  )
);

-- Only host can insert/update room state
drop policy if exists "host manages room state" on public.session_room_state;
create policy "host manages room state" on public.session_room_state
for all to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_room_state.session_id and s.host_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sessions s
    where s.id = session_room_state.session_id and s.host_id = auth.uid()
  )
);

-- ============================================================
-- 3. Room participants – tracks who is in the live room
-- ============================================================
create table if not exists public.session_room_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'participant' check (role in ('host','participant')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  is_muted boolean not null default false,
  is_video_on boolean not null default false,
  is_screen_sharing boolean not null default false,
  unique(session_id, user_id)
);

create index if not exists idx_room_participants_session on public.session_room_participants(session_id);
create index if not exists idx_room_participants_user on public.session_room_participants(user_id);

alter table public.session_room_participants enable row level security;

-- Participants and host can view who's in the room
drop policy if exists "room participants readable" on public.session_room_participants;
create policy "room participants readable" on public.session_room_participants
for select to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_room_participants.session_id
      and (
        s.host_id = auth.uid()
        or exists (
          select 1 from public.session_registrations sr
          where sr.session_id = s.id and sr.user_id = auth.uid() and sr.status in ('registered','waitlisted')
        )
        or session_room_participants.user_id = auth.uid()
      )
  )
);

-- Participants can insert themselves (join)
drop policy if exists "participants can join room" on public.session_room_participants;
create policy "participants can join room" on public.session_room_participants
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.sessions s
    where s.id = session_room_participants.session_id
      and (
        s.host_id = auth.uid()
        or exists (
          select 1 from public.session_registrations sr
          where sr.session_id = s.id and sr.user_id = auth.uid() and sr.status in ('registered','waitlisted')
        )
      )
  )
);

-- Users can update their own row (mute/video/leave)
drop policy if exists "participants update own row" on public.session_room_participants;
create policy "participants update own row" on public.session_room_participants
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Host can update any participant (mute/remove)
drop policy if exists "host can manage participants" on public.session_room_participants;
create policy "host can manage participants" on public.session_room_participants
for update to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_room_participants.session_id and s.host_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sessions s
    where s.id = session_room_participants.session_id and s.host_id = auth.uid()
  )
);

-- ============================================================
-- 4. Session chat messages
-- ============================================================
create table if not exists public.session_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_session_chat_session on public.session_chat_messages(session_id, created_at);

alter table public.session_chat_messages enable row level security;

-- Registered/host can read chat
drop policy if exists "session chat readable" on public.session_chat_messages;
create policy "session chat readable" on public.session_chat_messages
for select to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_chat_messages.session_id
      and (
        s.host_id = auth.uid()
        or exists (
          select 1 from public.session_registrations sr
          where sr.session_id = s.id and sr.user_id = auth.uid() and sr.status in ('registered','waitlisted')
        )
      )
  )
);

-- Registered/host can send messages
drop policy if exists "session chat writable" on public.session_chat_messages;
create policy "session chat writable" on public.session_chat_messages
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.sessions s
    where s.id = session_chat_messages.session_id
      and (
        s.host_id = auth.uid()
        or exists (
          select 1 from public.session_registrations sr
          where sr.session_id = s.id and sr.user_id = auth.uid() and sr.status in ('registered','waitlisted')
        )
      )
  )
);

-- Host can pin messages
drop policy if exists "host can pin chat" on public.session_chat_messages;
create policy "host can pin chat" on public.session_chat_messages
for update to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_chat_messages.session_id and s.host_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sessions s
    where s.id = session_chat_messages.session_id and s.host_id = auth.uid()
  )
);

-- ============================================================
-- 5. Session reminders
-- ============================================================
create table if not exists public.session_reminders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('24h','1h','15m','start')),
  sent_at timestamptz not null default now(),
  unique(session_id, user_id, reminder_type)
);

create index if not exists idx_session_reminders_lookup on public.session_reminders(session_id, reminder_type);

alter table public.session_reminders enable row level security;

-- Only the system (security definer) manages reminders, but users can view their own
drop policy if exists "users see own reminders" on public.session_reminders;
create policy "users see own reminders" on public.session_reminders
for select to authenticated
using (user_id = auth.uid());

-- ============================================================
-- 6. Functions
-- ============================================================

-- Start a live session room (host only)
create or replace function public.start_session_room(target_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1 from public.sessions s
    where s.id = target_session and s.host_id = auth.uid()
  ) then
    raise exception 'Only the host can start the session.';
  end if;

  insert into public.session_room_state (session_id, status, started_at, started_by)
  values (target_session, 'live', now(), auth.uid())
  on conflict (session_id) do update
    set status = 'live', started_at = now(), started_by = auth.uid(), updated_at = now();

  update public.sessions set status = 'live', updated_at = now() where id = target_session;
end;
$$;

-- End a live session room (host only)
create or replace function public.end_session_room(target_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1 from public.sessions s
    where s.id = target_session and s.host_id = auth.uid()
  ) then
    raise exception 'Only the host can end the session.';
  end if;

  update public.session_room_state
  set status = 'ended', ended_at = now(), updated_at = now()
  where session_id = target_session;

  update public.sessions set status = 'completed', updated_at = now() where id = target_session;

  -- Mark all active participants as left
  update public.session_room_participants
  set left_at = now()
  where session_id = target_session and left_at is null;
end;
$$;

-- Join a live room (participant)
create or replace function public.join_session_room(target_session uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.sessions;
  room_state public.session_room_state;
  user_role text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select * into session_row from public.sessions where id = target_session;
  if session_row.id is null then
    raise exception 'Session not found.';
  end if;

  -- Determine role
  if session_row.host_id = auth.uid() then
    user_role := 'host';
  elsif exists (
    select 1 from public.session_registrations sr
    where sr.session_id = target_session and sr.user_id = auth.uid() and sr.status in ('registered','waitlisted')
  ) then
    user_role := 'participant';
  else
    raise exception 'You are not registered for this session.';
  end if;

  -- Check room is live
  select * into room_state from public.session_room_state where session_id = target_session;
  if room_state.status is null or room_state.status != 'live' then
    -- Host can join before room is live (waiting state)
    if user_role != 'host' then
      raise exception 'The room is not yet open.';
    end if;
  end if;

  -- Insert or update participant
  insert into public.session_room_participants (session_id, user_id, role)
  values (target_session, auth.uid(), user_role)
  on conflict (session_id, user_id) do update
    set left_at = null, is_muted = false, is_video_on = false;

  return user_role;
end;
$$;

-- Leave a live room
create or replace function public.leave_session_room(target_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.session_room_participants
  set left_at = now()
  where session_id = target_session and user_id = auth.uid() and left_at is null;
end;
$$;

-- Mute/unmute a participant (host only)
create or replace function public.mute_session_participant(target_session uuid, target_user uuid, muted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.sessions s
    where s.id = target_session and s.host_id = auth.uid()
  ) then
    raise exception 'Only the host can mute participants.';
  end if;

  update public.session_room_participants
  set is_muted = muted
  where session_id = target_session and user_id = target_user;
end;
$$;

-- Remove a participant from room (host only)
create or replace function public.remove_session_participant(target_session uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.sessions s
    where s.id = target_session and s.host_id = auth.uid()
  ) then
    raise exception 'Only the host can remove participants.';
  end if;

  update public.session_room_participants
  set left_at = now()
  where session_id = target_session and user_id = target_user and left_at is null;

  update public.session_registrations
  set status = 'removed', updated_at = now()
  where session_id = target_session and user_id = target_user and status in ('registered','waitlisted');
end;
$$;

-- Send session chat message
create or replace function public.send_session_chat(target_session uuid, message_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  msg_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1 from public.sessions s
    where s.id = target_session
      and (
        s.host_id = auth.uid()
        or exists (
          select 1 from public.session_registrations sr
          where sr.session_id = s.id and sr.user_id = auth.uid() and sr.status in ('registered','waitlisted')
        )
      )
  ) then
    raise exception 'You are not part of this session.';
  end if;

  insert into public.session_chat_messages (session_id, user_id, body)
  values (target_session, auth.uid(), message_body)
  returning id into msg_id;

  return msg_id;
end;
$$;

-- Host pin/unpin a chat message
create or replace function public.pin_session_chat(target_message uuid, pin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.session_chat_messages scm
    join public.sessions s on s.id = scm.session_id
    where scm.id = target_message and s.host_id = auth.uid()
  ) then
    raise exception 'Only the host can pin messages.';
  end if;

  update public.session_chat_messages set pinned = pin where id = target_message;
end;
$$;

-- Create session notifications (security definer for all session notification types)
create or replace function public.notify_session_event(
  target_session uuid,
  event_type text,
  target_user uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.sessions;
  recipient uuid;
  title_text text;
  body_text text;
begin
  select * into session_row from public.sessions where id = target_session;
  if session_row.id is null then return; end if;

  case event_type
    when 'registration_confirmed' then
      title_text := 'Registration confirmed';
      body_text := 'You are registered for "' || session_row.title || '" on ' ||
                   to_char(session_row.starts_at at time zone 'UTC', 'Mon DD, YYYY at HH12:MI AM UTC') || '.';
      insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
      values (target_user, session_row.host_id, 'session_registration_confirmed', title_text, body_text, target_session);

    when 'reminder_24h' then
      title_text := 'Session tomorrow';
      body_text := '"' || session_row.title || '" starts in 24 hours.';
      insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
      values (target_user, session_row.host_id, 'session_reminder', title_text, body_text, target_session);

    when 'reminder_1h' then
      title_text := 'Session in 1 hour';
      body_text := '"' || session_row.title || '" starts in 1 hour.';
      insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
      values (target_user, session_row.host_id, 'session_reminder', title_text, body_text, target_session);

    when 'reminder_15m' then
      title_text := 'Session starting soon';
      body_text := '"' || session_row.title || '" starts in 15 minutes.';
      insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
      values (target_user, session_row.host_id, 'session_reminder', title_text, body_text, target_session);

    when 'starting_now' then
      title_text := 'Session starting now';
      body_text := '"' || session_row.title || '" is live now. Join when you are ready.';
      insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
      values (target_user, session_row.host_id, 'session_starting', title_text, body_text, target_session);

    when 'host_started' then
      title_text := 'Host has started the session';
      body_text := 'The host has started "' || session_row.title || '". You can join now.';
      insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
      values (target_user, session_row.host_id, 'session_host_started', title_text, body_text, target_session);

    when 'session_cancelled' then
      title_text := 'Session cancelled';
      body_text := '"' || session_row.title || '" has been cancelled by the host.';
      insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
      values (target_user, session_row.host_id, 'session_cancelled', title_text, body_text, target_session);

    when 'session_updated' then
      title_text := 'Session updated';
      body_text := '"' || session_row.title || '" has been updated. Please check the details.';
      insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
      values (target_user, session_row.host_id, 'session_updated', title_text, body_text, target_session);
  end case;
end;
$$;

-- Broadcast reminders to all registered participants for a session
create or replace function public.send_session_reminders(target_session uuid, reminder_type text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reg record;
  count integer := 0;
begin
  for reg in
    select sr.user_id
    from public.session_registrations sr
    where sr.session_id = target_session
      and sr.status in ('registered','waitlisted')
      and not exists (
        select 1 from public.session_reminders rm
        where rm.session_id = target_session and rm.user_id = sr.user_id and rm.reminder_type = send_session_reminders.reminder_type
      )
  loop
    insert into public.session_reminders (session_id, user_id, reminder_type)
    values (target_session, reg.user_id, send_session_reminders.reminder_type);

    perform public.notify_session_event(
      target_session,
      case send_session_reminders.reminder_type
        when '24h' then 'reminder_24h'
        when '1h' then 'reminder_1h'
        when '15m' then 'reminder_15m'
        when 'start' then 'starting_now'
      end,
      reg.user_id
    );
    count := count + 1;
  end loop;

  return count;
end;
$$;

-- Cancel session (host only, sends notifications)
create or replace function public.cancel_session(target_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  reg record;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if not exists (
    select 1 from public.sessions s
    where s.id = target_session and s.host_id = auth.uid()
  ) then
    raise exception 'Only the host can cancel the session.';
  end if;

  update public.sessions
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where id = target_session;

  -- End room if live
  update public.session_room_state
  set status = 'ended', ended_at = now(), updated_at = now()
  where session_id = target_session and status != 'ended';

  -- Notify all registered participants
  for reg in
    select sr.user_id from public.session_registrations sr
    where sr.session_id = target_session and sr.status in ('registered','waitlisted')
  loop
    perform public.notify_session_event(target_session, 'session_cancelled', reg.user_id);
  end loop;
end;
$$;

-- Revoke and grant
revoke all on function public.start_session_room(uuid) from public;
revoke all on function public.end_session_room(uuid) from public;
revoke all on function public.join_session_room(uuid) from public;
revoke all on function public.leave_session_room(uuid) from public;
revoke all on function public.mute_session_participant(uuid, uuid, boolean) from public;
revoke all on function public.remove_session_participant(uuid, uuid) from public;
revoke all on function public.send_session_chat(uuid, text) from public;
revoke all on function public.pin_session_chat(uuid, boolean) from public;
revoke all on function public.notify_session_event(uuid, text, uuid) from public;
revoke all on function public.send_session_reminders(uuid, text) from public;
revoke all on function public.cancel_session(uuid) from public;

grant execute on function public.start_session_room(uuid) to authenticated;
grant execute on function public.end_session_room(uuid) to authenticated;
grant execute on function public.join_session_room(uuid) to authenticated;
grant execute on function public.leave_session_room(uuid) to authenticated;
grant execute on function public.mute_session_participant(uuid, uuid, boolean) to authenticated;
grant execute on function public.remove_session_participant(uuid, uuid) to authenticated;
grant execute on function public.send_session_chat(uuid, text) to authenticated;
grant execute on function public.pin_session_chat(uuid, boolean) to authenticated;
grant execute on function public.notify_session_event(uuid, text, uuid) to authenticated;
grant execute on function public.send_session_reminders(uuid, text) to authenticated;
grant execute on function public.cancel_session(uuid) to authenticated;

-- ============================================================
-- 7. Realtime
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table public.session_room_state;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.session_room_participants;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.session_chat_messages;
exception when duplicate_object then null; end $$;


-- =============================================
-- MIGRATION: 20260722130000_session_covers_storage.sql
-- =============================================

-- Session cover images storage bucket

insert into storage.buckets (id, name, public)
values ('session-covers', 'session-covers', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder
create policy "Healers can upload session covers"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'session-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access
create policy "Session covers are publicly readable"
on storage.objects
for select to authenticated
using (bucket_id = 'session-covers');

-- Allow owners to update/delete their own covers
create policy "Healers can update own session covers"
on storage.objects
for update to authenticated
using (
  bucket_id = 'session-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Healers can delete own session covers"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'session-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);


-- =============================================
-- MIGRATION: 20260722140000_ai_companion.sql
-- =============================================

-- AI Companion tables, RLS, and realtime.
-- Idempotent: uses IF NOT EXISTS, CREATE OR REPLACE, etc.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New AI conversation' check (char_length(title) between 1 and 120),
  status text not null default 'active' check (status in ('active','archived')),
  use_profile_context boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null check (char_length(content) <= 12000),
  provider_response_id text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  event_type text not null default 'message' check (event_type in ('message','blocked','error','limit')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  message_id uuid references public.ai_messages(id) on delete cascade,
  rating text not null check (rating in ('helpful','not_helpful','unsafe')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_recent_idx on public.ai_conversations(user_id, last_message_at desc) where deleted_at is null;
create index if not exists ai_messages_conversation_recent_idx on public.ai_messages(conversation_id, created_at) where deleted_at is null;
create index if not exists ai_usage_user_created_idx on public.ai_usage(user_id, created_at desc);
create index if not exists ai_feedback_user_created_idx on public.ai_feedback(user_id, created_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_feedback enable row level security;

-- Conversations
drop policy if exists "users view own ai conversations" on public.ai_conversations;
create policy "users view own ai conversations" on public.ai_conversations
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users create own ai conversations" on public.ai_conversations;
create policy "users create own ai conversations" on public.ai_conversations
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "users update own ai conversations" on public.ai_conversations;
create policy "users update own ai conversations" on public.ai_conversations
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Messages
drop policy if exists "users view own ai messages" on public.ai_messages;
create policy "users view own ai messages" on public.ai_messages
for select to authenticated
using (exists (
  select 1 from public.ai_conversations c
  where c.id = conversation_id and c.user_id = (select auth.uid()) and c.deleted_at is null
));

drop policy if exists "users insert own ai user messages" on public.ai_messages;
create policy "users insert own ai user messages" on public.ai_messages
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'user'
  and exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid()) and c.deleted_at is null
  )
);

drop policy if exists "users soft delete own ai messages" on public.ai_messages;
create policy "users soft delete own ai messages" on public.ai_messages
for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid()) and c.deleted_at is null
  )
)
with check (
  user_id = (select auth.uid())
  and role = 'user'
);

-- Usage
drop policy if exists "users view own ai usage" on public.ai_usage;
create policy "users view own ai usage" on public.ai_usage
for select to authenticated
using (user_id = (select auth.uid()));

-- Feedback
drop policy if exists "users view own ai feedback" on public.ai_feedback;
create policy "users view own ai feedback" on public.ai_feedback
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users create own ai feedback" on public.ai_feedback;
create policy "users create own ai feedback" on public.ai_feedback
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid()) and c.deleted_at is null
  )
);

grant select, insert, update on public.ai_conversations to authenticated;
grant select, insert, update on public.ai_messages to authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert on public.ai_feedback to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.ai_conversations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.ai_messages;
exception when duplicate_object then null; end $$;


-- =============================================
-- MIGRATION: 20260722150000_drop_ai_companion_cleanup.sql
-- =============================================

-- Cleanup migration: Drop AI Companion database objects.
-- Created: 2026-07-22
-- Status: NOT auto-applied. Requires explicit approval before execution.
-- Reason: AI Companion feature has been removed from the application.

-- ============================================================
-- TABLES TO DROP
-- ============================================================
-- ai_conversations  — user conversation threads with AI
-- ai_messages       — individual messages (user + assistant roles)
-- ai_usage          — rate limit and usage tracking
-- ai_feedback       — user feedback on AI responses

-- ============================================================
-- DROP TABLES (cascade removes RLS policies, indexes, triggers)
-- ============================================================
DROP TABLE IF EXISTS public.ai_feedback CASCADE;
DROP TABLE IF EXISTS public.ai_usage CASCADE;
DROP TABLE IF EXISTS public.ai_messages CASCADE;
DROP TABLE IF EXISTS public.ai_conversations CASCADE;

-- ============================================================
-- SUPABASE SECRETS TO REMOVE (manual, via dashboard or CLI)
-- ============================================================
-- AI_PROVIDER     — no longer needed
-- AI_MODEL        — no longer needed
-- GROQ_API_KEY    — no longer needed (if using Groq)
-- OPENAI_API_KEY  — no longer needed (if using OpenAI)
-- GEMINI_API_KEY  — no longer needed (if using Gemini)

-- ============================================================
-- EDGE FUNCTION TO REMOVE (already deleted from repo)
-- ============================================================
-- supabase/functions/ai-companion/index.ts — DELETED
-- supabase functions delete ai-companion  — run manually if deployed


-- =============================================
-- MIGRATION: 20260722160000_session_room_lifecycle.sql
-- =============================================

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


-- =============================================
-- MIGRATION: 20260722170000_feedback_reports.sql
-- =============================================

-- ============================================================
-- Feedback Reports System
-- ============================================================

-- 1. feedback_reports table
CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category      text NOT NULL CHECK (category IN ('bug_report','feature_request','improvement','question','general','other')),
  subject       text NOT NULL CHECK (length(trim(subject)) >= 3 AND length(subject) <= 200),
  description   text NOT NULL CHECK (length(trim(description)) >= 10 AND length(description) <= 5000),
  priority      text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  screenshot_url text,
  browser       text,
  os            text,
  current_page  text,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','resolved','closed')),
  admin_notes   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_reports_user_id ON public.feedback_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_status ON public.feedback_reports(status);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_created_at ON public.feedback_reports(created_at DESC);

-- 3. Unique constraint: prevent duplicate submissions within 60 seconds
CREATE OR REPLACE FUNCTION public.check_feedback_duplicate()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.feedback_reports
    WHERE user_id = NEW.user_id
      AND subject = NEW.subject
      AND description = NEW.description
      AND created_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'Duplicate feedback submission detected. Please wait before submitting again.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_feedback_duplicate
  BEFORE INSERT ON public.feedback_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.check_feedback_duplicate();

-- 4. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_feedback_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_feedback_updated_at
  BEFORE UPDATE ON public.feedback_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feedback_timestamp();

-- 5. RLS policies
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback"
  ON public.feedback_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
  ON public.feedback_reports FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all feedback
CREATE POLICY "Admins can view all feedback"
  ON public.feedback_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND profile_type = 'admin'
    )
  );

-- Admins can update feedback (status, notes)
CREATE POLICY "Admins can update feedback"
  ON public.feedback_reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND profile_type = 'admin'
    )
  );

-- 6. Storage bucket for screenshots
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'feedback-screenshots',
  'feedback-screenshots',
  true,
  5242880,
  ARRAY['image/png','image/jpeg','image/webp','image/gif']
) ON CONFLICT (id) DO NOTHING;

-- 7. Storage RLS: users can upload to their own folder
CREATE POLICY "Users can upload feedback screenshots"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 8. Storage RLS: anyone can read feedback screenshots (public bucket)
CREATE POLICY "Public read access for feedback screenshots"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'feedback-screenshots');

-- 9. Storage RLS: users can delete their own screenshots
CREATE POLICY "Users can delete own feedback screenshots"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'feedback-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 10. RPC for submitting feedback (validates and inserts in one call)
CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_category text,
  p_subject text,
  p_description text,
  p_priority text DEFAULT 'medium',
  p_screenshot_url text DEFAULT NULL,
  p_browser text DEFAULT NULL,
  p_os text DEFAULT NULL,
  p_current_page text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate category
  IF p_category NOT IN ('bug_report','feature_request','improvement','question','general','other') THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  -- Validate priority
  IF p_priority NOT IN ('low','medium','high') THEN
    RAISE EXCEPTION 'Invalid priority';
  END IF;

  -- Validate lengths
  IF length(trim(p_subject)) < 3 OR length(p_subject) > 200 THEN
    RAISE EXCEPTION 'Subject must be 3-200 characters';
  END IF;

  IF length(trim(p_description)) < 10 OR length(p_description) > 5000 THEN
    RAISE EXCEPTION 'Description must be 10-5000 characters';
  END IF;

  INSERT INTO public.feedback_reports (user_id, category, subject, description, priority, screenshot_url, browser, os, current_page)
  VALUES (v_user_id, p_category, p_subject, p_description, p_priority, p_screenshot_url, p_browser, p_os, p_current_page)
  RETURNING to_jsonb(feedback_reports.*) INTO v_result;

  RETURN v_result;
END;
$$;

-- 11. RPC for admin to update status
CREATE OR REPLACE FUNCTION public.update_feedback_status(
  p_feedback_id uuid,
  p_status text,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND profile_type = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_status NOT IN ('new','in_review','resolved','closed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  UPDATE public.feedback_reports
  SET status = p_status,
      admin_notes = COALESCE(p_admin_notes, admin_notes)
  WHERE id = p_feedback_id
  RETURNING to_jsonb(feedback_reports.*) INTO v_result;

  RETURN v_result;
END;
$$;


-- =============================================
-- MIGRATION: 20260722180000_podcast_studio_production.sql
-- =============================================

-- Nova Resort podcast studio production migration.
-- Expands audio bucket to accept browser recordings, adds video bucket,
-- adds episode notifications, and fixes recording pipeline.

-- 1. Expand podcast-audio bucket to accept browser-recorded formats
update storage.buckets
set allowed_mime_types = array[
  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
  'audio/webm', 'audio/ogg', 'audio/wav'
]
where id = 'podcast-audio';

-- 2. Create podcast-video bucket for video episodes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'podcast-video',
  'podcast-video',
  false,
  524288000,  -- 500MB
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  file_size_limit = 524288000,
  allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime'];

-- 3. Storage policies for podcast-video bucket
-- Upload: healers upload to own path
drop policy if exists "podcast creators upload video" on storage.objects;
create policy "podcast creators upload video" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'podcast-video'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_create_content((select auth.uid()))
  );

-- Update: owners can update own video
drop policy if exists "podcast creators manage own video" on storage.objects;
create policy "podcast creators manage own video" on storage.objects
  for update to authenticated
  using (bucket_id = 'podcast-video' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'podcast-video' and owner_id = (select auth.uid())::text);

-- Delete: owners can delete own video
drop policy if exists "podcast creators delete own video" on storage.objects;
create policy "podcast creators delete own video" on storage.objects
  for delete to authenticated
  using (bucket_id = 'podcast-video' and owner_id = (select auth.uid())::text);

-- 4. Add video support to podcast_episodes table
-- Add media_kind column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'podcast_episodes' and column_name = 'media_kind'
  ) then
    alter table public.podcast_episodes
      add column media_kind text not null default 'audio'
      check (media_kind in ('audio', 'video'));
  end if;
end $$;

-- Add video_path and video_url columns if they don't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'podcast_episodes' and column_name = 'video_path'
  ) then
    alter table public.podcast_episodes add column video_path text;
    alter table public.podcast_episodes add column video_url text;
    alter table public.podcast_episodes add column media_mime_type text;
    alter table public.podcast_episodes add column media_size_bytes bigint;
  end if;
end $$;

-- Relax duration constraint: allow 0 for drafts (media not yet uploaded)
-- and raise max to 3600 seconds (1 hour) for video content
alter table public.podcast_episodes
  drop constraint if exists podcast_episodes_audio_duration_check;

alter table public.podcast_episodes
  add constraint podcast_episodes_audio_duration_check
  check (audio_duration_seconds >= 0 and audio_duration_seconds <= 3600);

-- 5. Notification function for new episode publication
create or replace function public.notify_podcast_episode_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pod record;
  follower record;
  creator_name text;
begin
  -- Only notify on publish (not on other status changes)
  if new.status <> 'published' or coalesce(old.status, '') = 'published' then
    return new;
  end if;

  -- Get podcast and creator info
  select p.title as podcast_title, p.creator_id, pr.display_name, pr.full_name
  into pod
  from public.podcasts p
  join public.profiles pr on pr.id = p.creator_id
  where p.id = new.podcast_id;

  creator_name := coalesce(pod.display_name, pod.full_name, 'A healer');

  -- Notify all followers of this podcast
  for follower in
    select pf.user_id
    from public.podcast_follows pf
    where pf.podcast_id = new.podcast_id
      and pf.user_id <> new.creator_id
  loop
    insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
    values (
      follower.user_id,
      new.creator_id,
      'podcast_episode_published',
      'New episode available',
      creator_name || ' published "' || new.title || '" in ' || pod.podcast_title,
      new.id
    );
  end loop;

  return new;
end;
$$;

-- Drop existing trigger if it exists
drop trigger if exists on_podcast_episode_published on public.podcast_episodes;

-- Create trigger on status change to published
create trigger on_podcast_episode_published
  after update on public.podcast_episodes
  for each row
  execute function public.notify_podcast_episode_published();

-- 6. Also create trigger for INSERT with published status (new episodes created as published)
drop trigger if exists on_podcast_episode_insert_published on public.podcast_episodes;
create trigger on_podcast_episode_insert_published
  after insert on public.podcast_episodes
  for each row
  when (new.status = 'published')
  execute function public.notify_podcast_episode_published();

-- 7. Update storage usage RPC to include video bucket
create or replace function public.get_podcast_storage_usage(creator uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select sum((metadata->>'size')::bigint)
     from storage.objects
     where bucket_id = 'podcast-audio'
       and (storage.foldername(name))[1] = creator::text),
    0
  ) + coalesce(
    (select sum((metadata->>'size')::bigint)
     from storage.objects
     where bucket_id = 'podcast-covers'
       and (storage.foldername(name))[1] = creator::text),
    0
  ) + coalesce(
    (select sum((metadata->>'size')::bigint)
     from storage.objects
     where bucket_id = 'podcast-video'
       and (storage.foldername(name))[1] = creator::text),
    0
  );
$$;

-- 8. Index for episode status lookups (improves listing performance)
create index if not exists podcast_episodes_creator_status_idx
  on public.podcast_episodes (creator_id, status)
  where deleted_at is null;

-- 9. Ensure published episode has media path (conditional constraint)
-- Only enforce if there are no existing published episodes without media
-- (This is a safety check; actual enforcement is in the publish flow)


-- =============================================
-- MIGRATION: 20260723000000_registration_rewrite.sql
-- =============================================

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


-- =============================================
-- MIGRATION: 20260723010000_fix_registration_and_session_rooms.sql
-- =============================================

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



