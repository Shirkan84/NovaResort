import { useEffect, useState, useCallback } from 'react'
import { Bookmark, CalendarDays, CheckCircle2, ChevronRight, Clock3, Heart, Headphones, Pause, Play, Star, Trash2, TrendingUp, UsersRound, Sun, X, Trophy, Flame } from 'lucide-react'
import { supabase } from './supabase'
import './member-dashboard.css'

type MemberStats = {
  sessions_registered: number; sessions_completed: number; sessions_upcoming: number;
  podcasts_followed: number; episodes_saved: number; connections_count: number; healers_followed: number
}

type ContinueListeningItem = {
  episode_id: string; episode_title: string; episode_duration: number;
  position_seconds: number; completion_pct: number; updated_at: string;
  podcast_id: string; podcast_title: string; podcast_cover: string | null; podcast_category: string | null
}

type UpcomingSession = {
  id: string; session_id: string; registration_status: string; registered_at: string;
  session_title: string; session_category: string | null; session_language: string | null;
  session_starts_at: string; session_ends_at: string | null; session_status: string;
  session_type: string | null; session_price: number | null; session_cover_url: string | null;
  host_name: string; host_avatar: string | null; host_id: string
}

type SavedHealer = {
  save_id: string; healer_id: string; saved_at: string;
  full_name: string; display_name: string | null; avatar_url: string | null;
  professional_title: string | null; specialties: string[] | null; country: string | null; online: boolean | null
}

type SavedPodcastEpisode = {
  save_id: string; episode_id: string; saved_at: string;
  episode_title: string; podcast_id: string; podcast_title: string;
  podcast_cover: string | null; audio_url: string | null;
  audio_duration_seconds: number | null; category: string | null
}

type DashboardNotification = {
  id: string; type: string; title: string; body: string | null;
  entity_id: string | null; read_at: string | null; created_at: string
}

type RecommendedPodcast = {
  id: string; title: string; short_description: string | null; cover_image_url: string | null;
  category: string | null; language: string | null; follower_count: number;
  episode_count: number; total_plays: number; creator_name: string; creator_avatar: string | null
}

const initials = (name?: string | null) => (name || 'N').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
const profileInitials = (name?: string | null) => (name || 'N').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
const fmtDuration = (seconds?: number | null) => {
  const v = Math.max(seconds || 0, 0)
  const m = Math.floor(v / 60), s = v % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
const timeUntil = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'now'
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000)
  return h > 24 ? `${Math.floor(h / 24)}d` : h > 0 ? `${h}h ${m}m` : `${m}m`
}
const formatDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

type DashboardProps = {
  userId: string; name: string; onOpenFeature: (f: string) => void
  onOpenProfile: (id: string) => void; onOpenPodcast: (id?: string) => void
  onPlayEpisode: (ep: any) => void; onNotice: (t: string) => void
}

export function MemberDashboard({ userId, name, onOpenFeature, onOpenProfile, onOpenPodcast, onPlayEpisode, onNotice }: DashboardProps) {
  const [stats, setStats] = useState<MemberStats | null>(null)
  const [continueListening, setContinueListening] = useState<ContinueListeningItem[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSession[]>([])
  const [savedHealers, setSavedHealers] = useState<SavedHealer[]>([])
  const [notifications, setNotifications] = useState<DashboardNotification[]>([])
  const [recommended, setRecommended] = useState<RecommendedPodcast[]>([])
  const [podcastFollowingCount, setPodcastFollowingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [statsRes, continueRes, sessionsRes, healersRes, notifRes, recRes, followCountRes] = await Promise.all([
      supabase.rpc('get_member_stats', { target_user: userId }),
      supabase.rpc('get_continue_listening', { page_limit: 5 }),
      supabase.rpc('get_my_sessions', { status_filter: 'registered', page_limit: 4, page_offset: 0 }),
      supabase.rpc('get_followed_healers_list', { page_limit: 6, page_offset: 0 }),
      supabase.from('notifications').select('id,type,title,body,entity_id,read_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
      supabase.rpc('get_recommended_podcasts', { page_limit: 6 }),
      supabase.from('podcast_follows').select('id', { count: 'exact', head: true }).eq('user_id', userId)
    ])
    if (statsRes.data?.[0]) setStats(statsRes.data[0] as MemberStats)
    setContinueListening((continueRes.data as ContinueListeningItem[]) || [])
    setUpcomingSessions(((sessionsRes.data as any[]) || []).map(s => ({
      id: s.id, session_id: s.session_id, registration_status: s.registration_status, registered_at: s.registered_at,
      session_title: s.session_title, session_category: s.session_category, session_language: s.session_language,
      session_starts_at: s.session_starts_at, session_ends_at: s.session_ends_at, session_status: s.session_status,
      session_type: s.session_type, session_price: s.session_price, session_cover_url: s.session_cover_url,
      host_name: s.host_name, host_avatar: s.host_avatar, host_id: s.host_id
    })))
    setSavedHealers((healersRes.data as SavedHealer[]) || [])
    setNotifications((notifRes.data as DashboardNotification[]) || [])
    setRecommended((recRes.data as RecommendedPodcast[]) || [])
    setPodcastFollowingCount(followCountRes.count || 0)
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const unreadCount = notifications.filter(n => !n.read_at).length
  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }

  async function resumeEpisode(item: ContinueListeningItem) {
    setPlayingId(playingId === item.episode_id ? null : item.episode_id)
    const { data } = await supabase.from('podcast_episodes')
      .select('id,podcast_id,title,description,episode_number,season_number,audio_path,audio_url,audio_duration_seconds,cover_image_url,visibility,status,published_at,tags,content_warning,explicit_content,show_notes')
      .eq('id', item.episode_id)
      .single()
    if (data) {
      let audioUrl = data.audio_url
      if (data.audio_path && !audioUrl) {
        const { data: signed } = await supabase.storage.from('podcast-audio').createSignedUrl(data.audio_path, 31536000)
        audioUrl = signed?.signedUrl || null
      }
      onPlayEpisode({
        ...data,
        audio_url: audioUrl,
        podcast_title: item.podcast_title,
        creator_name: '',
        listen_position_seconds: item.position_seconds,
        saved: false
      })
    }
  }

  async function cancelRegistration(sessionId: string) {
    if (!confirm('Cancel this registration?')) return
    const { error } = await supabase.rpc('cancel_session_registration', { target_session: sessionId })
    if (error) onNotice(error.message)
    else { onNotice('Registration cancelled.'); load() }
  }

  async function unfollowHealer(healerId: string) {
    if (!confirm('Unfollow this healer?')) return
    const { error } = await supabase.rpc('toggle_follow_healer', { target_healer: healerId })
    if (error) onNotice(error.message)
    else { onNotice('Healer unfollowed.'); load() }
  }

  async function markNotificationRead(id: string) {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
  }

  if (loading) return <div className="member-dashboard"><div className="dashboard-loading">Loading your dashboard...</div></div>

  return (
    <div className="member-dashboard">
      {/* Welcome Section */}
      <section className="dashboard-welcome">
        <div className="welcome-text">
          <p className="eyebrow">YOUR WELLNESS JOURNEY</p>
          <h1>{greeting()}, {name.split(' ')[0] || 'there'}</h1>
          <p className="welcome-sub">Continue where you left off, or discover something new today.</p>
        </div>
        <div className="welcome-actions">
          <button className="primary" onClick={() => onOpenFeature('sessions')}><CalendarDays size={16} /> Browse Sessions</button>
          <button className="secondary-cta" onClick={() => onOpenPodcast()}><Headphones size={16} /> Podcasts</button>
          <button className="secondary-cta" onClick={() => onOpenFeature('wellness-journey')}><Trophy size={16} /> Wellness Journey</button>
        </div>
      </section>

      {/* Stats Bar */}
      {stats && (
        <section className="dashboard-stats">
          <button onClick={() => onOpenFeature('sessions')}>
            <span className="stat-icon sessions"><CalendarDays size={18} /></span>
            <div><b>{stats.sessions_upcoming}</b><small>Upcoming Sessions</small></div>
          </button>
          <button onClick={() => onOpenFeature('sessions')}>
            <span className="stat-icon completed"><CheckCircle2 size={18} /></span>
            <div><b>{stats.sessions_completed}</b><small>Completed</small></div>
          </button>
          <button onClick={() => onOpenPodcast()}>
            <span className="stat-icon podcasts"><Headphones size={18} /></span>
            <div><b>{podcastFollowingCount}</b><small>Podcasts Followed</small></div>
          </button>
          <button onClick={() => onOpenFeature('healers')}>
            <span className="stat-icon healers"><Heart size={18} /></span>
            <div><b>{stats.healers_followed}</b><small>Healers Following</small></div>
          </button>
          <button onClick={() => onOpenFeature('connections')}>
            <span className="stat-icon connections"><UsersRound size={18} /></span>
            <div><b>{stats.connections_count}</b><small>Connections</small></div>
          </button>
        </section>
      )}

      <div className="dashboard-grid">
        <div className="dashboard-main-col">
          {/* Continue Listening */}
          {continueListening.length > 0 && (
            <section className="dashboard-section">
              <div className="section-head">
                <div><h2>Continue Listening</h2><p>Pick up where you left off</p></div>
              </div>
              <div className="continue-listening-grid">
                {continueListening.map(item => (
                  <article className="continue-card" key={item.episode_id}>
                    <button className="continue-play" onClick={() => resumeEpisode(item)}>
                      {playingId === item.episode_id ? <Pause size={20} /> : <Play size={20} />}
                    </button>
                    <div className="continue-info">
                      <b>{item.episode_title}</b>
                      <span>{item.podcast_title}</span>
                      <div className="continue-progress">
                        <div className="progress-bar"><div className="progress-fill" style={{ width: `${item.completion_pct}%` }} /></div>
                        <small>{fmtDuration(item.position_seconds)} / {fmtDuration(item.episode_duration)}</small>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Upcoming Sessions */}
          <section className="dashboard-section">
            <div className="section-head">
              <div><h2>My Sessions</h2><p>Sessions you're registered for</p></div>
              <button onClick={() => onOpenFeature('sessions')}>View all <ChevronRight size={14} /></button>
            </div>
            {upcomingSessions.length === 0 ? (
              <div className="dashboard-empty">
                <CalendarDays size={28} />
                <h3>No registered sessions</h3>
                <p>Browse upcoming sessions and register for the ones that interest you.</p>
                <button className="primary" onClick={() => onOpenFeature('sessions')}><CalendarDays size={15} /> Browse Sessions</button>
              </div>
            ) : (
              <div className="sessions-list">
                {upcomingSessions.map(s => {
                  const isLive = new Date(s.session_starts_at) <= new Date()
                  return (
                    <article className="session-list-item" key={s.id}>
                      <div className="session-date-box">
                        <b>{formatDate(s.session_starts_at)}</b>
                        <span>{formatTime(s.session_starts_at)}</span>
                      </div>
                      <div className="session-list-info">
                        <div className="session-list-header">
                          <h3>{s.session_title}</h3>
                          {isLive && <span className="live-badge-sm">LIVE</span>}
                        </div>
                        <p>{s.host_name}{s.session_category ? ` · ${s.session_category}` : ''}{s.session_type ? ` · ${s.session_type}` : ''}</p>
                        <div className="session-list-meta">
                          <span><Clock3 size={12} /> {timeUntil(s.session_starts_at)}</span>
                          {s.session_language && <span><Sun size={12} /> {s.session_language}</span>}
                          <span>{s.session_price && s.session_price > 0 ? `$${s.session_price}` : 'Free'}</span>
                        </div>
                      </div>
                      <div className="session-list-actions">
                        <button onClick={() => cancelRegistration(s.session_id)} className="cancel-btn">Cancel</button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {/* Recommended Podcasts */}
          {recommended.length > 0 && (
            <section className="dashboard-section">
              <div className="section-head">
                <div><h2>Recommended for You</h2><p>Based on your interests and activity</p></div>
                <button onClick={() => onOpenPodcast()}>Browse all <ChevronRight size={14} /></button>
              </div>
              <div className="recommended-grid">
                {recommended.map(p => (
                  <article className="recommended-card" key={p.id}>
                    <div className="recommended-cover">
                      {p.cover_image_url ? <img src={p.cover_image_url} alt="" loading="lazy" /> : <Headphones size={24} />}
                    </div>
                    <div className="recommended-info">
                      <b>{p.title}</b>
                      <span>{p.category || 'Podcast'}{p.language ? ` · ${p.language}` : ''}</span>
                      <p>{p.short_description || 'A podcast for your wellness journey.'}</p>
                      <div className="recommended-meta">
                        <span>{p.follower_count} followers</span>
                        <span>{p.total_plays} plays</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="dashboard-side-col">
          {/* Followed Healers */}
          <section className="dashboard-panel">
            <div className="panel-head">
              <h3>Followed Healers</h3>
              <button onClick={() => onOpenFeature('healers')}>View all</button>
            </div>
            {savedHealers.length === 0 ? (
              <p className="panel-empty">You haven't followed any healers yet.</p>
            ) : (
              <div className="healer-mini-list">
                {savedHealers.map(h => (
                  <article className="healer-mini" key={h.save_id}>
                    <button className="healer-mini-avatar" onClick={() => onOpenProfile(h.healer_id)}>
                      <span className="avatar healer rose">
                        {h.avatar_url ? <img src={h.avatar_url} alt="" loading="lazy" /> : initials(h.display_name || h.full_name)}
                        <i className={h.online ? 'online' : ''} />
                      </span>
                    </button>
                    <div className="healer-mini-info">
                      <button onClick={() => onOpenProfile(h.healer_id)}>{h.display_name || h.full_name}</button>
                      <span>{h.professional_title || 'Healer'}{h.country ? ` · ${h.country}` : ''}</span>
                    </div>
                    <button className="unfollow-btn" onClick={() => unfollowHealer(h.healer_id)} title="Unfollow">
                      <X size={14} />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Recent Notifications */}
          <section className="dashboard-panel">
            <div className="panel-head">
              <h3>Notifications {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}</h3>
              <button onClick={() => onOpenFeature('notifications')}>View all</button>
            </div>
            {notifications.length === 0 ? (
              <p className="panel-empty">No notifications yet.</p>
            ) : (
              <div className="notif-list">
                {notifications.map(n => (
                  <article className={`notif-mini ${n.read_at ? '' : 'unread'}`} key={n.id} onClick={() => markNotificationRead(n.id)}>
                    <div className="notif-mini-dot" />
                    <div>
                      <b>{n.title}</b>
                      <p>{n.body || 'New update'}</p>
                      <small>{new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
