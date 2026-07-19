-- Nova Resort user-created sessions and registrations.

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '',
  category text not null default 'Community Discussion',
  cover_image_url text,
  language text not null default 'English',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'UTC',
  capacity integer not null default 20 check (capacity > 0),
  visibility text not null default 'public' check (visibility in ('public','private')),
  status text not null default 'published' check (status in ('draft','published','registration_closed','live','completed','cancelled')),
  registration_deadline timestamptz,
  chat_enabled boolean not null default true,
  participant_audio_enabled boolean not null default false,
  participant_video_enabled boolean not null default false,
  live_room_provider text not null default 'jitsi',
  live_room_id text not null default ('nova-session-' || gen_random_uuid()::text),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_at > starts_at),
  check (registration_deadline is null or registration_deadline <= starts_at)
);

create table if not exists public.session_registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered','waitlisted','cancelled','removed','attended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,user_id)
);

create index if not exists sessions_starts_at_idx on public.sessions(starts_at);
create index if not exists sessions_host_idx on public.sessions(host_id,status,starts_at);
create index if not exists session_registrations_user_idx on public.session_registrations(user_id,status);
create index if not exists session_registrations_session_idx on public.session_registrations(session_id,status);

alter table public.sessions enable row level security;
alter table public.session_registrations enable row level security;

drop policy if exists "public sessions are visible" on public.sessions;
create policy "public sessions are visible" on public.sessions
for select to authenticated
using (visibility = 'public' or host_id = auth.uid() or exists (
  select 1 from public.session_registrations sr
  where sr.session_id = id and sr.user_id = auth.uid() and sr.status in ('registered','waitlisted','attended')
));

drop policy if exists "users create own sessions" on public.sessions;
create policy "users create own sessions" on public.sessions
for insert to authenticated
with check (host_id = auth.uid() and starts_at > now());

drop policy if exists "hosts update own sessions" on public.sessions;
create policy "hosts update own sessions" on public.sessions
for update to authenticated
using (host_id = auth.uid())
with check (host_id = auth.uid());

drop policy if exists "participants view own registrations" on public.session_registrations;
create policy "participants view own registrations" on public.session_registrations
for select to authenticated
using (user_id = auth.uid() or exists (select 1 from public.sessions s where s.id = session_id and s.host_id = auth.uid()));

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

create or replace function public.cancel_session_registration(target_session uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  update public.session_registrations
  set status = 'cancelled', updated_at = now()
  where session_id = target_session and user_id = auth.uid() and status in ('registered','waitlisted');
end;
$$;

revoke all on function public.register_for_session(uuid) from public;
revoke all on function public.cancel_session_registration(uuid) from public;
revoke execute on function public.register_for_session(uuid) from anon;
revoke execute on function public.cancel_session_registration(uuid) from anon;
grant execute on function public.register_for_session(uuid) to authenticated;
grant execute on function public.cancel_session_registration(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.sessions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.session_registrations;
exception when duplicate_object then null; end $$;
