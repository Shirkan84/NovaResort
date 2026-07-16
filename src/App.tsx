import { FormEvent, useEffect, useState } from 'react'
import {
  Bell, CalendarDays, ChevronDown, ChevronRight, CircleUserRound, Clock3,
  Compass, Heart, Home, Leaf, LockKeyhole, Menu, MessageCircleMore, MoreHorizontal,
  Search, Send, Settings, ShieldCheck, Sparkles, UsersRound, Video, X, Moon, Sun, Languages
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { ChatRoom, DbRoom, EditProfile, Notifications, PeopleDirectory } from './CommunityFeatures'
import { applyLanguage, getLanguage, switchLanguage } from './i18n'

type Room = {
  title: string; description: string; people: number; color: string; icon: string; tags: string[]
}

const rooms: Room[] = [
  { title: 'Heart to Heart', description: 'A gentle space for honest conversations and mutual support.', people: 28, color: 'peach', icon: '♡', tags: ['Open', 'Moderated'] },
  { title: 'Mindful Moments', description: 'Pause, breathe, and return to yourself with the community.', people: 16, color: 'sage', icon: '✦', tags: ['Open', 'Guided'] },
  { title: 'Self Growth', description: 'Celebrate progress, share intentions, and grow together.', people: 21, color: 'lavender', icon: '⌁', tags: ['Open', 'Community'] },
]

const healers = [
  { name: 'Maya Bennett', role: 'Mindfulness guide', focus: 'Anxiety & stress', avatar: 'MB', tone: 'rose', online: true },
  { name: 'Noah Williams', role: 'Wellness coach', focus: 'Self growth', avatar: 'NW', tone: 'blue', online: true },
  { name: 'Amara Lewis', role: 'Breathwork guide', focus: 'Mind & body', avatar: 'AL', tone: 'gold', online: false },
]

const conversations = [
  { name: 'Olivia Chen', message: 'That really helped, thank you 🌿', time: '2m', avatar: 'OC', unread: 2 },
  { name: 'Heart to Heart', message: 'Lucas: Does anyone else feel...', time: '12m', avatar: '♡', unread: 0 },
  { name: 'Noah Williams', message: 'Of course. Take all the time you need.', time: '1h', avatar: 'NW', unread: 0 },
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
  const [feature, setFeature] = useState<'people'|'profile'|'notifications'|null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => applyLanguage(language), [language])
  useEffect(() => {
    if (!session) return
    supabase.from('rooms').select('id,name,description,icon,theme,is_private').eq('is_private',false).limit(6).then(({data}) => setDbRooms((data as DbRoom[]) || []))
  }, [session])

  const act = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2800) }

  if (authLoading) return <div className="auth-loader"><Logo/><span/></div>
  if (!session) return <AuthScreen/>
  const name = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Member'
  const initials = name.split(' ').map((part: string) => part[0]).join('').slice(0,2).toUpperCase()

  return <div className={dark ? 'app dark' : 'app'}>
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="side-top"><Logo/><button className="icon-btn close-mobile" onClick={() => setMenuOpen(false)}><X size={20}/></button></div>
      <nav>
        {[
          [Home, 'Home'], [Compass, 'Discover'], [MessageCircleMore, 'Messages'], [UsersRound, 'Community'], [CalendarDays, 'Sessions']
        ].map(([Icon, label]) => <button key={label as string} className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => {setActiveNav(label as string); setMenuOpen(false); if(label==='Community'||label==='Discover')setFeature('people');else act(`${label} selected`)}}><Icon size={19}/><span>{label as string}</span>{label === 'Messages' && <i>2</i>}</button>)}
      </nav>
      <div className="side-card">
        <div className="side-card-icon"><ShieldCheck size={20}/></div>
        <b>Your safety matters</b>
        <p>Explore our community guidelines and support resources.</p>
        <button onClick={() => act('Safety center opened')}>Visit safety center <ChevronRight size={14}/></button>
      </div>
      <div className="side-bottom">
        <button className="nav-item" onClick={() => act('Settings opened')}><Settings size={19}/><span>Settings</span></button>
        <button className="profile-mini" onClick={() => setFeature('profile')}><div className="avatar user">{initials}</div><div><b>{name}</b><span>Community member</span></div><MoreHorizontal size={18}/></button>
        <button className="signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </aside>

    <main>
      <header>
        <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)}><Menu size={22}/></button>
        <div className="mobile-logo"><Logo/></div>
        <div className="search"><Search size={18}/><input aria-label="Search" placeholder="Search people, rooms, or topics..."/><span>⌘ K</span></div>
        <div className="header-actions">
          <button className="language-toggle" onClick={()=>switchLanguage(language==='en'?'he':'en')}><Languages size={17}/>{language==='en'?'עברית':'English'}</button>
          <button className="icon-btn" aria-label="Toggle theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
          <button className="icon-btn notification" aria-label="Notifications" onClick={() => setFeature('notifications')}><Bell size={20}/><i>3</i></button>
          <button className="user-chip"><div className="avatar user">{initials}</div><ChevronDown size={15}/></button>
        </div>
      </header>

      <div className="content">
        <section className="welcome">
          <div><p className="eyebrow">WELCOME TO NOVA RESORT</p><h1>Good to see you, {name.split(' ')[0]} <span>✦</span></h1><p>Take a breath. You’re in a place where you can simply be.</p></div>
          <button className="primary" onClick={() => act('Discovering community rooms')}><Compass size={17}/> Explore the community</button>
        </section>

        <div className="stats">
          <div><span className="stat-icon green"><UsersRound/></span><p><b>248</b><small>Members online</small></p><em>+12%</em></div>
          <div><span className="stat-icon purple"><Heart/></span><p><b>18</b><small>Healers available</small></p><em>Online now</em></div>
          <div><span className="stat-icon amber"><MessageCircleMore/></span><p><b>11</b><small>Active rooms</small></p><em>Join anytime</em></div>
          <div><span className="stat-icon blue"><CalendarDays/></span><p><b>2</b><small>Upcoming sessions</small></p><button onClick={() => act('Calendar opened')}>View calendar</button></div>
        </div>

        <div className="layout">
          <div className="main-col">
            <section>
              <div className="section-head"><div><h2>Find your space</h2><p>Join a conversation that feels right for you today.</p></div><button onClick={() => act('Showing all rooms')}>View all rooms <ChevronRight size={16}/></button></div>
              <div className="room-grid">
                {(dbRooms.length ? dbRooms.slice(0,3).map(r=>({title:r.name,description:r.description,people:0,color:r.theme,icon:r.icon,tags:['Open','Live'],db:r})) : rooms.map(r=>({...r,db:null as DbRoom|null}))).map(room => <article className={`room-card ${room.color}`} key={room.title}>
                  <div className="room-art"><span>{room.icon}</span><div className="bubble b1"></div><div className="bubble b2"></div><div className="bubble b3"></div></div>
                  <div className="room-info"><div className="tags">{room.tags.map((t,i) => <span key={t} className={i === 0 ? 'open-tag' : ''}>{i === 0 && <i/>}{t}</span>)}</div><h3>{room.title}</h3><p>{room.description}</p><div className="room-bottom"><span><UsersRound size={15}/>{room.people ? `${room.people} here now` : 'Real-time room'}</span><button onClick={() => room.db ? setSelectedRoom(room.db) : act('Database setup is required first')}>Join room <ChevronRight size={15}/></button></div></div>
                </article>)}
              </div>
            </section>

            <section className="healer-section">
              <div className="section-head"><div><h2>Connect with a healer</h2><p>Verified guides who are here to listen and support.</p></div><button onClick={() => act('Showing all healers')}>View all healers <ChevronRight size={16}/></button></div>
              <div className="healer-grid">{healers.map(h => <article className="healer-card" key={h.name}>
                <div className={`avatar healer ${h.tone}`}>{h.avatar}<i className={h.online ? 'online' : ''}/></div>
                <div className="healer-info"><h3>{h.name}<ShieldCheck size={14}/></h3><p>{h.role}</p><span>{h.focus}</span></div>
                <button aria-label={`Message ${h.name}`} onClick={() => act(`Starting a conversation with ${h.name}`)}><MessageCircleMore size={18}/></button>
              </article>)}</div>
            </section>

            <section className="quote-card"><div className="quote-icon">“</div><div><p>“You don’t have to see the whole staircase. Just take the first step.”</p><span>A gentle reminder for today</span></div><Leaf size={55}/></section>
          </div>

          <aside className="right-col">
            <section className="panel conversations"><div className="panel-head"><h3>Recent conversations</h3><button onClick={() => act('Messages opened')}>View all</button></div>
              {conversations.map(c => <button className="conversation" key={c.name} onClick={() => act(`Opening conversation with ${c.name}`)}><div className="avatar soft">{c.avatar}</div><div><b>{c.name}</b><p>{c.message}</p></div><span>{c.time}{c.unread > 0 && <i>{c.unread}</i>}</span></button>)}
              <button className="new-message" onClick={() => act('New message started')}><Send size={16}/> Start a new message</button>
            </section>

            <section className="panel session"><div className="panel-head"><h3>Upcoming session</h3><button><MoreHorizontal size={18}/></button></div>
              <div className="date-box"><b>18</b><span>JUL</span></div><div className="session-copy"><h4>Mindful breathing</h4><p>with Maya Bennett</p><span><Clock3 size={14}/> Tomorrow, 10:30 AM</span></div>
              <button className="join-session" onClick={() => act('Video room will open at session time')}><Video size={16}/> Join session</button>
            </section>

            <section className="checkin"><span><CircleUserRound size={21}/></span><div><h3>How are you feeling?</h3><p>A small check-in can make a big difference.</p><div className="moods">{['😔','😕','😐','🙂','😊'].map(x => <button key={x} onClick={() => act('Thank you for checking in')}>{x}</button>)}</div></div></section>

            <section className="disclaimer"><LockKeyhole size={17}/><p><b>A safe space, not a medical service.</b> Nova Resort offers peer support and wellness connection. If you are in immediate danger, please contact local emergency services.</p></section>
          </aside>
        </div>
      </div>
    </main>
    {menuOpen && <button className="backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)}/>} 
    {selectedRoom && <ChatRoom room={selectedRoom} userId={session.user.id} onClose={()=>setSelectedRoom(null)}/>} 
    {feature==='people' && <PeopleDirectory userId={session.user.id} onClose={()=>setFeature(null)}/>} 
    {feature==='profile' && <EditProfile userId={session.user.id} onClose={()=>setFeature(null)}/>} 
    {feature==='notifications' && <Notifications userId={session.user.id} onClose={()=>setFeature(null)}/>} 
    {notice && <div className="toast"><ShieldCheck size={17}/>{notice}</div>}
  </div>
}

export default App
