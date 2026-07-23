-- AI Companion tables, RLS, and realtime.
-- Idempotent: uses IF NOT EXISTS, CREATE OR REPLACE, etc.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New AI conversation' check (char_length(title) between 1 and 120),
  status text not null default 'active' check (status in ('active','archived')),
  use_profile_context boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null check (char_length(content) <= 12000),
  provider_response_id text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  event_type text not null default 'message' check (event_type in ('message','blocked','error','limit')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  message_id uuid references public.ai_messages(id) on delete cascade,
  rating text not null check (rating in ('helpful','not_helpful','unsafe')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_recent_idx on public.ai_conversations(user_id, last_message_at desc) where deleted_at is null;
create index if not exists ai_messages_conversation_recent_idx on public.ai_messages(conversation_id, created_at) where deleted_at is null;
create index if not exists ai_usage_user_created_idx on public.ai_usage(user_id, created_at desc);
create index if not exists ai_feedback_user_created_idx on public.ai_feedback(user_id, created_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_usage enable row level security;
alter table public.ai_feedback enable row level security;

-- Conversations
drop policy if exists "users view own ai conversations" on public.ai_conversations;
create policy "users view own ai conversations" on public.ai_conversations
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users create own ai conversations" on public.ai_conversations;
create policy "users create own ai conversations" on public.ai_conversations
for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "users update own ai conversations" on public.ai_conversations;
create policy "users update own ai conversations" on public.ai_conversations
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Messages
drop policy if exists "users view own ai messages" on public.ai_messages;
create policy "users view own ai messages" on public.ai_messages
for select to authenticated
using (exists (
  select 1 from public.ai_conversations c
  where c.id = conversation_id and c.user_id = (select auth.uid()) and c.deleted_at is null
));

drop policy if exists "users insert own ai user messages" on public.ai_messages;
create policy "users insert own ai user messages" on public.ai_messages
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and role = 'user'
  and exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid()) and c.deleted_at is null
  )
);

drop policy if exists "users soft delete own ai messages" on public.ai_messages;
create policy "users soft delete own ai messages" on public.ai_messages
for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid()) and c.deleted_at is null
  )
)
with check (
  user_id = (select auth.uid())
  and role = 'user'
);

-- Usage
drop policy if exists "users view own ai usage" on public.ai_usage;
create policy "users view own ai usage" on public.ai_usage
for select to authenticated
using (user_id = (select auth.uid()));

-- Feedback
drop policy if exists "users view own ai feedback" on public.ai_feedback;
create policy "users view own ai feedback" on public.ai_feedback
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "users create own ai feedback" on public.ai_feedback;
create policy "users create own ai feedback" on public.ai_feedback
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.ai_conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid()) and c.deleted_at is null
  )
);

grant select, insert, update on public.ai_conversations to authenticated;
grant select, insert, update on public.ai_messages to authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert on public.ai_feedback to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.ai_conversations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.ai_messages;
exception when duplicate_object then null; end $$;
