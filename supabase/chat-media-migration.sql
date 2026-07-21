alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_type text;
alter table public.messages add column if not exists media_mime_type text;
alter table public.messages add column if not exists media_size integer;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'chat-media') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('chat-media', 'chat-media', false, 52428800,
      array['image/jpeg','image/png','image/gif','image/webp','audio/webm','audio/mpeg','audio/ogg','video/webm','video/mp4']);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'chat media upload own' and tablename = 'objects') then
    create policy "chat media upload own" on storage.objects for insert to authenticated
    with check (
      bucket_id = 'chat-media'
      and (storage.foldername(name))[1] = (select auth.uid()::text)
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'chat media read room members' and tablename = 'objects') then
    create policy "chat media read room members" on storage.objects for select to authenticated
    using (
      bucket_id = 'chat-media'
      and (
        (storage.foldername(name))[1] = (select auth.uid()::text)
        or exists (
          select 1 from public.room_members rm
          where rm.user_id = (select auth.uid())
            and rm.room_id::text = (storage.foldername(name))[2]
        )
        or exists (
          select 1 from public.rooms r
          where r.is_private = false
            and r.id::text = (storage.foldername(name))[2]
        )
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'chat media delete own' and tablename = 'objects') then
    create policy "chat media delete own" on storage.objects for delete to authenticated
    using (
      bucket_id = 'chat-media'
      and (storage.foldername(name))[1] = (select auth.uid()::text)
    );
  end if;
end $$;

create index if not exists messages_media_type_idx on public.messages(media_type) where media_type is not null;
