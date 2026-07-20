import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Filter, Sun,
  Languages, MapPin, MessageCircleMore, Search, ShieldCheck, UserPlus, UsersRound, X
} from 'lucide-react'
import { supabase } from './supabase'
import type { DbRoom } from './CommunityFeatures'
import { searchPublicHealers, type PublicHealer } from './services/healers'
import './people-discovery.css'

type Profile = {
  id:string; full_name:string; display_name:string|null; avatar_url:string|null; country:string|null;
  profile_type:string; about:string|null; interests:string[]|null; specialties:string[]|null; online:boolean|null
}
type HealerProfile = PublicHealer
type Friendship = { id:string; requester_id:string; addressee_id:string; status:string }

const PAGE_SIZE = 12
const professionalTypes = [
  ['all','All professionals'],
  ['healer','Healers'],
  ['therapist','Therapists'],
  ['coach','Coaches'],
  ['mindfulness_teacher','Mindfulness teachers'],
  ['wellness_professional','Wellness professionals'],
] as const
const availabilityOptions = ['all','available','weekdays','weekends','evenings','online'] as const

const initials = (name?:string|null) => (name || 'N').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
const nameOf = (person:{display_name:string|null;full_name:string}) => person.display_name || person.full_name || 'Nova member'
const connectionFor = (id:string, rows:Friendship[]) => rows.find(row => row.requester_id === id || row.addressee_id === id)
const titleFor = (person:{profile_type:string;professional_title?:string|null}) => person.professional_title || person.profile_type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())

function relationshipState(userId:string, personId:string, rows:Friendship[]) {
  const row = connectionFor(personId, rows)
  if (!row) return 'none'
  if (row.status === 'accepted') return 'accepted'
  if (row.status === 'pending' && row.requester_id === userId) return 'sent'
  if (row.status === 'pending' && row.addressee_id === userId) return 'incoming'
  return 'none'
}

function useRelationships(userId:string) {
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const load = useCallback(async () => {
    const { data } = await supabase
      .from('friendships')
      .select('id,requester_id,addressee_id,status')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .in('status', ['pending', 'accepted'])
    setFriendships((data as Friendship[]) || [])
  }, [userId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`discovery-connections-${userId}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'friendships' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, load])

  return { friendships, reload: load }
}

function ConnectButton({ userId, person, friendships, reload }:{ userId:string; person:{id:string}; friendships:Friendship[]; reload:()=>void }) {
  const [busy, setBusy] = useState(false)
  const row = connectionFor(person.id, friendships)
  const state = relationshipState(userId, person.id, friendships)

  async function run(action:() => any) {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (result.error) alert(result.error.message || 'Connect action failed.')
    else reload()
  }

  if (state === 'accepted') return <button className="ghost-action" disabled>Connected</button>
  if (state === 'sent') return <button className="ghost-action" disabled={busy || !row} onClick={() => row && run(() => supabase.rpc('cancel_connection_request', { request_id:row.id }))}>Request sent</button>
  if (state === 'incoming') return <span className="connection-reply-actions">
    <button className="primary-action" disabled={busy || !row} onClick={() => row && run(() => supabase.rpc('respond_connection_request', { request_id:row.id, next_status:'accepted' }))}>Accept</button>
    <button className="ghost-action danger" disabled={busy || !row} onClick={() => row && run(() => supabase.rpc('respond_connection_request', { request_id:row.id, next_status:'declined' }))}>Deny</button>
  </span>
  return <button className="primary-action" disabled={busy} onClick={() => run(() => supabase.rpc('send_connection_request', { other_user:person.id }))}><UserPlus size={15}/> Connect</button>
}

function PeopleDiscoveryPanel({ userId, onClose, onOpenRoom }:{ userId:string; onClose:()=>void; onOpenRoom:(room:DbRoom)=>void }) {
  const [people, setPeople] = useState<Profile[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all'|'online'|'members'|'healers'>('all')
  const [selected, setSelected] = useState<Profile|null>(null)
  const [loading, setLoading] = useState(true)
  const { friendships, reload } = useRelationships(userId)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('profiles')
      .select('id,full_name,display_name,avatar_url,country,profile_type,about,interests,specialties,online')
      .neq('id', userId)
      .neq('visibility', 'private')
      .limit(120)
      .then(({ data }) => {
        setPeople((data as Profile[]) || [])
        setLoading(false)
      })
  }, [userId])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter(person => {
      if (filter === 'online' && !person.online) return false
      if (filter === 'members' && person.profile_type === 'healer') return false
      if (filter === 'healers' && person.profile_type !== 'healer') return false
      const haystack = [
        nameOf(person), person.country || '', person.about || '', person.profile_type,
        ...(person.interests || []), ...(person.specialties || [])
      ].join(' ').toLowerCase()
      return !q || haystack.includes(q)
    })
  }, [people, query, filter])

  async function startMessage(person:Profile) {
    const { data, error } = await supabase.rpc('create_private_room', { other_user:person.id })
    if (error) { alert(error.message); return }
    onClose()
    onOpenRoom({ id:data, name:nameOf(person), description:'Private two-person conversation', icon:'<>', theme:'sage', is_private:true })
  }

  return <div className="feature-overlay">
    <section className="directory-window discovery-window">
      <header>
        <div><h2>Discover People</h2><p>Meet members, discover shared interests, and open private two-person rooms.</p></div>
        <button onClick={onClose}><X/></button>
      </header>
      <div className="discovery-toolbar">
        <label><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search names, places, interests, or specialties"/></label>
        <div>{(['all','online','members','healers'] as const).map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
      </div>
      {loading ? <div className="empty-state">Loading people...</div> : visible.length === 0 ? <div className="empty-state"><UsersRound/><h3>No matches yet</h3><p>Try a different search or check back when more profiles are active.</p></div> : <div className="discovery-grid">
        {visible.map(person => <article key={person.id} className="discovery-card">
          <button className="profile-open" onClick={() => setSelected(person)}>
            <span className="profile-photo">{person.avatar_url ? <img src={person.avatar_url} alt=""/> : initials(nameOf(person))}<i className={person.online ? 'online' : ''}/></span>
            <div><h3>{nameOf(person)}</h3><p>{person.profile_type === 'healer' ? 'Healer / Therapist' : 'Community member'}{person.country ? ` in ${person.country}` : ''}</p></div>
          </button>
          <p>{person.about || 'Open to meaningful wellness connection.'}</p>
          <div className="chip-row">{(person.profile_type === 'healer' ? (person.specialties || []) : (person.interests || person.specialties || [])).slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div>
          <div className="card-actions">
            <button onClick={() => startMessage(person)}><MessageCircleMore size={15}/> Message</button>
            <ConnectButton userId={userId} person={person} friendships={friendships} reload={reload}/>
          </div>
        </article>)}
      </div>}
      {selected && <div className="profile-detail">
        <article>
          <button onClick={() => setSelected(null)}><X size={16}/></button>
          <span className="profile-photo large">{selected.avatar_url ? <img src={selected.avatar_url} alt=""/> : initials(nameOf(selected))}<i className={selected.online ? 'online' : ''}/></span>
          <h3>{nameOf(selected)}</h3>
          <p>{selected.about || 'This member has not added an about section yet.'}</p>
          <div className="detail-meta"><ShieldCheck size={15}/>{selected.profile_type === 'healer' ? 'Healer / Therapist profile' : 'Community member profile'}</div>
          <div className="chip-row">{[...(selected.interests || []), ...(selected.specialties || [])].slice(0, 6).map(tag => <span key={tag}>{tag}</span>)}</div>
          <div className="card-actions">
            <button onClick={() => startMessage(selected)}><MessageCircleMore size={15}/> Message</button>
            <ConnectButton userId={userId} person={selected} friendships={friendships} reload={reload}/>
          </div>
        </article>
      </div>}
    </section>
  </div>
}

function HealerCard({ healer, userId, friendships, reload, onClose, onOpenRoom, onOpenProfile, onOpenSessions }:{
  healer:HealerProfile; userId:string; friendships:Friendship[]; reload:()=>void; onClose:()=>void;
  onOpenRoom:(room:DbRoom)=>void; onOpenProfile:(id:string)=>void; onOpenSessions:()=>void
}) {
  async function startMessage() {
    const { data, error } = await supabase.rpc('create_private_room', { other_user:healer.id })
    if (error) { alert(error.message); return }
    onClose()
    onOpenRoom({ id:data, name:nameOf(healer), description:'Private two-person conversation', icon:'<>', theme:'sage', is_private:true })
  }

  const verified = healer.professional_verification_status === 'approved'
  return <article className="healer-directory-card">
    <button className="healer-directory-photo" onClick={() => onOpenProfile(healer.id)} aria-label={`View ${nameOf(healer)} profile`}>
      {healer.avatar_url ? <img src={healer.avatar_url} alt={`${nameOf(healer)} profile photo`}/> : initials(nameOf(healer))}
      <i className={healer.online ? 'online' : ''}/>
    </button>
    <div className="healer-directory-body">
      <div className="healer-directory-title">
        <button onClick={() => onOpenProfile(healer.id)}>{nameOf(healer)}</button>
        {verified && <span><BadgeCheck size={13}/> Verified</span>}
      </div>
      <p className="healer-role">{titleFor(healer)}</p>
      <div className="healer-directory-meta">
        {healer.country && <span><MapPin size={13}/>{healer.country}</span>}
        {(healer.languages || []).length > 0 && <span><Languages size={13}/>{(healer.languages || []).slice(0, 3).join(', ')}</span>}
        <span><Sun size={13}/>{healer.online ? 'Online now' : 'Offline'}</span>
      </div>
      <p className="healer-directory-bio">{healer.about || 'This wellness professional has not added a biography yet.'}</p>
      <div className="chip-row">{(healer.specialties || ['Emotional wellness']).slice(0, 5).map(tag => <span key={tag}>{tag}</span>)}</div>
      {healer.next_session_title && <button className="directory-session" onClick={onOpenSessions}>
        <CalendarDays size={14}/>
        <span>{healer.next_session_title}</span>
        <time>{healer.next_session_starts_at ? new Date(healer.next_session_starts_at).toLocaleString([], {dateStyle:'medium', timeStyle:'short'}) : 'Upcoming'}</time>
      </button>}
      <div className="card-actions healer-directory-actions">
        <button onClick={() => onOpenProfile(healer.id)}>View profile</button>
        <ConnectButton userId={userId} person={healer} friendships={friendships} reload={reload}/>
        <button onClick={startMessage}><MessageCircleMore size={15}/> Message</button>
        <button onClick={onOpenSessions}>{healer.next_session_title ? 'View sessions' : 'Request session'}</button>
      </div>
    </div>
  </article>
}

export function DiscoverPeople(props:{ userId:string; onClose:()=>void; onOpenRoom:(room:DbRoom)=>void }) {
  return <PeopleDiscoveryPanel {...props}/>
}

export function HealersDirectory({ userId, onClose, onOpenRoom, onOpenProfile, onOpenSessions }:{
  userId:string; onClose:()=>void; onOpenRoom:(room:DbRoom)=>void; onOpenProfile:(id:string)=>void; onOpenSessions:()=>void
}) {
  const [items, setItems] = useState<HealerProfile[]>([])
  const [query, setQuery] = useState('')
  const [professionalType, setProfessionalType] = useState('all')
  const [language, setLanguage] = useState('all')
  const [country, setCountry] = useState('all')
  const [availability, setAvailability] = useState('all')
  const [onlineOnly, setOnlineOnly] = useState(false)
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { friendships, reload } = useRelationships(userId)

  const countries = useMemo(() => ['all', ...Array.from(new Set(items.map(item => item.country).filter(Boolean) as string[])).sort()], [items])
  const languages = useMemo(() => ['all', ...Array.from(new Set(items.flatMap(item => item.languages || []))).sort()], [items])
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await searchPublicHealers({
        query,
        professionalType,
        language,
        country,
        onlineOnly,
        verifiedOnly,
        availability,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      setItems(rows)
      setTotal(Number(rows[0]?.total_count || 0))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not load healers right now. Please try again.')
      setItems([])
      setTotal(0)
    }
    setLoading(false)
  }, [query, professionalType, language, country, onlineOnly, verifiedOnly, availability, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(0) }, [query, professionalType, language, country, onlineOnly, verifiedOnly, availability])

  return <div className="feature-overlay">
    <section className="directory-window discovery-window healers-window">
      <header>
        <div><h2>Healers Directory</h2><p>Browse active wellness professionals who allow discovery on Nova Resort.</p></div>
        <button onClick={onClose}><X/></button>
      </header>
      <div className="healers-toolbar">
        <label className="healer-search"><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name, specialty, language, or bio"/></label>
        <label><Filter size={14}/><select value={professionalType} onChange={event => setProfessionalType(event.target.value)}>{professionalTypes.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><Languages size={14}/><select value={language} onChange={event => setLanguage(event.target.value)}>{languages.map(value => <option value={value} key={value}>{value === 'all' ? 'Any language' : value}</option>)}</select></label>
        <label><MapPin size={14}/><select value={country} onChange={event => setCountry(event.target.value)}>{countries.map(value => <option value={value} key={value}>{value === 'all' ? 'Any country' : value}</option>)}</select></label>
        <label><CalendarDays size={14}/><select value={availability} onChange={event => setAvailability(event.target.value)}>{availabilityOptions.map(value => <option value={value} key={value}>{value === 'all' ? 'Any availability' : value}</option>)}</select></label>
        <button className={onlineOnly ? 'active' : ''} onClick={() => setOnlineOnly(value => !value)}>Online</button>
        <button className={verifiedOnly ? 'active' : ''} onClick={() => setVerifiedOnly(value => !value)}>Verified</button>
      </div>
      <div className="directory-count">{loading ? 'Loading healers...' : `${total} verified healer${total === 1 ? '' : 's'} found`}</div>
      {loading ? <div className="empty-state">Loading healer profiles...</div> : error ? <div className="empty-state"><Sun/><h3>Healers unavailable</h3><p>We could not load healers right now. Please try again.</p></div> : items.length === 0 ? <div className="empty-state"><UsersRound/><h3>No verified healers are available yet.</h3><p>Try changing the filters or check back after administrator approvals.</p></div> : <div className="healer-directory-list">
        {items.map(healer => <HealerCard key={healer.id} healer={healer} userId={userId} friendships={friendships} reload={reload} onClose={onClose} onOpenRoom={onOpenRoom} onOpenProfile={onOpenProfile} onOpenSessions={onOpenSessions}/>)}
      </div>}
      <footer className="directory-pagination">
        <button disabled={page === 0 || loading} onClick={() => setPage(value => Math.max(0, value - 1))}><ChevronLeft size={15}/> Previous</button>
        <span>Page {page + 1} of {pages}</span>
        <button disabled={page + 1 >= pages || loading} onClick={() => setPage(value => value + 1)}>Next <ChevronRight size={15}/></button>
      </footer>
    </section>
  </div>
}
