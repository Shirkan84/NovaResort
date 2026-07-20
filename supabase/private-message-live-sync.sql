-- Private-message live sync support.

alter table public.messages add column if not exists client_message_id uuid;

create unique index if not exists messages_sender_client_message_unique_idx
on public.messages(sender_id, client_message_id)
where client_message_id is not null;

create index if not exists messages_room_client_message_idx
on public.messages(room_id, client_message_id)
where client_message_id is not null;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
