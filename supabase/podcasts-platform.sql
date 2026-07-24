-- Nova Resort healer-only podcast platform.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists professional_verification_status text not null default 'unverified';
alter table public.profiles add column if not exists professional_title text;
alter table public.profiles add column if not exists account_status text not null default 'active';

alter table public.profiles drop constraint if exists profiles_profile_type_check;
alter table public.profiles add constraint profiles_profile_type_check check (
  profile_type in ('member','healer','therapist','coach','mindfulness_teacher','wellness_professional','community_facilitator','admin')
);

create or replace function public.is_approved_podcast_creator(check_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = check_user
      and p.account_status = 'active'
      and p.professional_verification_status = 'approved'
      and p.profile_type in ('healer','therapist','coach','mindfulness_teacher','wellness_professional','community_facilitator','admin')
  );
$$;

create table if not exists public.podcast_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 48),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table if not exists public.podcasts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  short_description text not null default '' check (char_length(short_description) <= 220),
  description text not null default '' check (char_length(description) <= 5000),
  cover_image_url text,
  cover_path text,
  category text not null default 'Wellness Education',
  language text not null default 'English',
  visibility text not null default 'public' check (visibility in ('public','connections','group','private')),
  status text not null default 'draft' check (status in ('draft','published','archived','suspended')),
  comments_enabled boolean not null default true,
  reactions_enabled boolean not null default true,
  professional_disclaimer_accepted boolean not null default false,
  rights_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz
);

create table if not exists public.podcast_groups (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 80),
  description text not null default '',
  visibility text not null default 'invitation' check (visibility in ('invitation','request','connections')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.podcast_group_members (
  group_id uuid not null references public.podcast_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined','removed')),
  role text not null default 'listener' check (role in ('listener','moderator')),
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id,user_id)
);

create table if not exists public.podcast_episodes (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references public.podcasts(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '' check (char_length(description) <= 8000),
  season_number integer,
  episode_number integer not null default 1,
  audio_path text,
  audio_url text,
  audio_duration_seconds integer not null default 0 check (audio_duration_seconds >= 0),
  transcript text,
  cover_image_url text,
  cover_path text,
  visibility text not null default 'public' check (visibility in ('public','connections','group','private')),
  group_id uuid references public.podcast_groups(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','processing','ready','scheduled','published','failed','archived')),
  comments_enabled boolean not null default true,
  reactions_enabled boolean not null default true,
  content_warning text,
  explicit_content boolean not null default false,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (podcast_id, episode_number)
);

create table if not exists public.podcast_tag_links (
  tag_id uuid not null references public.podcast_tags(id) on delete cascade,
  podcast_id uuid references public.podcasts(id) on delete cascade,
  episode_id uuid references public.podcast_episodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((podcast_id is not null)::integer + (episode_id is not null)::integer = 1),
  unique (tag_id,podcast_id),
  unique (tag_id,episode_id)
);

create table if not exists public.podcast_follows (
  podcast_id uuid not null references public.podcasts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (podcast_id,user_id)
);

create table if not exists public.podcast_episode_saves (
  episode_id uuid not null references public.podcast_episodes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (episode_id,user_id)
);

create table if not exists public.podcast_listens (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.podcast_episodes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_position_seconds integer not null default 0,
  listen_duration_seconds integer not null default 0,
  completed_at timestamptz,
  session_id uuid not null default gen_random_uuid()
);

create table if not exists public.podcast_progress (
  episode_id uuid not null references public.podcast_episodes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position_seconds integer not null default 0,
  duration_seconds integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (episode_id,user_id)
);

create table if not exists public.podcast_reactions (
  episode_id uuid not null references public.podcast_episodes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('heart','calm','insightful','supportive')),
  created_at timestamptz not null default now(),
  primary key (episode_id,user_id,reaction)
);

create table if not exists public.podcast_comments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.podcast_episodes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.podcast_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.podcast_reports (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid references public.podcasts(id) on delete cascade,
  episode_id uuid references public.podcast_episodes(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  check (podcast_id is not null or episode_id is not null)
);

create or replace function public.can_access_podcast(podcast_row public.podcasts)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select podcast_row.status = 'published'
    and (
      podcast_row.visibility = 'public'
      or podcast_row.creator_id = (select auth.uid())
      or (
        podcast_row.visibility = 'connections'
        and exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester_id = podcast_row.creator_id and f.addressee_id = (select auth.uid()))
              or (f.addressee_id = podcast_row.creator_id and f.requester_id = (select auth.uid())))
        )
      )
    );
$$;

create or replace function public.can_access_episode(episode_row public.podcast_episodes)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select episode_row.deleted_at is null
    and episode_row.status = 'published'
    and exists (
      select 1 from public.podcasts p
      where p.id = episode_row.podcast_id
        and p.status = 'published'
        and (
          public.can_access_podcast(p)
          or episode_row.creator_id = (select auth.uid())
          or (
            episode_row.visibility = 'group'
            and exists (
              select 1 from public.podcast_group_members gm
              where gm.group_id = episode_row.group_id
                and gm.user_id = (select auth.uid())
                and gm.status = 'approved'
            )
          )
        )
    );
$$;

create index if not exists podcasts_creator_status_idx on public.podcasts(creator_id,status,visibility,updated_at);
create index if not exists podcast_episodes_podcast_status_idx on public.podcast_episodes(podcast_id,status,published_at);
create index if not exists podcast_listens_episode_user_idx on public.podcast_listens(episode_id,user_id,started_at);
create index if not exists podcast_progress_user_idx on public.podcast_progress(user_id,updated_at);
create index if not exists podcast_comments_episode_idx on public.podcast_comments(episode_id,created_at) where deleted_at is null;
create index if not exists podcast_tags_slug_idx on public.podcast_tags(slug);
create index if not exists podcast_comments_user_idx on public.podcast_comments(user_id);
create index if not exists podcast_comments_parent_idx on public.podcast_comments(parent_id);
create index if not exists podcast_episode_saves_user_idx on public.podcast_episode_saves(user_id);
create index if not exists podcast_episodes_creator_idx on public.podcast_episodes(creator_id);
create index if not exists podcast_episodes_group_idx on public.podcast_episodes(group_id);
create index if not exists podcast_follows_user_idx on public.podcast_follows(user_id);
create index if not exists podcast_group_members_user_idx on public.podcast_group_members(user_id);
create index if not exists podcast_group_members_invited_by_idx on public.podcast_group_members(invited_by);
create index if not exists podcast_groups_creator_idx on public.podcast_groups(creator_id);
create index if not exists podcast_listens_user_idx on public.podcast_listens(user_id);
create index if not exists podcast_reactions_user_idx on public.podcast_reactions(user_id);
create index if not exists podcast_reports_podcast_idx on public.podcast_reports(podcast_id);
create index if not exists podcast_reports_episode_idx on public.podcast_reports(episode_id);
create index if not exists podcast_reports_reporter_idx on public.podcast_reports(reporter_id);
create index if not exists podcast_tag_links_podcast_idx on public.podcast_tag_links(podcast_id);
create index if not exists podcast_tag_links_episode_idx on public.podcast_tag_links(episode_id);

alter table public.podcast_tags enable row level security;
alter table public.podcasts enable row level security;
alter table public.podcast_episodes enable row level security;
alter table public.podcast_tag_links enable row level security;
alter table public.podcast_follows enable row level security;
alter table public.podcast_episode_saves enable row level security;
alter table public.podcast_listens enable row level security;
alter table public.podcast_progress enable row level security;
alter table public.podcast_reactions enable row level security;
alter table public.podcast_comments enable row level security;
alter table public.podcast_groups enable row level security;
alter table public.podcast_group_members enable row level security;
alter table public.podcast_reports enable row level security;

drop policy if exists "podcast tags visible" on public.podcast_tags;
create policy "podcast tags visible" on public.podcast_tags for select to authenticated using (true);

drop policy if exists "approved creators manage tags" on public.podcast_tags;
create policy "approved creators manage tags" on public.podcast_tags for insert to authenticated
with check (public.is_approved_podcast_creator((select auth.uid())));

drop policy if exists "visible podcasts are readable" on public.podcasts;
create policy "visible podcasts are readable" on public.podcasts for select to authenticated
using (public.can_access_podcast(podcasts) or creator_id = (select auth.uid()));

drop policy if exists "approved creators create podcasts" on public.podcasts;
create policy "approved creators create podcasts" on public.podcasts for insert to authenticated
with check (creator_id = (select auth.uid()) and public.is_approved_podcast_creator((select auth.uid())));

drop policy if exists "creators update own podcasts" on public.podcasts;
create policy "creators update own podcasts" on public.podcasts for update to authenticated
using (creator_id = (select auth.uid()) and public.is_approved_podcast_creator((select auth.uid())))
with check (creator_id = (select auth.uid()) and public.is_approved_podcast_creator((select auth.uid())));

drop policy if exists "visible episodes are readable" on public.podcast_episodes;
create policy "visible episodes are readable" on public.podcast_episodes for select to authenticated
using (public.can_access_episode(podcast_episodes) or creator_id = (select auth.uid()));

drop policy if exists "creators insert own episodes" on public.podcast_episodes;
create policy "creators insert own episodes" on public.podcast_episodes for insert to authenticated
with check (creator_id = (select auth.uid()) and public.is_approved_podcast_creator((select auth.uid())));

drop policy if exists "creators update own episodes" on public.podcast_episodes;
create policy "creators update own episodes" on public.podcast_episodes for update to authenticated
using (creator_id = (select auth.uid()) and public.is_approved_podcast_creator((select auth.uid())))
with check (creator_id = (select auth.uid()) and public.is_approved_podcast_creator((select auth.uid())));

drop policy if exists "visible tag links are readable" on public.podcast_tag_links;
create policy "visible tag links are readable" on public.podcast_tag_links for select to authenticated
using (
  podcast_id is null or exists (select 1 from public.podcasts p where p.id = podcast_id and (public.can_access_podcast(p) or p.creator_id = (select auth.uid())))
);

drop policy if exists "creators manage tag links" on public.podcast_tag_links;
create policy "creators manage tag links" on public.podcast_tag_links for all to authenticated
using (
  exists (select 1 from public.podcasts p where p.id = podcast_id and p.creator_id = (select auth.uid()))
  or exists (select 1 from public.podcast_episodes e where e.id = episode_id and e.creator_id = (select auth.uid()))
)
with check (
  exists (select 1 from public.podcasts p where p.id = podcast_id and p.creator_id = (select auth.uid()))
  or exists (select 1 from public.podcast_episodes e where e.id = episode_id and e.creator_id = (select auth.uid()))
);

drop policy if exists "users manage own podcast follows" on public.podcast_follows;
create policy "users manage own podcast follows" on public.podcast_follows for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "users manage own episode saves" on public.podcast_episode_saves;
create policy "users manage own episode saves" on public.podcast_episode_saves for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "users insert own listens" on public.podcast_listens;
create policy "users insert own listens" on public.podcast_listens for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.podcast_episodes e where e.id = episode_id and public.can_access_episode(e)));

drop policy if exists "users view own listens" on public.podcast_listens;
create policy "users view own listens" on public.podcast_listens for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "users manage own progress" on public.podcast_progress;
create policy "users manage own progress" on public.podcast_progress for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "users manage own reactions" on public.podcast_reactions;
create policy "users manage own reactions" on public.podcast_reactions for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "visible comments are readable" on public.podcast_comments;
create policy "visible comments are readable" on public.podcast_comments for select to authenticated
using (deleted_at is null and exists (select 1 from public.podcast_episodes e where e.id = episode_id and e.comments_enabled and public.can_access_episode(e)));

drop policy if exists "users create podcast comments" on public.podcast_comments;
create policy "users create podcast comments" on public.podcast_comments for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.podcast_episodes e where e.id = episode_id and e.comments_enabled and public.can_access_episode(e)));

drop policy if exists "users update own podcast comments" on public.podcast_comments;
create policy "users update own podcast comments" on public.podcast_comments for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "creators manage podcast groups" on public.podcast_groups;
create policy "creators manage podcast groups" on public.podcast_groups for all to authenticated
using (creator_id = (select auth.uid())) with check (creator_id = (select auth.uid()) and public.is_approved_podcast_creator((select auth.uid())));

drop policy if exists "members view own podcast groups" on public.podcast_group_members;
create policy "members view own podcast groups" on public.podcast_group_members for select to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.podcast_groups g where g.id = group_id and g.creator_id = (select auth.uid())));

drop policy if exists "creators manage podcast group members" on public.podcast_group_members;
create policy "creators manage podcast group members" on public.podcast_group_members for all to authenticated
using (exists (select 1 from public.podcast_groups g where g.id = group_id and g.creator_id = (select auth.uid())))
with check (exists (select 1 from public.podcast_groups g where g.id = group_id and g.creator_id = (select auth.uid())));

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

create or replace function public.list_podcast_episodes(podcast_ref uuid, page_limit integer default 20, page_offset integer default 0)
returns table (
  id uuid,
  podcast_id uuid,
  title text,
  description text,
  episode_number integer,
  season_number integer,
  audio_path text,
  audio_url text,
  audio_duration_seconds integer,
  cover_image_url text,
  visibility text,
  status text,
  published_at timestamptz,
  comments_enabled boolean,
  reactions_enabled boolean,
  transcript text,
  saved boolean,
  listen_position_seconds integer,
  tags text[],
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with visible as (
    select e.*, count(*) over() as total_count
    from public.podcast_episodes e
    where e.podcast_id = podcast_ref
      and public.can_access_episode(e)
  )
  select v.id, v.podcast_id, v.title, v.description, v.episode_number, v.season_number,
         v.audio_path, v.audio_url, v.audio_duration_seconds, v.cover_image_url, v.visibility, v.status,
         v.published_at, v.comments_enabled, v.reactions_enabled, v.transcript,
         exists (select 1 from public.podcast_episode_saves s where s.episode_id = v.id and s.user_id = (select auth.uid())) as saved,
         coalesce((select pg.position_seconds from public.podcast_progress pg where pg.episode_id = v.id and pg.user_id = (select auth.uid())), 0),
         coalesce((select array_agg(t.name order by t.name) from public.podcast_tag_links l join public.podcast_tags t on t.id = l.tag_id where l.episode_id = v.id), '{}'::text[]) as tags,
         v.total_count
  from visible v
  order by v.published_at desc nulls last, v.episode_number desc
  limit least(greatest(page_limit, 1), 30)
  offset greatest(page_offset, 0);
$$;

create or replace function public.record_podcast_play(episode_ref uuid, position_seconds integer default 0, duration_seconds integer default 0)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from public.podcast_episodes e where e.id = episode_ref and public.can_access_episode(e)) then
    raise exception 'Episode is unavailable.';
  end if;

  if not exists (
    select 1 from public.podcast_listens pl
    where pl.episode_id = episode_ref and pl.user_id = auth.uid()
      and pl.created_at > now() - interval '5 minutes'
  ) then
    insert into public.podcast_listens (episode_id, user_id, last_position_seconds, listen_duration_seconds, completed_at)
    values (episode_ref, auth.uid(), greatest(position_seconds, 0), greatest(duration_seconds, 0),
      case when duration_seconds > 0 and position_seconds >= duration_seconds * 0.9 then now() else null end);
  end if;

  insert into public.podcast_progress (episode_id, user_id, position_seconds, duration_seconds, updated_at)
  values (episode_ref, auth.uid(), greatest(position_seconds, 0), greatest(duration_seconds, 0), now())
  on conflict (episode_id,user_id) do update set
    position_seconds = excluded.position_seconds,
    duration_seconds = excluded.duration_seconds,
    updated_at = now();
end;
$$;

revoke all on function public.is_approved_podcast_creator(uuid) from public;
revoke all on function public.can_access_podcast(public.podcasts) from public;
revoke all on function public.can_access_episode(public.podcast_episodes) from public;
revoke all on function public.search_podcasts(text,text,text,text,text,integer,integer) from public;
revoke all on function public.list_podcast_episodes(uuid,integer,integer) from public;
revoke all on function public.record_podcast_play(uuid,integer,integer) from public;
grant execute on function public.is_approved_podcast_creator(uuid) to authenticated;
grant execute on function public.can_access_podcast(public.podcasts) to authenticated;
grant execute on function public.can_access_episode(public.podcast_episodes) to authenticated;
grant execute on function public.search_podcasts(text,text,text,text,text,integer,integer) to authenticated;
grant execute on function public.list_podcast_episodes(uuid,integer,integer) to authenticated;
grant execute on function public.record_podcast_play(uuid,integer,integer) to authenticated;

grant select, insert, update, delete on public.podcast_tags to authenticated;
grant select, insert, update, delete on public.podcasts to authenticated;
grant select, insert, update, delete on public.podcast_episodes to authenticated;
grant select, insert, update, delete on public.podcast_tag_links to authenticated;
grant select, insert, update, delete on public.podcast_follows to authenticated;
grant select, insert, update, delete on public.podcast_episode_saves to authenticated;
grant select, insert on public.podcast_listens to authenticated;
grant select, insert, update, delete on public.podcast_progress to authenticated;
grant select, insert, update, delete on public.podcast_reactions to authenticated;
grant select, insert, update on public.podcast_comments to authenticated;
grant select, insert, update, delete on public.podcast_groups to authenticated;
grant select, insert, update, delete on public.podcast_group_members to authenticated;
grant select, insert on public.podcast_reports to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('podcast-covers','podcast-covers',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('podcast-audio','podcast-audio',false,104857600,array['audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/aac','audio/x-m4a'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "podcast creators upload covers" on storage.objects;
create policy "podcast creators upload covers" on storage.objects for insert to authenticated
with check (bucket_id = 'podcast-covers' and (storage.foldername(name))[1] = (select auth.uid())::text and public.is_approved_podcast_creator((select auth.uid())));

drop policy if exists "podcast creators manage own covers" on storage.objects;
create policy "podcast creators manage own covers" on storage.objects for update to authenticated
using (bucket_id = 'podcast-covers' and owner_id = (select auth.uid())::text)
with check (bucket_id = 'podcast-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "podcast creators upload audio" on storage.objects;
create policy "podcast creators upload audio" on storage.objects for insert to authenticated
with check (bucket_id = 'podcast-audio' and (storage.foldername(name))[1] = (select auth.uid())::text and public.is_approved_podcast_creator((select auth.uid())));

drop policy if exists "podcast creators manage own audio" on storage.objects;
create policy "podcast creators manage own audio" on storage.objects for update to authenticated
using (bucket_id = 'podcast-audio' and owner_id = (select auth.uid())::text)
with check (bucket_id = 'podcast-audio' and (storage.foldername(name))[1] = (select auth.uid())::text);

do $$ begin
  alter publication supabase_realtime add table public.podcast_comments;
exception when duplicate_object then null; end $$;

insert into public.podcast_tags (name, slug) values
('Mindfulness','mindfulness'),('Meditation','meditation'),('Emotional Healing','emotional-healing'),
('Personal Coaching','personal-coaching'),('Relationships','relationships'),('Stress Management','stress-management'),
('Anxiety Support','anxiety-support'),('Self Growth','self-growth'),('Breathwork','breathwork'),('Sleep','sleep'),
('Confidence','confidence'),('Parenting','parenting'),('Grief','grief'),('Trauma Awareness','trauma-awareness'),
('Wellness Education','wellness-education'),('Spiritual Growth','spiritual-growth'),('Motivation','motivation'),
('Healthy Habits','healthy-habits')
on conflict (slug) do nothing;
