-- Profile metadata for the full healer directory.

alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists discoverable boolean not null default true;
alter table public.profiles add column if not exists professional_title text;
alter table public.profiles add column if not exists professional_verification_status text not null default 'unverified';

alter table public.profiles drop constraint if exists profiles_profile_type_check;
alter table public.profiles add constraint profiles_profile_type_check check (
  profile_type in ('member','healer','therapist','coach','mindfulness_teacher','wellness_professional','admin')
);

alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check check (
  account_status in ('active','paused','suspended','deleted')
);

alter table public.profiles drop constraint if exists profiles_professional_verification_status_check;
alter table public.profiles add constraint profiles_professional_verification_status_check check (
  professional_verification_status in ('unverified','pending','approved','rejected')
);

create index if not exists profiles_healer_directory_idx on public.profiles(profile_type, visibility, discoverable, account_status, online);
create index if not exists profiles_professional_verification_idx on public.profiles(professional_verification_status) where professional_verification_status = 'approved';

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (
  id = (select auth.uid())
  and profile_type = public.current_account_type()
  and professional_verification_status = public.current_verification_status()
  and account_status = 'active'
);

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
  with filtered as (
    select p.*
    from public.profiles p
    where p.id <> (select auth.uid())
      and p.account_status = 'active'
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
      and (availability_filter = 'all' or coalesce(p.availability,'') ilike '%' || availability_filter || '%')
      and (
        coalesce(nullif(search_text,''),'') = ''
        or coalesce(p.display_name,'') ilike '%' || search_text || '%'
        or coalesce(p.full_name,'') ilike '%' || search_text || '%'
        or coalesce(p.professional_title,'') ilike '%' || search_text || '%'
        or coalesce(p.about,'') ilike '%' || search_text || '%'
        or exists (select 1 from unnest(coalesce(p.specialties,'{}'::text[])) s where s ilike '%' || search_text || '%')
        or exists (select 1 from unnest(coalesce(p.languages,'{}'::text[])) l where l ilike '%' || search_text || '%')
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

revoke all on function public.search_healers(text,text,text,text,boolean,boolean,text,integer,integer) from public;
grant execute on function public.search_healers(text,text,text,text,boolean,boolean,text,integer,integer) to authenticated;
