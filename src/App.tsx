import { useState } from 'react'
import {
  Bell, CalendarDays, ChevronDown, ChevronRight, CircleUserRound, Clock3,
  Compass, Heart, Home, Leaf, LockKeyhole, Menu, MessageCircleMore, MoreHorizontal,
  Search, Send, Settings, ShieldCheck, Sparkles, UsersRound, Video, X, Moon, Sun
} from 'lucide-react'

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

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const [notice, setNotice] = useState('')
  const [activeNav, setActiveNav] = useState('Home')

  const act = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2800) }

  return <div className={dark ? 'app dark' : 'app'}>
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="side-top"><Logo/><button className="icon-btn close-mobile" onClick={() => setMenuOpen(false)}><X size={20}/></button></div>
      <nav>
        {[
          [Home, 'Home'], [Compass, 'Discover'], [MessageCircleMore, 'Messages'], [UsersRound, 'Community'], [CalendarDays, 'Sessions']
        ].map(([Icon, label]) => <button key={label as string} className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => {setActiveNav(label as string); setMenuOpen(false); act(`${label} selected`)}}><Icon size={19}/><span>{label as string}</span>{label === 'Messages' && <i>2</i>}</button>)}
      </nav>
      <div className="side-card">
        <div className="side-card-icon"><ShieldCheck size={20}/></div>
        <b>Your safety matters</b>
        <p>Explore our community guidelines and support resources.</p>
        <button onClick={() => act('Safety center opened')}>Visit safety center <ChevronRight size={14}/></button>
      </div>
      <div className="side-bottom">
        <button className="nav-item" onClick={() => act('Settings opened')}><Settings size={19}/><span>Settings</span></button>
        <button className="profile-mini" onClick={() => act('Profile opened')}><div className="avatar user">SK</div><div><b>Shir Kanevsky</b><span>Community member</span></div><MoreHorizontal size={18}/></button>
      </div>
    </aside>

    <main>
      <header>
        <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)}><Menu size={22}/></button>
        <div className="mobile-logo"><Logo/></div>
        <div className="search"><Search size={18}/><input aria-label="Search" placeholder="Search people, rooms, or topics..."/><span>⌘ K</span></div>
        <div className="header-actions">
          <button className="icon-btn" aria-label="Toggle theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
          <button className="icon-btn notification" aria-label="Notifications" onClick={() => act('You have 3 new notifications')}><Bell size={20}/><i>3</i></button>
          <button className="user-chip"><div className="avatar user">SK</div><ChevronDown size={15}/></button>
        </div>
      </header>

      <div className="content">
        <section className="welcome">
          <div><p className="eyebrow">THURSDAY, JULY 16</p><h1>Good morning, Shir <span>✦</span></h1><p>Take a breath. You’re in a place where you can simply be.</p></div>
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
                {rooms.map(room => <article className={`room-card ${room.color}`} key={room.title}>
                  <div className="room-art"><span>{room.icon}</span><div className="bubble b1"></div><div className="bubble b2"></div><div className="bubble b3"></div></div>
                  <div className="room-info"><div className="tags">{room.tags.map((t,i) => <span key={t} className={i === 0 ? 'open-tag' : ''}>{i === 0 && <i/>}{t}</span>)}</div><h3>{room.title}</h3><p>{room.description}</p><div className="room-bottom"><span><UsersRound size={15}/>{room.people} here now</span><button onClick={() => act(`Joining ${room.title}`)}>Join room <ChevronRight size={15}/></button></div></div>
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
    {notice && <div className="toast"><ShieldCheck size={17}/>{notice}</div>}
  </div>
}

export default App
