-- Nova Resort private messaging hardening and unread-state support.

alter table public.messages add column if not exists updated_at timestamptz not null default now();
alter table public.messages add column if not exists read_at timestamptz;

alter table public.rooms add column if not exists private_user_low uuid references public.profiles(id) on delete cascade;
alter table public.rooms add column if not exists private_user_high uuid references public.profiles(id) on delete cascade;

update public.rooms r
set private_user_low = pair.user_low,
    private_user_high = pair.user_high
from (
  select room_id,
         (array_agg(user_id order by user_id::text))[1] as user_low,
         (array_agg(user_id order by user_id::text))[2] as user_high,
         count(*) as member_count
  from public.room_members
  group by room_id
) pair
where r.id = pair.room_id
  and r.is_private = true
  and r.max_participants = 2
  and pair.member_count = 2
  and (r.private_user_low is null or r.private_user_high is null);

create unique index if not exists private_rooms_pair_unique_idx
on public.rooms(private_user_low, private_user_high)
where is_private = true and max_participants = 2 and private_user_low is not null and private_user_high is not null;

create index if not exists messages_private_unread_idx
on public.messages(room_id, sender_id, created_at desc)
where deleted_at is null;

create index if not exists messages_room_read_idx
on public.messages(room_id, read_at)
where deleted_at is null;

create index if not exists notifications_user_type_entity_idx
on public.notifications(user_id, type, entity_id, read_at);

create or replace function public.prepare_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data public.rooms;
  recipient uuid;
begin
  new.updated_at = now();

  select * into room_data
  from public.rooms
  where id = new.room_id;

  if room_data.id is null then
    raise exception 'Conversation not found.';
  end if;

  if not exists (
    select 1 from public.room_members rm
    where rm.room_id = new.room_id and rm.user_id = new.sender_id
  ) then
    raise exception 'You are not a participant in this conversation.';
  end if;

  if room_data.is_private then
    select rm.user_id into recipient
    from public.room_members rm
    where rm.room_id = new.room_id and rm.user_id <> new.sender_id
    limit 1;

    if recipient is null then
      raise exception 'Private conversation recipient not found.';
    end if;

    if exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = new.sender_id and b.blocked_id = recipient)
         or (b.blocker_id = recipient and b.blocked_id = new.sender_id)
    ) then
      raise exception 'Messages are unavailable for this private conversation.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_message_insert_trigger on public.messages;
create trigger prepare_message_insert_trigger
before insert or update on public.messages
for each row execute function public.prepare_message_insert();

create or replace function public.after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room_data public.rooms;
  sender_name text;
  recipient uuid;
begin
  update public.rooms
  set updated_at = now()
  where id = new.room_id;

  insert into public.room_user_preferences (room_id, user_id, last_read_at, updated_at)
  values (new.room_id, new.sender_id, now(), now())
  on conflict (room_id, user_id)
  do update set last_read_at = now(), updated_at = now();

  select * into room_data
  from public.rooms
  where id = new.room_id;

  if room_data.is_private then
    select coalesce(nullif(display_name,''), nullif(full_name,''), 'A Nova Resort member')
    into sender_name
    from public.profiles
    where id = new.sender_id;

    for recipient in
      select rm.user_id
      from public.room_members rm
      where rm.room_id = new.room_id and rm.user_id <> new.sender_id
    loop
      insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
      values (
        recipient,
        new.sender_id,
        'private_message',
        'New private message',
        sender_name || ': ' || left(new.body, 140),
        new.room_id
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists after_message_insert_trigger on public.messages;
create trigger after_message_insert_trigger
after insert on public.messages
for each row execute function public.after_message_insert();

create or replace function public.mark_room_read(target_room uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  if not exists (
    select 1 from public.room_members rm
    where rm.room_id = target_room and rm.user_id = auth.uid()
  ) then
    raise exception 'Conversation not found.';
  end if;

  insert into public.room_user_preferences (room_id, user_id, last_read_at, updated_at)
  values (target_room, auth.uid(), now(), now())
  on conflict (room_id, user_id)
  do update set last_read_at = excluded.last_read_at, updated_at = excluded.updated_at;

  update public.messages
  set read_at = coalesce(read_at, now()), updated_at = now()
  where room_id = target_room
    and sender_id <> auth.uid()
    and deleted_at is null
    and read_at is null;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and type = 'private_message'
    and entity_id = target_room
    and read_at is null;
end;
$$;

drop function if exists public.create_private_room(uuid);
create function public.create_private_room(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found_room uuid;
  user_low uuid;
  user_high uuid;
begin
  if auth.uid() is null or other_user is null or other_user = auth.uid() then
    raise exception 'Invalid private-room participant';
  end if;

  if not exists (select 1 from public.profiles where id = other_user) then
    raise exception 'Participant does not exist';
  end if;

  user_low := least(auth.uid(), other_user);
  user_high := greatest(auth.uid(), other_user);

  perform pg_advisory_xact_lock(hashtext(user_low::text || ':' || user_high::text));

  if exists (
    select 1 from public.user_blocks
    where (blocker_id = auth.uid() and blocked_id = other_user)
       or (blocker_id = other_user and blocked_id = auth.uid())
  ) then
    raise exception 'Messages are unavailable for this profile.';
  end if;

  select id into found_room
  from public.rooms
  where is_private = true
    and max_participants = 2
    and private_user_low = user_low
    and private_user_high = user_high
  limit 1;

  if found_room is null then
    select r.id into found_room
    from public.rooms r
    where r.is_private = true and r.max_participants = 2
      and exists (select 1 from public.room_members a where a.room_id=r.id and a.user_id=auth.uid())
      and exists (select 1 from public.room_members b where b.room_id=r.id and b.user_id=other_user)
      and (select count(*) from public.room_members c where c.room_id=r.id) = 2
    limit 1;
  end if;

  if found_room is null then
    insert into public.rooms (slug,name,description,icon,theme,is_private,max_participants,created_by,private_user_low,private_user_high)
    values ('private-'||gen_random_uuid()::text,'Private conversation','A private room for two people.','♢','sage',true,2,auth.uid(),user_low,user_high)
    returning id into found_room;
  else
    update public.rooms
    set private_user_low = user_low,
        private_user_high = user_high,
        updated_at = now()
    where id = found_room
      and (private_user_low is null or private_user_high is null);
  end if;

  insert into public.room_members (room_id,user_id)
  values (found_room,auth.uid()),(found_room,other_user)
  on conflict (room_id,user_id) do nothing;

  insert into public.room_user_preferences (room_id,user_id,last_read_at,updated_at)
  values (found_room,auth.uid(),now(),now()),(found_room,other_user,'epoch'::timestamptz,now())
  on conflict (room_id,user_id) do nothing;

  return found_room;
end;
$$;

drop function if exists public.list_private_rooms();
create function public.list_private_rooms()
returns table (
  id uuid,
  name text,
  description text,
  icon text,
  theme text,
  is_private boolean,
  avatar_url text,
  other_user_id uuid,
  other_online boolean,
  other_last_seen timestamptz,
  verified boolean,
  last_message text,
  last_sender_id uuid,
  last_message_at timestamptz,
  last_activity timestamptz,
  last_read_at timestamptz,
  unread_count integer
)
language sql
security definer
set search_path = public
as $$
  select r.id,
         coalesce(nullif(p.display_name,''),nullif(p.full_name,''),'Private conversation') as name,
         'Private two-person conversation'::text as description,
         '♢'::text as icon,
         r.theme,
         r.is_private,
         p.avatar_url,
         p.id as other_user_id,
         p.online as other_online,
         p.last_seen as other_last_seen,
         (p.profile_type = 'healer') as verified,
         lm.body as last_message,
         lm.sender_id as last_sender_id,
         lm.created_at as last_message_at,
         coalesce(lm.created_at,r.updated_at,r.created_at) as last_activity,
         coalesce(pref.last_read_at,'epoch'::timestamptz) as last_read_at,
         coalesce(unread.count,0)::integer as unread_count
  from public.room_members mine
  join public.rooms r on r.id = mine.room_id and r.is_private = true and r.max_participants = 2
  join public.room_members other_member on other_member.room_id = r.id and other_member.user_id <> auth.uid()
  join public.profiles p on p.id = other_member.user_id
  left join public.room_user_preferences pref on pref.room_id = r.id and pref.user_id = auth.uid()
  left join lateral (
    select m.body, m.sender_id, m.created_at
    from public.messages m
    where m.room_id = r.id and m.deleted_at is null
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) as count
    from public.messages m
    where m.room_id = r.id
      and m.sender_id <> auth.uid()
      and m.deleted_at is null
      and m.created_at > coalesce(pref.last_read_at,'epoch'::timestamptz)
  ) unread on true
  where mine.user_id = auth.uid()
  order by coalesce(lm.created_at,r.updated_at,r.created_at) desc;
$$;

revoke all on function public.create_private_room(uuid) from public;
revoke all on function public.list_private_rooms() from public;
revoke all on function public.mark_room_read(uuid) from public;
revoke all on function public.after_message_insert() from public, anon, authenticated;
revoke all on function public.prepare_message_insert() from public, anon, authenticated;
revoke all on function public.create_private_room(uuid) from anon;
revoke all on function public.list_private_rooms() from anon;
revoke all on function public.mark_room_read(uuid) from anon;

grant execute on function public.create_private_room(uuid) to authenticated;
grant execute on function public.list_private_rooms() to authenticated;
grant execute on function public.mark_room_read(uuid) to authenticated;
