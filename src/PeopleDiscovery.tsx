import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageCircleMore, Search, ShieldCheck, UserPlus, UsersRound, X } from 'lucide-react'
import { supabase } from './supabase'
import type { DbRoom } from './CommunityFeatures'
import './people-discovery.css'

type Profile = {
  id:string; full_name:string; display_name:string|null; avatar_url:string|null; country:string|null;
  profile_type:string; about:string|null; interests:string[]|null; specialties:string[]|null; online:boolean|null
}
type Friendship = { id:string; requester_id:string; addressee_id:string; status:string }
type DiscoveryMode = 'discover'|'healers'

const initials = (name?:string|null) => (name || 'N').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
const nameOf = (person:Profile) => person.display_name || person.full_name || 'Nova member'
const connectionFor = (id:string, rows:Friendship[]) => rows.find(row => row.requester_id === id || row.addressee_id === id)

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

function ConnectButton({ userId, person, friendships, reload }:{ userId:string; person:Profile; friendships:Friendship[]; reload:()=>void }) {
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
  if (state === 'incoming') return <button className="ghost-action" disabled={busy || !row} onClick={() => row && run(() => supabase.rpc('respond_connection_request', { request_id:row.id, next_status:'accepted' }))}>Accept</button>
  return <button className="primary-action" disabled={busy} onClick={() => run(() => supabase.rpc('send_connection_request', { other_user:person.id }))}><UserPlus size={15}/> Connect</button>
}

function PeopleDiscoveryPanel({ userId, onClose, onOpenRoom, mode }:{ userId:string; onClose:()=>void; onOpenRoom:(room:DbRoom)=>void; mode:DiscoveryMode }) {
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
      .limit(120)
      .then(({ data }) => {
        setPeople((data as Profile[]) || [])
        setLoading(false)
      })
  }, [userId])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people.filter(person => {
      if (mode === 'healers' && person.profile_type !== 'healer') return false
      if (filter === 'online' && !person.online) return false
      if (filter === 'members' && person.profile_type === 'healer') return false
      if (filter === 'healers' && person.profile_type !== 'healer') return false
      const haystack = [
        nameOf(person), person.country || '', person.about || '', person.profile_type,
        ...(person.interests || []), ...(person.specialties || [])
      ].join(' ').toLowerCase()
      return !q || haystack.includes(q)
    })
  }, [people, query, filter, mode])

  async function startMessage(person:Profile) {
    const { data, error } = await supabase.rpc('create_private_room', { other_user:person.id })
    if (error) { alert(error.message); return }
    onClose()
    onOpenRoom({ id:data, name:nameOf(person), description:'Private two-person conversation', icon:'<>', theme:'sage', is_private:true })
  }

  const healerMode = mode === 'healers'
  const title = healerMode ? 'Healer Discovery' : 'Discover People'
  const subtitle = healerMode
    ? 'Find members offering healer or therapist support and start a respectful connection.'
    : 'Meet members, discover shared interests, and open private two-person rooms.'

  return <div className="feature-overlay">
    <section className="directory-window discovery-window">
      <header>
        <div><h2>{title}</h2><p>{subtitle}</p></div>
        <button onClick={onClose}><X/></button>
      </header>
      <div className="discovery-toolbar">
        <label><Search size={15}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search names, places, interests, or specialties"/></label>
        <div>
          {(['all','online','members','healers'] as const).map(item => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}
        </div>
      </div>
      {loading ? <div className="empty-state">Loading people...</div> : visible.length === 0 ? <div className="empty-state"><UsersRound/><h3>No matches yet</h3><p>Try a different search or check back when more profiles are active.</p></div> : <div className="discovery-grid">
        {visible.map(person => <article key={person.id} className="discovery-card">
          <button className="profile-open" onClick={() => setSelected(person)}>
            <span className="profile-photo">{person.avatar_url ? <img src={person.avatar_url} alt=""/> : initials(nameOf(person))}<i className={person.online ? 'online' : ''}/></span>
            <div>
              <h3>{nameOf(person)}</h3>
              <p>{person.profile_type === 'healer' ? 'Healer / Therapist' : 'Community member'}{person.country ? ` in ${person.country}` : ''}</p>
            </div>
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

export function DiscoverPeople(props:{ userId:string; onClose:()=>void; onOpenRoom:(room:DbRoom)=>void }) {
  return <PeopleDiscoveryPanel {...props} mode="discover"/>
}

export function HealersDirectory(props:{ userId:string; onClose:()=>void; onOpenRoom:(room:DbRoom)=>void }) {
  return <PeopleDiscoveryPanel {...props} mode="healers"/>
}
