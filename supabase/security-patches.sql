-- Nova Resort Security Patches
-- Run AFTER all other migration files in Supabase SQL Editor.

-- =============================================================================
-- 1. FIX: Notification injection vulnerability
-- Remove direct INSERT policy for authenticated users on notifications.
-- All notification creation is handled by security definer functions.
-- =============================================================================
drop policy if exists "authenticated users create notifications" on public.notifications;
-- Notifications can only be created via security definer functions
-- (after_message_insert, send_connection_request, respond_connection_request, register_for_session)

-- =============================================================================
-- 2. FIX: Session overbooking race condition (TOCTOU)
-- Add advisory lock to prevent concurrent registrations from exceeding capacity.
-- =============================================================================
create or replace function public.register_for_session(target_session uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.sessions;
  active_count integer;
  next_status text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to register.';
  end if;

  -- Advisory lock prevents concurrent registrations for the same session
  perform pg_advisory_xact_lock(hashtext('session_reg:' || target_session::text));

  select * into session_row
  from public.sessions
  where id = target_session and visibility = 'public' and status in ('published','live');

  if session_row.id is null then
    raise exception 'This session is not available for registration.';
  end if;
  if session_row.host_id = auth.uid() then
    raise exception 'Hosts are already part of their own sessions.';
  end if;
  if session_row.registration_deadline is not null and session_row.registration_deadline < now() then
    raise exception 'Registration is closed.';
  end if;

  select count(*) into active_count
  from public.session_registrations
  where session_id = target_session and status = 'registered';

  next_status := case when active_count >= session_row.capacity then 'waitlisted' else 'registered' end;

  insert into public.session_registrations (session_id,user_id,status)
  values (target_session,auth.uid(),next_status)
  on conflict (session_id,user_id) do update
    set status = excluded.status, updated_at = now()
    where public.session_registrations.status in ('cancelled','removed');

  insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
  values (session_row.host_id, auth.uid(), 'session_registration', 'New session registration', 'A member registered for your session.', target_session);

  return next_status;
end;
$$;

-- =============================================================================
-- 3. FIX: Podcast reports admin review
-- Add admin UPDATE/DELETE policies so moderation workflow is functional.
-- Also grant UPDATE to authenticated (for admin RLS check).
-- =============================================================================
drop policy if exists "users create podcast reports" on public.podcast_reports;
create policy "users create podcast reports" on public.podcast_reports for insert to authenticated
with check (reporter_id = (select auth.uid()));

drop policy if exists "users view own podcast reports" on public.podcast_reports;
create policy "users view own podcast reports" on public.podcast_reports for select to authenticated
using (reporter_id = (select auth.uid()) or public.current_user_is_admin());

drop policy if exists "admins manage podcast reports" on public.podcast_reports;
create policy "admins manage podcast reports" on public.podcast_reports for all to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

-- Update grants to allow admin updates
revoke all on public.podcast_reports from authenticated;
grant select, insert, update on public.podcast_reports to authenticated;

-- =============================================================================
-- 4. FIX: ILIKE wildcard sanitization in search functions
-- Escape % and _ metacharacters to prevent pattern injection.
-- =============================================================================

-- Fix search_podcasts
create or replace function public.search_podcasts(
  search_text text default '',
  category_filter text default 'all',
  language_filter text default 'all',
  tag_filter text default 'all',
  sort_by text default 'popular',
  page_limit integer default 12,
  page_offset integer default 0
)
returns table (
  id uuid,
  title text,
  slug text,
  short_description text,
  description text,
  cover_image_url text,
  category text,
  language text,
  creator_id uuid,
  creator_name text,
  creator_avatar_url text,
  professional_title text,
  verified boolean,
  follower_count bigint,
  episode_count bigint,
  total_plays bigint,
  latest_episode_id uuid,
  latest_episode_title text,
  latest_episode_published_at timestamptz,
  tags text[],
  popularity_score numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with sanitized as (
    select replace(replace(replace(search_text, '%', '\%'), '_', '\_'), E'\\', E'\\\\') as safe_text
  ), visible as (
    select p.*, pr.display_name, pr.full_name, pr.avatar_url, pr.professional_title, pr.professional_verification_status
    from public.podcasts p
    join public.profiles pr on pr.id = p.creator_id
    cross join sanitized s
    where public.can_access_podcast(p)
      and (category_filter = 'all' or p.category = category_filter)
      and (language_filter = 'all' or p.language = language_filter)
      and (
        tag_filter = 'all'
        or exists (
          select 1 from public.podcast_tag_links l join public.podcast_tags t on t.id = l.tag_id
          where l.podcast_id = p.id and t.slug = tag_filter
        )
      )
      and (
        s.safe_text = ''
        or p.title ilike '%' || s.safe_text || '%'
        or p.short_description ilike '%' || s.safe_text || '%'
        or p.description ilike '%' || s.safe_text || '%'
        or p.category ilike '%' || s.safe_text || '%'
        or p.language ilike '%' || s.safe_text || '%'
        or coalesce(pr.display_name, pr.full_name) ilike '%' || s.safe_text || '%'
        or coalesce(pr.professional_title,'') ilike '%' || s.safe_text || '%'
        or exists (
          select 1 from public.podcast_tag_links l join public.podcast_tags t on t.id = l.tag_id
          where l.podcast_id = p.id and t.name ilike '%' || s.safe_text || '%'
        )
      )
  ), scored as (
    select v.*,
      (select count(*) from public.podcast_follows f where f.podcast_id = v.id) as follower_count,
      (select count(*) from public.podcast_episodes e where e.podcast_id = v.id and public.can_access_episode(e)) as episode_count,
      (select count(*) from public.podcast_listens pl join public.podcast_episodes e on e.id = pl.episode_id where e.podcast_id = v.id and pl.user_id <> v.creator_id) as total_plays,
      (select count(distinct pl.user_id) from public.podcast_listens pl join public.podcast_episodes e on e.id = pl.episode_id where e.podcast_id = v.id and pl.started_at >= now() - interval '30 days' and pl.user_id <> v.creator_id)
        + (select count(*) * 1.5 from public.podcast_episode_saves s join public.podcast_episodes e on e.id = s.episode_id where e.podcast_id = v.id)
        + (select count(*) * 2 from public.podcast_follows f where f.podcast_id = v.id) as popularity_score,
      count(*) over() as total_count
    from visible v
  )
  select s.id, s.title, s.slug, s.short_description, s.description, s.cover_image_url, s.category, s.language,
         s.creator_id, coalesce(s.display_name, s.full_name) as creator_name, s.avatar_url,
         s.professional_title, s.professional_verification_status = 'approved' as verified,
         s.follower_count, s.episode_count, s.total_plays,
         le.id, le.title, le.published_at,
         coalesce((select array_agg(t.name order by t.name) from public.podcast_tag_links l join public.podcast_tags t on t.id = l.tag_id where l.podcast_id = s.id), '{}'::text[]) as tags,
         s.popularity_score, s.total_count
  from scored s
  left join lateral (
    select e.id, e.title, e.published_at
    from public.podcast_episodes e
    where e.podcast_id = s.id and public.can_access_episode(e)
    order by e.published_at desc nulls last, e.created_at desc
    limit 1
  ) le on true
  order by
    case when sort_by = 'newest' then s.created_at end desc nulls last,
    case when sort_by = 'followed' then s.follower_count end desc nulls last,
    case when sort_by = 'played' then s.total_plays end desc nulls last,
    s.popularity_score desc,
    s.updated_at desc
  limit least(greatest(page_limit, 1), 24)
  offset greatest(page_offset, 0);
$$;

-- Fix search_healers
create or replace function public.search_healers(
  search_text text default '',
  professional_type text default 'all',
  language_filter text default 'all',
  country_filter text default 'all',
  online_only boolean default false,
  verified_only boolean default false,
  availability_filter text default 'all',
  page_limit integer default 12,
  page_offset integer default 0
)
returns table (
  id uuid,
  full_name text,
  display_name text,
  avatar_url text,
  country text,
  languages text[],
  profile_type text,
  professional_title text,
  professional_verification_status text,
  about text,
  specialties text[],
  availability text,
  online boolean,
  last_seen timestamptz,
  next_session_id uuid,
  next_session_title text,
  next_session_starts_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with sanitized as (
    select replace(replace(replace(search_text, '%', '\%'), '_', '\_'), E'\\', E'\\\\') as safe_text,
           replace(replace(replace(availability_filter, '%', '\%'), '_', '\_'), E'\\', E'\\\\') as safe_availability
  ), filtered as (
    select p.*
    from public.profiles p
    cross join sanitized s
    where p.account_status = 'active'
      and p.discoverable = true
      and p.visibility <> 'private'
      and p.profile_type in ('healer','therapist','coach','mindfulness_teacher','wellness_professional')
      and p.professional_verification_status = 'approved'
      and not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = (select auth.uid()) and b.blocked_id = p.id
      )
      and (professional_type = 'all' or p.profile_type = professional_type)
      and (language_filter = 'all' or p.languages && array[language_filter])
      and (country_filter = 'all' or p.country = country_filter)
      and (online_only = false or p.online = true)
      and (verified_only = false or p.professional_verification_status = 'approved')
      and (availability_filter = 'all' or coalesce(p.availability,'') ilike '%' || s.safe_availability || '%')
      and (
        s.safe_text = ''
        or coalesce(p.display_name,'') ilike '%' || s.safe_text || '%'
        or coalesce(p.full_name,'') ilike '%' || s.safe_text || '%'
        or coalesce(p.professional_title,'') ilike '%' || s.safe_text || '%'
        or coalesce(p.about,'') ilike '%' || s.safe_text || '%'
        or exists (select 1 from unnest(coalesce(p.specialties,'{}'::text[])) sp where sp ilike '%' || s.safe_text || '%')
        or exists (select 1 from unnest(coalesce(p.languages,'{}'::text[])) l where l ilike '%' || s.safe_text || '%')
      )
  ), counted as (
    select filtered.*, count(*) over() as total_count
    from filtered
  )
  select c.id, c.full_name, c.display_name, c.avatar_url, c.country, c.languages, c.profile_type,
         c.professional_title, c.professional_verification_status, c.about, c.specialties, c.availability,
         c.online, c.last_seen,
         ns.id as next_session_id, ns.title as next_session_title, ns.starts_at as next_session_starts_at,
         c.total_count
  from counted c
  left join lateral (
    select s.id, s.title, s.starts_at
    from public.sessions s
    where s.host_id = c.id
      and s.visibility = 'public'
      and s.status in ('published','live','registration_closed')
      and s.starts_at >= now()
    order by s.starts_at asc
    limit 1
  ) ns on true
  order by c.online desc, (c.professional_verification_status = 'approved') desc, c.updated_at desc
  limit least(greatest(page_limit, 1), 24)
  offset greatest(page_offset, 0);
$$;

-- =============================================================================
-- 5. FIX: Add missing indexes
-- =============================================================================

-- Reverse lookup index for user_blocks (bidirectional block checks)
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);

-- Composite index for public session queries
create index if not exists sessions_public_upcoming_idx on public.sessions(visibility, status, starts_at) where visibility = 'public';

-- Room members user lookup index
create index if not exists room_members_user_idx on public.room_members(user_id);

-- =============================================================================
-- 6. FIX: Add rooms paired-null constraint
-- =============================================================================
do $$ begin
  alter table public.rooms add constraint private_users_paired_check
    check ((private_user_low IS NULL) = (private_user_high IS NULL));
exception when duplicate_object then null; end $$;

-- =============================================================================
-- 7. FIX: Narrow podcast table grants (principle of least privilege)
-- =============================================================================
revoke all on public.podcast_tags from authenticated;
grant select, insert on public.podcast_tags to authenticated;

revoke all on public.podcast_follows from authenticated;
grant select, insert, delete on public.podcast_follows to authenticated;

revoke all on public.podcast_episode_saves from authenticated;
grant select, insert, delete on public.podcast_episode_saves to authenticated;

revoke all on public.podcast_reactions from authenticated;
grant select, insert, delete on public.podcast_reactions to authenticated;
