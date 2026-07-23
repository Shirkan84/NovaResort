import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, Clock3, CircleDot, Plus, Users, Video, X, ChevronRight, Pencil,
  MessageCircleMore, Headphones, Mic, UserPlus, Bell, Settings, ExternalLink,
  Trash2, Send, Eye, TrendingUp, AlertTriangle, CheckCircle2, Loader2, Star,
  MapPin, Globe, Mic2, Play, Pause, BarChart3, Link2, Heart
} from 'lucide-react'
import { supabase } from './supabase'

type SessionRow = {
  id:string;host_id:string;title:string;description:string;category:string;language:string;
  starts_at:string;ends_at:string;status:string;capacity:number;session_type:string;
  cover_image_url:string|null;price:number;
  profiles?:{full_name:string;display_name:string|null;avatar_url:string|null}|null;
  session_registrations?:{status:string;user_id:string}[];
  session_room_state?:{status:string;started_at:string|null;ended_at:string|null}|null;
}
type Profile = {
  id:string;full_name:string;display_name:string|null;avatar_url:string|null;
  profile_type:string;professional_title:string|null;professional_verification_status:string|null;
  about:string|null;specialties:string[]|null;interests:string[]|null;
  languages:string[]|null;country:string|null;city:string|null;
  availability:string|null;years_experience:number|null;
  online:boolean|null;visibility:string|null;discoverable:boolean|null;
}
type Connection = {id:string;requester_id:string;addressee_id:string;status:string;created_at:string;
  profiles?:{full_name:string;display_name:string|null;avatar_url:string|null;online:boolean|null}|null}
type Podcast = {id:string;title:string;short_description:string|null;cover_image_url:string|null;
  category:string|null;language:string|null;creator_id:string;status:string;visibility:string|null;
  follower_count:number;episode_count:number;total_plays:number;
  latest_episode_title:string|null;latest_episode_published_at:string|null}
type PodcastEpisode = {id:string;podcast_id:string;title:string;status:string;published_at:string|null;
  audio_duration_seconds:number|null;media_kind:string|null;created_at:string;deleted_at:string|null}
type Notification = {id:string;type:string;title:string|null;body:string|null;entity_id:string|null;
  read_at:string|null;created_at:string;actor_id:string|null;
  profiles?:{full_name:string;avatar_url:string|null}|null}
type PrivateRoom = {id:string;name:string;other_user_id?:string;other_online?:boolean;
  last_message?:string;unread_count?:number;last_activity?:string}

const CATEGORY_ICONS:Record<string,any> = {bug_report:'🐛',feature_request:'💡',improvement:'⭐',question:'❓',general:'📝',other:'📌'}
const STATUS_COLORS:Record<string,string> = {new:'#526f62',in_review:'#a67a45',resolved:'#5a7b87',closed:'#999'}
const SESSION_STATUS_LABELS:Record<string,string> = {published:'Published',live:'Live',completed:'Completed',cancelled:'Cancelled',draft:'Draft',registration_closed:'Reg Closed'}

function fmtTime(iso:string){return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function fmtDate(iso:string){return new Date(iso).toLocaleDateString([],{month:'short',day:'numeric'})}
function fmtDateTime(iso:string){return new Date(iso).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
function timeAgo(iso:string){const d=Date.now()-new Date(iso).getTime();if(d<60000)return'just now';if(d<3600000)return`${Math.floor(d/60000)}m ago`;if(d<86400000)return`${Math.floor(d/3600000)}h ago`;return`${Math.floor(d/86400000)}d ago`}
function duration(start:string,end:string){const ms=new Date(end).getTime()-new Date(start).getTime();const h=Math.floor(ms/3600000);const m=Math.floor((ms%3600000)/60000);return h>0?`${h}h ${m}m`:`${m}m`}
function profileCompletion(p:Profile):{percent:number;missing:string[]}{
  const checks:{key:string;label:string}[]=[
    {key:'avatar_url',label:'Profile photo'},{key:'professional_title',label:'Professional title'},
    {key:'about',label:'Biography'},{key:'specialties',label:'Specialties'},
    {key:'languages',label:'Languages'},{key:'country',label:'Country'},{key:'availability',label:'Availability'}
  ]
  const missing=checks.filter(c=>{const v=(p as any)[c.key];return !v||(Array.isArray(v)&&v.length===0)}).map(c=>c.label)
  return{percent:Math.round(((checks.length-missing.length)/checks.length)*100),missing}
}

export function HealerDashboard({userId,onOpenSession,onCreateSession,onClose}:{userId:string;onOpenSession:(id:string)=>void;onCreateSession:()=>void;onClose:()=>void}){
  const [profile,setProfile]=useState<Profile|null>(null)
  const [sessions,setSessions]=useState<SessionRow[]>([])
  const [connections,setConnections]=useState<Connection[]>([])
  const [podcasts,setPodcasts]=useState<Podcast[]>([])
  const [episodes,setEpisodes]=useState<PodcastEpisode[]>([])
  const [notifications,setNotifications]=useState<Notification[]>([])
  const [privateRooms,setPrivateRooms]=useState<PrivateRoom[]>([])
  const [healerStats,setHealerStats]=useState<{follower_count:number;review_count:number;avg_rating:number|null;profile_view_count:number}|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [activeTab,setActiveTab]=useState<'overview'|'sessions'|'connections'|'podcasts'|'activity'>('overview')

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const [profRes,sessionsRes,connsRes,podRes,epRes,notiRes]=await Promise.all([
        supabase.from('profiles').select('id,full_name,display_name,avatar_url,profile_type,professional_title,professional_verification_status,about,specialties,interests,languages,country,city,availability,years_experience,online,visibility,discoverable').eq('id',userId).single(),
        supabase.from('sessions').select('id,host_id,title,description,category,language,starts_at,ends_at,status,capacity,session_type,cover_image_url,price,profiles!sessions_host_id_fkey(full_name,display_name,avatar_url),session_registrations(status,user_id),session_room_state(status,started_at,ended_at)').eq('host_id',userId).order('starts_at',{ascending:false}).limit(50),
        supabase.from('friendships').select('id,requester_id,addressee_id,status,created_at,profiles!friendships_requester_id_fkey(full_name,display_name,avatar_url,online)').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`).eq('status','accepted').order('created_at',{ascending:false}).limit(50),
        supabase.from('podcasts').select('id,title,short_description,cover_image_url,category,language,creator_id,status,visibility,follower_count,episode_count,total_plays,latest_episode_title,latest_episode_published_at').eq('creator_id',userId).order('created_at',{ascending:false}),
        supabase.from('podcast_episodes').select('id,podcast_id,title,status,published_at,audio_duration_seconds,media_kind,created_at,deleted_at').eq('creator_id',userId).is('deleted_at',null).order('created_at',{ascending:false}).limit(20),
        supabase.from('notifications').select('id,type,title,body,entity_id,read_at,created_at,actor_id,profiles!notifications_actor_id_fkey(full_name,avatar_url)').eq('user_id',userId).order('created_at',{ascending:false}).limit(30)
      ])
      if(profRes.error)throw profRes.error
      setProfile(profRes.data as Profile)
      setSessions((sessionsRes.data as unknown as SessionRow[])||[])
      setConnections((connsRes.data as unknown as Connection[])||[])
      setPodcasts((podRes.data as Podcast[])||[])
      setEpisodes((epRes.data as PodcastEpisode[])||[])
      setNotifications((notiRes.data as unknown as Notification[])||[])

      // Load private rooms for unread count
      try{
        const {data:rooms}=await supabase.rpc('list_private_rooms')
        if(rooms)setPrivateRooms(rooms as PrivateRoom[])
      }catch{}

      // Load healer-specific stats
      try{
        const {data:stats}=await supabase.rpc('get_healer_dashboard_stats',{target_healer:userId})
        if(stats)setHealerStats(stats as any)
      }catch{}
    }catch(e:any){setError(e.message||'Failed to load dashboard')}finally{setLoading(false)}
  },[userId])

  useEffect(()=>{load()},[load])

  const now=Date.now()
  const upcoming=sessions.filter(s=>new Date(s.starts_at).getTime()>=now&&s.status!=='cancelled')
  const active=sessions.filter(s=>s.session_room_state?.status==='live')
  const past=sessions.filter(s=>new Date(s.ends_at).getTime()<now||s.status==='completed'||s.status==='cancelled')
  const totalRegs=sessions.reduce((sum,s)=>sum+(s.session_registrations?.filter(r=>r.status==='registered'||r.status==='attended').length||0),0)
  const uniqueAttendees=new Set(sessions.flatMap(s=>s.session_registrations?.filter(r=>r.status==='registered'||r.status==='attended').map(r=>r.user_id)||[])).size
  const totalPodFollowers=podcasts.reduce((s,p)=>s+p.follower_count,0)
  const totalPlays=podcasts.reduce((s,p)=>s+p.total_plays,0)
  const unreadNotifs=notifications.filter(n=>!n.read_at).length
  const unreadMessages=privateRooms.reduce((s,r)=>s+(r.unread_count||0),0)
  const publishedPodcasts=podcasts.filter(p=>p.status==='published')
  const draftEpisodes=episodes.filter(e=>e.status==='draft')
  const publishedEpisodes=episodes.filter(e=>e.status==='published')
  const connProfiles=connections.map(c=>{
    const otherId=c.requester_id===userId?c.addressee_id:c.requester_id
    const prof=c.profiles
    return{...c,otherId,displayName:prof?.full_name||'Member',avatarUrl:prof?.avatar_url,online:prof?.online}
  })
  const comp=profile?profileCompletion(profile):{percent:0,missing:[]}
  const alerts:{icon:any;color:string;message:string;action:()=>void;actionLabel:string}[]=[]
  if(comp.percent<100)alerts.push({icon:AlertTriangle,color:'#a67a45',message:`Profile is ${comp.percent}% complete. Missing: ${comp.missing.slice(0,3).join(', ')}`,action:()=>window.location.hash='#/profile',actionLabel:'Complete Profile'})
  upcoming.slice(0,3).forEach(s=>{
    const minsUntil=(new Date(s.starts_at).getTime()-now)/60000
    if(minsUntil<=60&&minsUntil>0&&!s.session_room_state)alerts.push({icon:Video,color:'#cf685f',message:`"${s.title}" starts in ${Math.ceil(minsUntil)} min — open the room`,action:()=>onOpenSession(s.id),actionLabel:'Open Room'})
    const regs=s.session_registrations?.filter(r=>r.status==='registered').length||0
    if(regs===0&&new Date(s.starts_at).getTime()-now<86400000)alerts.push({icon:Users,color:'#a67a45',message:`"${s.title}" has no registrations yet`,action:()=>onOpenSession(s.id),actionLabel:'View Session'})
    if(regs>=s.capacity-2&&regs<s.capacity)alerts.push({icon:TrendingUp,color:'#526f62',message:`"${s.title}" is almost full (${regs}/${s.capacity})`,action:()=>onOpenSession(s.id),actionLabel:'View Details'})
  })
  if(unreadMessages>0)alerts.push({icon:MessageCircleMore,color:'#5a7b87',message:`You have ${unreadMessages} unread message${unreadMessages>1?'s':''}`,action:()=>window.location.hash='#/messages',actionLabel:'Read Messages'})
  draftEpisodes.slice(0,2).forEach(ep=>{
    alerts.push({icon:Headphones,color:'#a67a45',message:`Draft episode "${ep.title}" is not published`,action:()=>window.location.hash='#/podcasts/manage',actionLabel:'Publish'})
  })

  const recentActivity=notifications.slice(0,10).map(n=>({
    id:n.id,type:n.type,title:n.title||n.type,body:n.body,entityId:n.entity_id,
    createdAt:n.created_at,actorName:n.profiles?.full_name||'Someone',actorAvatar:n.profiles?.avatar_url,
    action:()=>{
      if(n.entity_id){
        if(n.type?.includes('session'))onOpenSession(n.entity_id)
        else if(n.type?.includes('connection'))window.location.hash='#/connections'
        else if(n.type?.includes('podcast'))window.location.hash='#/podcasts/manage'
        else window.location.hash='#/notifications'
      }else window.location.hash='#/notifications'
    }
  }))

  if(loading)return <div className="hd-overlay"><div className="hd-window"><div className="hd-loading"><Loader2 size={24} className="spin"/><span>Loading dashboard…</span></div></div></div>
  if(error)return <div className="hd-overlay"><div className="hd-window"><div className="hd-error">{error}<button onClick={load}>Retry</button></div></div></div>
  if(!profile)return <div className="hd-overlay"><div className="hd-window"><div className="hd-error">Profile not found.</div></div></div>

  const displayName=profile.display_name||profile.full_name||'Healer'
  const initials=displayName.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  const upcomingNext=upcoming[0]

  return <div className="hd-overlay"><div className="hd-window">
    {/* ── Header ── */}
    <header className="hd-header">
      <div className="hd-header-left">
        <button className="hd-back" onClick={onClose}><X size={18}/></button>
        <div className="hd-avatar">{profile.avatar_url?<img src={profile.avatar_url} alt={displayName}/>:<span>{initials}</span>}</div>
        <div className="hd-header-info">
          <h1>Welcome back, {displayName.split(' ')[0]}</h1>
          <p>{profile.professional_title||'Wellness Professional'}{profile.professional_verification_status==='verified'?' · Verified':''}</p>
        </div>
      </div>
      <div className="hd-header-right">
        <div className="hd-comp-badge" data-complete={comp.percent===100}>
          <div className="hd-comp-bar"><div style={{width:`${comp.percent}%`}}/></div>
          <span>{comp.percent}% complete</span>
        </div>
        <button className="hd-btn hd-btn-outline" onClick={()=>window.location.hash='#/profile'}><Settings size={14}/> Edit Profile</button>
        <button className="hd-btn hd-btn-outline" onClick={()=>window.location.hash=`/profile/${userId}`}><ExternalLink size={14}/> Public Profile</button>
      </div>
    </header>

    {/* ── Tabs ── */}
    <nav className="hd-tabs">
      {(['overview','sessions','connections','podcasts','activity'] as const).map(t=>
        <button key={t} className={activeTab===t?'active':''} onClick={()=>setActiveTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>
      )}
    </nav>

    <div className="hd-body">
    {activeTab==='overview'?<div>
      {/* ── Metrics ── */}
      <div className="hd-metrics">
        <div className="hd-metric" onClick={()=>setActiveTab('sessions')}>
          <CalendarDays size={18}/><div><b>{upcoming.length}</b><span>Upcoming Sessions</span></div>
        </div>
        <div className="hd-metric live" onClick={()=>setActiveTab('sessions')}>
          <CircleDot size={18}/><div><b>{active.length}</b><span>Live Now</span></div>
        </div>
        <div className="hd-metric">
          <Users size={18}/><div><b>{totalRegs}</b><span>Total Registrations</span></div>
        </div>
        <div className="hd-metric" onClick={()=>setActiveTab('connections')}>
          <Heart size={18}/><div><b>{healerStats?.follower_count||connections.length}</b><span>Followers</span></div>
        </div>
        {healerStats?.avg_rating!==null&&<div className="hd-metric">
          <Star size={18}/><div><b>{healerStats!.avg_rating?.toFixed(1)}</b><span>Rating ({healerStats!.review_count})</span></div>
        </div>}
        {healerStats?.profile_view_count!==undefined&&<div className="hd-metric">
          <Eye size={18}/><div><b>{healerStats.profile_view_count}</b><span>Profile Views (30d)</span></div>
        </div>}
        {podcasts.length>0&&<div className="hd-metric" onClick={()=>setActiveTab('podcasts')}>
          <Headphones size={18}/><div><b>{publishedPodcasts.length}</b><span>Podcasts</span></div>
        </div>}
        {totalPodFollowers>0&&<div className="hd-metric">
          <Heart size={18}/><div><b>{totalPodFollowers}</b><span>Podcast Followers</span></div>
        </div>}
        {unreadMessages>0&&<div className="hd-metric" onClick={()=>window.location.hash='#/messages'}>
          <MessageCircleMore size={18}/><div><b>{unreadMessages}</b><span>Unread Messages</span></div>
        </div>}
        <div className="hd-metric" onClick={()=>window.location.hash='#/notifications'}>
          <Bell size={18}/><div><b>{unreadNotifs}</b><span>Notifications</span></div>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="hd-quick-actions">
        <h3>Quick Actions</h3>
        <div className="hd-qa-grid">
          <button className="hd-qa" onClick={onCreateSession}><Plus size={16}/> Create Session</button>
          <button className="hd-qa" onClick={()=>window.location.hash='#/podcasts/manage'}><Mic size={16}/> Create Podcast</button>
          <button className="hd-qa" onClick={()=>window.location.hash='#/sessions'}><Video size={16}/> View All Sessions</button>
          <button className="hd-qa" onClick={()=>window.location.hash='#/connections'}><UserPlus size={16}/> View Connections</button>
          <button className="hd-qa" onClick={()=>window.location.hash='#/messages'}><MessageCircleMore size={16}/> Messages</button>
          <button className="hd-qa" onClick={()=>window.location.hash='#/profile'}><Pencil size={16}/> Edit Profile</button>
          <button className="hd-qa" onClick={()=>window.location.hash=`/profile/${userId}`}><ExternalLink size={16}/> Public Profile</button>
        </div>
      </div>

      {/* ── Alerts ── */}
      {alerts.length>0&&<section className="hd-section hd-alerts">
        <div className="hd-section-head"><h3><AlertTriangle size={15}/> Needs Your Attention</h3></div>
        <div className="hd-alert-list">{alerts.map((a,i)=>
          <div key={i} className="hd-alert"><span className="hd-alert-icon" style={{color:a.color}}><a.icon size={15}/></span><p>{a.message}</p><button onClick={a.action}>{a.actionLabel}</button></div>
        )}</div>
      </section>}

      {/* ── Upcoming Sessions ── */}
      <section className="hd-section">
        <div className="hd-section-head"><h3><CalendarDays size={15}/> Upcoming Sessions</h3>{upcoming.length>3&&<button onClick={()=>setActiveTab('sessions')}>View all <ChevronRight size={14}/></button>}</div>
        {upcoming.length===0?<div className="hd-empty"><p>No upcoming sessions. Create one to get started.</p><button onClick={onCreateSession}><Plus size={14}/> Create Session</button></div>
        :<div className="hd-session-list">{upcoming.slice(0,5).map(s=>{
          const regCount=s.session_registrations?.filter(r=>r.status==='registered'||r.status==='attended').length||0
          const isLive=s.session_room_state?.status==='live'
          const minsUntil=(new Date(s.starts_at).getTime()-now)/60000
          return <article key={s.id} className={`hd-session ${isLive?'live':''}`}>
            <div className="hd-session-time"><span className="hd-session-day">{fmtDate(s.starts_at)}</span><span className="hd-session-clock">{fmtTime(s.starts_at)}</span></div>
            <div className="hd-session-info">
              <h4>{s.title}</h4>
              <div className="hd-session-meta">
                <span>{s.category}</span><span>·</span><span>{s.language}</span><span>·</span><span>{s.session_type}</span><span>·</span><span>{duration(s.starts_at,s.ends_at)}</span>
                {isLive&&<span className="hd-live-tag"><CircleDot size={10}/> LIVE</span>}
                {!isLive&&minsUntil<=60&&minsUntil>0&&<span className="hd-soon-tag">Starts in {Math.ceil(minsUntil)}m</span>}
              </div>
              <div className="hd-session-cap">
                <Users size={12}/> {regCount}/{s.capacity} registered
                {regCount>=s.capacity&&<span className="hd-full">FULL</span>}
              </div>
            </div>
            <div className="hd-session-actions">
              {isLive?<button className="hd-btn hd-btn-primary" onClick={()=>onOpenSession(s.id)}><Video size={13}/> Enter</button>
              :<button className="hd-btn hd-btn-outline" onClick={()=>onOpenSession(s.id)}><ChevronRight size={13}/> Details</button>}
            </div>
          </article>
        })}</div>}
      </section>
      {connProfiles.length>0&&<section className="hd-section">
        <div className="hd-section-head"><h3><Link2 size={15}/> Connections</h3>{connections.length>5&&<button onClick={()=>window.location.hash='#/connections'}>View all <ChevronRight size={14}/></button>}</div>
        <div className="hd-conn-list">{connProfiles.slice(0,5).map(c=>
          <div key={c.id} className="hd-conn-row">
            <div className="hd-conn-avatar">{c.avatarUrl?<img src={c.avatarUrl} alt={c.displayName}/>:<span>{c.displayName[0]}</span>}</div>
            <div className="hd-conn-info"><b>{c.displayName}</b><span>{timeAgo(c.created_at)}</span></div>
            <button className="hd-btn hd-btn-sm" onClick={()=>window.location.hash=`/profile/${c.otherId}`}>View</button>
          </div>
        )}</div>
      </section>}

      {/* ── Podcasts ── */}
      {podcasts.length>0&&<section className="hd-section">
        <div className="hd-section-head"><h3><Headphones size={15}/> Podcasts</h3><button onClick={()=>window.location.hash='#/podcasts/manage'}>Manage <ChevronRight size={14}/></button></div>
        <div className="hd-podcast-cards">{podcasts.slice(0,3).map(p=>
          <article key={p.id} className="hd-podcast-card" onClick={()=>window.location.hash=`/podcasts/${p.id}`}>
            <div className="hd-podcast-cover">{p.cover_image_url?<img src={p.cover_image_url} alt={p.title}/>:<Headphones size={24}/>}</div>
            <div className="hd-podcast-info">
              <h4>{p.title}</h4>
              <div className="hd-podcast-stats">
                <span><Play size={11}/> {p.total_plays} plays</span>
                <span><Heart size={11}/> {p.follower_count} followers</span>
                <span><Mic size={11}/> {p.episode_count} episodes</span>
              </div>
              {p.latest_episode_title&&<p className="hd-podcast-latest">Latest: {p.latest_episode_title}</p>}
            </div>
          </article>
        )}</div>
        <div className="hd-cta-row">
          <button className="hd-btn hd-btn-outline" onClick={()=>window.location.hash='#/podcasts/manage'}><Headphones size={14}/> Manage Podcasts</button>
          <button className="hd-btn hd-btn-primary" onClick={()=>window.location.hash='#/podcasts/manage/new'}><Plus size={14}/> Create Podcast</button>
        </div>
      </section>}
      {podcasts.length===0&&<section className="hd-section">
        <div className="hd-section-head"><h3><Headphones size={15}/> Podcasts</h3></div>
        <div className="hd-empty"><Headphones size={28}/><p>Share your knowledge by creating your first podcast.</p><button onClick={()=>window.location.hash='#/podcasts/manage/new'}><Mic size={14}/> Create Your First Podcast</button></div>
      </section>}

      {/* ── Messages ── */}
      <section className="hd-section">
        <div className="hd-section-head"><h3><MessageCircleMore size={15}/> Messages</h3><button onClick={()=>window.location.hash='#/messages'}>View all <ChevronRight size={14}/></button></div>
        {privateRooms.length===0?<div className="hd-empty"><p>No conversations yet.</p></div>
        :<div className="hd-msg-list">{privateRooms.slice(0,4).map(r=>
          <button key={r.id} className="hd-msg-row" onClick={()=>window.location.hash=`/room/${r.id}`}>
            <div className="hd-msg-info"><b>{r.name}</b><p>{r.last_message||'No messages yet'}</p></div>
            <div className="hd-msg-meta">{r.unread_count?<span className="hd-unread">{r.unread_count}</span>:null}{r.last_activity&&<span>{timeAgo(r.last_activity)}</span>}</div>
          </button>
        )}</div>}
      </section>
      {comp.percent<100&&<section className="hd-section hd-profile-strength">
        <div className="hd-section-head"><h3><Star size={15}/> Profile Strength</h3><span className="hd-comp-pct">{comp.percent}%</span></div>
        <div className="hd-comp-bar-lg"><div style={{width:`${comp.percent}%`}}/></div>
        <div className="hd-missing-fields">{comp.missing.map(f=><span key={f}>{f}</span>)}</div>
        <button className="hd-btn hd-btn-primary" onClick={()=>window.location.hash='#/profile'}><Pencil size={14}/> Complete Your Profile</button>
      </section>}

      {/* ── Calendar Preview ── */}
      {upcoming.length>0&&<section className="hd-section">
        <div className="hd-section-head"><h3><CalendarDays size={15}/> This Week</h3><button onClick={()=>setActiveTab('sessions')}>Full list <ChevronRight size={14}/></button></div>
        <div className="hd-calendar">{upcoming.slice(0,7).map(s=>{
          const d=new Date(s.starts_at)
          const dayName=d.toLocaleDateString([],{weekday:'short'})
          const dayNum=d.getDate()
          return <button key={s.id} className="hd-cal-item" onClick={()=>onOpenSession(s.id)}>
            <div className="hd-cal-date"><span className="hd-cal-day">{dayName}</span><span className="hd-cal-num">{dayNum}</span></div>
            <div className="hd-cal-info"><b>{s.title}</b><span>{fmtTime(s.starts_at)} · {s.category}</span></div>
          </button>
        })}</div>
      </section>}

      {/* ── Recent Activity ── */}
      {recentActivity.length>0&&<section className="hd-section">
        <div className="hd-section-head"><h3><Bell size={15}/> Recent Activity</h3><button onClick={()=>window.location.hash='#/notifications'}>All notifications <ChevronRight size={14}/></button></div>
        <div className="hd-activity-list">{recentActivity.map(a=>
          <button key={a.id} className="hd-activity-row" onClick={a.action}>
            <div className="hd-activity-avatar">{a.actorAvatar?<img src={a.actorAvatar} alt=""/>:<span>{a.actorName[0]}</span>}</div>
            <div className="hd-activity-info"><p><b>{a.actorName}</b> {a.body||a.title||a.type}</p><span>{timeAgo(a.createdAt)}</span></div>
          </button>
        )}</div>
      </section>}
    </div>:null}

    {activeTab==='sessions'?<div>
      <div className="hd-tab-header">
        <h2>My Sessions</h2>
        <button className="hd-btn hd-btn-primary" onClick={onCreateSession}><Plus size={14}/> Create Session</button>
      </div>
      <div className="hd-session-tabs">{(['upcoming','active','past'] as const).map(t=>
        <button key={t} className={t==='upcoming'?'active':''}>{t[0].toUpperCase()+t.slice(1)} ({t==='upcoming'?upcoming.length:t==='active'?active.length:past.length})</button>
      )}</div>
      <div className="hd-session-list">{upcoming.map(s=>{
        const regCount=s.session_registrations?.filter(r=>r.status==='registered'||r.status==='attended').length||0
        return <article key={s.id} className="hd-session">
          <div className="hd-session-time"><span className="hd-session-day">{fmtDate(s.starts_at)}</span><span className="hd-session-clock">{fmtTime(s.starts_at)}</span></div>
          <div className="hd-session-info">
            <h4>{s.title}</h4>
            <div className="hd-session-meta"><span>{s.category}</span><span>·</span><span>{s.language}</span><span>·</span><span>{s.session_type}</span><span>·</span><span>{duration(s.starts_at,s.ends_at)}</span></div>
            <div className="hd-session-cap"><Users size={12}/> {regCount}/{s.capacity}</div>
          </div>
          <div className="hd-session-actions">
            <button className="hd-btn hd-btn-outline" onClick={()=>onOpenSession(s.id)}><ChevronRight size={13}/> Details</button>
          </div>
        </article>
      })}</div>
    </div>:null}

    {activeTab==='connections'?<div>
      <div className="hd-tab-header"><h2>Connections</h2><span>{connections.length} total</span></div>
      <div className="hd-conn-list">{connProfiles.map(c=>
        <div key={c.id} className="hd-conn-row">
          <div className="hd-conn-avatar">{c.avatarUrl?<img src={c.avatarUrl} alt={c.displayName}/>:<span>{c.displayName[0]}</span>}</div>
          <div className="hd-conn-info"><b>{c.displayName}</b><span>Connected {timeAgo(c.created_at)}</span></div>
          <div className="hd-conn-actions">
            <button className="hd-btn hd-btn-sm" onClick={()=>window.location.hash=`/profile/${c.otherId}`}>Profile</button>
            <button className="hd-btn hd-btn-sm" onClick={()=>window.location.hash=`/messages`}>Message</button>
          </div>
        </div>
      )}</div>
      {connections.length===0&&<div className="hd-empty"><UserPlus size={28}/><p>No connections yet. Visit the Community or Discover page to connect with members.</p><button onClick={()=>window.location.hash='#/discover'}>Discover Members</button></div>}
    </div>:null}

    {activeTab==='podcasts'?<div>
      <div className="hd-tab-header">
        <h2>My Podcasts</h2>
        <button className="hd-btn hd-btn-primary" onClick={()=>window.location.hash='#/podcasts/manage/new'}><Plus size={14}/> Create Podcast</button>
      </div>
      {podcasts.length===0?<div className="hd-empty"><Headphones size={28}/><p>Share your knowledge with the community.</p><button onClick={()=>window.location.hash='#/podcasts/manage/new'}><Mic size={14}/> Create Your First Podcast</button></div>
      :<div className="hd-podcast-list">{podcasts.map(p=>
        <article key={p.id} className="hd-podcast-row">
          <div className="hd-podcast-cover-lg">{p.cover_image_url?<img src={p.cover_image_url} alt={p.title}/>:<Headphones size={28}/>}</div>
          <div className="hd-podcast-detail">
            <h4>{p.title}</h4>
            <p>{p.short_description||'No description'}</p>
            <div className="hd-podcast-stats"><span><Play size={11}/> {p.total_plays}</span><span><Heart size={11}/> {p.follower_count}</span><span><Mic size={11}/> {p.episode_count} episodes</span><span className={`hd-ps-status ${p.status}`}>{p.status}</span></div>
          </div>
          <div className="hd-podcast-actions">
            <button className="hd-btn hd-btn-outline" onClick={()=>window.location.hash=`/podcasts/manage/${p.id}`}>Manage</button>
            <button className="hd-btn hd-btn-outline" onClick={()=>window.location.hash=`/podcasts/${p.id}`}>View</button>
          </div>
        </article>
      )}</div>}
      {draftEpisodes.length>0&&<section className="hd-section" style={{marginTop:16}}>
        <div className="hd-section-head"><h3>Draft Episodes</h3></div>
        <div className="hd-episode-list">{draftEpisodes.map(ep=>
          <div key={ep.id} className="hd-episode-row"><span className="hd-ep-status draft">Draft</span>{ep.media_kind==='video'&&<span className="hd-ep-status" style={{background:'#7c3aed',color:'#fff'}}>Video</span>}<b>{ep.title}</b><span>{timeAgo(ep.created_at)}</span><button onClick={()=>window.location.hash='#/podcasts/manage'}>Edit</button></div>
        )}</div>
      </section>}
    </div>:null}

    {activeTab==='activity'?<div>
      <div className="hd-tab-header"><h2>Recent Activity</h2></div>
      {recentActivity.length===0?<div className="hd-empty"><Bell size={28}/><p>No recent activity.</p></div>
      :<div className="hd-activity-list full">{recentActivity.map(a=>
        <button key={a.id} className="hd-activity-row" onClick={a.action}>
          <div className="hd-activity-avatar">{a.actorAvatar?<img src={a.actorAvatar} alt=""/>:<span>{a.actorName[0]}</span>}</div>
          <div className="hd-activity-info"><p><b>{a.actorName}</b> {a.body||a.title||a.type}</p><span>{timeAgo(a.createdAt)}</span></div>
        </button>
      )}</div>}
    </div>:null}
    </div>
  </div></div>
}
