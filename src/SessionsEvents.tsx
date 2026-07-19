import { FormEvent, useCallback, useEffect, useState } from 'react'
import { CalendarDays, Clock3, Plus, Search, Video, X } from 'lucide-react'
import { supabase } from './supabase'
import './sessions-events.css'

type SessionRow = {
  id:string; host_id:string; title:string; description:string; category:string; language:string;
  starts_at:string; ends_at:string; timezone:string; capacity:number; visibility:string; status:string;
  registration_deadline:string|null; chat_enabled:boolean; live_room_id:string;
  profiles?:{full_name:string;display_name:string|null;avatar_url:string|null;profile_type:string;specialties:string[]}|null;
  session_registrations?:{status:string;user_id:string}[]
}

const categories = ['Meditation','Mindfulness','Emotional Support','Personal Coaching','Relationships','Stress Management','Self Growth','Breathwork','Wellness Education','Healing Circle','Community Discussion','Professional Workshop']

function localValue(date:Date){return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function initials(name?:string|null){return (name||'N').split(' ').map(x=>x[0]).join('').slice(0,2)}
function duration(start:string,end:string){const mins=Math.max(0,Math.round((new Date(end).getTime()-new Date(start).getTime())/60000));return mins>=60?`${Math.floor(mins/60)}h ${mins%60||''}`.trim():`${mins}m`}

export function SessionsPage({userId,onClose}:{userId:string;onClose:()=>void}) {
  const [items,setItems]=useState<SessionRow[]>([]),[mine,setMine]=useState<{session_id:string;status:string}[]>([]),[tab,setTab]=useState<'upcoming'|'hosting'|'registered'|'past'>('upcoming'),[query,setQuery]=useState(''),[showCreate,setShowCreate]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const [{data,error},{data:registrations}]=await Promise.all([
      supabase.from('sessions').select('*,profiles!sessions_host_id_fkey(full_name,display_name,avatar_url,profile_type,specialties),session_registrations(status,user_id)').order('starts_at',{ascending:true}).limit(80),
      supabase.from('session_registrations').select('session_id,status').eq('user_id',userId).in('status',['registered','waitlisted'])
    ])
    if(error){setError(error.message);setLoading(false);return}
    setItems((data as unknown as SessionRow[])||[])
    setMine((registrations as {session_id:string;status:string}[])||[])
    setLoading(false)
  },[userId])
  useEffect(()=>{load();const c=supabase.channel(`sessions-${userId}`).on('postgres_changes',{event:'*',schema:'public',table:'sessions'},()=>load()).on('postgres_changes',{event:'*',schema:'public',table:'session_registrations'},()=>load()).subscribe();return()=>{supabase.removeChannel(c)}},[userId,load])
  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const fd=new FormData(e.currentTarget)
    const starts=new Date(String(fd.get('starts_at'))), ends=new Date(String(fd.get('ends_at')))
    if(starts <= new Date()){setError('Start time must be in the future.');return}
    if(ends <= starts){setError('End time must be after the start time.');return}
    const row={host_id:userId,title:String(fd.get('title')).trim(),description:String(fd.get('description')).trim(),category:String(fd.get('category')),language:String(fd.get('language')||'English'),starts_at:starts.toISOString(),ends_at:ends.toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,capacity:Number(fd.get('capacity')||20),visibility:String(fd.get('visibility')||'public'),registration_deadline:fd.get('registration_deadline')?new Date(String(fd.get('registration_deadline'))).toISOString():null,chat_enabled:Boolean(fd.get('chat_enabled'))}
    const {error}=await supabase.from('sessions').insert(row)
    if(error)setError(error.message);else{setShowCreate(false);load()}
  }
  async function register(s:SessionRow){const current=mine.find(x=>x.session_id===s.id);const {error}=current?await supabase.rpc('cancel_session_registration',{target_session:s.id}):await supabase.rpc('register_for_session',{target_session:s.id});if(error)alert(error.message);else load()}
  const now=Date.now()
  const filtered=items.filter(s=>`${s.title} ${s.description} ${s.category} ${s.language} ${s.profiles?.display_name||s.profiles?.full_name||''}`.toLowerCase().includes(query.toLowerCase()))
  const visible=filtered.filter(s=>tab==='hosting'?s.host_id===userId:tab==='registered'?mine.some(r=>r.session_id===s.id):tab==='past'?new Date(s.ends_at).getTime()<now:new Date(s.ends_at).getTime()>=now&&s.status!=='cancelled')
  return <div className="feature-overlay"><section className="sessions-window"><header><div><h2>Sessions</h2><p>Events, workshops, guided practices, and community gatherings.</p></div><button className="create-session" onClick={()=>setShowCreate(true)}><Plus/> Create session</button><button onClick={onClose}><X/></button></header><div className="session-tabs">{(['upcoming','registered','hosting','past'] as const).map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}</div><label className="session-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by title, host, category, or language"/></label>{showCreate&&<form className="session-form" onSubmit={create}><div className="form-row"><label>Title<input name="title" required minLength={3}/></label><label>Category<select name="category">{categories.map(c=><option key={c}>{c}</option>)}</select></label></div><label>Description<textarea name="description" required placeholder="What will people experience?"/></label><div className="form-row"><label>Start<input type="datetime-local" name="starts_at" required defaultValue={localValue(new Date(Date.now()+86400000))}/></label><label>End<input type="datetime-local" name="ends_at" required defaultValue={localValue(new Date(Date.now()+90000000))}/></label></div><div className="form-row"><label>Language<input name="language" defaultValue="English"/></label><label>Capacity<input name="capacity" type="number" min={1} defaultValue={20}/></label></div><div className="form-row"><label>Visibility<select name="visibility"><option value="public">Public</option><option value="private">Private</option></select></label><label>Registration deadline<input type="datetime-local" name="registration_deadline"/></label></div><label className="check-label"><input type="checkbox" name="chat_enabled" defaultChecked/>Enable session chat</label><p className="session-disclaimer">Nova Resort sessions are wellness and community support experiences, not emergency medical care.</p><button className="save-profile">Publish session</button></form>}{loading?<div className="empty-state">Loading sessions...</div>:error?<div className="empty-state"><CalendarDays/><h3>Sessions unavailable</h3><p>{error}</p></div>:visible.length===0?<div className="empty-state"><CalendarDays/><h3>No sessions here yet</h3><p>Create the first session or check another tab.</p></div>:<div className="session-grid">{visible.map(s=>{const reg=s.session_registrations?.filter(r=>r.status==='registered').length||0,current=mine.find(x=>x.session_id===s.id);return <article className="session-card" key={s.id}><div className="session-cover"><CalendarDays/><span>{s.category}</span></div><div className="session-body"><div className="session-host"><span>{s.profiles?.avatar_url?<img src={s.profiles.avatar_url} alt=""/>:initials(s.profiles?.display_name||s.profiles?.full_name)}</span><div><b>{s.profiles?.display_name||s.profiles?.full_name||'Nova host'}</b><small>{s.profiles?.profile_type==='healer'?'Healer / Therapist':'Community host'}</small></div></div><h3>{s.title}</h3><p>{s.description||'A calm Nova Resort session.'}</p><div className="session-meta"><span><Clock3/> {new Date(s.starts_at).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}</span><span>{duration(s.starts_at,s.ends_at)}</span><span>{s.language}</span><span>{reg}/{s.capacity} registered</span></div><div className="session-actions"><button onClick={()=>register(s)} disabled={s.host_id===userId}>{s.host_id===userId?'Hosting':current?current.status==='waitlisted'?'On waitlist':'Registered':reg>=s.capacity?'Join waitlist':'Register'}</button><button onClick={()=>alert(`Live room opens for registered participants. Room: ${s.live_room_id}`)}><Video/> Details</button></div></div></article>})}</div>}</section></div>
}
