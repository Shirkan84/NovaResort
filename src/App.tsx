import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell, CalendarDays, ChevronDown, ChevronRight, CircleUserRound, Clock3,
  Compass, Heart, Home, Leaf, LockKeyhole, Menu, MessageCircleMore, MoreHorizontal,
  Search, Send, Settings, ShieldCheck, Sparkles, UsersRound, Video, X, Moon, Sun, Languages, UserPlus, Headphones, Mic, MessageSquareWarning
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { ChatRoom, Connections, DbRoom, EditProfile, Notifications, PeopleDirectory, SafetyCenter } from './CommunityFeatures'
import { PrivateChats, PrivateChatRoom } from './PrivateMessaging'
import { DiscoverPeople, HealersDirectory } from './PeopleDiscovery'
import { SessionsPage } from './SessionsEvents'
import { HealerDashboard } from './HealerDashboard'
import { FeedbackForm } from './FeedbackForm'
import { FeedbackAdmin } from './FeedbackAdmin'
import './feedback.css'
import './healer-dashboard.css'
import { PodcastPlatform, PodcastMiniPlayer, PopularPodcastsStrip, ProfilePodcastSection, PlayerEpisode } from './PodcastPlatform'
import { getFeaturedHealers } from './services/healers'
import { useUserRole } from './hooks/useUserRole'
import { applyLanguage, getLanguage, switchLanguage } from './i18n'
import { RegistrationChooser, MemberRegistration, HealerRegistration, CheckEmail, AuthCallbackHandler } from './Registration'
import './registration.css'
import './social-home.css'

type Room = {
  title: string; description: string; people: number; color: string; icon: string; tags: string[]
}
type LiveProfile = { id:string;full_name:string;display_name:string|null;avatar_url:string|null;profile_type:string;professional_title?:string|null;professional_verification_status?:string|null;specialties:string[]|null;interests?:string[]|null;about:string|null;country?:string|null;online:boolean|null;visibility?:string|null;next_session?:NextSession|null }
type RecentMessage = { id:string;body:string;created_at:string;profiles?:{full_name:string;avatar_url:string|null}|null;rooms?:{id:string;name:string}|null }
type Friendship = { id:string; requester_id:string; addressee_id:string; status:string }
type NextSession = { id:string; title:string; starts_at:string; host_id:string }
type Feature = 'discover'|'people'|'healers'|'profile'|'notifications'|'messages'|'safety'|'connections'|'sessions'|'podcasts'|'healer'|'feedback'|'feedback-admin'
type AuthView = 'login'|'register'|'register-member'|'register-healer'|'check-email'|'callback'|null
type AppRoute = { feature: Feature | null; roomId: string | null; profileId: string | null; podcastId: string | null; episodeId: string | null; podcastStudio: boolean; studioAction: string | null; studioPodcastId: string | null; studioEpisodeId: string | null; sessionId: string | null; sessionView: string | null; authView: AuthView; notFound: boolean }

const BASE_URL = import.meta.env.VITE_BASE_URL || 'https://shirkan84.github.io/NovaResort/'
const BASE_PATH = import.meta.env.VITE_BASE_PATH || '/NovaResort'

function routeFromHash(): AppRoute {
  const pathRoute = window.location.pathname
    .replace(new RegExp('^' + BASE_PATH.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '/?'), '')
    .replace(/^\/+|\/+$/g, '')
  const value = decodeURIComponent(window.location.hash.replace(/^#\/?/, '') || pathRoute || 'home')
  const base = { feature: null, roomId: null, profileId: null, podcastId: null, episodeId: null, podcastStudio: false, studioAction: null as string | null, studioPodcastId: null as string | null, studioEpisodeId: null as string | null, sessionId: null as string | null, sessionView: null as string | null, authView: null as AuthView, notFound: false }
  if (value === 'login') return { ...base, authView: 'login' }
  if (value === 'register') return { ...base, authView: 'register' }
  if (value === 'register/member') return { ...base, authView: 'register-member' }
  if (value === 'register/healer') return { ...base, authView: 'register-healer' }
  if (value === 'check-email') return { ...base, authView: 'check-email' }
  if (value === 'auth/callback') return { ...base, authView: 'callback' }
  if (value.startsWith('room/')) return { ...base, roomId: value.slice(5) || null }
  if (value.startsWith('profile/')) return { ...base, profileId: value.slice(8) || null }
  if (value === 'podcasts/manage') return { ...base, feature: 'podcasts', podcastStudio: true, studioAction: 'list' }
  if (value === 'podcasts/manage/new') return { ...base, feature: 'podcasts', podcastStudio: true, studioAction: 'create' }
  if (value.startsWith('podcasts/manage/')) {
    const rest = value.slice('podcasts/manage/'.length)
    const parts = rest.split('/')
    const spId = parts[0] || null
    if (parts.length === 1) return { ...base, feature: 'podcasts', podcastStudio: true, studioAction: 'episodes', studioPodcastId: spId }
    if (parts[1] === 'edit') return { ...base, feature: 'podcasts', podcastStudio: true, studioAction: 'edit', studioPodcastId: spId }
    if (parts[1] === 'episodes' && parts[2] === 'new') return { ...base, feature: 'podcasts', podcastStudio: true, studioAction: 'create-episode', studioPodcastId: spId }
    if (parts[1] === 'episodes' && parts[3]) return { ...base, feature: 'podcasts', podcastStudio: true, studioAction: 'edit-episode', studioPodcastId: spId, studioEpisodeId: parts[3] }
    return { ...base, feature: 'podcasts', podcastStudio: true, studioAction: 'list' }
  }
  if (value.startsWith('podcasts/')) {
    const parts = value.split('/')
    return { ...base, feature: 'podcasts', podcastId: parts[1] || null, episodeId: parts[3] || null }
  }
  if (value === 'podcasts') return { ...base, feature: 'podcasts' }
  if (value === 'discover' || value === 'members' || value === 'members/online') return { ...base, feature: 'discover' }
  if (value === 'community' || value === 'rooms' || value === 'discover/rooms') return { ...base, feature: 'people' }
  if (value === 'healers' || value === 'community/healers') return { ...base, feature: 'healers' }
  if (value === 'connections') return { ...base, feature: 'connections' }
  if (value === 'messages') return { ...base, feature: 'messages' }
  if (value === 'healer' || value === 'healer/dashboard') return { ...base, feature: 'healer' }
  if (value === 'feedback') return { ...base, feature: 'feedback' }
  if (value === 'feedback/admin') return { ...base, feature: 'feedback-admin' }
  if (value.startsWith('sessions/')) {
    const parts = value.split('/')
    const sId = parts[1] || null
    if (parts[2] === 'room') return { ...base, feature: 'sessions', sessionId: sId, sessionView: 'room' }
    if (parts[2] === 'chat') return { ...base, feature: 'sessions', sessionId: sId, sessionView: 'chat' }
    if (sId) return { ...base, feature: 'sessions', sessionId: sId, sessionView: 'detail' }
    return { ...base, feature: 'sessions' }
  }
  if (value === 'sessions' || value === 'sessions/upcoming') return { ...base, feature: 'sessions' }
  if (value === 'notifications') return { ...base, feature: 'notifications' }
  if (value === 'profile' || value === 'settings') return { ...base, feature: 'profile' }
  if (value === 'safety' || value === 'community-guidelines' || value === 'privacy' || value === 'terms') return { ...base, feature: 'safety' }
  if (value !== 'home' && value !== '') return { ...base, notFound: true }
  return base
}

function setRoute(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const next = `#${normalized}`
  if (window.location.hash !== next) window.location.hash = next
}

function navFromFeature(feature: Feature | null) {
  if (feature === 'discover') return 'Discover'
  if (feature === 'people') return 'Community'
  if (feature === 'healers') return 'Healers'
  if (feature === 'healer') return 'Healer Dashboard'
  if (feature === 'feedback') return 'Home'
  if (feature === 'feedback-admin') return 'Home'
  if (feature === 'messages') return 'Messages'
  if (feature === 'connections') return 'Connections'
  if (feature === 'sessions') return 'Sessions'
  if (feature === 'podcasts') return 'Podcasts'
  if (feature === 'notifications') return 'Home'
  if (feature === 'safety') return 'Home'
  if (feature === 'profile') return 'Settings'
  return 'Home'
}

const rooms: Room[] = [
  { title: 'Heart to Heart', description: 'A gentle space for honest conversations and mutual support.', people: 28, color: 'peach', icon: '♡', tags: ['Open', 'Moderated'] },
  { title: 'Mindful Moments', description: 'Pause, breathe, and return to yourself with the community.', people: 16, color: 'sage', icon: '✦', tags: ['Open', 'Guided'] },
  { title: 'Self Growth', description: 'Celebrate progress, share intentions, and grow together.', people: 21, color: 'lavender', icon: '⌁', tags: ['Open', 'Community'] },
]

function HealerPodcastDashboard({ userId, onOpenStudio, onOpenPodcast }: { userId: string; onOpenStudio: () => void; onOpenPodcast: (id: string) => void }) {
  const [stats, setStats] = useState({ podcastCount: 0, draftCount: 0, publishedCount: 0 })
  const [recentEpisodes, setRecentEpisodes] = useState<any[]>([])
  useEffect(() => {
    let live = true
    Promise.all([
      supabase.from('podcasts').select('id,status', { count: 'exact' }).eq('creator_id', userId),
      supabase.from('podcast_episodes').select('id,status,title,audio_duration_seconds,created_at,podcast_id,podcasts(title)').eq('creator_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(5)
    ]).then(([podcastResult, episodeResult]) => {
      if (!live) return
      const podcasts = podcastResult.data || []
      const podcastCount = podcasts.length
      const draftCount = podcasts.filter(p => p.status === 'draft').length
      const publishedCount = podcasts.filter(p => p.status === 'published').length
      setStats({ podcastCount, draftCount, publishedCount })
      setRecentEpisodes(episodeResult.data || [])
    })
    return () => { live = false }
  }, [userId])
  if (stats.podcastCount === 0 && recentEpisodes.length === 0) return <section className="healer-podcast-dashboard">
    <div className="section-head"><div><h2>Podcast Studio</h2><p>Create and share wellness audio with the community.</p></div><button onClick={onOpenStudio}>Open Studio <ChevronRight size={16}/></button></div>
    <div className="empty-state" style={{padding:'24px 0'}}><Mic size={24}/><h3>Your podcast studio is ready</h3><p>Create your first podcast to start sharing audio content with members.</p><button className="healer-action" onClick={onOpenStudio}>Create your first podcast <ChevronRight size={14}/></button></div>
  </section>
  return <section className="healer-podcast-dashboard">
    <div className="section-head"><div><h2>Podcast Studio</h2><p>Your podcast content at a glance.</p></div><button onClick={onOpenStudio}>Open Studio <ChevronRight size={16}/></button></div>
    <div className="healer-podcast-stats">
      <div className="healer-stat"><b>{stats.podcastCount}</b><span>{stats.podcastCount === 1 ? 'Show' : 'Shows'}</span></div>
      <div className="healer-stat"><b>{stats.publishedCount}</b><span>Published</span></div>
      <div className="healer-stat"><b>{stats.draftCount}</b><span>Drafts</span></div>
    </div>
    {recentEpisodes.length > 0 && <div className="healer-recent-episodes">
      <h4>Recent episodes</h4>
      {recentEpisodes.map(ep => <button key={ep.id} className="healer-episode-row" onClick={() => onOpenPodcast(ep.podcast_id)}>
        <div><b>{ep.title}</b><small>{(ep.podcasts as any)?.title || 'Podcast'}</small></div>
        <span className={`status-badge ${ep.status}`}>{ep.status}</span>
      </button>)}
    </div>}
  </section>
}

function Logo() {
  return <div className="logo"><div className="logo-mark"><Leaf size={20} /><Sparkles size={10} /></div><div><b>nova</b><span>resort</span></div></div>
}

const profileName = (profile:LiveProfile) => profile.display_name || profile.full_name || 'Nova member'
const profileInitials = (name?:string|null) => (name || 'N').split(' ').map(part => part[0]).join('').slice(0,2).toUpperCase()
const roleLabel = (profile:LiveProfile) => profile.profile_type === 'healer' ? (profile.professional_title || 'Healer') : profile.profile_type === 'admin' ? 'Administrator' : 'Member'
const relationshipFor = (id:string, rows:Friendship[]) => rows.find(row => row.requester_id === id || row.addressee_id === id)

function AuthScreen() {
  const language = getLanguage()
  const [mode, setMode] = useState<'login'|'reset'>('login')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') || '').trim()
    const password = String(data.get('password') || '')
    setLoading(true); setError(''); setMessage('')
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: BASE_URL })
        if (error) throw error
        setMessage('Password reset instructions have been sent to your email.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.') }
    finally { setLoading(false) }
  }

  return <div className="auth-page"><button className="language-toggle auth-language" onClick={()=>switchLanguage(language==='en'?'he':'en')}><Languages/>{language==='en'?'\u05E2\u05D1\u05E8\u05D9\u05EA':'English'}</button>
    <div className="auth-brand"><Logo/><div className="auth-hero-copy"><span className="auth-kicker"><Sparkles size={13}/> A SAFE SPACE TO BE HUMAN</span><h1>Connection can be<br/><em>part of the healing.</em></h1><p>Talk, listen, and grow in a thoughtful community built around emotional wellbeing and meaningful human connection.</p><div className="auth-values"><span><Heart/>Kind connection</span><span><ShieldCheck/>Safety first</span><span><Leaf/>Space to grow</span></div></div><p className="auth-disclaimer">Nova Resort is a peer-support community and is not a substitute for professional or emergency services.</p></div>
    <div className="auth-panel"><div className="auth-mobile-logo"><Logo/></div><div className="auth-form-wrap"><span className="welcome-icon"><Leaf size={22}/></span>
      <h2>{mode === 'reset' ? 'Reset your password' : 'Welcome to Nova Resort'}</h2>
      <p>{mode === 'reset' ? 'We\u2019ll send a secure reset link to your email.' : 'Sign in to return to your community.'}</p>
      {message && <div className="form-message success"><ShieldCheck size={17}/>{message}</div>}{error && <div className="form-message error">{error}</div>}
      <form onSubmit={submit}>
        <label>Email address<input type="email" name="email" required placeholder="you@example.com"/></label>
        {mode !== 'reset' && <label>Password<input type="password" name="password" required minLength={8} placeholder="At least 8 characters"/></label>}
        {mode === 'login' && <button type="button" className="forgot" onClick={() => {setMode('reset');setError('');setMessage('')}}>Forgot password?</button>}
        <button className="auth-submit" disabled={loading}>{loading ? 'Please wait\u2026' : mode === 'reset' ? 'Send reset link' : 'Sign in'}<ChevronRight size={17}/></button>
      </form>
      <div className="auth-switch">{mode === 'login' ? <>New to Nova Resort? <button onClick={() => setRoute('register')}>Create an account</button></> : <>Already have an account? <button onClick={() => setMode('login')}>Sign in</button></>}</div>
    </div>
    <footer className="auth-footer">&copy; 2026 Nova Resort. Created and designed by Shir Kanevsky. All rights reserved.</footer>
  </div>
  </div>
}
function ProfilePreviewActions({profile,friendships,userId,onConnect,onMessage,onSessions,onCreatePodcast,onCreateSession}:{profile:LiveProfile;friendships:Friendship[];userId:string;onConnect:(p:LiveProfile)=>void;onMessage:(p:LiveProfile)=>void;onSessions:()=>void;onCreatePodcast?:()=>void;onCreateSession?:()=>void}) {
  const rel = relationshipFor(profile.id, friendships)
  const label = rel?.status==='accepted' ? 'Connected' : rel?.status==='pending' && rel.requester_id===userId ? 'Request sent' : rel?.status==='pending' ? 'Accept request' : 'Connect'
  const isOwn = profile.id === userId
  return <div className="healer-actions">
    {!isOwn && <button onClick={()=>onConnect(profile)} disabled={rel?.status==='accepted'}><UserPlus size={13}/> {label}</button>}
    {!isOwn && <button onClick={()=>onMessage(profile)}><MessageCircleMore size={13}/> Message</button>}
    {profile.profile_type === 'healer' && !isOwn && <button onClick={onSessions}>View sessions</button>}
    {isOwn && profile.profile_type === 'healer' && <>
      <button className="healer-create-action" onClick={onCreatePodcast}><Mic size={13}/> Create podcast</button>
      <button className="healer-create-action" onClick={onCreateSession}><CalendarDays size={13}/> Create session</button>
    </>}
  </div>
}

function App() {
  const language = getLanguage()
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('nova-theme')
    if (saved === 'dark') return true
    if (saved === 'light') return false
    localStorage.removeItem('nova-dark-mode')
    return false
  })
  const [notice, setNotice] = useState('')
  const [activeNav, setActiveNav] = useState('Home')
  const [dbRooms, setDbRooms] = useState<DbRoom[]>([])
  const [selectedRoom, setSelectedRoom] = useState<DbRoom | null>(null)
  const [feature, setFeature] = useState<Feature | null>(null)
  const [route, setRouteState] = useState<AppRoute>(() => routeFromHash())
  const [showAllRooms,setShowAllRooms] = useState(false)
  const [liveHealers,setLiveHealers] = useState<LiveProfile[]>([])
  const [healersLoading,setHealersLoading] = useState(true)
  const [healersError,setHealersError] = useState('')
  const [recentMessages,setRecentMessages] = useState<RecentMessage[]>([])
  const [friendships,setFriendships] = useState<Friendship[]>([])
  const [profilePreview,setProfilePreview] = useState<LiveProfile|null>(null)
  const [currentAvatar,setCurrentAvatar] = useState<string|null>(null)
  const [podcastPlayer,setPodcastPlayer] = useState<PlayerEpisode|null>(null)
  const [signingOut,setSigningOut] = useState(false)
  const [metrics,setMetrics] = useState({members:0,online:0,healers:0,rooms:0,sessions:0,notifications:0,connections:0})
  const { canCreateContent, profile: userProfile, isLoading: roleLoading } = useUserRole(session?.user?.id ?? null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    const syncRoute = () => setRouteState(routeFromHash())
    syncRoute()
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])
  useEffect(() => applyLanguage(language), [language])
  useEffect(() => { localStorage.setItem('nova-theme', dark ? 'dark' : 'light') }, [dark])
  useEffect(() => { return () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current) } }, [])
  useEffect(() => {
    if (!session) return
    let cancelled = false
    async function applyRouteToState() {
      if (route.roomId) {
        setFeature(null)
        setActiveNav('Messages')
        const cached = selectedRoom?.id === route.roomId ? selectedRoom : dbRooms.find(room => room.id === route.roomId)
        if (cached) {
          setSelectedRoom(cached)
          return
        }
        const { data, error } = await supabase.from('rooms').select('id,name,description,icon,theme,is_private').eq('id', route.roomId).single()
        if (cancelled) return
        if (error || !data) {
          setSelectedRoom(null)
          setRoute('home')
          setNotice('That room link is no longer available.')
          return
        }
        setSelectedRoom(data as DbRoom)
        return
      }
      if (route.profileId) {
        setSelectedRoom(null)
        setFeature(null)
        setActiveNav('Healers')
        const cached = liveHealers.find(profile => profile.id === route.profileId)
        if (cached) {
          setProfilePreview(cached)
          return
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('id,full_name,display_name,avatar_url,country,profile_type,professional_title,professional_verification_status,about,interests,specialties,online,visibility')
          .eq('id', route.profileId)
          .neq('visibility','private')
          .single()
        if (cancelled) return
        if (error || !data) {
          setProfilePreview(null)
          setRoute('home')
          setNotice('That profile is not available.')
          return
        }
        setProfilePreview(data as LiveProfile)
        return
      }
      setProfilePreview(null)
      setSelectedRoom(null)
      setFeature(route.feature)
      setActiveNav(navFromFeature(route.feature))
      if (!route.feature) window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    applyRouteToState()
    return () => { cancelled = true }
  }, [route, session, dbRooms, selectedRoom, liveHealers])
  useEffect(() => {
    if (!session) return
    const loadLiveData=async()=>{
      try {
        const fiveMinutesAgo=new Date(Date.now()-5*60*1000).toISOString()
        setHealersLoading(true)
        const [rooms,allMembers,online,healerCount,featuredHealersResult,activeRooms,sessions,notifications,connections,activity,me,relations]=await Promise.all([
          supabase.from('rooms').select('id,name,description,icon,theme,is_private').eq('is_private',false).limit(6),
          supabase.from('profiles').select('id',{count:'exact',head:true}),
          supabase.from('profiles').select('id',{count:'exact',head:true}).gte('last_seen',fiveMinutesAgo),
          supabase.from('profiles').select('id',{count:'exact',head:true}).eq('profile_type','healer').neq('visibility','private').eq('account_status','active').eq('discoverable',true),
          getFeaturedHealers(12).then(result=>({data:result,error:null as Error|null})).catch(error=>({data:{rows:[] as LiveProfile[],total:0},error:error as Error})),
          supabase.from('rooms').select('id',{count:'exact',head:true}).eq('is_private',false),
          supabase.from('sessions').select('id',{count:'exact',head:true}).gte('starts_at',new Date().toISOString()).in('status',['published','live','registration_closed']),
          supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',session.user.id).is('read_at',null),
          supabase.from('friendships').select('id',{count:'exact',head:true}).eq('addressee_id',session.user.id).eq('status','pending'),
          supabase.from('messages').select('id,body,created_at,profiles!messages_sender_id_fkey(full_name,avatar_url),rooms!messages_room_id_fkey(id,name)').order('created_at',{ascending:false}).limit(3),
          supabase.from('profiles').select('avatar_url').eq('id',session.user.id).single(),
          supabase.from('friendships').select('id,requester_id,addressee_id,status').or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`).in('status',['pending','accepted'])
        ])
        const healerRows = (featuredHealersResult.data.rows||[]).map(profile => ({...profile,interests:null,visibility:'community',next_session:(profile as any).next_session_id?{id:(profile as any).next_session_id,title:(profile as any).next_session_title||'Upcoming session',starts_at:(profile as any).next_session_starts_at||new Date().toISOString(),host_id:profile.id}:null}))
        setDbRooms((rooms.data as DbRoom[])||[]);setLiveHealers(healerRows);setHealersError(featuredHealersResult.error?'We could not load healers right now. Please try again.':'');setHealersLoading(false);setRecentMessages((activity.data as unknown as RecentMessage[])||[]);setFriendships((relations.data as Friendship[])||[]);setCurrentAvatar(me.data?.avatar_url||null)
        setMetrics({members:allMembers.count||0,online:online.count||0,healers:healerCount.count||0,rooms:activeRooms.count||0,sessions:sessions.count||0,notifications:notifications.count||0,connections:connections.count||0})
      } catch {
        setHealersError('Unable to load data. Please refresh the page.')
        setHealersLoading(false)
      }
    }
    const heartbeat=()=>{supabase.from('profiles').update({online:true,last_seen:new Date().toISOString()}).eq('id',session.user.id).then(()=>{},()=>{})}
    const refreshNotifications=()=>loadLiveData()
    heartbeat();loadLiveData();const timer=window.setInterval(()=>{heartbeat();loadLiveData()},60000)
    const notices=supabase.channel(`app-notifications-${session.user.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`user_id=eq.${session.user.id}`},()=>loadLiveData())
      .subscribe()
    window.addEventListener('nova-notifications-read',refreshNotifications)
    return()=>{window.clearInterval(timer);window.removeEventListener('nova-notifications-read',refreshNotifications);supabase.removeChannel(notices);supabase.from('profiles').update({online:false,last_seen:new Date().toISOString()}).eq('id',session.user.id)}
  }, [session])

  const noticeTimer = useRef<number | null>(null)
  const act = useCallback((text: string) => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    setNotice(text)
    noticeTimer.current = window.setTimeout(() => { setNotice(''); noticeTimer.current = null }, 2800)
  }, [])
  const openFeature = (next: Feature | null) => setRoute(next === 'people' ? 'community' : next || 'home')
  const openRoom = (room: DbRoom) => { setSelectedRoom(room); setFeature(null); setRoute(`room/${room.id}`) }
  const closeOverlay = () => setRoute('home')
  const openProfile = (id:string) => setRoute(`profile/${id}`)
  const openHealers = () => setRoute('healers')
  const openPodcast = (id?:string) => { if (!id) return setRoute('podcasts'); if (id === 'manage') return setRoute('podcasts/manage'); if (id.startsWith('manage/')) return setRoute(`podcasts/${id}`); return setRoute(`podcasts/${id}`) }
  const openPodcastEpisode = (podcastId:string, episodeId:string) => setRoute(`podcasts/${podcastId}/episodes/${episodeId}`)
  async function signOut() {
    setSigningOut(true)
    try {
      setSelectedRoom(null);setFeature(null);setProfilePreview(null);setPodcastPlayer(null)
      setDbRooms([]);setLiveHealers([]);setRecentMessages([]);setFriendships([]);setCurrentAvatar(null)
      setMetrics({members:0,online:0,healers:0,rooms:0,sessions:0,notifications:0,connections:0})
      setMenuOpen(false);setShowAllRooms(false);setHealersError('');setActiveNav('Home')
      if (noticeTimer.current) { window.clearTimeout(noticeTimer.current); noticeTimer.current = null }
      setNotice('')
      await supabase.removeAllChannels()
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setRoute('login')
    } catch {
      act('We could not sign you out. Please try again.')
      setSigningOut(false)
    }
  }
  async function startPrivateMessage(person:LiveProfile){const {data,error}=await supabase.rpc('create_private_room',{other_user:person.id});if(error){act(error.message);return}if(!data){act('Could not create conversation.');return}openRoom({id:data,name:profileName(person),description:'Private two-person conversation',icon:'♢',theme:'sage',is_private:true})}
  async function connectWith(person:LiveProfile){
    if (!session) return
    const row = relationshipFor(person.id, friendships)
    if (row?.status === 'accepted') return
    if (row?.status === 'pending' && row.requester_id === session.user.id) {
      const { error } = await supabase.rpc('cancel_connection_request',{request_id:row.id})
      if (error) act(error.message); else {act('Connection request cancelled.');setFriendships(items=>items.filter(item=>item.id!==row.id))}
      return
    }
    if (row?.status === 'pending' && row.addressee_id === session.user.id) {
      const { error } = await supabase.rpc('respond_connection_request',{request_id:row.id,next_status:'accepted'})
      if (error) act(error.message); else {act('Connection accepted.');setFriendships(items=>items.map(item=>item.id===row.id?{...item,status:'accepted'}:item))}
      return
    }
    const { error } = await supabase.rpc('send_connection_request',{other_user:person.id})
    if (error) act(error.message)
    else act('Connection request sent.')
  }

  if (authLoading) return <div className="auth-loader"><Logo/><span/></div>
  if (route.authView === 'callback') return <AuthCallbackHandler/>
  if (!session) {
    if (route.authView === 'check-email') return <CheckEmail/>
    if (route.authView === 'register') return <RegistrationChooser/>
    if (route.authView === 'register-member') return <MemberRegistration/>
    if (route.authView === 'register-healer') return <HealerRegistration/>
    return <AuthScreen/>
  }
  if (!roleLoading && userProfile && userProfile.account_status === 'email_pending') return <CheckEmail email={session.user.email}/>
  if (roleLoading) return <div className="auth-loader"><Logo/><span/></div>
  const name = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Member'
  const initials = name.split(' ').map((part: string) => part[0]).join('').slice(0,2).toUpperCase()

  return <div className={dark ? 'app dark' : 'app'}>
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="side-top"><Logo/><button className="icon-btn close-mobile" onClick={() => setMenuOpen(false)}><X size={20}/></button></div>
      <nav>
        {[
          [Home, 'Home'], [Compass, 'Discover'], [UsersRound, 'Community'], [Sun, 'Healers'], [Headphones, 'Podcasts'], [Heart, 'Connections'], [MessageCircleMore, 'Messages'], [CalendarDays, 'Sessions']
        ].map(([Icon, label]) => <button key={label as string} className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => {setMenuOpen(false);setRoute(label==='Community'?'community':label==='Discover'?'discover':label==='Healers'?'healers':label==='Podcasts'?'podcasts':label==='Connections'?'connections':label==='Messages'?'messages':label==='Sessions'?'sessions':'home')}}><Icon size={19}/><span>{label as string}</span>{label === 'Connections' && metrics.connections > 0 && <i>{metrics.connections}</i>}</button>)}
        {canCreateContent && <button className={activeNav === 'Healer Dashboard' ? 'nav-item active' : 'nav-item'} onClick={() => {setMenuOpen(false);setRoute('healer')}}><ShieldCheck size={19}/><span>Healer Dashboard</span></button>}
      </nav>
      <div className="side-card">
        <div className="side-card-icon"><ShieldCheck size={20}/></div>
        <b>Your safety matters</b>
        <p>Explore our community guidelines and support resources.</p>
        <button onClick={() => openFeature('safety')}>Visit safety center <ChevronRight size={14}/></button>
      </div>
      <div className="side-bottom">
        <button className="nav-item" onClick={() => openFeature('profile')}><Settings size={19}/><span>Settings</span></button>
        <button className="profile-mini" onClick={() => openFeature('profile')}><div className="avatar user">{currentAvatar?<img src={currentAvatar} alt=""/>:initials}</div><div><b>{name}</b><span>Community member</span></div><MoreHorizontal size={18}/></button>
        <button className="signout" disabled={signingOut} onClick={signOut}>{signingOut?'Signing out...':'Sign out'}</button>
      </div>
    </aside>

    <main>
      <header>
        <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)}><Menu size={22}/></button>
        <div className="mobile-logo"><Logo/></div>
        <div className="search" onClick={()=>openFeature('discover')}><Search size={18}/><input aria-label="Search" readOnly placeholder="Search people, rooms, or topics..."/><span>⌘ K</span></div>
        <div className="header-actions">
          <button className="language-toggle" onClick={()=>switchLanguage(language==='en'?'he':'en')}><Languages size={17}/>{language==='en'?'עברית':'English'}</button>
          <button className="icon-btn" aria-label="Toggle theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
          <button className="icon-btn notification" aria-label="Notifications" onClick={() => openFeature('notifications')}><Bell size={20}/>{metrics.notifications>0&&<i>{metrics.notifications}</i>}</button>
          <button className="user-chip" onClick={()=>openFeature('profile')}><div className="avatar user">{currentAvatar?<img src={currentAvatar} alt=""/>:initials}</div><ChevronDown size={15}/></button>
          <button className="header-signout" disabled={signingOut} onClick={signOut}>{signingOut?'Signing out...':'Sign out'}</button>
        </div>
      </header>

      <div className="content">
        {route.notFound ? <section className="welcome"><div style={{gridColumn:'1/-1',textAlign:'center',padding:'80px 20px'}}><p className="eyebrow">PAGE NOT FOUND</p><h1>This page doesn't exist.</h1><p className="platform-intro">The link you followed may be broken or the page may have been removed.</p><div className="welcome-actions" style={{justifyContent:'center'}}><button className="primary" onClick={closeOverlay}><Home size={17}/> Go to homepage</button></div></div></section> : <>
        <section className="welcome">
          <div><p className="eyebrow">WELCOME TO NOVA RESORT</p><h1>Good to see you, {name.split(' ')[0]} <span>✦</span></h1><p className="platform-intro">A caring space where members and wellness professionals connect, talk, heal, grow, and support one another. Therapists, healers, and coaches can also host <mark>online sessions and workshops</mark> for the community.</p></div>
          <div className="welcome-actions"><button className="primary" onClick={() => openFeature('people')}><Compass size={17}/> Explore the community</button><button className="secondary-cta" onClick={() => setRoute('members')}><UsersRound size={17}/> Discover Members</button></div>
        </section>

        <div className="stats">
          <div><span className="stat-icon green"><UsersRound/></span><p><b>{metrics.online}</b><small>Members online</small></p><em>{metrics.members} registered</em></div>
          <button className="stat-link" onClick={openHealers}><span className="stat-icon purple"><Sun/></span><p><b>{metrics.healers}</b><small>Healers available</small></p><em>Registered guides</em></button>
          <div><span className="stat-icon amber"><MessageCircleMore/></span><p><b>{metrics.rooms}</b><small>Active rooms</small></p><em>Join anytime</em></div>
          <div><span className="stat-icon blue"><CalendarDays/></span><p><b>{metrics.sessions}</b><small>Upcoming sessions</small></p><button onClick={() => openFeature('sessions')}>View sessions</button></div>
        </div>

        <div className="quick-actions">
          <button onClick={() => openFeature('discover')}><UsersRound size={16}/> Find people</button>
          <button onClick={openHealers}><Sun size={16}/> Find a healer</button>
          <button onClick={() => openFeature('podcasts')}><Headphones size={16}/> Podcasts</button>
           <button onClick={() => openFeature('sessions')}><CalendarDays size={16}/> Sessions</button>
          <button onClick={() => openFeature('messages')}><MessageCircleMore size={16}/> Private rooms</button>
          {canCreateContent && <>
            <button className="healer-action" onClick={() => openPodcast('manage')}><Mic size={16}/> Create Podcast</button>
            <button className="healer-action" onClick={() => openFeature('sessions')}><Video size={16}/> Host a session</button>
          </>}
          <button onClick={() => openFeature('feedback')}><MessageSquareWarning size={16}/> Send Feedback</button>
        </div>

        <div className="layout">
          <div className="main-col">
            <section className="healer-section">
              <div className="section-head"><div><button className="section-title-link" onClick={openHealers}><h2>Meet our healers</h2></button><p>Connect with registered wellness professionals, explore their profiles, and discover their upcoming sessions and workshops.</p></div><button onClick={openHealers}>View all healers <ChevronRight size={16}/></button></div>
              {healersLoading?<div className="healer-strip"><div className="healer-card wide skeleton"/><div className="healer-card wide skeleton"/><div className="healer-card wide skeleton"/></div>:healersError?<div className="inline-empty">{healersError}</div>:liveHealers.length===0?<div className="inline-empty">No verified healers are available yet.</div>:<div className="healer-strip" role="list" aria-label="Registered healers">{liveHealers.map(h=>{const relation=relationshipFor(h.id,friendships),connectLabel=relation?.status==='accepted'?'Connected':relation?.status==='pending'&&relation.requester_id===session.user.id?'Request sent':relation?.status==='pending'?'Accept request':'Connect';return <article className="healer-card wide" role="listitem" key={h.id}>
                <button className="healer-photo-button" onClick={()=>openProfile(h.id)} aria-label={`View ${profileName(h)} profile`}><span className="avatar healer rose">{h.avatar_url?<img src={h.avatar_url} alt={`${profileName(h)} profile photo`} loading="lazy" onError={event=>{event.currentTarget.style.display='none'}}/>:profileInitials(profileName(h))}<i className={h.online?'online':''}/><span className="sr-only">{h.online?'Online now':'Offline'}</span></span></button>
                <div className="healer-info">
                  <button className="healer-name" onClick={()=>openProfile(h.id)}>{profileName(h)}</button>
                  <p>{roleLabel(h)}{h.country?` · ${h.country}`:''}</p>
                  <div className="healer-tags">{(h.specialties||h.interests||['Emotional wellness']).slice(0,3).map(tag=><span key={tag}>{tag}</span>)}</div>
                  <p className="healer-bio">{h.about||'Registered wellness professional in the Nova Resort community.'}</p>
                  {h.next_session&&<button className="next-session" onClick={()=>openFeature('sessions')}><CalendarDays size={13}/><span>{h.next_session.title}</span><time>{new Date(h.next_session.starts_at).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}</time></button>}
                  <div className="healer-actions"><button onClick={()=>openProfile(h.id)}>View profile</button><button onClick={()=>connectWith(h)} disabled={relation?.status==='accepted'}><UserPlus size={13}/>{connectLabel}</button><button onClick={()=>startPrivateMessage(h)}><MessageCircleMore size={13}/> Message</button>{h.next_session&&<button onClick={()=>openFeature('sessions')}>View sessions</button>}</div>
                </div>
              </article>})}</div>}
            </section>

            <PopularPodcastsStrip onOpenPodcast={openPodcast} onPlayEpisode={setPodcastPlayer} onOpenProfile={openProfile}/>

            {canCreateContent && <HealerPodcastDashboard userId={session.user.id} onOpenStudio={() => openPodcast('manage')} onOpenPodcast={openPodcast}/>}

            <section>
              <div className="section-head"><div><h2>Find your space</h2><p>Join a conversation that feels right for you today.</p></div><button onClick={() => setShowAllRooms(!showAllRooms)}>{showAllRooms?'Show fewer rooms':'View all rooms'} <ChevronRight size={16}/></button></div>
              <div className="room-grid">
                {(dbRooms.length ? dbRooms.slice(0,showAllRooms?6:3).map(r=>({title:r.name,description:r.description,people:0,color:r.theme,icon:r.icon,tags:['Open','Live'],db:r})) : rooms.map(r=>({...r,db:null as DbRoom|null}))).map(room => <article className={`room-card ${room.color}`} key={room.title}>
                  <div className="room-art"><span>{room.icon}</span><div className="bubble b1"></div><div className="bubble b2"></div><div className="bubble b3"></div></div>
                  <div className="room-info"><div className="tags">{room.tags.map((t,i) => <span key={t} className={i === 0 ? 'open-tag' : ''}>{i === 0 && <i/>}{t}</span>)}</div><h3>{room.title}</h3><p>{room.description}</p><div className="room-bottom"><span><UsersRound size={15}/>{room.people ? `${room.people} here now` : 'Real-time room'}</span><button onClick={() => room.db ? openRoom(room.db) : act('Database setup is required first')}>Join room <ChevronRight size={15}/></button></div></div>
                </article>)}
              </div>
            </section>

            <section className="quote-card"><div className="quote-icon">“</div><div><p>“You don’t have to see the whole staircase. Just take the first step.”</p><span>A gentle reminder for today</span></div><Leaf size={55}/></section>
          </div>

          <aside className="right-col">
            <section className="panel conversations"><div className="panel-head"><h3>Recent conversations</h3><button onClick={() => openFeature('messages')}>View all</button></div>
              {recentMessages.length===0?<p className="mini-empty">No community messages yet.</p>:recentMessages.map(c => <button className="conversation" key={c.id} onClick={() => c.rooms&&openRoom({id:c.rooms.id,name:c.rooms.name,description:'Community conversation',icon:'♡',theme:'sage',is_private:false})}><div className="avatar soft">{c.profiles?.avatar_url?<img src={c.profiles.avatar_url} alt=""/>:(c.profiles?.full_name||'N').slice(0,1)}</div><div><b>{c.profiles?.full_name||'Community member'}</b><p>{c.body}</p></div><span>{new Date(c.created_at).toLocaleDateString()}</span></button>)}
              <button className="new-message" onClick={() => openFeature('discover')}><Send size={16}/> Start a new message</button>
            </section>

            <section className="panel session"><div className="panel-head"><h3>Upcoming wellness sessions</h3><button onClick={()=>openFeature('sessions')}><MoreHorizontal size={18}/></button></div>
              <div className="date-box"><b>{metrics.sessions}</b><span>OPEN</span></div><div className="session-copy"><h4>{metrics.sessions?'Sessions open now':'Create the first session'}</h4><p>{metrics.sessions?'Join a group event or host your own.':'Events can be public, private, live, or waitlisted.'}</p><span><Clock3 size={14}/> Community workshops and rooms</span></div>
              <button className="join-session" onClick={() => openFeature('sessions')}><Video size={16}/> Open sessions</button>
            </section>

            <section className="checkin"><span><CircleUserRound size={21}/></span><div><h3>How are you feeling?</h3><p>A small check-in can make a big difference.</p><div className="moods">{['😔','😕','😐','🙂','😊'].map(x => <button key={x} onClick={() => act('Thank you for checking in')}>{x}</button>)}</div></div></section>

            <section className="disclaimer"><LockKeyhole size={17}/><p><b>A safe space, not a medical service.</b> Nova Resort offers peer support and wellness connection. If you are in immediate danger, please contact local emergency services.</p></section>
          </aside>
        </div>
        </>}
      </div>
    </main>
    {menuOpen && <button className="backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)}/>} 
    {feature==='discover' && <DiscoverPeople userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom} onOpenProfile={openProfile}/>}
    {selectedRoom && (selectedRoom.is_private ? <PrivateChatRoom room={selectedRoom} userId={session.user.id} onClose={closeOverlay} onOpenProfile={openProfile}/> : <ChatRoom room={selectedRoom} userId={session.user.id} onClose={closeOverlay}/>)} 
    {feature==='people' && <PeopleDirectory userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {feature==='healers' && <HealersDirectory userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom} onOpenProfile={openProfile} onOpenSessions={()=>openFeature('sessions')}/>} 
    {feature==='connections' && <Connections userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {feature==='messages' && <PrivateChats onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {feature==='podcasts' && <PodcastPlatform userId={session.user.id} isHealer={canCreateContent} podcastId={route.podcastId} episodeId={route.episodeId} studio={route.podcastStudio} studioAction={route.studioAction} studioPodcastId={route.studioPodcastId} studioEpisodeId={route.studioEpisodeId} onClose={closeOverlay} onOpenPodcast={openPodcast} onOpenEpisode={openPodcastEpisode} onOpenProfile={openProfile} onPlayEpisode={setPodcastPlayer}/>} 
    {feature==='profile' && <EditProfile userId={session.user.id} onClose={closeOverlay}/>} 
    {feature==='sessions' && <SessionsPage userId={session.user.id} isHealer={canCreateContent} onClose={closeOverlay} initialSessionId={route.sessionId} initialSessionView={route.sessionView}/>} 
    {feature==='healer' && <HealerDashboard userId={session.user.id} onOpenSession={(id)=>{closeOverlay();openFeature('sessions');setTimeout(()=>setRoute(`sessions/${id}`),50)}} onCreateSession={()=>{closeOverlay();openFeature('sessions');setTimeout(()=>setRoute('sessions'),100)}} onClose={closeOverlay}/>} 
    {feature==='notifications' && <Notifications userId={session.user.id} onClose={closeOverlay}/>} 
    {feature==='safety' && <SafetyCenter onClose={closeOverlay}/>} 
    {feature==='feedback' && <FeedbackForm onClose={closeOverlay}/>} 
    {feature==='feedback-admin' && <FeedbackAdmin onClose={closeOverlay}/>} 
    {profilePreview && <div className="feature-overlay"><section className="profile-window public-profile-window"><header><div><h2>{profileName(profilePreview)}</h2><p>{roleLabel(profilePreview)}{profilePreview.country?` · ${profilePreview.country}`:''}</p></div><button onClick={closeOverlay}><X/></button></header><div className="public-profile-body"><span className="avatar healer rose public-profile-avatar">{profilePreview.avatar_url?<img src={profilePreview.avatar_url} alt={`${profileName(profilePreview)} profile photo`} loading="lazy"/>:profileInitials(profileName(profilePreview))}<i className={profilePreview.online?'online':''}/></span><p>{profilePreview.about||'This member has not added an introduction yet.'}</p><div className="healer-tags">{[...(profilePreview.profile_type==='healer'?profilePreview.specialties||[]:[]),...(profilePreview.interests||[])].slice(0,6).map(tag=><span key={tag}>{tag}</span>)}</div><ProfilePreviewActions profile={profilePreview} friendships={friendships} userId={session.user.id} onConnect={connectWith} onMessage={startPrivateMessage} onSessions={()=>openFeature('sessions')} onCreatePodcast={()=>openPodcast('manage')} onCreateSession={()=>openFeature('sessions')}/></div></section></div>}
    {profilePreview && <div className="profile-podcast-sidecar"><ProfilePodcastSection profileId={profilePreview.id} onOpenPodcast={openPodcast}/></div>}
    <PodcastMiniPlayer episode={podcastPlayer} onClose={() => setPodcastPlayer(null)}/>
    {notice && <div className="toast"><ShieldCheck size={17}/>{notice}</div>}
  </div>
}

export default App
