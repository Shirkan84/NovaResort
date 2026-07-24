import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Clock3, Headphones, Heart, Loader2, MapPin, Mic, Play, User, X, ChevronRight, Sparkles } from 'lucide-react'
import { supabase } from './supabase'
import { useFocusTrap } from './hooks/useFocusTrap'

type FeedItem = {
  type: 'session' | 'episode' | 'healer'
  id: string
  title: string
  description?: string
  category?: string
  starts_at?: string
  status?: string
  host_name?: string
  host_avatar?: string
  host_id?: string
  cover_image_url?: string
  podcast_id?: string
  podcast_title?: string
  audio_duration_seconds?: number
  professional_title?: string
  specialties?: string[]
  avatar_url?: string
  country?: string
  created_at: string
}

export function CommunityFeed({userId, onClose, onOpenSession, onOpenPodcast, onOpenProfile}:{
  userId:string; onClose:()=>void; onOpenSession:(id:string)=>void; onOpenPodcast:(id:string)=>void; onOpenProfile:(id:string)=>void
}){
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const containerRef = useFocusTrap(true)

  const load = useCallback(async()=>{
    setLoading(true); setError('')
    try{
      const {data, error: rpcErr} = await supabase.rpc('get_community_feed', {p_user_id: userId, p_limit: 30, p_offset: 0})
      if(rpcErr) throw rpcErr
      setItems((data as FeedItem[]) || [])
    }catch(e:any){ setError(e.message || 'Failed to load feed') }
    finally{ setLoading(false) }
  }, [userId])

  useEffect(()=>{ load() }, [load])

  function timeAgo(iso:string){
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if(mins < 1) return 'just now'
    if(mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if(hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  function fmtDate(iso:string){ return new Date(iso).toLocaleDateString([], {month:'short', day:'numeric'}) }
  function fmtTime(iso:string){ return new Date(iso).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) }
  function initials(name?:string|null){ return (name||'N').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase() }
  function duration(sec?:number){ if(!sec) return ''; const m=Math.floor(sec/60); return `${m} min` }

  function handleClick(item:FeedItem){
    if(item.type === 'session') onOpenSession(item.id)
    else if(item.type === 'episode') onOpenPodcast(item.podcast_id || item.id)
    else if(item.type === 'healer') onOpenProfile(item.id)
  }

  function renderIcon(type:string){
    if(type === 'session') return <CalendarDays size={16}/>
    if(type === 'episode') return <Headphones size={16}/>
    return <User size={16}/>
  }

  function renderBadge(item:FeedItem){
    if(item.type === 'session' && item.status === 'live') return <span className="feed-badge live">LIVE</span>
    if(item.type === 'session') return <span className="feed-badge">Session</span>
    if(item.type === 'episode') return <span className="feed-badge">New Episode</span>
    return <span className="feed-badge">New Healer</span>
  }

  return <div className="feature-overlay" ref={containerRef}><section className="feed-window" role="dialog" aria-modal="true" aria-label="Activity feed">
    <header>
      <div><h2><Sparkles size={18}/> Activity Feed</h2><p>Latest activity from healers you follow and content you might enjoy.</p></div>
      <button onClick={onClose}><X/></button>
    </header>

    <div className="feed-body">
      {loading && <div className="feed-loading"><Loader2 size={24} className="spin"/><span>Loading feed…</span></div>}
      {!loading && error && <div className="feed-empty"><p>{error}</p><button onClick={load}>Retry</button></div>}
      {!loading && !error && items.length === 0 && <div className="feed-empty">
        <Sparkles size={32}/>
        <h3>Your feed is quiet</h3>
        <p>Follow healers and podcasts to see their latest activity here.</p>
      </div>}
      {!loading && !error && items.length > 0 && <div className="feed-list">
        {items.map((item, i) => <button key={`${item.type}-${item.id}-${i}`} className="feed-item" onClick={()=>handleClick(item)}>
          <div className="feed-item-icon">{renderIcon(item.type)}</div>
          <div className="feed-item-content">
            <div className="feed-item-header">
              {renderBadge(item)}
              <span className="feed-item-time">{timeAgo(item.created_at)}</span>
            </div>
            <h3 className="feed-item-title">{item.title}</h3>
            {item.type === 'session' && <div className="feed-item-meta">
              <span><CalendarDays size={11}/> {fmtDate(item.starts_at || item.created_at)} · {fmtTime(item.starts_at || '')}</span>
              {item.host_name && <span className="feed-item-host">{item.host_name}</span>}
              {item.category && <span>{item.category}</span>}
            </div>}
            {item.type === 'episode' && <div className="feed-item-meta">
              <span><Headphones size={11}/> {item.podcast_title}</span>
              {item.audio_duration_seconds && <span>{duration(item.audio_duration_seconds)}</span>}
            </div>}
            {item.type === 'healer' && <div className="feed-item-meta">
              {item.professional_title && <span>{item.professional_title}</span>}
              {item.country && <span><MapPin size={11}/> {item.country}</span>}
              {item.specialties && item.specialties.length > 0 && <span>{item.specialties.slice(0,2).join(', ')}</span>}
            </div>}
            {item.description && <p className="feed-item-desc">{item.description}</p>}
          </div>
          <div className="feed-item-thumb">
            {item.type === 'healer' ? <div className="feed-avatar">{item.avatar_url ? <img src={item.avatar_url} alt={item.title ? item.title + " avatar" : "Avatar"}/> : initials(item.title)}</div> :
             item.cover_image_url ? <img src={item.cover_image_url} alt={item.title ? item.title + " cover" : "Feed item cover"}/> :
             item.type === 'session' ? <CalendarDays size={20}/> : <Mic size={20}/>}
          </div>
          <ChevronRight size={16} className="feed-item-arrow"/>
        </button>)}
      </div>}
    </div>
  </section></div>
}
