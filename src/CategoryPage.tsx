import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, ChevronRight, Clock3, Headphones, Loader2, MapPin, X } from 'lucide-react'
import { supabase } from './supabase'
import { searchSessions, type SessionSearchResult } from './services/search'
import { getCategoryBySlug, slugToCategoryName, CATEGORIES } from './categories'

type FeaturedHealer = {id:string;full_name:string;display_name:string|null;avatar_url:string|null;professional_title:string|null;country:string|null;specialties:string[]|null;online:boolean|null;professional_verification_status:string|null}
type FeaturedPodcast = {id:string;title:string;short_description:string|null;cover_image_url:string|null;category:string|null;language:string|null;follower_count:number;episode_count:number;total_plays:number}

export function CategoryPage({slug,userId,onClose,onOpenSession,onOpenProfile,onOpenPodcast,onOpenCategory}:{
  slug:string;userId:string;onClose:()=>void;onOpenSession:(id:string)=>void;onOpenProfile:(id:string)=>void;onOpenPodcast:(id:string)=>void;onOpenCategory:(slug:string)=>void
}){
  const category=getCategoryBySlug(slug)
  const categoryName=category?.name||slugToCategoryName(slug)
  const [sessions,setSessions]=useState<SessionSearchResult[]>([])
  const [healers,setHealers]=useState<FeaturedHealer[]>([])
  const [podcasts,setPodcasts]=useState<FeaturedPodcast[]>([])
  const [loading,setLoading]=useState(true)

  const load=useCallback(async()=>{
    setLoading(true)
    try{
      const [sessRes,healersRes,podcastsRes]=await Promise.all([
        searchSessions({category_filter:categoryName,upcoming_only:true,page_limit:6,sort_by:'upcoming'}),
        supabase.from('profiles').select('id,full_name,display_name,avatar_url,professional_title,country,specialties,online,professional_verification_status')
          .eq('profile_type','healer').eq('account_status','active').eq('discoverable',true).neq('visibility','private')
          .eq('professional_verification_status','approved').contains('specialties',[categoryName]).limit(6),
        supabase.from('podcasts').select('id,title,short_description,cover_image_url,category,language,follower_count,episode_count,total_plays')
          .eq('status','published').eq('category',categoryName).order('created_at',{ascending:false}).limit(6),
      ])
      setSessions(sessRes.data||[])
      setHealers((healersRes.data as FeaturedHealer[])||[])
      setPodcasts((podcastsRes.data as FeaturedPodcast[])||[])
    }catch(e){console.error('Failed to load category:',e)}finally{setLoading(false)}
  },[categoryName])

  useEffect(()=>{load()},[load])

  function fmtDate(iso:string){return new Date(iso).toLocaleDateString([],{month:'short',day:'numeric'})}
  function fmtTime(iso:string){return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
  function initials(name?:string|null){return(name||'N').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()}

  const relatedCategories=CATEGORIES.filter(c=>c.slug!==slug).slice(0,6)

  if(!category)return <div className="category-overlay"><div className="category-window">
    <header className="category-header"><button className="category-back" onClick={onClose}><X size={18}/></button><h1>Category not found</h1></header>
    <div className="category-body"><p>This category doesn&apos;t exist.</p></div>
  </div></div>

  return <div className="category-overlay"><div className="category-window">
    <header className="category-header">
      <div className="category-header-left">
        <button className="category-back" onClick={onClose}><X size={18}/></button>
        <div>
          <h1><span className="category-icon">{category.icon}</span> {category.name}</h1>
          <p>{category.description}</p>
        </div>
      </div>
    </header>

    <div className="category-body">
      {loading ? <div className="category-loading"><Loader2 size={24} className="spin"/><span>Loading…</span></div> : <>
        {sessions.length > 0 && <section className="category-section">
          <div className="category-section-head">
            <h2><CalendarDays size={16}/> Sessions</h2>
            <button onClick={() => { onClose(); setTimeout(() => { window.location.hash = '#/sessions' }, 50) }}>View all <ChevronRight size={14}/></button>
          </div>
          <div className="explore-session-grid">
            {sessions.map(s => <button key={s.id} className={`explore-session-card ${s.status === 'live' ? 'live' : ''}`} onClick={() => onOpenSession(s.id)}>
              <div className="explore-session-cover" style={s.cover_image_url ? { backgroundImage: `url(${s.cover_image_url})` } : undefined}>
                {s.status === 'live' && <span className="explore-live-badge"><span className="live-dot"/> LIVE</span>}
              </div>
              <div className="explore-session-body">
                <h3>{s.title}</h3>
                <div className="explore-session-meta">
                  <span><Clock3 size={10}/> {fmtDate(s.starts_at)} · {fmtTime(s.starts_at)}</span>
                  {s.location && <span><MapPin size={10}/> {s.location}</span>}
                </div>
                <div className="explore-session-host">
                  <span>{s.host_avatar ? <img src={s.host_avatar} alt=""/> : initials(s.host_name)}</span>
                  {s.host_name}
                </div>
              </div>
            </button>)}
          </div>
        </section>}

        {healers.length > 0 && <section className="category-section">
          <div className="category-section-head"><h2>Healers</h2></div>
          <div className="explore-healer-grid">
            {healers.map(h => <button key={h.id} className="explore-healer-card" onClick={() => onOpenProfile(h.id)}>
              <div className="explore-healer-avatar">
                {h.avatar_url ? <img src={h.avatar_url} alt=""/> : initials(h.full_name)}
                {h.online && <span className="online-dot"/>}
              </div>
              <h4>{h.display_name || h.full_name}</h4>
              <p>{h.professional_title || 'Healer'}</p>
            </button>)}
          </div>
        </section>}

        {podcasts.length > 0 && <section className="category-section">
          <div className="category-section-head"><h2><Headphones size={16}/> Podcasts</h2></div>
          <div className="explore-podcast-grid">
            {podcasts.map(p => <button key={p.id} className="explore-podcast-card" onClick={() => onOpenPodcast(p.id)}>
              <div className="explore-podcast-cover">{p.cover_image_url ? <img src={p.cover_image_url} alt=""/> : <Headphones size={20}/>}</div>
              <div className="explore-podcast-info">
                <h4>{p.title}</h4>
                {p.short_description && <p>{p.short_description}</p>}
                <div className="explore-podcast-stats">
                  <span>{p.episode_count} episodes</span>
                </div>
              </div>
            </button>)}
          </div>
        </section>}

        {sessions.length === 0 && healers.length === 0 && podcasts.length === 0 && <div className="category-empty">
          <span className="category-empty-icon">{category.icon}</span>
          <h3>No content in {category.name} yet</h3>
          <p>Check back soon — healers are adding new sessions and podcasts regularly.</p>
        </div>}

        <section className="category-section">
          <h2>Explore other categories</h2>
          <div className="explore-categories">
            {relatedCategories.map(c => <button key={c.slug} className="explore-cat-card" style={{ borderColor: c.color + '40' }} onClick={() => onOpenCategory(c.slug)}>
              <span className="explore-cat-icon">{c.icon}</span>
              <span className="explore-cat-name">{c.name}</span>
            </button>)}
          </div>
        </section>
      </>}
    </div>
  </div></div>
}
