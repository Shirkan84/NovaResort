-- Nova Resort community lobby and public wellness rooms.

alter table public.rooms add column if not exists tags text[] not null default '{}';
alter table public.rooms add column if not exists updated_at timestamptz not null default now();

alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists pinned boolean not null default false;
alter table public.messages add column if not exists pinned_by uuid references public.profiles(id) on delete set null;
alter table public.messages add column if not exists pinned_at timestamptz;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id,user_id,emoji)
);

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null default 'Community safety concern',
  created_at timestamptz not null default now(),
  unique(message_id,reporter_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id,blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.room_user_preferences (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted boolean not null default false,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id,user_id)
);

create index if not exists room_members_room_id_idx on public.room_members(room_id);
create index if not exists messages_room_created_idx on public.messages(room_id, created_at desc) where deleted_at is null;
create index if not exists messages_reply_to_idx on public.messages(reply_to);
create index if not exists message_reactions_message_id_idx on public.message_reactions(message_id);
create index if not exists message_reports_message_id_idx on public.message_reports(message_id);
create index if not exists room_user_preferences_user_idx on public.room_user_preferences(user_id);

alter table public.message_reactions enable row level security;
alter table public.message_reports enable row level security;
alter table public.user_blocks enable row level security;
alter table public.room_user_preferences enable row level security;

drop policy if exists "room reactions are visible" on public.message_reactions;
create policy "room reactions are visible" on public.message_reactions
for select to authenticated
using (exists (
  select 1 from public.messages m
  join public.rooms r on r.id = m.room_id
  where m.id = message_id
    and (not r.is_private or exists(select 1 from public.room_members rm where rm.room_id = r.id and rm.user_id = auth.uid()))
));

drop policy if exists "users manage own reactions" on public.message_reactions;
create policy "users manage own reactions" on public.message_reactions
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "users create message reports" on public.message_reports;
create policy "users create message reports" on public.message_reports
for insert to authenticated
with check (reporter_id = auth.uid());

drop policy if exists "users view own message reports" on public.message_reports;
create policy "users view own message reports" on public.message_reports
for select to authenticated
using (reporter_id = auth.uid());

drop policy if exists "users manage own blocks" on public.user_blocks;
create policy "users manage own blocks" on public.user_blocks
for all to authenticated
using (blocker_id = auth.uid())
with check (blocker_id = auth.uid());

drop policy if exists "users manage own room preferences" on public.room_user_preferences;
create policy "users manage own room preferences" on public.room_user_preferences
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into public.rooms (slug,name,description,icon,theme,is_private,max_participants,tags) values
('healing-circle','Healing Circle','A warm and supportive space to share your healing journey, encourage others, celebrate progress, and remind one another that recovery is possible.','🌿','sage',false,null,array['Healing','Support','Safe Space']),
('mindfulness-lounge','Mindfulness Lounge','Slow down together. Practice presence, gratitude, breathing, and mindful awareness with people seeking inner peace.','🧘','blue',false,null,array['Mindfulness','Presence','Peace']),
('meditation-room','Meditation Room','Discuss meditation techniques, guided practices, silent sessions, breathing exercises, and spiritual awareness.','🕊','lavender',false,null,array['Meditation','Breathing','Calm']),
('emotional-support','Emotional Support','Talk openly about anxiety, loneliness, sadness, relationships, or difficult moments in a judgment-free environment.','❤️','rose',false,null,array['Support','Listening','Community']),
('positive-energy','Positive Energy','Share good news, gratitude, inspiration, uplifting stories, and small victories.','☀','gold',false,null,array['Gratitude','Positivity','Inspiration']),
('self-growth','Self Growth','Discuss habits, discipline, goals, emotional intelligence, confidence, and becoming the best version of yourself.','🌱','green',false,null,array['Growth','Goals','Motivation']),
('relationships','Relationships','Healthy relationships, friendships, communication, dating, family, and emotional connection.','💞','pink',false,null,array['Love','Family','Relationships']),
('life-stories','Life Stories','Tell your story. Listen to others. Every life has experiences worth sharing.','🌎','teal',false,null,array['Stories','Community','Connection']),
('late-night-lounge','Late Night Lounge','For people who simply do not want to feel alone during the evening or late hours.','🌙','indigo',false,null,array['Night','Company','Safe Space']),
('creativity-corner','Creativity Corner','Music, photography, painting, writing, AI art, creativity, and inspiration.','🎨','orange',false,null,array['Art','Music','Creativity']),
('learning-together','Learning Together','Learn from one another about psychology, philosophy, neuroscience, spirituality, and wellness.','📚','blue',false,null,array['Learning','Psychology','Growth']),
('gratitude-circle','Gratitude Circle','Every day share something you are grateful for, no matter how small.','🙏','gold',false,null,array['Gratitude','Happiness','Mindfulness'])
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  theme = excluded.theme,
  is_private = false,
  max_participants = null,
  tags = excluded.tags,
  updated_at = now();

create or replace function public.list_public_rooms()
returns table (
  id uuid,
  name text,
  description text,
  icon text,
  theme text,
  is_private boolean,
  tags text[],
  total_members bigint,
  online_members bigint,
  last_activity timestamptz,
  pinned_message text
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.name, r.description, r.icon, r.theme, r.is_private, r.tags,
         count(distinct rm.user_id) as total_members,
         count(distinct rm.user_id) filter (where p.last_seen >= now() - interval '5 minutes') as online_members,
         coalesce(max(m.created_at), r.created_at) as last_activity,
         (select pm.body from public.messages pm where pm.room_id = r.id and pm.pinned = true and pm.deleted_at is null order by pm.pinned_at desc nulls last, pm.created_at desc limit 1) as pinned_message
  from public.rooms r
  left join public.room_members rm on rm.room_id = r.id
  left join public.profiles p on p.id = rm.user_id
  left join public.messages m on m.room_id = r.id and m.deleted_at is null
  where r.is_private = false
  group by r.id
  order by r.created_at asc;
$$;

revoke all on function public.list_public_rooms() from public;
grant execute on function public.list_public_rooms() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null; end $$;
