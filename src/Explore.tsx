import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Clock3, Headphones, Heart, MapPin, Mic, Play, Plus, Search, Users, Video, X, ChevronRight, Loader2, Globe, Star, TrendingUp } from 'lucide-react'
import { supabase } from './supabase'
import { searchSessions, type SessionSearchResult } from './services/search'
import { CATEGORIES } from './categories'
import { SessionLikeButton } from './SessionLikeButton'

type FeaturedHealer = {id:string;full_name:string;display_name:string|null;avatar_url:string|null;professional_title:string|null;country:string|null;specialties:string[]|null;online:boolean|null;professional_verification_status:string|null}
type FeaturedPodcast = {id:string;title:string;short_description:string|null;cover_image_url:string|null;category:string|null;language:string|null;follower_count:number;episode_count:number;total_plays:number}

export function ExplorePage({userId,onClose,onOpenSession,onOpenCategory}:{userId:string;onClose:()=>void;onOpenSession:(id:string)=>void;onOpenCategory:(slug:string)=>void}){
  const [liveSessions,setLiveSessions]=useState<SessionSearchResult[]>([])
  const [upcomingSessions,setUpcomingSessions]=useState<SessionSearchResult[]>([])
  const [featuredHealers,setFeaturedHealers]=useState<FeaturedHealer[]>([])
  const [newestPodcasts,setNewestPodcasts]=useState<FeaturedPodcast[]>([])
  const [loading,setLoading]=useState(true)

  const load=useCallback(async()=>{
    setLoading(true)
    try{
      const [liveRes,upcomingRes,healersRes,podcastsRes]=await Promise.all([
        searchSessions({status_filter:'live',page_limit:6,sort_by:'upcoming'}),
        searchSessions({upcoming_only:true,page_limit:8,sort_by:'upcoming'}),
        supabase.from('profiles').select('id,full_name,display_name,avatar_url,professional_title,country,specialties,online,professional_verification_status')
          .eq('profile_type','healer').eq('account_status','active').eq('discoverable',true).neq('visibility','private')
          .eq('professional_verification_status','approved').order('online',{ascending:false}).limit(8),
        supabase.from('podcasts').select('id,title,short_description,cover_image_url,category,language,follower_count,episode_count,total_plays')
          .eq('status','published').order('created_at',{ascending:false}).limit(8),
      ])
      setLiveSessions(liveRes.data||[])
      setUpcomingSessions(upcomingRes.data||[])
      setFeaturedHealers((healersRes.data as FeaturedHealer[])||[])
      setNewestPodcasts((podcastsRes.data as FeaturedPodcast[])||[])
    }catch(e){console.error('Failed to load explore:',e)}finally{setLoading(false)}
  },[])

  useEffect(()=>{load()},[load])

  function fmtTime(iso:string){return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
  function fmtDate(iso:string){return new Date(iso).toLocaleDateString([],{month:'short',day:'numeric'})}
  function initials(name?:string|null){return(name||'N').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()}

  if(loading)return <div className="explore-overlay"><div className="explore-window"><div className="explore-loading"><Loader2 size={24} className="spin"/><span>Loading explore…</span></div></div></div>

  return <div className="explore-overlay"><div className="explore-window">
    <header className="explore-header">
      <div className="explore-header-left">
        <button className="explore-back" onClick={onClose}><X size={18}/></button>
        <div><h1>Explore</h1><p>Discover healers, sessions, and podcasts</p></div>
      </div>
    </header>

    <div className="explore-body">
      {/* ── Categories ── */}
      <section className="explore-section">
        <h2>Wellness Categories</h2>
        <div className="explore-categories">
          {CATEGORIES.map(c=>
            <button key={c.slug} className="explore-cat-card" style={{borderColor:c.color+'40'}} onClick={()=>onOpenCategory(c.slug)}>
              <span className="explore-cat-icon">{c.icon}</span>
              <span className="explore-cat-name">{c.name}</span>
            </button>
          )}
        </div>
      </section>

      {/* ── Live Now ── */}
      {liveSessions.length>0&&<section className="explore-section">
        <div className="explore-section-head"><h2><span className="live-dot"/> Live Now</h2><button onClick={()=>window.location.hash='#/sessions'}>View all <ChevronRight size={14}/></button></div>
        <div className="explore-session-grid">
          {liveSessions.map(s=><article key={s.id} className="explore-session-card live" onClick={()=>onOpenSession(s.id)}>
            <div className="explore-session-cover" style={s.cover_image_url?{backgroundImage:`url(${s.cover_image_url})`}:undefined}>
              <span className="explore-live-badge"><span className="live-dot"/> LIVE</span>
            </div>
            <div className="explore-session-body">
              <h3>{s.title}</h3>
              <div className="explore-session-meta"><span><CalendarDays size={11}/> {fmtDate(s.starts_at)}</span><span><Clock3 size={11}/> {fmtTime(s.starts_at)}</span></div>
              <div className="explore-session-host"><span>{s.host_avatar?<img src={s.host_avatar} alt=""/>:initials(s.host_name)}</span>{s.host_name}</div>
            </div>
          </article>)}
        </div>
      </section>}

      {/* ── Upcoming Sessions ── */}
      {upcomingSessions.length>0&&<section className="explore-section">
        <div className="explore-section-head"><h2><CalendarDays size={16}/> Upcoming Sessions</h2><button onClick={()=>window.location.hash='#/sessions'}>View all <ChevronRight size={14}/></button></div>
        <div className="explore-session-grid">
          {upcomingSessions.slice(0,6).map(s=><article key={s.id} className="explore-session-card" onClick={()=>onOpenSession(s.id)}>
            <div className="explore-session-cover" style={s.cover_image_url?{backgroundImage:`url(${s.cover_image_url})`}:undefined}>
              <span className="explore-session-type">{s.session_type==='in_person'?'In Person':s.session_type==='hybrid'?'Hybrid':'Online'}</span>
              <SessionLikeButton sessionId={s.id} userId={userId}/>
            </div>
            <div className="explore-session-body">
              <h3>{s.title}</h3>
              <div className="explore-session-meta"><span><CalendarDays size={11}/> {fmtDate(s.starts_at)}</span><span><Clock3 size={11}/> {fmtTime(s.starts_at)}</span><span>{s.category}</span></div>
              <div className="explore-session-cap"><Users size={11}/> {s.registered_count}/{s.capacity}{s.is_full&&<span className="full-tag">Full</span>}</div>
            </div>
          </article>)}
        </div>
      </section>}

      {/* ── Featured Healers ── */}
      {featuredHealers.length>0&&<section className="explore-section">
        <div className="explore-section-head"><h2><Star size={16}/> Featured Healers</h2><button onClick={()=>window.location.hash='#/healers'}>View all <ChevronRight size={14}/></button></div>
        <div className="explore-healer-grid">
          {featuredHealers.map(h=><article key={h.id} className="explore-healer-card" onClick={()=>window.location.hash=`#/profile/${h.id}`}>
            <div className="explore-healer-avatar">{h.avatar_url?<img src={h.avatar_url} alt=""/>:initials(h.display_name||h.full_name)}{h.online&&<span className="online-dot"/>}</div>
            <h4>{h.display_name||h.full_name}</h4>
            <p>{h.professional_title||'Healer'}</p>
            {h.specialties&&h.specialties.length>0&&<div className="explore-healer-tags">{h.specialties.slice(0,2).map(s=><span key={s}>{s}</span>)}</div>}
            {h.country&&<span className="explore-healer-loc"><Globe size={10}/> {h.country}</span>}
          </article>)}
        </div>
      </section>}

      {/* ── Newest Podcasts ── */}
      {newestPodcasts.length>0&&<section className="explore-section">
        <div className="explore-section-head"><h2><Headphones size={16}/> Newest Podcasts</h2><button onClick={()=>window.location.hash='#/podcasts'}>View all <ChevronRight size={14}/></button></div>
        <div className="explore-podcast-grid">
          {newestPodcasts.map(p=><article key={p.id} className="explore-podcast-card" onClick={()=>window.location.hash=`#/podcasts/${p.id}`}>
            <div className="explore-podcast-cover">{p.cover_image_url?<img src={p.cover_image_url} alt=""/>:<Headphones size={24}/>}</div>
            <div className="explore-podcast-info">
              <h4>{p.title}</h4>
              <p>{p.short_description||'No description'}</p>
              <div className="explore-podcast-stats"><span><Play size={10}/> {p.total_plays} plays</span><span><Heart size={10}/> {p.follower_count} followers</span></div>
            </div>
          </article>)}
        </div>
      </section>}
    </div>
  </div></div>
}
