-- Search & Discovery: search_sessions, search_global, and performance indexes.

-- ============================================================
-- 1. sanitize_text helper (shared across search functions)
-- ============================================================
create or replace function public.sanitize_search_text(input text)
returns text
language sql
immutable
as $$
  select replace(replace(replace(coalesce(input, ''), '%', '\%'), '_', '\_'), E'\\', E'\\\\');
$$;

-- ============================================================
-- 2. search_sessions RPC
-- ============================================================
create or replace function public.search_sessions(
  search_text text default '',
  category_filter text default 'all',
  language_filter text default 'all',
  session_type_filter text default 'all',
  status_filter text default 'all',
  upcoming_only boolean default false,
  sort_by text default 'upcoming',
  page_limit integer default 12,
  page_offset integer default 0
)
returns table (
  id uuid,
  host_id uuid,
  title text,
  description text,
  category text,
  language text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  capacity integer,
  visibility text,
  status text,
  registration_deadline timestamptz,
  session_type text,
  price numeric,
  currency text,
  location text,
  cover_image_url text,
  host_name text,
  host_avatar text,
  host_verified boolean,
  registered_count bigint,
  is_full boolean,
  room_status text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with sanitized as (
    select public.sanitize_search_text(search_text) as safe_text
  ), visible as (
    select s.*
    from public.sessions s
    cross join sanitized sa
    where s.visibility = 'public'
      and (category_filter = 'all' or s.category = category_filter)
      and (language_filter = 'all' or s.language = language_filter)
      and (session_type_filter = 'all' or s.session_type = session_type_filter)
      and (
        status_filter = 'all'
        or s.status = status_filter
      )
      and (
        upcoming_only = false
        or (s.starts_at >= now() and s.status not in ('cancelled','completed'))
      )
      and (
        sa.safe_text = ''
        or s.title ilike '%' || sa.safe_text || '%'
        or s.description ilike '%' || sa.safe_text || '%'
        or s.category ilike '%' || sa.safe_text || '%'
        or s.language ilike '%' || sa.safe_text || '%'
        or s.location ilike '%' || sa.safe_text || '%'
      )
  ), counted as (
    select v.*, count(*) over() as total_count
    from visible v
  )
  select c.id, c.host_id, c.title, c.description, c.category, c.language,
         c.starts_at, c.ends_at, c.timezone, c.capacity, c.visibility, c.status,
         c.registration_deadline, c.session_type, c.price, c.currency, c.location, c.cover_image_url,
         coalesce(pr.display_name, pr.full_name) as host_name,
         pr.avatar_url as host_avatar,
         pr.professional_verification_status = 'approved' as host_verified,
         coalesce((select count(*) from public.session_registrations sr
                   where sr.session_id = c.id and sr.status = 'registered'), 0) as registered_count,
         coalesce((select count(*) from public.session_registrations sr
                   where sr.session_id = c.id and sr.status = 'registered'), 0) >= c.capacity as is_full,
         (select rs.status from public.session_room_state rs where rs.session_id = c.id) as room_status,
         c.total_count
  from counted c
  left join public.profiles pr on pr.id = c.host_id
  order by
    case when sort_by = 'newest' then c.created_at end desc nulls last,
    case when sort_by = 'popular' then (
      select count(*) from public.session_registrations sr
      where sr.session_id = c.id and sr.status = 'registered'
    ) end desc nulls last,
    c.starts_at asc
  limit least(greatest(page_limit, 1), 24)
  offset greatest(page_offset, 0);
$$;

-- ============================================================
-- 3. search_global RPC — cross-entity search
-- ============================================================
create or replace function public.search_global(
  search_text text default '',
  page_limit integer default 5
)
returns table (
  entity_type text,
  id uuid,
  title text,
  subtitle text,
  description text,
  image_url text,
  badge text,
  relevance numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with sanitized as (
    select public.sanitize_search_text(search_text) as safe_text
  ), session_results as (
    select
      'session'::text as entity_type,
      s.id,
      s.title,
      s.category || ' · ' || to_char(s.starts_at, 'Mon DD, YYYY HH12:MI AM') as subtitle,
      left(s.description, 120) as description,
      s.cover_image_url as image_url,
      case when s.session_room_state is not null and (select rs.status from public.session_room_state rs where rs.session_id = s.id) = 'live'
        then 'LIVE' else s.status end as badge,
      (case
        when s.title ilike '%' || (select safe_text from sanitized) || '%' then 3
        when s.description ilike '%' || (select safe_text from sanitized) || '%' then 2
        when s.category ilike '%' || (select safe_text from sanitized) || '%' then 1
        else 0.5
      end) as relevance
    from public.sessions s, sanitized sa
    where sa.safe_text <> ''
      and s.visibility = 'public'
      and s.status not in ('cancelled','draft')
      and (
        s.title ilike '%' || sa.safe_text || '%'
        or s.description ilike '%' || sa.safe_text || '%'
        or s.category ilike '%' || sa.safe_text || '%'
        or s.language ilike '%' || sa.safe_text || '%'
      )
  ), podcast_results as (
    select
      'podcast'::text as entity_type,
      p.id,
      p.title,
      coalesce(p.category, 'Uncategorized') || ' · ' || coalesce(p.language, '') as subtitle,
      left(coalesce(p.short_description, p.description, ''), 120) as description,
      p.cover_image_url as image_url,
      null::text as badge,
      (case
        when p.title ilike '%' || (select safe_text from sanitized) || '%' then 3
        when p.short_description ilike '%' || (select safe_text from sanitized) || '%' then 2
        when p.category ilike '%' || (select safe_text from sanitized) || '%' then 1
        else 0.5
      end) as relevance
    from public.podcasts p, sanitized sa
    where sa.safe_text <> ''
      and public.can_access_podcast(p)
      and (
        p.title ilike '%' || sa.safe_text || '%'
        or p.short_description ilike '%' || sa.safe_text || '%'
        or p.description ilike '%' || sa.safe_text || '%'
        or p.category ilike '%' || sa.safe_text || '%'
        or p.language ilike '%' || sa.safe_text || '%'
        or exists (
          select 1 from public.podcast_tag_links l
          join public.podcast_tags t on t.id = l.tag_id
          where l.podcast_id = p.id and t.name ilike '%' || sa.safe_text || '%'
        )
      )
  ), healer_results as (
    select
      'healer'::text as entity_type,
      p.id,
      coalesce(p.display_name, p.full_name) as title,
      coalesce(p.professional_title, 'Healer') || ' · ' || coalesce(p.country, '') as subtitle,
      left(coalesce(p.about, ''), 120) as description,
      p.avatar_url as image_url,
      case when p.professional_verification_status = 'approved' then 'Verified' else null end as badge,
      (case
        when coalesce(p.display_name, p.full_name) ilike '%' || (select safe_text from sanitized) || '%' then 3
        when p.professional_title ilike '%' || (select safe_text from sanitized) || '%' then 2
        when p.about ilike '%' || (select safe_text from sanitized) || '%' then 1
        else 0.5
      end) as relevance
    from public.profiles p, sanitized sa
    where sa.safe_text <> ''
      and p.account_status = 'active'
      and p.discoverable = true
      and p.visibility <> 'private'
      and p.profile_type in ('healer','therapist','coach','mindfulness_teacher','wellness_professional')
      and (
        coalesce(p.display_name, '') ilike '%' || sa.safe_text || '%'
        or coalesce(p.full_name, '') ilike '%' || sa.safe_text || '%'
        or coalesce(p.professional_title, '') ilike '%' || sa.safe_text || '%'
        or coalesce(p.about, '') ilike '%' || sa.safe_text || '%'
        or exists (select 1 from unnest(coalesce(p.specialties,'{}'::text[])) sp
                   where sp ilike '%' || sa.safe_text || '%')
      )
  ), combined as (
    select * from session_results
    union all
    select * from podcast_results
    union all
    select * from healer_results
  )
  select c.entity_type, c.id, c.title, c.subtitle, c.description, c.image_url, c.badge, c.relevance
  from combined c
  order by c.relevance desc, c.title asc
  limit least(greatest(page_limit, 1), 20);
$$;

-- ============================================================
-- 4. Performance indexes for search
-- ============================================================

-- Sessions: category and language filtering
create index if not exists sessions_category_idx on public.sessions(category);
create index if not exists sessions_language_idx on public.sessions(language);
create index if not exists sessions_status_idx on public.sessions(status);
create index if not exists sessions_visibility_status_idx on public.sessions(visibility, status, starts_at);

-- Podcasts: category filtering
create index if not exists podcasts_category_idx on public.podcasts(category);
create index if not exists podcasts_language_idx on public.podcasts(language);

-- Profiles: search-relevant columns
create index if not exists profiles_full_name_idx on public.profiles(full_name);
create index if not exists profiles_specialties_idx on public.profiles using gin(specialties);
create index if not exists profiles_interests_idx on public.profiles using gin(interests);
create index if not exists profiles_profile_type_idx on public.profiles(profile_type);

-- Session registrations: count queries for search results
create index if not exists session_registrations_session_status_idx on public.session_registrations(session_id, status);

-- Session room state: status lookup for search results
create index if not exists session_room_state_session_idx on public.session_room_state(session_id, status);
