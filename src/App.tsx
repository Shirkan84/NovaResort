import { FormEvent, useEffect, useState } from 'react'
import {
  Bell, CalendarDays, ChevronDown, ChevronRight, CircleUserRound, Clock3,
  Bot, Compass, Heart, Home, Leaf, LockKeyhole, Menu, MessageCircleMore, MoreHorizontal,
  Search, Send, Settings, ShieldCheck, Sparkles, UsersRound, Video, X, Moon, Sun, Languages
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { ChatRoom, Connections, DbRoom, EditProfile, Notifications, PeopleDirectory, PrivateChats, SafetyCenter } from './CommunityFeatures'
import { AICompanion } from './AICompanion'
import { DiscoverPeople, HealersDirectory } from './PeopleDiscovery'
import { SessionsPage } from './SessionsEvents'
import { applyLanguage, getLanguage, switchLanguage } from './i18n'
import './social-home.css'

type Room = {
  title: string; description: string; people: number; color: string; icon: string; tags: string[]
}
type LiveProfile = { id:string;full_name:string;display_name:string|null;avatar_url:string|null;profile_type:string;specialties:string[];about:string;online:boolean }
type RecentMessage = { id:string;body:string;created_at:string;profiles?:{full_name:string;avatar_url:string|null}|null;rooms?:{id:string;name:string}|null }
type Feature = 'discover'|'people'|'healers'|'profile'|'notifications'|'messages'|'safety'|'connections'|'sessions'|'ai'
type AppRoute = { feature: Feature | null; roomId: string | null }

function routeFromHash(): AppRoute {
  const pathRoute = window.location.pathname
    .replace(/^\/NovaResort\/?/, '')
    .replace(/^\/+|\/+$/g, '')
  const value = decodeURIComponent(window.location.hash.replace(/^#\/?/, '') || pathRoute || 'home')
  if (value.startsWith('room/')) return { feature: null, roomId: value.slice(5) || null }
  if (value === 'discover' || value === 'members' || value === 'members/online') return { feature: 'discover', roomId: null }
  if (value === 'community' || value === 'rooms' || value === 'discover/rooms') return { feature: 'people', roomId: null }
  if (value === 'healers' || value === 'community/healers') return { feature: 'healers', roomId: null }
  if (value === 'connections') return { feature: 'connections', roomId: null }
  if (value === 'messages') return { feature: 'messages', roomId: null }
  if (value === 'ai' || value.startsWith('ai/')) return { feature: 'ai', roomId: null }
  if (value === 'sessions' || value === 'sessions/upcoming') return { feature: 'sessions', roomId: null }
  if (value === 'notifications') return { feature: 'notifications', roomId: null }
  if (value === 'profile' || value === 'settings') return { feature: 'profile', roomId: null }
  if (value === 'safety' || value === 'community-guidelines' || value === 'privacy' || value === 'terms') return { feature: 'safety', roomId: null }
  return { feature: null, roomId: null }
}

function setRoute(path: string) {
  const next = `#${path}`
  if (window.location.hash === next) window.dispatchEvent(new HashChangeEvent('hashchange'))
  else window.location.hash = next
}

function navFromFeature(feature: Feature | null) {
  if (feature === 'discover') return 'Discover'
  if (feature === 'people') return 'Community'
  if (feature === 'healers') return 'Healers'
  if (feature === 'messages') return 'Messages'
  if (feature === 'ai') return 'AI Companion'
  if (feature === 'connections') return 'Connections'
  if (feature === 'sessions') return 'Sessions'
  return 'Home'
}

const rooms: Room[] = [
  { title: 'Heart to Heart', description: 'A gentle space for honest conversations and mutual support.', people: 28, color: 'peach', icon: '♡', tags: ['Open', 'Moderated'] },
  { title: 'Mindful Moments', description: 'Pause, breathe, and return to yourself with the community.', people: 16, color: 'sage', icon: '✦', tags: ['Open', 'Guided'] },
  { title: 'Self Growth', description: 'Celebrate progress, share intentions, and grow together.', people: 21, color: 'lavender', icon: '⌁', tags: ['Open', 'Community'] },
]

function Logo() {
  return <div className="logo"><div className="logo-mark"><Leaf size={20} /><Sparkles size={10} /></div><div><b>nova</b><span>resort</span></div></div>
}

function AuthScreen() {
  const language = getLanguage()
  const [mode, setMode] = useState<'login'|'register'|'reset'>('login')
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
      if (mode === 'register') {
        const fullName = String(data.get('fullName') || '').trim()
        if (password !== String(data.get('confirmPassword') || '')) throw new Error('Passwords do not match.')
        if (!data.get('guidelines')) throw new Error('Please accept the community guidelines.')
        const { error } = await supabase.auth.signUp({ email, password, options: {
          emailRedirectTo: 'https://shirkan84.github.io/NovaResort/',
          data: { full_name: fullName, profile_type: data.get('profileType'), country: data.get('country') }
        }})
        if (error) throw error
        setMessage('Welcome to Nova Resort. Please check your email to verify your account.')
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://shirkan84.github.io/NovaResort/' })
        if (error) throw error
        setMessage('Password reset instructions have been sent to your email.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.') }
    finally { setLoading(false) }
  }

  return <div className="auth-page"><button className="language-toggle auth-language" onClick={()=>switchLanguage(language==='en'?'he':'en')}><Languages/>{language==='en'?'עברית':'English'}</button>
    <div className="auth-brand"><Logo/><div className="auth-hero-copy"><span className="auth-kicker"><Sparkles size={13}/> A SAFE SPACE TO BE HUMAN</span><h1>Connection can be<br/><em>part of the healing.</em></h1><p>Talk, listen, and grow in a thoughtful community built around emotional wellbeing and meaningful human connection.</p><div className="auth-values"><span><Heart/>Kind connection</span><span><ShieldCheck/>Safety first</span><span><Leaf/>Space to grow</span></div></div><p className="auth-disclaimer">Nova Resort is a peer-support community and is not a substitute for professional or emergency services.</p></div>
    <div className="auth-panel"><div className="auth-mobile-logo"><Logo/></div><div className="auth-form-wrap"><span className="welcome-icon"><Leaf size={22}/></span>
      <h2>{mode === 'register' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome to Nova Resort'}</h2>
      <p>{mode === 'register' ? 'Join a community where you can feel seen and supported.' : mode === 'reset' ? 'We’ll send a secure reset link to your email.' : 'Sign in to return to your community.'}</p>
      {message && <div className="form-message success"><ShieldCheck size={17}/>{message}</div>}{error && <div className="form-message error">{error}</div>}
      <form onSubmit={submit}>
        {mode === 'register' && <><label>Full name<input name="fullName" required placeholder="Your full name"/></label><div className="form-row"><label>Country<input name="country" required placeholder="Your country"/></label><label>Profile type<select name="profileType"><option value="member">Community member</option><option value="healer">Healer / Therapist</option></select></label></div></>}
        <label>Email address<input type="email" name="email" required placeholder="you@example.com"/></label>
        {mode !== 'reset' && <label>Password<input type="password" name="password" required minLength={8} placeholder="At least 8 characters"/></label>}
        {mode === 'register' && <><label>Confirm password<input type="password" name="confirmPassword" required minLength={8} placeholder="Repeat your password"/></label><label className="check-label"><input type="checkbox" name="guidelines"/>I agree to the Community Guidelines and Privacy Policy.</label></>}
        {mode === 'login' && <button type="button" className="forgot" onClick={() => {setMode('reset');setError('');setMessage('')}}>Forgot password?</button>}
        <button className="auth-submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}<ChevronRight size={17}/></button>
      </form>
      <div className="auth-switch">{mode === 'login' ? <>New to Nova Resort? <button onClick={() => setMode('register')}>Create an account</button></> : <>Already have an account? <button onClick={() => setMode('login')}>Sign in</button></>}</div>
    </div></div>
  </div>
}

function App() {
  const language = getLanguage()
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const [notice, setNotice] = useState('')
  const [activeNav, setActiveNav] = useState('Home')
  const [dbRooms, setDbRooms] = useState<DbRoom[]>([])
  const [selectedRoom, setSelectedRoom] = useState<DbRoom | null>(null)
  const [feature, setFeature] = useState<Feature | null>(null)
  const [route, setRouteState] = useState<AppRoute>(() => routeFromHash())
  const [showAllRooms,setShowAllRooms] = useState(false)
  const [liveHealers,setLiveHealers] = useState<LiveProfile[]>([])
  const [recentMessages,setRecentMessages] = useState<RecentMessage[]>([])
  const [currentAvatar,setCurrentAvatar] = useState<string|null>(null)
  const [metrics,setMetrics] = useState({members:0,online:0,healers:0,rooms:0,sessions:0,notifications:0,connections:0})

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
      setSelectedRoom(null)
      setFeature(route.feature)
      setActiveNav(navFromFeature(route.feature))
      if (!route.feature) window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    applyRouteToState()
    return () => { cancelled = true }
  }, [route, session, dbRooms, selectedRoom])
  useEffect(() => {
    if (!session) return
    const loadLiveData=async()=>{
      const fiveMinutesAgo=new Date(Date.now()-5*60*1000).toISOString()
      const [rooms,allMembers,online,healerCount,healers,activeRooms,sessions,notifications,connections,activity,me]=await Promise.all([
        supabase.from('rooms').select('id,name,description,icon,theme,is_private').eq('is_private',false).limit(6),
        supabase.from('profiles').select('id',{count:'exact',head:true}),
        supabase.from('profiles').select('id',{count:'exact',head:true}).gte('last_seen',fiveMinutesAgo),
        supabase.from('profiles').select('id',{count:'exact',head:true}).eq('profile_type','healer'),
        supabase.from('profiles').select('id,full_name,display_name,avatar_url,profile_type,specialties,about,online').eq('profile_type','healer').limit(6),
        supabase.from('rooms').select('id',{count:'exact',head:true}).eq('is_private',false),
        supabase.from('sessions').select('id',{count:'exact',head:true}).gte('starts_at',new Date().toISOString()).in('status',['published','live','registration_closed']),
        supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',session.user.id).is('read_at',null),
        supabase.from('friendships').select('id',{count:'exact',head:true}).eq('addressee_id',session.user.id).eq('status','pending'),
        supabase.from('messages').select('id,body,created_at,profiles!messages_sender_id_fkey(full_name,avatar_url),rooms!messages_room_id_fkey(id,name)').order('created_at',{ascending:false}).limit(3),
        supabase.from('profiles').select('avatar_url').eq('id',session.user.id).single()
      ])
      setDbRooms((rooms.data as DbRoom[])||[]);setLiveHealers((healers.data as LiveProfile[])||[]);setRecentMessages((activity.data as unknown as RecentMessage[])||[]);setCurrentAvatar(me.data?.avatar_url||null)
      setMetrics({members:allMembers.count||0,online:online.count||0,healers:healerCount.count||0,rooms:activeRooms.count||0,sessions:sessions.count||0,notifications:notifications.count||0,connections:connections.count||0})
    }
    const heartbeat=()=>supabase.from('profiles').update({online:true,last_seen:new Date().toISOString()}).eq('id',session.user.id)
    heartbeat();loadLiveData();const timer=window.setInterval(()=>{heartbeat();loadLiveData()},60000)
    return()=>{window.clearInterval(timer);supabase.from('profiles').update({online:false,last_seen:new Date().toISOString()}).eq('id',session.user.id)}
  }, [session])

  const act = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2800) }
  const openFeature = (next: Feature | null) => setRoute(next === 'people' ? 'community' : next || 'home')
  const openRoom = (room: DbRoom) => { setSelectedRoom(room); setFeature(null); setRoute(`room/${room.id}`) }
  const closeOverlay = () => setRoute('home')
  async function startPrivateMessage(person:LiveProfile){const {data,error}=await supabase.rpc('create_private_room',{other_user:person.id});if(error){act(error.message);return}openRoom({id:data,name:person.display_name||person.full_name,description:'Private two-person conversation',icon:'♢',theme:'sage',is_private:true})}

  if (authLoading) return <div className="auth-loader"><Logo/><span/></div>
  if (!session) return <AuthScreen/>
  const name = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Member'
  const initials = name.split(' ').map((part: string) => part[0]).join('').slice(0,2).toUpperCase()

  return <div className={dark ? 'app dark' : 'app'}>
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="side-top"><Logo/><button className="icon-btn close-mobile" onClick={() => setMenuOpen(false)}><X size={20}/></button></div>
      <nav>
        {[
          [Home, 'Home'], [Compass, 'Discover'], [UsersRound, 'Community'], [Heart, 'Healers'], [Heart, 'Connections'], [MessageCircleMore, 'Messages'], [Bot, 'AI Companion'], [CalendarDays, 'Sessions']
        ].map(([Icon, label]) => <button key={label as string} className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => {setMenuOpen(false);setRoute(label==='Community'?'community':label==='Discover'?'discover':label==='Healers'?'healers':label==='Connections'?'connections':label==='Messages'?'messages':label==='AI Companion'?'ai':label==='Sessions'?'sessions':'home')}}><Icon size={19}/><span>{label as string}</span>{label === 'Connections' && metrics.connections > 0 && <i>{metrics.connections}</i>}</button>)}
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
        <button className="signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
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
        </div>
      </header>

      <div className="content">
        <section className="welcome">
          <div><p className="eyebrow">WELCOME TO NOVA RESORT</p><h1>Good to see you, {name.split(' ')[0]} <span>✦</span></h1><p>Take a breath. You’re in a place where you can simply be.</p></div>
          <button className="primary" onClick={() => openFeature('people')}><Compass size={17}/> Explore the community</button>
        </section>

        <div className="stats">
          <div><span className="stat-icon green"><UsersRound/></span><p><b>{metrics.online}</b><small>Members online</small></p><em>{metrics.members} registered</em></div>
          <div><span className="stat-icon purple"><Heart/></span><p><b>{metrics.healers}</b><small>Healers available</small></p><em>Registered guides</em></div>
          <div><span className="stat-icon amber"><MessageCircleMore/></span><p><b>{metrics.rooms}</b><small>Active rooms</small></p><em>Join anytime</em></div>
          <div><span className="stat-icon blue"><CalendarDays/></span><p><b>{metrics.sessions}</b><small>Upcoming sessions</small></p><button onClick={() => openFeature('sessions')}>View sessions</button></div>
        </div>

        <div className="quick-actions">
          <button onClick={() => openFeature('discover')}><UsersRound size={16}/> Find people</button>
          <button onClick={() => openFeature('healers')}><Heart size={16}/> Find a healer</button>
          <button onClick={() => openFeature('sessions')}><CalendarDays size={16}/> Create session</button>
          <button onClick={() => openFeature('ai')}><Bot size={16}/> AI Companion</button>
          <button onClick={() => openFeature('messages')}><MessageCircleMore size={16}/> Private rooms</button>
        </div>

        <div className="layout">
          <div className="main-col">
            <section>
              <div className="section-head"><div><h2>Find your space</h2><p>Join a conversation that feels right for you today.</p></div><button onClick={() => setShowAllRooms(!showAllRooms)}>{showAllRooms?'Show fewer rooms':'View all rooms'} <ChevronRight size={16}/></button></div>
              <div className="room-grid">
                {(dbRooms.length ? dbRooms.slice(0,showAllRooms?6:3).map(r=>({title:r.name,description:r.description,people:0,color:r.theme,icon:r.icon,tags:['Open','Live'],db:r})) : rooms.map(r=>({...r,db:null as DbRoom|null}))).map(room => <article className={`room-card ${room.color}`} key={room.title}>
                  <div className="room-art"><span>{room.icon}</span><div className="bubble b1"></div><div className="bubble b2"></div><div className="bubble b3"></div></div>
                  <div className="room-info"><div className="tags">{room.tags.map((t,i) => <span key={t} className={i === 0 ? 'open-tag' : ''}>{i === 0 && <i/>}{t}</span>)}</div><h3>{room.title}</h3><p>{room.description}</p><div className="room-bottom"><span><UsersRound size={15}/>{room.people ? `${room.people} here now` : 'Real-time room'}</span><button onClick={() => room.db ? openRoom(room.db) : act('Database setup is required first')}>Join room <ChevronRight size={15}/></button></div></div>
                </article>)}
              </div>
            </section>

            <section className="healer-section">
              <div className="section-head"><div><h2>Connect with a healer</h2><p>Community healers who are here to listen and support.</p></div><button onClick={() => openFeature('healers')}>View all healers <ChevronRight size={16}/></button></div>
              <div className="healer-grid">{liveHealers.length===0?<div className="inline-empty">No healers have registered yet.</div>:liveHealers.slice(0,3).map((h,i) => <article className="healer-card" key={h.id}>
                <div className={`avatar healer ${['rose','blue','gold'][i%3]}`}>{h.avatar_url?<img src={h.avatar_url} alt=""/>:(h.display_name||h.full_name||'H').slice(0,2).toUpperCase()}<i className={h.online ? 'online' : ''}/></div>
                <div className="healer-info"><h3>{h.display_name||h.full_name}<Heart size={14}/></h3><p>Healer / Therapist</p><span>{h.specialties?.[0]||'Emotional wellness'}</span></div>
                <button aria-label={`Message ${h.full_name}`} onClick={() => startPrivateMessage(h)}><MessageCircleMore size={18}/></button>
              </article>)}</div>
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
      </div>
    </main>
    {menuOpen && <button className="backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)}/>} 
    {feature==='discover' && <DiscoverPeople userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {selectedRoom && <ChatRoom room={selectedRoom} userId={session.user.id} onClose={closeOverlay}/>} 
    {feature==='people' && <PeopleDirectory userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {feature==='healers' && <HealersDirectory userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {feature==='connections' && <Connections userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {feature==='messages' && <PrivateChats onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {feature==='ai' && <AICompanion userId={session.user.id} onClose={closeOverlay}/>} 
    {feature==='profile' && <EditProfile userId={session.user.id} onClose={closeOverlay}/>} 
    {feature==='sessions' && <SessionsPage userId={session.user.id} onClose={closeOverlay}/>} 
    {feature==='notifications' && <Notifications userId={session.user.id} onClose={closeOverlay}/>} 
    {feature==='safety' && <SafetyCenter onClose={closeOverlay}/>} 
    {notice && <div className="toast"><ShieldCheck size={17}/>{notice}</div>}
  </div>
}

export default App
