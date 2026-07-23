-- Session Attendance & Reviews: tracking participation and feedback.

-- ============================================================
-- 1. session_attendance – granular join/leave tracking per user per session
-- ============================================================
create table if not exists public.session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  duration_seconds int generated always as (
    case when left_at is not null then greatest(0, extract(epoch from (left_at - joined_at))::int) else null end
  ) stored,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

alter table public.session_attendance enable row level security;

-- Host can see attendance for their sessions
drop policy if exists "host reads attendance" on public.session_attendance;
create policy "host reads attendance" on public.session_attendance
for select to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_attendance.session_id and s.host_id = auth.uid()
  )
);

-- Users can see their own attendance
drop policy if exists "user reads own attendance" on public.session_attendance;
create policy "user reads own attendance" on public.session_attendance
for select to authenticated
using (user_id = auth.uid());

-- Host can insert/update attendance records
drop policy if exists "host manages attendance" on public.session_attendance;
create policy "host manages attendance" on public.session_attendance
for all to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = session_attendance.session_id and s.host_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.sessions s
    where s.id = session_attendance.session_id and s.host_id = auth.uid()
  )
);

-- ============================================================
-- 2. RPC: record_attendance – host marks user joined/left
-- ============================================================
create or replace function public.record_attendance(
  target_session uuid,
  target_user uuid,
  action text default 'join'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.sessions
    where id = target_session and host_id = auth.uid()
  ) then
    raise exception 'Only the session host can record attendance';
  end if;

  if action = 'join' then
    insert into public.session_attendance (session_id, user_id, joined_at)
    values (target_session, target_user, now())
    on conflict (session_id, user_id) do update
      set joined_at = now(), left_at = null;
  elsif action = 'leave' then
    update public.session_attendance
      set left_at = now()
    where session_id = target_session
      and user_id = target_user
      and left_at is null;
  end if;

  -- Also update registration status
  update public.session_registrations
    set status = 'attended'
  where session_id = target_session
    and user_id = target_user
    and status = 'registered';
end;
$$;

-- ============================================================
-- 3. RPC: get_session_attendance – host fetches attendance list
-- ============================================================
create or replace function public.get_session_attendance(target_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.sessions
    where id = target_session and host_id = auth.uid()
  ) then
    raise exception 'Only the session host can view attendance';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', sa.user_id,
    'joined_at', sa.joined_at,
    'left_at', sa.left_at,
    'duration_seconds', sa.duration_seconds,
    'full_name', p.full_name,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url
  )), '[]'::jsonb)
  into result
  from public.session_attendance sa
  join public.profiles p on p.id = sa.user_id
  where sa.session_id = target_session
  order by sa.joined_at;

  return result;
end;
$$;

-- ============================================================
-- 4. session_reviews – feedback on sessions (separate from healer_reviews)
-- ============================================================
create table if not exists public.session_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check (rating >= 1 and rating <= 5),
  title text,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, user_id)
);

alter table public.session_reviews enable row level security;

-- Everyone can read published session reviews
drop policy if exists "public reads session reviews" on public.session_reviews;
create policy "public reads session reviews" on public.session_reviews
for select to authenticated
using (true);

-- Users can insert their own reviews
drop policy if exists "user inserts own review" on public.session_reviews;
create policy "user inserts own review" on public.session_reviews
for insert to authenticated
with check (user_id = auth.uid());

-- Users can update their own reviews
drop policy if exists "user updates own review" on public.session_reviews;
create policy "user updates own review" on public.session_reviews
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Users can delete their own reviews
drop policy if exists "user deletes own review" on public.session_reviews;
create policy "user deletes own review" on public.session_reviews
for delete to authenticated
using (user_id = auth.uid());

-- ============================================================
-- 5. RPC: submit_session_review – user submits or updates a review
-- ============================================================
create or replace function public.submit_session_review(
  target_session uuid,
  p_rating int,
  p_title text default null,
  p_body text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  -- Must be registered and session must be completed or past
  if not exists (
    select 1 from public.session_registrations sr
    join public.sessions s on s.id = sr.session_id
    where sr.session_id = target_session
      and sr.user_id = auth.uid()
      and sr.status in ('registered','attended')
      and (s.status = 'completed' or s.ends_at < now())
  ) then
    raise exception 'You can only review sessions you attended that have ended';
  end if;

  insert into public.session_reviews (session_id, user_id, rating, title, body)
  values (target_session, auth.uid(), p_rating, p_title, p_body)
  on conflict (session_id, user_id) do update
    set rating = p_rating, title = p_title, body = p_body, updated_at = now()
  returning to_jsonb(session_reviews.*) into result;

  return result;
end;
$$;

-- ============================================================
-- 6. RPC: get_session_reviews – fetch reviews for a session
-- ============================================================
create or replace function public.get_session_reviews(target_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sr.id,
    'rating', sr.rating,
    'title', sr.title,
    'body', sr.body,
    'created_at', sr.created_at,
    'user_id', sr.user_id,
    'full_name', p.full_name,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url
  ) order by sr.created_at desc), '[]'::jsonb)
  into result
  from public.session_reviews sr
  join public.profiles p on p.id = sr.user_id
  where sr.session_id = target_session;

  return result;
end;
$$;

-- ============================================================
-- 7. RPC: get_session_review_stats – avg rating + count for a session
-- ============================================================
create or replace function public.get_session_review_stats(target_session uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'avg_rating', round(avg(rating)::numeric, 1),
    'review_count', count(*)::int
  )
  from public.session_reviews
  where session_id = target_session;
$$;
