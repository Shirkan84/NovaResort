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
