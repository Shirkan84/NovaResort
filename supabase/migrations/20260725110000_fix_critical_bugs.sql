-- ============================================================
-- FIX: Deduplicate podcast_listens in record_podcast_play
-- Also fix get_recommended_podcasts to use real play counts
-- ============================================================

-- Fix record_podcast_play: only insert listen if no recent insert in last 5 minutes
CREATE OR REPLACE FUNCTION public.record_podcast_play(episode_ref uuid, position_seconds integer default 0, duration_seconds integer default 0)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from public.podcast_episodes e where e.id = episode_ref and public.can_access_episode(e)) then
    raise exception 'Episode is unavailable.';
  end if;

  if not exists (
    select 1 from public.podcast_listens pl
    where pl.episode_id = episode_ref and pl.user_id = auth.uid()
      and pl.created_at > now() - interval '5 minutes'
  ) then
    insert into public.podcast_listens (episode_id, user_id, last_position_seconds, listen_duration_seconds, completed_at)
    values (episode_ref, auth.uid(), greatest(position_seconds, 0), greatest(duration_seconds, 0),
      case when duration_seconds > 0 and position_seconds >= duration_seconds * 0.9 then now() else null end);
  end if;

  insert into public.podcast_progress (episode_id, user_id, position_seconds, duration_seconds, updated_at)
  values (episode_ref, auth.uid(), greatest(position_seconds, 0), greatest(duration_seconds, 0), now())
  on conflict (episode_id,user_id) do update set
    position_seconds = excluded.position_seconds,
    duration_seconds = excluded.duration_seconds,
    updated_at = now();
end;
$$;

-- Fix get_recommended_podcasts: use real play counts instead of hardcoded 0
CREATE OR REPLACE FUNCTION public.get_recommended_podcasts(
  page_limit integer DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  title text,
  short_description text,
  cover_image_url text,
  category text,
  language text,
  follower_count bigint,
  episode_count bigint,
  total_plays bigint,
  creator_name text,
  creator_avatar text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH member_interests AS (
    SELECT interests, languages FROM public.profiles WHERE id = auth.uid()
  ),
  followed_categories AS (
    SELECT DISTINCT p.category
    FROM public.podcast_follows pf
    JOIN public.podcasts p ON p.id = pf.podcast_id
    WHERE pf.user_id = auth.uid() AND p.category IS NOT NULL
  ),
  scored AS (
    SELECT
      p.id, p.title, p.short_description, p.cover_image_url,
      p.category, p.language, p.creator_id,
      pr.full_name as creator_full_name,
      pr.display_name as creator_display_name,
      pr.avatar_url as creator_avatar_url,
      (SELECT COUNT(*)::bigint FROM public.podcast_follows pf2 WHERE pf2.podcast_id = p.id) as follower_count,
      (SELECT COUNT(*)::bigint FROM public.podcast_episodes pe WHERE pe.podcast_id = p.id AND pe.status = 'published') as episode_count,
      (SELECT COUNT(*)::bigint FROM public.podcast_listens pl WHERE pl.episode_id IN (SELECT pe2.id FROM public.podcast_episodes pe2 WHERE pe2.podcast_id = p.id)) as total_plays,
      CASE
        WHEN p.category IN (SELECT category FROM followed_categories) THEN 3
        WHEN p.category = ANY(SELECT unnest(interests) FROM member_interests) THEN 2
        WHEN p.language = ANY(SELECT unnest(languages) FROM member_interests) THEN 1
        ELSE 0
      END as relevance_score
    FROM public.podcasts p
    LEFT JOIN public.profiles pr ON pr.id = p.creator_id
    WHERE p.status = 'published'
      AND p.creator_id <> auth.uid()
      AND NOT EXISTS (SELECT 1 FROM public.podcast_follows pf WHERE pf.podcast_id = p.id AND pf.user_id = auth.uid())
  )
  SELECT
    s.id, s.title, s.short_description, s.cover_image_url,
    s.category, s.language, s.follower_count, s.episode_count, s.total_plays,
    coalesce(nullif(s.creator_display_name,''), s.creator_full_name, 'Creator'),
    s.creator_avatar_url
  FROM scored s
  WHERE s.relevance_score > 0
  ORDER BY s.relevance_score DESC, s.total_plays DESC
  LIMIT page_limit;
$$;

-- Fix log_profile_view: add 24h dedup and self-view prevention
CREATE OR REPLACE FUNCTION public.log_profile_view(target_profile uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF target_profile = auth.uid() THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profile_views pv
    WHERE pv.profile_id = target_profile AND pv.viewer_id = auth.uid()
      AND pv.viewed_at > now() - interval '24 hours'
  ) THEN
    INSERT INTO public.profile_views (profile_id, viewer_id)
    VALUES (target_profile, auth.uid());
  END IF;
END;
$$;
