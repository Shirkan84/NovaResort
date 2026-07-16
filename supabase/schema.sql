-- Nova Resort database setup
-- Run once in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  display_name text,
  avatar_url text,
  cover_url text,
  country text,
  languages text[] not null default '{}',
  about text not null default '',
  interests text[] not null default '{}',
  healing_interests text[] not null default '{}',
  profile_type text not null default 'member' check (profile_type in ('member','healer','admin')),
  specialties text[] not null default '{}',
  years_experience integer,
  availability text,
  visibility text not null default 'community' check (visibility in ('community','friends','private')),
  online boolean not null default false,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  icon text not null default '♡',
  theme text not null default 'sage',
  is_private boolean not null default false,
  max_participants integer,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member','moderator')),
  joined_at timestamptz not null default now(),
  primary key (room_id,user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  kind text not null default 'text' check (kind in ('text','image','system')),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(requester_id,addressee_id),
  check (requester_id <> addressee_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.video_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  host_id uuid not null references public.profiles(id) on delete cascade,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited' check (status in ('invited','active','ended','declined')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, display_name, country, profile_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'country',
    case when new.raw_user_meta_data->>'profile_type' = 'healer' then 'healer' else 'member' end
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill users registered before this schema was installed.
insert into public.profiles (id, full_name, display_name, country, profile_type)
select id, coalesce(raw_user_meta_data->>'full_name',''),
       coalesce(raw_user_meta_data->>'full_name',split_part(email,'@',1)),
       raw_user_meta_data->>'country',
       case when raw_user_meta_data->>'profile_type' = 'healer' then 'healer' else 'member' end
from auth.users on conflict (id) do nothing;

insert into public.rooms (slug,name,description,icon,theme) values
('heart-to-heart','Heart to Heart','A gentle space for honest conversations and mutual support.','♡','peach'),
('mindful-moments','Mindful Moments','Pause, breathe, and return to yourself with the community.','✦','sage'),
('self-growth','Self Growth','Celebrate progress, share intentions, and grow together.','⌁','lavender'),
('emotional-support','Emotional Support','A moderated room to feel heard without judgment.','◌','sage'),
('relationships','Relationships','Thoughtful conversations about connection and boundaries.','∞','peach')
on conflict (slug) do nothing;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;
alter table public.video_sessions enable row level security;

create policy "community profiles are visible" on public.profiles for select to authenticated using (visibility <> 'private' or id = auth.uid());
create policy "users update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "authenticated users view public rooms" on public.rooms for select to authenticated using (not is_private or exists(select 1 from public.room_members where room_id=id and user_id=auth.uid()));
create policy "users create private rooms" on public.rooms for insert to authenticated with check (created_by=auth.uid());
create policy "users view own memberships" on public.room_members for select to authenticated using (user_id=auth.uid());
create policy "users join rooms" on public.room_members for insert to authenticated with check (user_id=auth.uid());
create policy "users leave rooms" on public.room_members for delete to authenticated using (user_id=auth.uid());
create policy "messages visible in public or joined rooms" on public.messages for select to authenticated using (exists(select 1 from public.rooms r where r.id=room_id and (not r.is_private or exists(select 1 from public.room_members rm where rm.room_id=r.id and rm.user_id=auth.uid()))));
create policy "authenticated users send messages" on public.messages for insert to authenticated with check (sender_id=auth.uid() and exists(select 1 from public.rooms r where r.id=room_id and (not r.is_private or exists(select 1 from public.room_members rm where rm.room_id=r.id and rm.user_id=auth.uid()))));
create policy "users manage own messages" on public.messages for update to authenticated using (sender_id=auth.uid()) with check (sender_id=auth.uid());
create policy "friendships visible to participants" on public.friendships for select to authenticated using (requester_id=auth.uid() or addressee_id=auth.uid());
create policy "users request friendship" on public.friendships for insert to authenticated with check (requester_id=auth.uid());
create policy "participants update friendships" on public.friendships for update to authenticated using (requester_id=auth.uid() or addressee_id=auth.uid());
create policy "users view own notifications" on public.notifications for select to authenticated using (user_id=auth.uid());
create policy "authenticated users create notifications" on public.notifications for insert to authenticated with check (actor_id=auth.uid());
create policy "users update own notifications" on public.notifications for update to authenticated using (user_id=auth.uid());
create policy "video participants view sessions" on public.video_sessions for select to authenticated using (host_id=auth.uid() or guest_id=auth.uid());
create policy "users invite video guest" on public.video_sessions for insert to authenticated with check (host_id=auth.uid());
create policy "participants update video sessions" on public.video_sessions for update to authenticated using (host_id=auth.uid() or guest_id=auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.friendships;
exception when duplicate_object then null; end $$;
