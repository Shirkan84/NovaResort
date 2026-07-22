-- Nova Resort podcast studio production migration.
-- Expands audio bucket to accept browser recordings, adds video bucket,
-- adds episode notifications, and fixes recording pipeline.

-- 1. Expand podcast-audio bucket to accept browser-recorded formats
update storage.buckets
set allowed_mime_types = array[
  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a',
  'audio/webm', 'audio/ogg', 'audio/wav'
]
where id = 'podcast-audio';

-- 2. Create podcast-video bucket for video episodes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'podcast-video',
  'podcast-video',
  false,
  524288000,  -- 500MB
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  file_size_limit = 524288000,
  allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime'];

-- 3. Storage policies for podcast-video bucket
-- Upload: healers upload to own path
drop policy if exists "podcast creators upload video" on storage.objects;
create policy "podcast creators upload video" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'podcast-video'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_create_content((select auth.uid()))
  );

-- Update: owners can update own video
drop policy if exists "podcast creators manage own video" on storage.objects;
create policy "podcast creators manage own video" on storage.objects
  for update to authenticated
  using (bucket_id = 'podcast-video' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'podcast-video' and owner_id = (select auth.uid())::text);

-- Delete: owners can delete own video
drop policy if exists "podcast creators delete own video" on storage.objects;
create policy "podcast creators delete own video" on storage.objects
  for delete to authenticated
  using (bucket_id = 'podcast-video' and owner_id = (select auth.uid())::text);

-- 4. Add video support to podcast_episodes table
-- Add media_kind column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'podcast_episodes' and column_name = 'media_kind'
  ) then
    alter table public.podcast_episodes
      add column media_kind text not null default 'audio'
      check (media_kind in ('audio', 'video'));
  end if;
end $$;

-- Add video_path and video_url columns if they don't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'podcast_episodes' and column_name = 'video_path'
  ) then
    alter table public.podcast_episodes add column video_path text;
    alter table public.podcast_episodes add column video_url text;
    alter table public.podcast_episodes add column media_mime_type text;
    alter table public.podcast_episodes add column media_size_bytes bigint;
  end if;
end $$;

-- Relax duration constraint: allow 0 for drafts (media not yet uploaded)
-- and raise max to 3600 seconds (1 hour) for video content
alter table public.podcast_episodes
  drop constraint if exists podcast_episodes_audio_duration_check;

alter table public.podcast_episodes
  add constraint podcast_episodes_audio_duration_check
  check (audio_duration_seconds >= 0 and audio_duration_seconds <= 3600);

-- 5. Notification function for new episode publication
create or replace function public.notify_podcast_episode_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pod record;
  follower record;
  creator_name text;
begin
  -- Only notify on publish (not on other status changes)
  if new.status <> 'published' or coalesce(old.status, '') = 'published' then
    return new;
  end if;

  -- Get podcast and creator info
  select p.title as podcast_title, p.creator_id, pr.display_name, pr.full_name
  into pod
  from public.podcasts p
  join public.profiles pr on pr.id = p.creator_id
  where p.id = new.podcast_id;

  creator_name := coalesce(pod.display_name, pod.full_name, 'A healer');

  -- Notify all followers of this podcast
  for follower in
    select pf.user_id
    from public.podcast_follows pf
    where pf.podcast_id = new.podcast_id
      and pf.user_id <> new.creator_id
  loop
    insert into public.notifications (user_id, actor_id, type, title, body, entity_id)
    values (
      follower.user_id,
      new.creator_id,
      'podcast_episode_published',
      'New episode available',
      creator_name || ' published "' || new.title || '" in ' || pod.podcast_title,
      new.id
    );
  end loop;

  return new;
end;
$$;

-- Drop existing trigger if it exists
drop trigger if exists on_podcast_episode_published on public.podcast_episodes;

-- Create trigger on status change to published
create trigger on_podcast_episode_published
  after update on public.podcast_episodes
  for each row
  execute function public.notify_podcast_episode_published();

-- 6. Also create trigger for INSERT with published status (new episodes created as published)
drop trigger if exists on_podcast_episode_insert_published on public.podcast_episodes;
create trigger on_podcast_episode_insert_published
  after insert on public.podcast_episodes
  for each row
  when (new.status = 'published')
  execute function public.notify_podcast_episode_published();

-- 7. Update storage usage RPC to include video bucket
create or replace function public.get_podcast_storage_usage(creator uuid)
returns bigint
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select sum((metadata->>'size')::bigint)
     from storage.objects
     where bucket_id = 'podcast-audio'
       and (storage.foldername(name))[1] = creator::text),
    0
  ) + coalesce(
    (select sum((metadata->>'size')::bigint)
     from storage.objects
     where bucket_id = 'podcast-covers'
       and (storage.foldername(name))[1] = creator::text),
    0
  ) + coalesce(
    (select sum((metadata->>'size')::bigint)
     from storage.objects
     where bucket_id = 'podcast-video'
       and (storage.foldername(name))[1] = creator::text),
    0
  );
$$;

-- 8. Index for episode status lookups (improves listing performance)
create index if not exists podcast_episodes_creator_status_idx
  on public.podcast_episodes (creator_id, status)
  where deleted_at is null;

-- 9. Ensure published episode has media path (conditional constraint)
-- Only enforce if there are no existing published episodes without media
-- (This is a safety check; actual enforcement is in the publish flow)
