-- Nova Resort profile-photo storage migration
-- Run once in Supabase Dashboard > SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar images are public" on storage.objects;
create policy "avatar images are public"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and owner_id = auth.uid()::text)
with check (bucket_id = 'avatars' and owner_id = auth.uid()::text);

drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and owner_id = auth.uid()::text);

create index if not exists profiles_last_seen_idx on public.profiles(last_seen desc);
create index if not exists messages_created_at_idx on public.messages(created_at desc);

-- Members may choose member or healer, but can never grant themselves admin access.
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and profile_type in ('member','healer'));

-- Creates or reuses a room that can only be accessed by exactly two users.
create or replace function public.create_private_room(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  found_room uuid;
begin
  if auth.uid() is null or other_user is null or other_user = auth.uid() then
    raise exception 'Invalid private-room participant';
  end if;
  if not exists (select 1 from public.profiles where id = other_user) then
    raise exception 'Participant does not exist';
  end if;

  select r.id into found_room
  from public.rooms r
  where r.is_private = true and r.max_participants = 2
    and exists (select 1 from public.room_members a where a.room_id=r.id and a.user_id=auth.uid())
    and exists (select 1 from public.room_members b where b.room_id=r.id and b.user_id=other_user)
    and (select count(*) from public.room_members c where c.room_id=r.id) = 2
  limit 1;

  if found_room is null then
    insert into public.rooms (slug,name,description,icon,theme,is_private,max_participants,created_by)
    values ('private-'||gen_random_uuid()::text,'Private conversation','A private room for two people.','♢','sage',true,2,auth.uid())
    returning id into found_room;
    insert into public.room_members (room_id,user_id) values (found_room,auth.uid()),(found_room,other_user);
  end if;
  return found_room;
end;
$$;

revoke all on function public.create_private_room(uuid) from public;
grant execute on function public.create_private_room(uuid) to authenticated;

create or replace function public.list_private_rooms()
returns table (id uuid, name text, description text, icon text, theme text, is_private boolean, avatar_url text, last_message text, last_activity timestamptz)
language sql
security definer
set search_path = public
as $$
  select r.id,
         coalesce(nullif(p.display_name,''),nullif(p.full_name,''),'Private conversation') as name,
         'Private two-person conversation'::text as description,
         '♢'::text as icon, r.theme, r.is_private, p.avatar_url,
         lm.body as last_message, coalesce(lm.created_at,r.created_at) as last_activity
  from public.room_members mine
  join public.rooms r on r.id=mine.room_id and r.is_private=true and r.max_participants=2
  join public.room_members other_member on other_member.room_id=r.id and other_member.user_id<>auth.uid()
  join public.profiles p on p.id=other_member.user_id
  left join lateral (select m.body,m.created_at from public.messages m where m.room_id=r.id and m.deleted_at is null order by m.created_at desc limit 1) lm on true
  where mine.user_id=auth.uid()
  order by coalesce(lm.created_at,r.created_at) desc;
$$;

revoke all on function public.list_private_rooms() from public;
grant execute on function public.list_private_rooms() to authenticated;
