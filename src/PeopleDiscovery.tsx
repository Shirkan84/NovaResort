import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck, CalendarDays, ChevronLeft, ChevronRight, Filter, Sun,
  Languages, MapPin, MessageCircleMore, Search, UserPlus, UsersRound, X
} from 'lucide-react'
import { supabase } from './supabase'
import type { DbRoom } from './CommunityFeatures'
import { searchPublicHealers, type PublicHealer } from './services/healers'
import { isApprovedHealer, publicAccountLabel, searchMembers, type PublicMember } from './services/members'
import './people-discovery.css'

type Profile = PublicMember
type HealerProfile = PublicHealer
type Friendship = { id:string; requester_id:string; addressee_id:string; status:string }

const PAGE_SIZE = 12
const MEMBER_PAGE_SIZE = 24
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

function relationshipState(userId:string, personId:string, rows:Friendship[], blocked:string[] = []) {
  if (blocked.includes(personId)) return 'blocked'
  if (userId === personId) return 'self'
  const row = connectionFor(personId, rows)
  if (!row) return 'none'
  if (row.status === 'accepted') return 'accepted'
  if (row.status === 'pending' && row.requester_id === userId) return 'sent'
  if (row.status === 'pending' && row.addressee_id === userId) return 'incoming'
  return 'none'
}

function useRelationships(userId:string) {
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [blocked, setBlocked] = useState<string[]>([])
  const load = useCallback(async () => {
    const [{ data }, { data:blocks }] = await Promise.all([
      supabase.from('friendships').select('id,requester_id,addressee_id,status').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`).in('status', ['pending', 'accepted']),
      supabase.from('user_blocks').select('blocked_id').eq('blocker_id', userId)
    ])
    setFriendships((data as Friendship[]) || [])
    setBlocked(((blocks as { blocked_id:string }[]) || []).map(item => item.blocked_id))
  }, [userId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`discovery-connections-${userId}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'friendships' }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'user_blocks' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, load])

  return { friendships, blocked, reload: load }
}

function ConnectButton({ userId, person, friendships, blocked = [], reload, onMessage, onViewProfile }:{ userId:string; person:{id:string}; friendships:Friendship[]; blocked?:string[]; reload:()=>void; onMessage?:()=>void; onViewProfile?:()=>void }) {
  const [busy, setBusy] = useState(false)
  const row = connectionFor(person.id, friendships)
  const state = relationshipState(userId, person.id, friendships, blocked)

  async function run(action:() => any) {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (result.error) alert(result.error.message || 'Connect action failed.')
    else reload()
  }

  if (state === 'self') return null
  if (state === 'blocked') return <button className="ghost-action" disabled>Blocked</button>
  if (state === 'accepted') return <><button className="ghost-action" disabled>Friends</button>{onMessage&&<button className="primary-action" onClick={onMessage}><MessageCircleMore size={15}/> Message</button>}</>
  if (state === 'sent') return <button className="ghost-action" disabled={busy || !row} onClick={() => row && run(() => supabase.rpc('cancel_connection_request', { request_id:row.id }))}>Request sent</button>
  if (state === 'incoming') return <span className="connection-reply-actions">
    <button className="primary-action" disabled={busy || !row} onClick={() => row && run(() => supabase.rpc('respond_connection_request', { request_id:row.id, next_status:'accepted' }))}>Accept</button>
    <button className="ghost-action danger" disabled={busy || !row} onClick={() => row && run(() => supabase.rpc('respond_connection_request', { request_id:row.id, next_status:'declined' }))}>Deny</button>
  </span>
  return <button className="primary-action" disabled={busy} onClick={() => run(() => supabase.rpc('send_connection_request', { other_user:person.id }))}><UserPlus size={15}/> Connect</button>
}

function PeopleDiscoveryPanel({ userId, onClose, onOpenRoom, onOpenProfile }:{ userId:string; onClose:()=>void; onOpenRoom:(room:DbRoom)=>void; onOpenProfile:(id:string)=>void }) {
  const [people, setPeople] = useState<Profile[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [memberType, setMemberType] = useState<'all'|'regular'|'healers'>('all')
  const [connectionFilter, setConnectionFilter] = useState<'everyone'|'not_connected'|'sent'|'incoming'|'friends'>('everyone')
  const [country, setCountry] = useState('all')
  const [language, setLanguage] = useState('all')
  const [specialty, setSpecialty] = useState('all')
  const [sort, setSort] = useState<'recently_joined'|'recently_active'|'name'|'healers_first'>('recently_joined')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const { friendships, blocked, reload } = useRelationships(userId)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const loadMembers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await searchMembers({ query:debouncedQuery, memberType, country, language, specialty, sort, limit:MEMBER_PAGE_SIZE, offset:page*MEMBER_PAGE_SIZE })
      setPeople(result.rows.filter(person => !blocked.includes(person.id)))
      setTotal(result.total)
    } catch (err) {
      setPeople([])
      setTotal(0)
      setError(err instanceof Error ? err.message : 'We could not load members right now. Please try again.')
    }
    setLoading(false)
  }, [debouncedQuery, memberType, country, language, specialty, sort, page, blocked])

  useEffect(() => { loadMembers() }, [loadMembers])
  useEffect(() => { setPage(0) }, [debouncedQuery, memberType, country, language, specialty, sort, connectionFilter])

  const countries = useMemo(() => ['all', ...Array.from(new Set(people.map(person => person.country).filter(Boolean) as string[])).sort()], [people])
  const languages = useMemo(() => ['all', ...Array.from(new Set(people.flatMap(person => person.languages || []))).sort()], [people])
  const specialties = useMemo(() => ['all', ...Array.from(new Set(people.flatMap(person => person.specialties || []))).sort()], [people])
  const visible = useMemo(() => people.filter(person => {
    const state = relationshipState(userId, person.id, friendships, blocked)
    if (connectionFilter === 'not_connected' && state !== 'none') return false
    if (connectionFilter === 'sent' && state !== 'sent') return false
    if (connectionFilter === 'incoming' && state !== 'incoming') return false
    if (connectionFilter === 'friends' && state !== 'accepted') return false
    return true
  }), [people, userId, friendships, blocked, connectionFilter])
  const pages = Math.max(1, Math.ceil(total / MEMBER_PAGE_SIZE))

  const clearFilters = () => { setQuery(''); setMemberType('all'); setConnectionFilter('everyone'); setCountry('all'); setLanguage('all'); setSpecialty('all'); setSort('recently_joined'); setPage(0) }

  async function startMessage(person:Profile) {
    const { data, error } = await supabase.rpc('create_private_room', { other_user:person.id })
    if (error) { alert(error.message); return }
    onClose()
    onOpenRoom({ id:data, name:nameOf(person), description:'Private two-person conversation', icon:'<>', theme:'sage', is_private:true })
  }

  return <div className="feature-overlay">
    <section className="directory-window discovery-window">
      <header>
        <div><h2>Discover Members</h2><p>Meet people across Nova Resort, explore their profiles, and build meaningful connections.</p></div>
        <button onClick={onClose}><X/></button>
      </header>
      <div className="discovery-toolbar member-toolbar">
        <label><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search names, titles, biographies, places, or specialties"/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}>Clear</button>}</label>
        <div>
          <select aria-label="Member type" value={memberType} onChange={event => setMemberType(event.target.value as typeof memberType)}><option value="all">All Members</option><option value="regular">Regular Members</option><option value="healers">Healers</option></select>
          <select aria-label="Connection status" value={connectionFilter} onChange={event => setConnectionFilter(event.target.value as typeof connectionFilter)}><option value="everyone">Everyone</option><option value="not_connected">Not Connected</option><option value="sent">Request Sent</option><option value="incoming">Incoming Requests</option><option value="friends">Friends</option></select>
          {specialties.length>1&&<select aria-label="Healer specialty" value={specialty} onChange={event=>setSpecialty(event.target.value)}>{specialties.map(value=><option key={value} value={value}>{value==='all'?'Any specialty':value}</option>)}</select>}
          <select aria-label="Country" value={country} onChange={event=>setCountry(event.target.value)}>{countries.map(value=><option key={value} value={value}>{value==='all'?'Any country':value}</option>)}</select>
          <select aria-label="Language" value={language} onChange={event=>setLanguage(event.target.value)}>{languages.map(value=><option key={value} value={value}>{value==='all'?'Any language':value}</option>)}</select>
          <select aria-label="Sort members" value={sort} onChange={event=>setSort(event.target.value as typeof sort)}><option value="recently_joined">Recently Joined</option><option value="recently_active">Recently Active</option><option value="name">Name</option><option value="healers_first">Healers First</option></select>
          <button onClick={clearFilters}>Clear Filters</button>
        </div>
      </div>
      <div className="directory-count">{loading ? 'Loading members...' : `${visible.length} of ${total} discoverable member${total === 1 ? '' : 's'}`}</div>
      {loading ? <div className="discovery-grid">{[0,1,2,3,4,5].map(item=><div className="discovery-card skeleton" key={item}/>)}</div> : error ? <div className="empty-state"><UsersRound/><h3>Members unavailable</h3><p>We could not load members right now. Please try again.</p></div> : visible.length === 0 ? <div className="empty-state"><UsersRound/><h3>{total===0?'No members are available to discover yet.':'No members match your current search or filters.'}</h3><button className="primary-action" onClick={clearFilters}>Clear Filters</button></div> : <div className="discovery-grid">
        {visible.map(person => <article key={person.id} className="discovery-card">
          <button className="profile-open" onClick={() => onOpenProfile(person.id)}>
            <span className="profile-photo">{person.avatar_url ? <img src={person.avatar_url} alt={`${nameOf(person)} profile photo`} loading="lazy" onError={event=>{event.currentTarget.style.display='none'}}/> : initials(nameOf(person))}<i className={person.online ? 'online' : ''}/></span>
            <div><h3>{nameOf(person)}{isApprovedHealer(person)&&<BadgeCheck size={13}/>}</h3><p>{publicAccountLabel(person)}{person.country ? ` in ${person.country}` : ''}</p></div>
          </button>
          <p>{person.about || 'Open to meaningful wellness connection.'}</p>
          <div className="chip-row">{(isApprovedHealer(person) ? (person.specialties || []) : (person.interests || person.specialties || [])).slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</div>
          <div className="card-actions">
            <button onClick={() => onOpenProfile(person.id)}>{person.id===userId?'View My Profile':'View Profile'}</button>
            <ConnectButton userId={userId} person={person} friendships={friendships} blocked={blocked} reload={reload} onMessage={() => startMessage(person)} onViewProfile={() => onOpenProfile(person.id)}/>
          </div>
        </article>)}
      </div>}
      <footer className="directory-pagination"><button disabled={page===0||loading} onClick={()=>setPage(value=>Math.max(0,value-1))}><ChevronLeft size={15}/> Previous</button><span>Page {page+1} of {pages}</span><button disabled={page+1>=pages||loading} onClick={()=>setPage(value=>value+1)}>Next <ChevronRight size={15}/></button></footer>
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

export function DiscoverPeople(props:{ userId:string; onClose:()=>void; onOpenRoom:(room:DbRoom)=>void; onOpenProfile:(id:string)=>void }) {
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
      const result = await searchPublicHealers({
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
      setItems(result.rows)
      setTotal(Number(result.total || 0))
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
