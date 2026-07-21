-- Nova Resort podcast episodes enhancements.
-- Adds slug, show_notes, and category columns to podcast_episodes.

-- 1. Add slug column for URL-friendly episode identifiers
alter table public.podcast_episodes add column if not exists slug text;

-- Generate slugs for existing episodes that lack one
update public.podcast_episodes
set slug = lower(regexp_replace(
  title || '-' || left(id::text, 8),
  '[^a-z0-9]+', '-', 'g'
))
where slug is null;

-- Add unique constraint on (podcast_id, slug) for episodes
create unique index if not exists podcast_episodes_podcast_slug_idx
  on public.podcast_episodes(podcast_id, slug)
  where slug is not null;

-- 2. Add show_notes column for detailed episode notes (separate from brief description)
alter table public.podcast_episodes add column if not exists show_notes text not null default '' check (char_length(show_notes) <= 10000);

-- 3. Add category column to episodes (can differ from podcast-level category)
alter table public.podcast_episodes add column if not exists category text;

-- 4. Ensure updated_at trigger exists for podcast_episodes
create or replace function public.update_podcast_episode_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_podcast_episode_updated_at on public.podcast_episodes;
create trigger update_podcast_episode_updated_at
  before update on public.podcast_episodes
  for each row
  execute function public.update_podcast_episode_timestamp();

-- 5. Ensure updated_at trigger exists for podcasts (shows)
create or replace function public.update_podcast_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_podcast_updated_at on public.podcasts;
create trigger update_podcast_updated_at
  before update on public.podcasts
  for each row
  execute function public.update_podcast_timestamp();

-- 6. Add slug column to podcasts if not present (for show-level slugs)
-- Already exists in the original schema, but ensure it's populated
update public.podcasts
set slug = lower(regexp_replace(
  title,
  '[^a-z0-9]+', '-', 'g'
))
where slug is null or slug = '';
