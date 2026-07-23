import { useCallback, useEffect, useState } from 'react'
import { Bookmark, CalendarDays, ChevronRight, Headphones, Heart, Sun, Trash2, X } from 'lucide-react'
import { supabase } from './supabase'

type SavedSession = {
  save_id: string; session_id: string; saved_at: string;
  session_title: string; session_category: string | null; session_language: string | null;
  session_starts_at: string; session_status: string; session_type: string | null;
  session_price: number | null; session_cover_url: string | null;
  host_name: string; host_avatar: string | null
}

type SavedHealer = {
  save_id: string; healer_id: string; saved_at: string;
  full_name: string; display_name: string | null; avatar_url: string | null;
  professional_title: string | null; specialties: string[] | null; country: string | null; online: boolean | null
}

type SavedEpisode = {
  save_id: string; episode_id: string; saved_at: string;
  episode_title: string; podcast_id: string; podcast_title: string;
  podcast_cover: string | null; audio_url: string | null;
  audio_duration_seconds: number | null; category: string | null
}

type FollowedPodcast = {
  id: string; created_at: string; podcast_id: string; podcast_title: string;
  podcast_cover: string | null; category: string | null; follower_count: number
}

type FollowedHealer = {
  follower_id: string; healer_id: string; followed_at: string;
  full_name: string; display_name: string | null; avatar_url: string | null;
  professional_title: string | null; specialties: string[] | null; country: string | null; online: boolean | null
}

const initials = (name?: string | null) => (name || 'N').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
const formatDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })

type FavoritesProps = {
  userId: string; onClose: () => void
  onOpenProfile: (id: string) => void; onOpenPodcast: (id?: string) => void
  onOpenFeature: (f: string) => void; onNotice: (t: string) => void
}

export function Favorites({ userId, onClose, onOpenProfile, onOpenPodcast, onOpenFeature, onNotice }: FavoritesProps) {
  const [tab, setTab] = useState<'sessions' | 'healers' | 'podcasts' | 'episodes' | 'following'>('sessions')
  const [sessions, setSessions] = useState<SavedSession[]>([])
  const [healers, setHealers] = useState<SavedHealer[]>([])
  const [episodes, setEpisodes] = useState<SavedEpisode[]>([])
  const [podcasts, setPodcasts] = useState<FollowedPodcast[]>([])
  const [followedHealers, setFollowedHealers] = useState<FollowedHealer[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [sessRes, healRes, epRes, podRes, fhRes] = await Promise.all([
      supabase.rpc('public_get_saved_sessions', { page_limit: 50, page_offset: 0 }),
      supabase.rpc('public_get_saved_healers_list', { page_limit: 50, page_offset: 0 }),
      supabase.from('podcast_episode_saves').select('id,episode_id,created_at,episode_title,podcast_id,podcast_title,podcast_cover,audio_url,audio_duration_seconds,category').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('podcast_follows').select('id,created_at,podcast_id,podcasts!podcast_follows_podcast_id_fkey(id,title,cover_image_url,category,follower_count)').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.rpc('get_followed_healers_list', { page_limit: 50, page_offset: 0 })
    ])
    setSessions(((sessRes.data as any[]) || []).map(s => ({
      save_id: s.save_id, session_id: s.session_id, saved_at: s.saved_at,
      session_title: s.session_title, session_category: s.session_category, session_language: s.session_language,
      session_starts_at: s.session_starts_at, session_status: s.session_status, session_type: s.session_type,
      session_price: s.session_price, session_cover_url: s.session_cover_url,
      host_name: s.host_name, host_avatar: s.host_avatar
    })))
    setHealers(((healRes.data as any[]) || []).map(h => ({
      save_id: h.save_id, healer_id: h.healer_id, saved_at: h.saved_at,
      full_name: h.full_name, display_name: h.display_name, avatar_url: h.avatar_url,
      professional_title: h.professional_title, specialties: h.specialties, country: h.country, online: h.online
    })))
    setEpisodes(((epRes.data as any[]) || []).map(e => ({
      save_id: e.id, episode_id: e.episode_id, saved_at: e.created_at,
      episode_title: e.episode_title, podcast_id: e.podcast_id, podcast_title: e.podcast_title,
      podcast_cover: e.podcast_cover, audio_url: e.audio_url,
      audio_duration_seconds: e.audio_duration_seconds, category: e.category
    })))
    setPodcasts(((podRes.data as any[]) || []).map(pf => ({
      id: pf.id, created_at: pf.created_at, podcast_id: pf.podcast_id,
      podcast_title: pf.podcasts?.title || 'Podcast', podcast_cover: pf.podcasts?.cover_image_url || null,
      category: pf.podcasts?.category || null, follower_count: pf.podcasts?.follower_count || 0
    })))
    setFollowedHealers(((fhRes.data as any[]) || []).map(f => ({
      follower_id: f.follower_id, healer_id: f.healer_id, followed_at: f.followed_at,
      full_name: f.full_name, display_name: f.display_name, avatar_url: f.avatar_url,
      professional_title: f.professional_title, specialties: f.specialties, country: f.country, online: f.online
    })))
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  async function unsaveSession(saveId: string) {
    await supabase.from('saved_sessions').delete().eq('id', saveId)
    setSessions(prev => prev.filter(s => s.save_id !== saveId))
    onNotice('Session removed from saved.')
  }

  async function unsaveHealer(saveId: string) {
    await supabase.from('saved_healers').delete().eq('id', saveId)
    setHealers(prev => prev.filter(h => h.save_id !== saveId))
    onNotice('Healer removed from saved.')
  }

  async function unfollowPodcast(podcastId: string) {
    await supabase.from('podcast_follows').delete().eq('podcast_id', podcastId).eq('user_id', userId)
    setPodcasts(prev => prev.filter(p => p.podcast_id !== podcastId))
    onNotice('Podcast unfollowed.')
  }

  async function unsaveEpisode(saveId: string) {
    await supabase.from('podcast_episode_saves').delete().eq('id', saveId)
    setEpisodes(prev => prev.filter(e => e.save_id !== saveId))
    onNotice('Episode removed from saved.')
  }

  async function unfollowHealer(healerId: string) {
    await supabase.rpc('toggle_follow_healer', { target_healer: healerId })
    setFollowedHealers(prev => prev.filter(h => h.healer_id !== healerId))
    onNotice('Healer unfollowed.')
  }

  const tabs: [typeof tab, string, number][] = [
    ['sessions', 'Saved Sessions', sessions.length],
    ['healers', 'Saved Healers', healers.length],
    ['podcasts', 'Followed Podcasts', podcasts.length],
    ['episodes', 'Saved Episodes', episodes.length],
    ['following', 'Following Healers', followedHealers.length]
  ]

  return (
    <div className="feature-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="directory-window favorites-window">
        <header>
          <div>
            <h2>My Favorites</h2>
            <p>Sessions, healers, podcasts, and episodes you've saved.</p>
          </div>
          <button onClick={onClose}><X /></button>
        </header>
        <div className="favorites-tabs">
          {tabs.map(([id, label, count]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}<span>{count}</span></button>
          ))}
        </div>
        <div className="favorites-content">
          {loading ? <div className="empty-state">Loading...</div> : (
            <>
              {tab === 'sessions' && (sessions.length === 0 ? (
                <div className="empty-state"><CalendarDays /><h3>No saved sessions</h3><p>Save sessions to find them here later.</p></div>
              ) : sessions.map(s => (
                <article className="favorite-row" key={s.save_id}>
                  <div className="favorite-icon sessions"><CalendarDays size={18} /></div>
                  <div className="favorite-info">
                    <b>{s.session_title}</b>
                    <p>{s.session_category || 'Session'}{s.session_language ? ` · ${s.session_language}` : ''} · {s.session_starts_at ? formatDate(s.session_starts_at) : ''}</p>
                    <span>{s.host_name}{s.session_price && s.session_price > 0 ? ` · $${s.session_price}` : ' · Free'}</span>
                  </div>
                  <button className="unsave-btn" onClick={() => unsaveSession(s.save_id)}><Trash2 size={14} /></button>
                </article>
              )))}

              {tab === 'healers' && (healers.length === 0 ? (
                <div className="empty-state"><Heart /><h3>No saved healers</h3><p>Save healer profiles to revisit them here.</p></div>
              ) : healers.map(h => (
                <article className="favorite-row" key={h.save_id}>
                  <button className="favorite-avatar" onClick={() => onOpenProfile(h.healer_id)}>
                    <span className="avatar healer rose">{h.avatar_url ? <img src={h.avatar_url} alt="" loading="lazy" /> : initials(h.display_name || h.full_name)}<i className={h.online ? 'online' : ''} /></span>
                  </button>
                  <div className="favorite-info">
                    <button onClick={() => onOpenProfile(h.healer_id)}>{h.display_name || h.full_name}</button>
                    <p>{h.professional_title || 'Healer'}{h.country ? ` · ${h.country}` : ''}</p>
                    <span>{(h.specialties || []).slice(0, 3).join(', ')}</span>
                  </div>
                  <button className="unsave-btn" onClick={() => unsaveHealer(h.save_id)}><Trash2 size={14} /></button>
                </article>
              )))}

              {tab === 'podcasts' && (podcasts.length === 0 ? (
                <div className="empty-state"><Headphones /><h3>No followed podcasts</h3><p>Follow podcasts to track your favorites.</p></div>
              ) : podcasts.map(p => (
                <article className="favorite-row" key={p.id}>
                  <div className="favorite-icon podcasts"><Headphones size={18} /></div>
                  <div className="favorite-info">
                    <button onClick={() => onOpenPodcast(p.podcast_id)}>{p.podcast_title}</button>
                    <p>{p.category || 'Podcast'} · {p.follower_count} followers</p>
                  </div>
                  <button className="unsave-btn" onClick={() => unfollowPodcast(p.podcast_id)}><Trash2 size={14} /></button>
                </article>
              )))}

              {tab === 'episodes' && (episodes.length === 0 ? (
                <div className="empty-state"><Headphones /><h3>No saved episodes</h3><p>Save episodes to listen later.</p></div>
              ) : episodes.map(e => (
                <article className="favorite-row" key={e.save_id}>
                  <div className="favorite-icon episodes"><Headphones size={18} /></div>
                  <div className="favorite-info">
                    <b>{e.episode_title}</b>
                    <p>{e.podcast_title}{e.category ? ` · ${e.category}` : ''}</p>
                  </div>
                  <button className="unsave-btn" onClick={() => unsaveEpisode(e.save_id)}><Trash2 size={14} /></button>
                </article>
              )))}

              {tab === 'following' && (followedHealers.length === 0 ? (
                <div className="empty-state"><Heart /><h3>Not following anyone</h3><p>Follow healers to see their updates in your feed.</p></div>
              ) : followedHealers.map(h => (
                <article className="favorite-row" key={h.follower_id}>
                  <button className="favorite-avatar" onClick={() => onOpenProfile(h.healer_id)}>
                    <span className="avatar healer rose">{h.avatar_url ? <img src={h.avatar_url} alt="" loading="lazy" /> : initials(h.display_name || h.full_name)}<i className={h.online ? 'online' : ''} /></span>
                  </button>
                  <div className="favorite-info">
                    <button onClick={() => onOpenProfile(h.healer_id)}>{h.display_name || h.full_name}</button>
                    <p>{h.professional_title || 'Healer'}{h.country ? ` · ${h.country}` : ''}</p>
                    <span>Following since {formatDate(h.followed_at)}</span>
                  </div>
                  <button className="unsave-btn" onClick={() => unfollowHealer(h.healer_id)}><Trash2 size={14} /></button>
                </article>
              )))}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
