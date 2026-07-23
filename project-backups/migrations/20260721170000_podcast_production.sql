-- Nova Resort podcast production hardening.
-- Adds 20-minute duration constraint, fixes bucket mime types, adds storage usage RPC.

-- 1. Enforce 20-minute maximum episode duration (1200 seconds)
alter table public.podcast_episodes
  drop constraint if exists podcast_episodes_audio_duration_check;

alter table public.podcast_episodes
  add constraint podcast_episodes_audio_duration_check
  check (audio_duration_seconds >= 0 and audio_duration_seconds <= 1200);

-- 2. Fix podcast-audio bucket: restrict to MP3, M4A, AAC only
update storage.buckets
set allowed_mime_types = array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a']
where id = 'podcast-audio';

-- 3. Storage usage RPC: returns total bytes used by a creator across both buckets
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
  );
$$;

revoke all on function public.get_podcast_storage_usage(uuid) from public;
grant execute on function public.get_podcast_storage_usage(uuid) to authenticated;

-- 4. Storage DELETE policies: allow healers to delete their own files
drop policy if exists "podcast creators delete own covers" on storage.objects;
create policy "podcast creators delete own covers" on storage.objects for delete to authenticated
using (bucket_id = 'podcast-covers' and owner_id = (select auth.uid())::text);

drop policy if exists "podcast creators delete own audio" on storage.objects;
create policy "podcast creators delete own audio" on storage.objects for delete to authenticated
using (bucket_id = 'podcast-audio' and owner_id = (select auth.uid())::text);
