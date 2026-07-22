import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Clock3, CircleDot, Plus, Users, Video, X, ChevronRight, Pencil } from 'lucide-react'
import { supabase } from './supabase'
import './sessions-events.css'

type Session = {
  id:string; host_id:string; title:string; description:string; category:string; language:string;
  starts_at:string; ends_at:string; status:string; capacity:number; session_type:string;
  cover_image_url:string|null;
  profiles?:{full_name:string;display_name:string|null;avatar_url:string|null}|null;
  session_registrations?:{status:string;user_id:string}[];
  session_room_state?:{status:string;started_at:string|null;ended_at:string|null}|null;
}

function fmtTime(iso:string){return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function fmtDate(iso:string){return new Date(iso).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}
function timeUntil(iso:string){const diff=new Date(iso).getTime()-Date.now();if(diff<=0)return'now';const h=Math.floor(diff/3600000);const m=Math.floor((diff%3600000)/60000);return h>0?`${h}h ${m}m`:`${m}m`}

export function HealerDashboard({userId,onOpenSession,onCreateSession,onClose}:{userId:string;onOpenSession:(id:string)=>void;onCreateSession:()=>void;onClose:()=>void}){
  const [sessions,setSessions]=useState<Session[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')

  const load=useCallback(async()=>{
    setLoading(true)
    const {data,error}=await supabase.from('sessions').select('id,host_id,title,description,category,language,starts_at,ends_at,status,capacity,session_type,cover_image_url,profiles!sessions_host_id_fkey(full_name,display_name,avatar_url),session_registrations(status,user_id),session_room_state(status,started_at,ended_at)').eq('host_id',userId).order('starts_at',{ascending:false}).limit(50)
    if(error){setError(error.message);setLoading(false);return}
    setSessions((data as unknown as Session[])||[])
    setLoading(false)
  },[userId])

  useEffect(()=>{load()},[load])

  const now=Date.now()
  const upcoming=sessions.filter(s=>new Date(s.starts_at).getTime()>=now&&s.status!=='cancelled')
  const active=sessions.filter(s=>s.session_room_state?.status==='live')
  const past=sessions.filter(s=>new Date(s.ends_at).getTime()<now||s.status==='completed'||s.status==='cancelled')
  const totalRegs=sessions.reduce((sum,s)=>sum+(s.session_registrations?.filter(r=>r.status==='registered'||r.status==='attended').length||0),0)

  async function openRoom(sessionId:string){
    const {error}=await supabase.rpc('open_session_room',{target_session:sessionId})
    if(error){alert(error.message);return}
    onOpenSession(sessionId)
  }

  return <div className="feature-overlay"><section className="sessions-window healer-dashboard">
    <header><div><h2>Healer Dashboard</h2><p>Manage your sessions, workshops, and participants.</p></div><button onClick={onClose}><X/></button></header>

    <div className="healer-stats-row">
      <div className="healer-stat-card"><CalendarDays size={20}/><div><b>{upcoming.length}</b><span>Upcoming</span></div></div>
      <div className="healer-stat-card"><CircleDot size={20}/><div><b>{active.length}</b><span>Live Now</span></div></div>
      <div className="healer-stat-card"><Users size={20}/><div><b>{totalRegs}</b><span>Total Registrations</span></div></div>
      <div className="healer-stat-card"><Clock3 size={20}/><div><b>{past.length}</b><span>Past Sessions</span></div></div>
    </div>

    <div className="healer-section-header">
      <h3>My Sessions</h3>
      <button className="healer-create-btn" onClick={onCreateSession}><Plus size={15}/> Create Session</button>
    </div>

    {loading?<div className="session-loading">Loading sessions…</div>:error?<div className="session-error">{error}</div>:sessions.length===0?<div className="session-empty"><CalendarDays size={28}/><p>No sessions yet. Create your first session to get started.</p><button className="healer-create-btn" onClick={onCreateSession}><Plus size={15}/> Create Session</button></div>:<div className="healer-session-list">{sessions.map(s=>{
      const isLive=s.session_room_state?.status==='live'
      const isEnded=s.status==='completed'||s.status==='cancelled'||s.session_room_state?.status==='ended'
      const regCount=s.session_registrations?.filter(r=>r.status==='registered'||r.status==='attended').length||0
      const isBeforeStart=new Date(s.starts_at).getTime()>Date.now()
      return <article key={s.id} className={`healer-session-row ${isLive?'live':''}`}>
        <div className="healer-session-info">
          <div className="healer-session-title"><h4>{s.title}</h4>{isLive&&<span className="live-badge"><CircleDot size={10}/> LIVE</span>}</div>
          <div className="healer-session-meta">
            <span><CalendarDays size={12}/> {fmtDate(s.starts_at)}</span>
            <span><Clock3 size={12}/> {fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}</span>
            <span><Users size={12}/> {regCount}/{s.capacity}</span>
            <span className={`session-status-badge ${s.status}`}>{s.status}</span>
          </div>
        </div>
        <div className="healer-session-actions">
          {!isLive&&!isEnded&&isBeforeStart&&<button className="healer-action-btn primary" onClick={()=>openRoom(s.id)}><CircleDot size={14}/> Open Room</button>}
          {isLive&&<button className="healer-action-btn primary" onClick={()=>onOpenSession(s.id)}><Video size={14}/> Enter Room</button>}
          {isLive&&<button className="healer-action-btn" onClick={()=>onOpenSession(s.id)}><Pencil size={14}/> Manage</button>}
          {!isEnded&&<button className="healer-action-btn" onClick={()=>onOpenSession(s.id)}><ChevronRight size={14}/> Details</button>}
        </div>
      </article>
    })}</div>}
  </section></div>
}
