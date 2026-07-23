import { useState, useEffect } from 'react'
import { CalendarDays, Compass, Clock3, Headphones, UsersRound, Sun, Mic, Video, MessageCircleMore, ChevronRight, Leaf, MessageSquareWarning, UserPlus, CircleUserRound, LockKeyhole, Send, MoreHorizontal } from 'lucide-react'
import { supabase } from './supabase'
import { PopularPodcastsStrip } from './PodcastPlatform'
import { getFeaturedHealers } from './services/healers'
import type { DbRoom } from './CommunityFeatures'
import type { PlayerEpisode } from './PodcastPlatform'
import './homepage.css'

type LiveProfile = { id: string; full_name: string; display_name: string | null; avatar_url: string | null; profile_type: string; professional_title?: string | null; professional_verification_status?: string | null; specialties: string[] | null; interests?: string[] | null; about: string | null; country?: string | null; online: boolean | null; visibility?: string | null; next_session?: NextSession | null }
type RecentMessage = { id: string; body: string; created_at: string; profiles?: { full_name: string; avatar_url: string | null } | null; rooms?: { id: string; name: string } | null }
type Friendship = { id: string; requester_id: string; addressee_id: string; status: string }
type NextSession = { id: string; title: string; starts_at: string; host_id: string }
type SessionRow = { id: string; host_id: string; title: string; description: string | null; category: string | null; language: string | null; starts_at: string; ends_at: string | null; capacity: number | null; session_type: string | null; price: number | null; cover_image_url: string | null; profiles?: { display_name: string | null; full_name: string | null; avatar_url: string | null; profile_type: string; specialties: string[] | null } | null }
type RecentItem = { id: string; type: 'session' | 'podcast' | 'healer'; title: string; subtitle: string; onClick: () => void }

const profileName = (p: LiveProfile) => p.display_name || p.full_name || 'Nova member'
const profileInitials = (name?: string | null) => (name || 'N').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
const roleLabel = (p: LiveProfile) => p.profile_type === 'healer' ? (p.professional_title || 'Healer') : p.profile_type === 'admin' ? 'Administrator' : 'Member'
const relationshipFor = (id: string, rows: Friendship[]) => rows.find(row => row.requester_id === id || row.addressee_id === id)

const ROOMS = [
  { title: 'Heart to Heart', description: 'A gentle space for honest conversations and mutual support.', people: 28, color: 'peach', icon: '♡', tags: ['Open', 'Moderated'] },
  { title: 'Mindful Moments', description: 'Pause, breathe, and return to yourself with the community.', people: 16, color: 'sage', icon: '✦', tags: ['Open', 'Guided'] },
  { title: 'Self Growth', description: 'Celebrate progress, share intentions, and grow together.', people: 21, color: 'lavender', icon: '⌁', tags: ['Open', 'Community'] },
]

const CATEGORIES = [
  { name: 'Meditation', icon: '🧘', color: '#e7f0e9' },
  { name: 'Stress', icon: '🌿', color: '#e8f0f3' },
  { name: 'Sleep', icon: '🌙', color: '#eeeaf6' },
  { name: 'Relationships', icon: '💛', color: '#f7eee0' },
  { name: 'Mindfulness', icon: '🍃', color: '#e7f0e9' },
  { name: 'Parenting', icon: '👨\u200d👩\u200d👧', color: '#e8f0f3' },
  { name: 'Nutrition', icon: '🥗', color: '#eaf4ec' },
  { name: 'Yoga', icon: '🧘\u200d♀', color: '#eeeaf6' },
  { name: 'Breathwork', icon: '🌬\ufe0f', color: '#f7eee0' },
]

export function Homepage({ userId, name, canCreateContent, liveHealers, healersLoading, healersError, recentMessages, friendships, dbRooms, showAllRooms, onOpenFeature, onOpenRoom, onOpenProfile, onOpenHealers, onOpenPodcast, onPlayEpisode, onConnect, onMessage, onNotice, onToggleRooms }: {
  userId: string; name: string; canCreateContent: boolean
  liveHealers: LiveProfile[]; healersLoading: boolean; healersError: string
  recentMessages: RecentMessage[]; friendships: Friendship[]; dbRooms: DbRoom[]
  showAllRooms: boolean; onToggleRooms: () => void
  onOpenFeature: (f: string) => void; onOpenRoom: (r: DbRoom) => void; onOpenProfile: (id: string) => void
  onOpenHealers: () => void; onOpenPodcast: (id?: string) => void; onPlayEpisode: (ep: PlayerEpisode) => void
  onConnect: (p: LiveProfile) => void; onMessage: (p: LiveProfile) => void; onNotice: (t: string) => void
}) {
  const [upcomingSessions, setUpcomingSessions] = useState<SessionRow[]>([])
  const [podcastCount, setPodcastCount] = useState(0)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [recentContent, setRecentContent] = useState<RecentItem[]>([])

  useEffect(() => {
    let live = true
    async function load() {
      setSessionsLoading(true)
      const [sessionsResult, countResult] = await Promise.all([
        supabase.from('sessions')
          .select('id,title,description,category,language,starts_at,ends_at,capacity,session_type,price,cover_image_url,host_id,profiles!sessions_host_id_fkey(display_name,full_name,avatar_url,profile_type,specialties)')
          .gte('starts_at', new Date().toISOString())
          .in('status', ['published', 'live', 'registration_closed'])
          .order('starts_at', { ascending: true })
          .limit(6),
        supabase.from('podcast_episodes')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'published')
          .is('deleted_at', null)
      ])
      if (!live) return
      setUpcomingSessions(((sessionsResult.data || []) as unknown as SessionRow[]))
      setPodcastCount(countResult.count || 0)
      setSessionsLoading(false)

      const [recentSessions, recentPodcasts] = await Promise.all([
        supabase.from('sessions').select('id,title,category,language,starts_at,cover_image_url,host_id').gte('starts_at', new Date().toISOString()).in('status', ['published', 'live', 'registration_closed']).order('created_at', { ascending: false }).limit(3),
        supabase.from('podcasts').select('id,title,category,language,cover_image_url,creator_id').eq('status', 'published').order('created_at', { ascending: false }).limit(3)
      ])
      if (!live) return
      const items: RecentItem[] = []
      for (const s of ((recentSessions.data || []) as any[])) {
        items.push({ id: `s-${s.id}`, type: 'session', title: s.title, subtitle: `${s.category || 'Session'} · ${new Date(s.starts_at).toLocaleDateString([], { dateStyle: 'medium' })}`, onClick: () => onOpenFeature('sessions') })
      }
      for (const p of ((recentPodcasts.data || []) as any[])) {
        items.push({ id: `p-${p.id}`, type: 'podcast', title: p.title, subtitle: `${p.category || 'Podcast'} · ${p.language || ''}`, onClick: () => onOpenPodcast(p.id) })
      }
      for (const h of liveHealers.slice(0, 3)) {
        items.push({ id: `h-${h.id}`, type: 'healer', title: profileName(h), subtitle: roleLabel(h), onClick: () => onOpenProfile(h.id) })
      }
      setRecentContent(items.slice(0, 6))
    }
    load()
    return () => { live = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>
    {/* Hero */}
    <section className="hero-section">
      <p className="eyebrow">WELCOME TO NOVA RESORT</p>
      <h1>Discover trusted wellness professionals, join live healing sessions, listen to inspiring podcasts, and become part of a growing wellness community.</h1>
      <p className="hero-subtitle">A caring space where members and wellness professionals connect, talk, heal, grow, and support one another. Therapists, healers, and coaches can also host online sessions and workshops for the community.</p>
      <div className="hero-actions">
        <button className="primary" onClick={() => onOpenFeature('discover')}><Compass size={17}/> Explore Healers</button>
        <button className="secondary-cta" onClick={() => onOpenFeature('sessions')}><CalendarDays size={17}/> Upcoming Sessions</button>
        {canCreateContent && <button className="healer-create-action" onClick={() => onOpenPodcast('manage')}><Mic size={14}/> Podcast Studio</button>}
      </div>
    </section>

    <div className="layout">
      <div className="main-col">
        {/* Featured Healers */}
        <section className="healer-section">
          <div className="section-head"><div><button className="section-title-link" onClick={onOpenHealers}><h2>Featured Healers</h2></button><p>Connect with verified wellness professionals, explore their profiles, and discover their upcoming sessions.</p></div><button onClick={onOpenHealers}>View all healers <ChevronRight size={16}/></button></div>
          {healersLoading ? <div className="healer-strip">{[1, 2, 3].map(i => <div key={i} className="healer-card wide skeleton"/>)}</div>
            : healersError ? <div className="inline-empty">{healersError}</div>
              : liveHealers.length === 0 ? <div className="inline-empty">No verified healers are available yet.</div>
                : <div className="healer-strip" role="list" aria-label="Featured healers">{liveHealers.slice(0, 6).map(h => {
                  const relation = relationshipFor(h.id, friendships)
                  const connectLabel = relation?.status === 'accepted' ? 'Connected' : relation?.status === 'pending' && relation.requester_id === userId ? 'Request sent' : relation?.status === 'pending' ? 'Accept request' : 'Connect'
                  return <article className="healer-card wide" role="listitem" key={h.id}>
                    <button className="healer-photo-button" onClick={() => onOpenProfile(h.id)} aria-label={`View ${profileName(h)} profile`}><span className="avatar healer rose">{h.avatar_url ? <img src={h.avatar_url} alt={`${profileName(h)} profile photo`} loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} /> : profileInitials(profileName(h))}<i className={h.online ? 'online' : ''} /><span className="sr-only">{h.online ? 'Online now' : 'Offline'}</span></span></button>
                    <div className="healer-info">
                      <button className="healer-name" onClick={() => onOpenProfile(h.id)}>{profileName(h)}</button>
                      <p>{roleLabel(h)}{h.country ? ` · ${h.country}` : ''}</p>
                      <div className="healer-tags">{(h.specialties || h.interests || ['Emotional wellness']).slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div>
                      {h.next_session && <button className="next-session" onClick={() => onOpenFeature('sessions')}><CalendarDays size={13} /><span>{h.next_session.title}</span><time>{new Date(h.next_session.starts_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time></button>}
                      <div className="healer-actions"><button onClick={() => onOpenProfile(h.id)}>View profile</button><button onClick={() => onConnect(h)} disabled={relation?.status === 'accepted'}><UserPlus size={13} />{connectLabel}</button><button onClick={() => onMessage(h)}><MessageCircleMore size={13} /> Message</button></div>
                    </div>
                  </article>
                })}</div>}
        </section>

        {/* Upcoming Sessions */}
        <section className="homepage-sessions">
          <div className="section-head"><div><h2>Upcoming Sessions</h2><p>Join live workshops, healing sessions, and community events.</p></div><button onClick={() => onOpenFeature('sessions')}>View all sessions <ChevronRight size={16}/></button></div>
          {sessionsLoading ? <div className="sessions-grid">{[1, 2, 3].map(i => <div key={i} className="skeleton-card"><div className="skeleton-cover" /><div className="skeleton-body"><div className="skeleton-line short" /><div className="skeleton-line" /><div className="skeleton-line medium" /></div></div>)}</div>
            : upcomingSessions.length === 0 ? <div className="home-empty"><CalendarDays size={28} /><h3>No upcoming sessions</h3><p>Check back soon or create your own session to share with the community.</p></div>
              : <div className="sessions-grid">{upcomingSessions.map(s => {
                const host = s.profiles
                const hostName = host?.display_name || host?.full_name || 'Host'
                const hostInitials = hostName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
                const startsAt = new Date(s.starts_at)
                const isLive = startsAt <= new Date() && (!s.ends_at || new Date(s.ends_at) >= new Date())
                return <article className="session-card" key={s.id} onClick={() => onOpenFeature('sessions')}>
                  <div className="session-card-header">
                    {s.cover_image_url ? <img src={s.cover_image_url} alt="" className="session-cover" loading="lazy" /> : <div className="session-cover-placeholder"><CalendarDays size={24} /></div>}
                    {isLive && <span className="live-badge">LIVE</span>}
                    {s.category && <span className="category-badge">{s.category}</span>}
                  </div>
                  <div className="session-card-body">
                    <div className="session-host"><span className="avatar small">{host?.avatar_url ? <img src={host.avatar_url} alt="" loading="lazy" /> : hostInitials}</span><span>{hostName}</span></div>
                    <h3>{s.title}</h3>
                    <div className="session-meta">
                      <span><CalendarDays size={13} /> {startsAt.toLocaleDateString([], { dateStyle: 'medium' })}</span>
                      <span><Clock3 size={13} /> {startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="session-tags">
                      {s.language && <span className="tag">{s.language}</span>}
                      {s.session_type && <span className="tag">{s.session_type}</span>}
                      {s.capacity && <span className="tag">{s.capacity} spots</span>}
                      <span className="tag">{s.price && s.price > 0 ? `$${s.price}` : 'Free'}</span>
                    </div>
                  </div>
                </article>
              })}</div>}
        </section>

        {/* Latest Podcasts */}
        <PopularPodcastsStrip onOpenPodcast={onOpenPodcast} onPlayEpisode={onPlayEpisode} onOpenProfile={onOpenProfile} />

        {/* Wellness Categories */}
        <section className="categories-section">
          <div className="section-head"><h2>Explore Wellness Topics</h2><p>Find content and sessions that match your interests.</p></div>
          <div className="categories-grid">{CATEGORIES.map(cat => <button key={cat.name} className="category-card" style={{ '--cat-color': cat.color } as React.CSSProperties} onClick={() => onOpenPodcast()}>
            <span className="category-icon">{cat.icon}</span><span className="category-name">{cat.name}</span>
          </button>)}</div>
        </section>

        {/* Quick Actions */}
        <div className="quick-actions">
          <button onClick={() => onOpenFeature('discover')}><UsersRound size={16} /> Find people</button>
          <button onClick={onOpenHealers}><Sun size={16} /> Find a healer</button>
          <button onClick={() => onOpenPodcast()}><Headphones size={16} /> Podcasts</button>
          <button onClick={() => onOpenFeature('sessions')}><CalendarDays size={16} /> Sessions</button>
          <button onClick={() => onOpenFeature('messages')}><MessageCircleMore size={16} /> Private rooms</button>
          {canCreateContent && <>
            <button className="healer-action" onClick={() => onOpenPodcast('manage')}><Mic size={16} /> Create Podcast</button>
            <button className="healer-action" onClick={() => onOpenFeature('sessions')}><Video size={16} /> Host a session</button>
          </>}
          <button onClick={() => onOpenFeature('feedback')}><MessageSquareWarning size={16} /> Send Feedback</button>
        </div>

        {/* Rooms Grid */}
        <section>
          <div className="section-head"><div><h2>Find your space</h2><p>Join a conversation that feels right for you today.</p></div><button onClick={onToggleRooms}>{showAllRooms ? 'Show fewer rooms' : 'View all rooms'} <ChevronRight size={16} /></button></div>
          <div className="room-grid">
            {(dbRooms.length ? dbRooms.slice(0, showAllRooms ? 6 : 3) : ROOMS).map((room: any) => <article className={`room-card ${room.color || room.theme}`} key={room.title || room.id}>
              <div className="room-art"><span>{room.icon}</span><div className="bubble b1" /><div className="bubble b2" /><div className="bubble b3" /></div>
              <div className="room-info"><div className="tags">{(room.tags || ['Open', 'Live']).map((t: string, i: number) => <span key={t} className={i === 0 ? 'open-tag' : ''}>{i === 0 && <i />}{t}</span>)}</div><h3>{room.title || room.name}</h3><p>{room.description}</p><div className="room-bottom"><span><UsersRound size={15} />{room.people ? `${room.people} here now` : 'Real-time room'}</span><button onClick={() => room.db ? onOpenRoom(room.db) : onNotice('Database setup is required first')}>Join room <ChevronRight size={15} /></button></div></div>
            </article>)}
          </div>
        </section>

        {/* Recently Added */}
        {recentContent.length > 0 && <section className="recently-added">
          <div className="section-head"><h2>Recently Added</h2><p>The latest content from our community.</p></div>
          <div className="recently-grid">{recentContent.map(item => <button key={item.id} className="recent-card" onClick={item.onClick}>
            <div className={`recent-card-icon ${item.type}`}>{item.type === 'session' ? <CalendarDays size={18} /> : item.type === 'podcast' ? <Headphones size={18} /> : <Sun size={18} />}</div>
            <div><b>{item.title}</b><small>{item.subtitle}</small></div>
          </button>)}</div>
        </section>}

        {/* Call to Action */}
        <section className="cta-section">
          <h2>Ready to begin your wellness journey?</h2>
          <p>Join thousands of members who are already connecting, healing, and growing together.</p>
          <div className="cta-actions">
            <button className="primary" onClick={() => onOpenFeature('discover')}><Compass size={17} /> Explore Healers</button>
            <button className="secondary-cta" onClick={() => onOpenFeature('sessions')}><CalendarDays size={17} /> Browse Sessions</button>
          </div>
        </section>

        {/* Quote Card */}
        <section className="quote-card"><div className="quote-icon">"</div><div><p>"You don't have to see the whole staircase. Just take the first step."</p><span>A gentle reminder for today</span></div><Leaf size={55} /></section>
      </div>

      <aside className="right-col">
        <section className="panel conversations"><div className="panel-head"><h3>Recent conversations</h3><button onClick={() => onOpenFeature('messages')}>View all</button></div>
          {recentMessages.length === 0 ? <p className="mini-empty">No community messages yet.</p> : recentMessages.map(c => <button className="conversation" key={c.id} onClick={() => c.rooms && onOpenRoom({ id: c.rooms.id, name: c.rooms.name, description: 'Community conversation', icon: '♡', theme: 'sage', is_private: false })}><div className="avatar soft">{c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} alt="" /> : (c.profiles?.full_name || 'N').slice(0, 1)}</div><div><b>{c.profiles?.full_name || 'Community member'}</b><p>{c.body}</p></div><span>{new Date(c.created_at).toLocaleDateString()}</span></button>)}
          <button className="new-message" onClick={() => onOpenFeature('discover')}><Send size={16} /> Start a new message</button>
        </section>

        <section className="panel session"><div className="panel-head"><h3>Upcoming wellness sessions</h3><button onClick={() => onOpenFeature('sessions')}><MoreHorizontal size={18} /></button></div>
          <div className="date-box"><b>{sessionsLoading ? '...' : upcomingSessions.length}</b><span>OPEN</span></div><div className="session-copy"><h4>{upcomingSessions.length ? 'Sessions open now' : 'Create the first session'}</h4><p>{upcomingSessions.length ? 'Join a group event or host your own.' : 'Events can be public, private, live, or waitlisted.'}</p><span><Clock3 size={14} /> Community workshops and rooms</span></div>
          <button className="join-session" onClick={() => onOpenFeature('sessions')}><Video size={16} /> Open sessions</button>
        </section>

        <section className="checkin"><span><CircleUserRound size={21} /></span><div><h3>How are you feeling?</h3><p>A small check-in can make a big difference.</p><div className="moods">{['😔', '😕', '😐', '🙂', '😊'].map(x => <button key={x} onClick={() => onNotice('Thank you for checking in')}>{x}</button>)}</div></div></section>

        <section className="disclaimer"><LockKeyhole size={17} /><p><b>A safe space, not a medical service.</b> Nova Resort offers peer support and wellness connection. If you are in immediate danger, please contact local emergency services.</p></section>
      </aside>
    </div>
  </>
}
