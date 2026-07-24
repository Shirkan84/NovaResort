import { useCallback, useEffect, useState } from 'react'
import {
  X, MapPin, Globe, Star, Heart, Users, CalendarDays, MessageCircleMore,
  BadgeCheck, Clock, ChevronRight, Link2, Loader2, ExternalLink, Share2, Bookmark, Flag
} from 'lucide-react'
import { supabase } from './supabase'
import { ReportModal } from './ShareReportModals'
import './healer-profile.css'

type HealerProfileData = {
  id: string
  full_name: string
  display_name: string | null
  avatar_url: string | null
  cover_image_url: string | null
  about: string | null
  professional_title: string | null
  professional_verification_status: string | null
  specialties: string[] | null
  languages: string[] | null
  country: string | null
  city: string | null
  location: string | null
  availability: string | null
  years_experience: number | null
  online: boolean | null
  online_available: boolean | null
  in_person_available: boolean | null
  certifications: string[] | null
  session_price: number | null
  professional_website: string | null
  linkedin_url: string | null
  social_instagram_url: string | null
  social_facebook_url: string | null
  social_youtube_url: string | null
}

type Review = {
  id: string
  rating: number
  title: string | null
  content: string | null
  created_at: string
  reviewer_name: string
  reviewer_avatar: string | null
  total_count: number
}

type Session = {
  id: string
  title: string
  category: string
  language: string
  starts_at: string
  ends_at: string
  session_type: string
  capacity: number
  status: string
  price: number
  cover_image_url: string | null
}

type Podcast = {
  id: string
  title: string
  short_description: string | null
  cover_image_url: string | null
  category: string | null
  follower_count: number
  episode_count: number
  total_plays: number
}

type Stats = {
  follower_count: number
  review_count: number
  avg_rating: number | null
  profile_view_count: number
  session_count: number
  total_registrations: number
}

type Tab = 'about' | 'sessions' | 'reviews' | 'podcasts'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="hp-stars">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={size}
          fill={i <= rating ? '#dca15d' : 'none'}
          stroke={i <= rating ? '#dca15d' : '#ccc'}
        />
      ))}
    </div>
  )
}

export function HealerProfile({
  healerId,
  currentUserId,
  onClose,
  onOpenSessions,
  onOpenPodcast,
  onMessage
}: {
  healerId: string
  currentUserId: string
  onClose: () => void
  onOpenSessions: () => void
  onOpenPodcast: (id: string) => void
  onMessage: (healer: { id: string; full_name: string; display_name: string | null; avatar_url: string | null; profile_type?: string; online?: boolean | null }) => void
}) {
  const [profile, setProfile] = useState<HealerProfileData | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [podcasts, setPodcasts] = useState<Podcast[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('about')
  const [isFollowing, setIsFollowing] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reviewPage, setReviewPage] = useState(0)
  const [hasMoreReviews, setHasMoreReviews] = useState(true)
  const [loadingReviews, setLoadingReviews] = useState(false)
  const [showReport, setShowReport] = useState(false)

  const isOwn = currentUserId === healerId

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [profileRes, statsRes] = await Promise.all([
        supabase.from('profiles').select(`
          id, full_name, display_name, avatar_url, cover_image_url, about,
          professional_title, professional_verification_status, specialties,
          languages, country, city, location, availability, years_experience,
          online, online_available, in_person_available, certifications,
          session_price, professional_website, linkedin_url,
          social_instagram_url, social_facebook_url, social_youtube_url
        `).eq('id', healerId).single(),
        supabase.rpc('get_healer_dashboard_stats', { target_healer: healerId }).single()
      ])

      if (profileRes.error) throw profileRes.error
      setProfile(profileRes.data as HealerProfileData)
      setStats(statsRes.data as Stats)

      // Check follow/save status
      if (!isOwn) {
        const [followRes, saveRes] = await Promise.all([
          supabase.rpc('is_following_healer', { target_healer: healerId }),
          supabase.rpc('is_saved_healer', { target_healer: healerId })
        ])
        setIsFollowing(followRes.data ?? false)
        setIsSaved(saveRes.data ?? false)
      }

      // Log profile view
      if (!isOwn) {
        supabase.rpc('log_profile_view', { target_profile: healerId }).then(() => {})
      }

      // Load sessions
      const { data: sessionsData } = await supabase
        .from('sessions')
        .select('id, title, category, language, starts_at, ends_at, session_type, capacity, status, price, cover_image_url')
        .eq('host_id', healerId)
        .in('status', ['published', 'registration_closed'])
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(6)
      setSessions((sessionsData as Session[]) || [])

      // Load podcasts
      const { data: podcastsData } = await supabase
        .from('podcasts')
        .select('id, title, short_description, cover_image_url, category, follower_count, episode_count, total_plays')
        .eq('creator_id', healerId)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(6)
      setPodcasts((podcastsData as Podcast[]) || [])

      // Load initial reviews
      loadReviews(0)
    } catch (e: any) {
      setError(e.message || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [healerId, isOwn])

  const loadReviews = useCallback(async (page: number) => {
    setLoadingReviews(true)
    try {
      const { data } = await supabase.rpc('get_healer_reviews', {
        target_healer: healerId,
        page_limit: 5,
        page_offset: page * 5
      })
      const rows = (data as Review[]) || []
      if (page === 0) {
        setReviews(rows)
      } else {
        setReviews(prev => [...prev, ...rows])
      }
      setHasMoreReviews(rows.length === 5)
    } catch {
      // ignore
    } finally {
      setLoadingReviews(false)
    }
  }, [healerId])

  useEffect(() => { loadProfile() }, [loadProfile])

  const toggleFollow = async () => {
    const { data } = await supabase.rpc('toggle_follow_healer', { target_healer: healerId })
    setIsFollowing(data ?? false)
    setStats(prev => prev ? { ...prev, follower_count: prev.follower_count + (data ? 1 : -1) } : prev)
    if(data) supabase.rpc('record_community_action', {p_action_type: 'follow', p_entity_type: 'healer', p_entity_id: healerId}).then(()=>{})
  }

  const toggleSave = async () => {
    const { data } = await supabase.rpc('toggle_save_healer', { target_healer: healerId })
    setIsSaved(data ?? false)
    if(data) supabase.rpc('record_community_action', {p_action_type: 'save_healer', p_entity_type: 'healer', p_entity_id: healerId}).then(()=>{})
  }

  const shareProfile = () => {
    const url = `${window.location.origin}${window.location.pathname}#/profile/${healerId}`
    if (navigator.share) {
      navigator.share({ title: profile?.display_name || profile?.full_name, url })
    } else {
      navigator.clipboard.writeText(url)
    }
  }

  if (loading) {
    return (
      <div className="feature-overlay">
        <div className="hp-window">
          <div className="hp-loading"><Loader2 size={24} className="spin" /><span>Loading profile...</span></div>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="feature-overlay">
        <div className="hp-window">
          <div className="hp-error">{error || 'Profile not found'}<button onClick={onClose}>Close</button></div>
        </div>
      </div>
    )
  }

  const displayName = profile.display_name || profile.full_name || 'Healer'
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const locationText = profile.location || [profile.city, profile.country].filter(Boolean).join(', ')
  const upcomingSessions = sessions.filter(s => new Date(s.starts_at).getTime() > Date.now())

  return (
    <div className="feature-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="hp-window">
        {/* Cover */}
        <div className="hp-cover">
          {profile.cover_image_url ? (
            <img src={profile.cover_image_url} alt="" />
          ) : (
            <div className="hp-cover-placeholder" />
          )}
          <button className="hp-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Profile Header */}
        <div className="hp-header">
          <div className="hp-avatar">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} />
            ) : (
              <span>{initials}</span>
            )}
            {profile.online && <i className="online" />}
          </div>
          <div className="hp-header-info">
            <div className="hp-name-row">
              <h1>{displayName}</h1>
              {profile.professional_verification_status === 'approved' && (
                <span className="hp-verified"><BadgeCheck size={16} /> Verified Professional</span>
              )}
            </div>
            {profile.professional_title && <p className="hp-title">{profile.professional_title}</p>}
            <div className="hp-meta">
              {locationText && <span><MapPin size={13} /> {locationText}</span>}
              {profile.years_experience && <span><Clock size={13} /> {profile.years_experience} years exp.</span>}
              {profile.online_available && <span><Globe size={13} /> Online</span>}
              {profile.in_person_available && <span><MapPin size={13} /> In-person</span>}
            </div>
          </div>
          <div className="hp-header-actions">
            {!isOwn && (
              <>
                <button
                  className={`hp-btn ${isFollowing ? 'hp-btn-active' : 'hp-btn-primary'}`}
                  onClick={toggleFollow}
                >
                  <Heart size={14} fill={isFollowing ? 'currentColor' : 'none'} />
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
                <button className="hp-btn hp-btn-outline" onClick={() => onMessage(profile)}>
                  <MessageCircleMore size={14} /> Message
                </button>
              </>
            )}
            <button className="hp-btn hp-btn-outline" onClick={toggleSave}>
              <Bookmark size={14} fill={isSaved ? 'currentColor' : 'none'} />
            </button>
            <button className="hp-btn hp-btn-outline" onClick={shareProfile}>
              <Share2 size={14} />
            </button>
            {!isOwn && <button className="hp-btn hp-btn-outline" onClick={() => setShowReport(true)} title="Report profile">
              <Flag size={14} />
            </button>}
          </div>
        </div>

        {/* Stats Bar */}
        <div className="hp-stats-bar">
          <div className="hp-stat">
            <b>{stats?.follower_count || 0}</b>
            <span>Followers</span>
          </div>
          <div className="hp-stat">
            <b>{stats?.avg_rating ? stats.avg_rating.toFixed(1) : '-'}</b>
            <span>Rating ({stats?.review_count || 0})</span>
          </div>
          <div className="hp-stat">
            <b>{stats?.session_count || 0}</b>
            <span>Sessions</span>
          </div>
          <div className="hp-stat">
            <b>{podcasts.length}</b>
            <span>Podcasts</span>
          </div>
        </div>

        {/* Tabs */}
        <nav className="hp-tabs">
          {(['about', 'sessions', 'reviews', 'podcasts'] as Tab[]).map(t => (
            <button key={t} className={activeTab === t ? 'active' : ''} onClick={() => setActiveTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>

        {/* Tab Content */}
        <div className="hp-body">
          {activeTab === 'about' && (
            <div className="hp-about">
              {profile.about && (
                <section className="hp-section">
                  <h3>About</h3>
                  <p>{profile.about}</p>
                </section>
              )}

              {profile.specialties && profile.specialties.length > 0 && (
                <section className="hp-section">
                  <h3>Specialties</h3>
                  <div className="hp-tags">
                    {profile.specialties.map(s => <span key={s}>{s}</span>)}
                  </div>
                </section>
              )}

              {profile.languages && profile.languages.length > 0 && (
                <section className="hp-section">
                  <h3>Languages</h3>
                  <div className="hp-tags">
                    {profile.languages.map(l => <span key={l}>{l}</span>)}
                  </div>
                </section>
              )}

              {profile.certifications && profile.certifications.length > 0 && (
                <section className="hp-section">
                  <h3>Certifications</h3>
                  <ul className="hp-list">
                    {profile.certifications.map(c => <li key={c}>{c}</li>)}
                  </ul>
                </section>
              )}

              {profile.availability && (
                <section className="hp-section">
                  <h3>Availability</h3>
                  <p>{profile.availability}</p>
                </section>
              )}

              {profile.session_price !== null && profile.session_price > 0 && (
                <section className="hp-section">
                  <h3>Session Price</h3>
                  <p>${profile.session_price}</p>
                </section>
              )}

              <section className="hp-section">
                <h3>Contact & Social</h3>
                <div className="hp-links">
                  {profile.professional_website && (
                    <a href={profile.professional_website} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={13} /> Website
                    </a>
                  )}
                  {profile.linkedin_url && (
                    <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer">
                      <Link2 size={13} /> LinkedIn
                    </a>
                  )}
                  {profile.social_instagram_url && (
                    <a href={profile.social_instagram_url} target="_blank" rel="noopener noreferrer">
                      <Globe size={13} /> Instagram
                    </a>
                  )}
                  {profile.social_facebook_url && (
                    <a href={profile.social_facebook_url} target="_blank" rel="noopener noreferrer">
                      <Globe size={13} /> Facebook
                    </a>
                  )}
                  {profile.social_youtube_url && (
                    <a href={profile.social_youtube_url} target="_blank" rel="noopener noreferrer">
                      <Globe size={13} /> YouTube
                    </a>
                  )}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="hp-sessions">
              {upcomingSessions.length === 0 ? (
                <div className="hp-empty">
                  <CalendarDays size={28} />
                  <p>No upcoming sessions</p>
                </div>
              ) : (
                <div className="hp-session-list">
                  {upcomingSessions.map(s => (
                    <article key={s.id} className="hp-session-card">
                      <div className="hp-session-time">
                        <span className="hp-session-day">{new Date(s.starts_at).toLocaleDateString([], { weekday: 'short' })}</span>
                        <span className="hp-session-date">{new Date(s.starts_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                        <span className="hp-session-clock">{formatTime(s.starts_at)}</span>
                      </div>
                      <div className="hp-session-info">
                        <h4>{s.title}</h4>
                        <div className="hp-session-meta">
                          <span>{s.category}</span>
                          <span>·</span>
                          <span>{s.language}</span>
                          <span>·</span>
                          <span>{s.session_type}</span>
                        </div>
                      </div>
                      <div className="hp-session-price">
                        {s.price > 0 ? `$${s.price}` : 'Free'}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {upcomingSessions.length > 0 && (
                <button className="hp-view-all" onClick={onOpenSessions}>
                  View all sessions <ChevronRight size={14} />
                </button>
              )}
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="hp-reviews">
              {reviews.length === 0 ? (
                <div className="hp-empty">
                  <Star size={28} />
                  <p>No reviews yet</p>
                </div>
              ) : (
                <>
                  <div className="hp-review-summary">
                    <div className="hp-review-avg">
                      <b>{stats?.avg_rating?.toFixed(1) || '-'}</b>
                      <StarRating rating={stats?.avg_rating || 0} size={18} />
                      <span>{stats?.review_count || 0} reviews</span>
                    </div>
                  </div>
                  <div className="hp-review-list">
                    {reviews.map(r => (
                      <article key={r.id} className="hp-review-card">
                        <div className="hp-review-header">
                          <div className="hp-review-avatar">
                            {r.reviewer_avatar ? (
                              <img src={r.reviewer_avatar} alt="" />
                            ) : (
                              <span>{r.reviewer_name[0]}</span>
                            )}
                          </div>
                          <div>
                            <b>{r.reviewer_name}</b>
                            <span>{timeAgo(r.created_at)}</span>
                          </div>
                          <StarRating rating={r.rating} />
                        </div>
                        {r.title && <h4>{r.title}</h4>}
                        {r.content && <p>{r.content}</p>}
                      </article>
                    ))}
                  </div>
                  {hasMoreReviews && (
                    <button
                      className="hp-load-more"
                      onClick={() => { setReviewPage(p => p + 1); loadReviews(reviewPage + 1) }}
                      disabled={loadingReviews}
                    >
                      {loadingReviews ? 'Loading...' : 'Load more reviews'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'podcasts' && (
            <div className="hp-podcasts">
              {podcasts.length === 0 ? (
                <div className="hp-empty">
                  <Globe size={28} />
                  <p>No podcasts yet</p>
                </div>
              ) : (
                <div className="hp-podcast-list">
                  {podcasts.map(p => (
                    <article key={p.id} className="hp-podcast-card" onClick={() => onOpenPodcast(p.id)}>
                      <div className="hp-podcast-cover">
                        {p.cover_image_url ? (
                          <img src={p.cover_image_url} alt={p.title} />
                        ) : (
                          <Globe size={24} />
                        )}
                      </div>
                      <div className="hp-podcast-info">
                        <h4>{p.title}</h4>
                        {p.short_description && <p>{p.short_description}</p>}
                        <div className="hp-podcast-stats">
                          <span>{p.total_plays} plays</span>
                          <span>·</span>
                          <span>{p.follower_count} followers</span>
                          <span>·</span>
                          <span>{p.episode_count} episodes</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {showReport && <ReportModal title="Profile" onReport={async(reason,details)=>{await supabase.rpc('report_profile',{p_profile_id:healerId,reason,details})}} onClose={() => setShowReport(false)} />}
    </div>
  )
}
