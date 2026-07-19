-- Nova Resort Connect system.

alter table public.friendships add column if not exists responded_at timestamptz;

do $$ begin
  alter table public.friendships drop constraint if exists friendships_status_check;
  alter table public.friendships add constraint friendships_status_check
    check (status in ('pending','accepted','declined','cancelled','removed','blocked'));
end $$;

create unique index if not exists friendships_active_pair_idx
on public.friendships (least(requester_id,addressee_id), greatest(requester_id,addressee_id))
where status in ('pending','accepted');

create index if not exists friendships_requester_idx on public.friendships(requester_id,status);
create index if not exists friendships_addressee_idx on public.friendships(addressee_id,status);

drop policy if exists "users request friendship" on public.friendships;
create policy "users request friendship" on public.friendships
for insert to authenticated
with check (requester_id = auth.uid() and status = 'pending');

drop policy if exists "participants update friendships" on public.friendships;

create or replace function public.send_connection_request(other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
  sender_name text;
begin
  if auth.uid() is null or other_user is null or other_user = auth.uid() then
    raise exception 'Connect request is not available for this profile.';
  end if;

  if exists (select 1 from public.user_blocks where (blocker_id = auth.uid() and blocked_id = other_user) or (blocker_id = other_user and blocked_id = auth.uid())) then
    raise exception 'Connect is unavailable for this profile.';
  end if;

  select id into request_id
  from public.friendships
  where least(requester_id,addressee_id)=least(auth.uid(),other_user)
    and greatest(requester_id,addressee_id)=greatest(auth.uid(),other_user)
    and status in ('pending','accepted')
  limit 1;

  if request_id is not null then
    return request_id;
  end if;

  insert into public.friendships (requester_id,addressee_id,status)
  values (auth.uid(), other_user, 'pending')
  returning id into request_id;

  select coalesce(nullif(display_name,''), nullif(full_name,''), 'A Nova Resort member')
  into sender_name
  from public.profiles
  where id = auth.uid();

  insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
  values (other_user, auth.uid(), 'connection_request', 'New Connect request', sender_name || ' wants to connect with you.', request_id);

  return request_id;
end;
$$;

create or replace function public.respond_connection_request(request_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.friendships;
  recipient_name text;
begin
  if auth.uid() is null or next_status not in ('accepted','declined') then
    raise exception 'Invalid Connect response.';
  end if;

  select * into row_data
  from public.friendships
  where id = request_id and addressee_id = auth.uid() and status = 'pending';

  if row_data.id is null then
    raise exception 'Connect request is no longer available.';
  end if;

  update public.friendships
  set status = next_status, responded_at = now(), updated_at = now()
  where id = request_id;

  if next_status = 'accepted' then
    select coalesce(nullif(display_name,''), nullif(full_name,''), 'A Nova Resort member')
    into recipient_name
    from public.profiles
    where id = auth.uid();

    insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
    values (row_data.requester_id, auth.uid(), 'connection_accepted', 'Connect request accepted', recipient_name || ' accepted your Connect request.', request_id);
  end if;
end;
$$;

create or replace function public.cancel_connection_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  update public.friendships
  set status = 'cancelled', updated_at = now()
  where id = request_id and requester_id = auth.uid() and status = 'pending';
end;
$$;

create or replace function public.remove_connection(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  update public.friendships
  set status = 'removed', updated_at = now()
  where id = request_id and status = 'accepted' and (requester_id = auth.uid() or addressee_id = auth.uid());
end;
$$;

create or replace function public.block_member(other_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or other_user is null or other_user = auth.uid() then
    raise exception 'Block is not available for this profile.';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), other_user)
  on conflict (blocker_id,blocked_id) do nothing;

  update public.friendships
  set status = case when status = 'accepted' then 'removed' else 'cancelled' end,
      updated_at = now()
  where (requester_id = auth.uid() and addressee_id = other_user)
     or (requester_id = other_user and addressee_id = auth.uid());
end;
$$;

revoke all on function public.send_connection_request(uuid) from public;
revoke all on function public.respond_connection_request(uuid,text) from public;
revoke all on function public.cancel_connection_request(uuid) from public;
revoke all on function public.remove_connection(uuid) from public;
revoke all on function public.block_member(uuid) from public;

grant execute on function public.send_connection_request(uuid) to authenticated;
grant execute on function public.respond_connection_request(uuid,text) to authenticated;
grant execute on function public.cancel_connection_request(uuid) to authenticated;
grant execute on function public.remove_connection(uuid) to authenticated;
grant execute on function public.block_member(uuid) to authenticated;
