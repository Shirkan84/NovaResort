import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, Clock3, Globe, MapPin, Mic, MicOff, Monitor, Plus, Search, Send, Users, Video, VideoOff, X, ChevronRight, ChevronLeft, CircleDot, Pencil, Trash2, Pin, PinOff, UserX, Image, Check, MessageCircle, Share2, Download, SlidersHorizontal } from 'lucide-react'
import { supabase } from './supabase'
import { createLiveRoomProvider, type LiveRoomProvider, type LiveRoomParticipant } from './services/liveroom'
import { searchSessions, type SessionSearchResult } from './services/search'
import { SessionChatRoom } from './SessionChatRoom'
import './sessions-events.css'

type SessionRow = {
  id:string; host_id:string; title:string; description:string; category:string; language:string;
  starts_at:string; ends_at:string; timezone:string; capacity:number; visibility:string; status:string;
  registration_deadline:string|null; chat_enabled:boolean; live_room_id:string;
  live_room_provider:string;
  session_type:string; price:number; currency:string; location:string|null; meeting_url:string|null;
  cover_image_url:string|null;
  profiles?:{full_name:string;display_name:string|null;avatar_url:string|null;profile_type:string;specialties:string[]}|null;
  session_registrations?:{status:string;user_id:string}[];
  session_room_state?:{status:string;started_at:string|null;ended_at:string|null}|null;
}

type ChatMsg = {
  id:string; user_id:string; body:string; pinned:boolean; created_at:string;
  profiles?:{full_name:string;display_name:string|null;avatar_url:string|null}|null;
}

const categories = ['Meditation','Mindfulness','Emotional Support','Personal Coaching','Relationships','Stress Management','Self Growth','Breathwork','Wellness Education','Healing Circle','Community Discussion','Professional Workshop']

function shareSession(s:{id:string;title:string;description:string}){
  const url=`${window.location.origin}${window.location.pathname}#/sessions/${s.id}`
  if(navigator.share){navigator.share({title:s.title,text:`Join "${s.title}" on Nova Resort`,url}).catch(()=>{})}
  else{navigator.clipboard.writeText(url);alert('Link copied to clipboard!')}
}
function downloadICS(s:{title:string;description:string;starts_at:string;ends_at:string;location:string|null}){
  const fmt=(iso:string)=>new Date(iso).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')
  const ics=`BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Nova Resort//Session//EN\nBEGIN:VEVENT\nDTSTART:${fmt(s.starts_at)}\nDTEND:${fmt(s.ends_at)}\nSUMMARY:${s.title.replace(/,/g,'\\,')}\nDESCRIPTION:${(s.description||'').replace(/\n/g,'\\n').replace(/,/g,'\\,')}\nLOCATION:${(s.location||'Online').replace(/,/g,'\\,')}\nEND:VEVENT\nEND:VCALENDAR`
  const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'})
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${s.title.replace(/[^a-z0-9]/gi,'_')}.ics`;a.click();URL.revokeObjectURL(a.href)
}
function isRegistrationClosed(s:{registration_deadline:string|null;starts_at:string}){
  if(!s.registration_deadline)return false
  return new Date(s.registration_deadline).getTime()<Date.now()
}

function localValue(date:Date){return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function initials(name?:string|null){return (name||'N').split(' ').map(x=>x[0]).join('').slice(0,2)}
function duration(start:string,end:string){const mins=Math.max(0,Math.round((new Date(end).getTime()-new Date(start).getTime())/60000));return mins>=60?`${Math.floor(mins/60)}h ${mins%60||''}`.trim():`${mins}m`}
function fmtTime(iso:string){return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function fmtDate(iso:string){return new Date(iso).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}
function timeUntil(iso:string){const diff=new Date(iso).getTime()-Date.now();if(diff<=0)return'now';const h=Math.floor(diff/3600000);const m=Math.floor((diff%3600000)/60000);return h>0?`${h}h ${m}m`:`${m}m`}

export function SessionsPage({userId,isHealer,onClose,initialSessionId,initialSessionView}:{userId:string;isHealer:boolean;onClose:()=>void;initialSessionId?:string|null;initialSessionView?:string|null}) {
  const [items,setItems]=useState<SessionRow[]>([])
  const [mine,setMine]=useState<{session_id:string;status:string}[]>([])
  const [tab,setTab]=useState<'upcoming'|'hosting'|'registered'|'live'|'past'>('upcoming')
  const [query,setQuery]=useState('')
  const [categoryFilter,setCategoryFilter]=useState('all')
  const [sortBy,setSortBy]=useState('upcoming')
  const [showFilters,setShowFilters]=useState(false)
  const [showCreate,setShowCreate]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [detailId,setDetailId]=useState<string|null>(null)
  const [liveSessionId,setLiveSessionId]=useState<string|null>(null)
  const [chatSessionId,setChatSessionId]=useState<string|null>(null)
  const [editingId,setEditingId]=useState<string|null>(null)
  const debounceRef=useRef<ReturnType<typeof setTimeout>|null>(null)

  useEffect(()=>{
    if(initialSessionId&&initialSessionView==='room')setLiveSessionId(initialSessionId)
    else if(initialSessionId&&initialSessionView==='chat')setChatSessionId(initialSessionId)
    else if(initialSessionId)setDetailId(initialSessionId)
  },[initialSessionId,initialSessionView])

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    try{
      const [{data:rpcData,total},regRes]=await Promise.all([
        searchSessions({search_text:query,category_filter:categoryFilter,sort_by:sortBy,page_limit:80}),
        supabase.from('session_registrations').select('session_id,status').eq('user_id',userId).in('status',['registered','waitlisted']),
      ])
      if(regRes.error)console.error('Failed to load registrations:',regRes.error.message)
      const mapped:SessionRow[]=rpcData.map(r=>({
        id:r.id,host_id:r.host_id,title:r.title,description:r.description,category:r.category,language:r.language,
        starts_at:r.starts_at,ends_at:r.ends_at,timezone:r.timezone,capacity:r.capacity,visibility:r.visibility,status:r.status,
        registration_deadline:r.registration_deadline,chat_enabled:true,live_room_id:'',live_room_provider:'jitsi',
        session_type:r.session_type,price:r.price,currency:r.currency,location:r.location,meeting_url:null,
        cover_image_url:r.cover_image_url,
        profiles:{full_name:r.host_name,display_name:r.host_name,avatar_url:r.host_avatar,profile_type:'healer',specialties:[]},
        session_registrations:[],session_room_state:r.room_status?{status:r.room_status,started_at:null,ended_at:null}:null,
      }))
      setItems(mapped)
      setMine((regRes.data as {session_id:string;status:string}[])||[])
    }catch(e:any){setError(e.message||'Failed to load')}finally{setLoading(false)}
  },[query,categoryFilter,sortBy,userId])

  useEffect(()=>{load();const c=supabase.channel(`sessions-${userId}`).on('postgres_changes',{event:'*',schema:'public',table:'sessions'},()=>load()).on('postgres_changes',{event:'*',schema:'public',table:'session_registrations'},()=>load()).subscribe();return()=>{supabase.removeChannel(c)}},[userId,load])

  function handleQueryChange(v:string){
    setQuery(v)
    if(debounceRef.current)clearTimeout(debounceRef.current)
    debounceRef.current=setTimeout(()=>{},300)
  }

  async function updateSession(id:string,updates:Partial<SessionRow>){
    const {error}=await supabase.from('sessions').update(updates).eq('id',id)
    if(error)alert(error.message);else{setEditingId(null);load()}
  }

  async function register(s:SessionRow){
    const current=mine.find(x=>x.session_id===s.id)
    const {error}=current?await supabase.rpc('cancel_session_registration',{target_session:s.id}):await supabase.rpc('register_for_session',{target_session:s.id})
    if(error)alert(error.message);else{
      if(!current)await supabase.rpc('notify_session_event',{target_session:s.id,event_type:'registration_confirmed',target_user:userId})
      load()
    }
  }

  async function cancelSession(s:SessionRow){
    if(!confirm('Cancel this session? All registered participants will be notified.'))return
    const {error}=await supabase.rpc('cancel_session',{target_session:s.id})
    if(error)alert(error.message);else load()
  }

  async function uploadCover(sessionId:string,file:File){
    const path=`${userId}/${sessionId}/cover.jpg`
    const {error}=await supabase.storage.from('session-covers').upload(path,file,{upsert:true})
    if(error){alert(error.message);return}
    const {data}=supabase.storage.from('session-covers').getPublicUrl(path)
    await updateSession(sessionId,{cover_image_url:data.publicUrl})
  }

  const now=Date.now()
  const filtered=items.filter(s=>`${s.title} ${s.description} ${s.category} ${s.language} ${s.profiles?.display_name||s.profiles?.full_name||''}`.toLowerCase().includes(query.toLowerCase()))
  const visible=filtered.filter(s=>{
    if(tab==='hosting')return s.host_id===userId
    if(tab==='registered')return mine.some(r=>r.session_id===s.id)
    if(tab==='live')return s.session_room_state?.status==='live'
    if(tab==='past')return new Date(s.ends_at).getTime()<now||s.status==='completed'||s.status==='cancelled'
    return new Date(s.ends_at).getTime()>=now&&s.status!=='cancelled'&&s.session_room_state?.status!=='live'
  })

  if(editingId){
    const session=items.find(s=>s.id===editingId)
    if(session)return <EditSessionForm session={session} onSaved={()=>{setEditingId(null);load()}} onCancel={()=>setEditingId(null)}/>
  }

  if(detailId){
    const session=items.find(s=>s.id===detailId)
    if(session)return <SessionDetail session={session} userId={userId} isHealer={isHealer} mine={mine} onBack={()=>setDetailId(null)} onJoinRoom={(id)=>{setDetailId(null);setLiveSessionId(id)}} onOpenRoom={(id)=>{setDetailId(null);setLiveSessionId(id)}} onOpenChat={(id)=>{setDetailId(null);setChatSessionId(id)}} onRegister={register} onCancelSession={cancelSession} onEdit={(id)=>{setDetailId(null);setEditingId(id)}} onUploadCover={uploadCover} load={load}/>
  }

  if(liveSessionId){
    const session=items.find(s=>s.id===liveSessionId)
    if(session)return <LiveRoom session={session} userId={userId} isHost={session.host_id===userId} onClose={()=>{setLiveSessionId(null);load()}}/>
  }

  if(chatSessionId){
    return <SessionChatRoom userId={userId} isHealer={isHealer} sessionId={chatSessionId} onBack={()=>{setChatSessionId(null);load()}}/>
  }

  return <div className="feature-overlay"><section className={`sessions-window ${showCreate?'has-create-form':''}`} role="dialog" aria-modal="true" aria-label="Sessions"><header><div><h2>Sessions</h2><p>Events, workshops, guided practices, and community gatherings.</p></div>{isHealer?<button className="create-session" onClick={()=>setShowCreate(true)}><Plus/> Create session</button>:null}<button onClick={onClose}><X/></button></header><div className="session-tabs">{(['upcoming','live','registered','hosting','past'] as const).map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}</div><div className="session-search-row"><label className="session-search"><Search size={15}/><input value={query} onChange={e=>handleQueryChange(e.target.value)} placeholder="Search by title, host, category, or language"/></label><button className={`filter-toggle ${showFilters?'active':''}`} onClick={()=>setShowFilters(!showFilters)}><SlidersHorizontal size={14}/> Filters</button></div>{showFilters&&<div className="session-filters"><select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)} aria-label="Filter by category"><option value="all">All Categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select><select value={sortBy} onChange={e=>setSortBy(e.target.value)} aria-label="Sort sessions"><option value="upcoming">Upcoming</option><option value="newest">Newest</option><option value="popular">Most Popular</option></select></div>}{showCreate&&<CreateSessionForm userId={userId} onCreated={()=>{setShowCreate(false);load()}} onCancel={()=>setShowCreate(false)}/>}{error&&<div className="session-error">{error}<button onClick={()=>setError('')}>×</button></div>}{loading?<div className="session-loading">Loading sessions…</div>:visible.length===0?<div className="session-empty"><CalendarDays size={28}/><p>{tab==='live'?'No live sessions right now.':tab==='past'?'No past sessions.':tab==='registered'?'You have not registered for any sessions.':tab==='hosting'?'You are not hosting any sessions.':query?'No sessions match your search.':'No upcoming sessions.'}</p></div>:<div className="session-grid">{visible.map(s=>{const isHost=s.host_id===userId;const reg=mine.find(r=>r.session_id===s.id);const isLive=s.session_room_state?.status==='live';return <article className={`session-card ${isLive?'live':''}`} key={s.id} onClick={()=>setDetailId(s.id)}><div className={`session-cover ${isLive?'live-cover':''}`} style={s.cover_image_url?{backgroundImage:`url(${s.cover_image_url})`,backgroundSize:'cover',backgroundPosition:'center'}:undefined}><div className="session-cover-top"><Video size={22}/><div className="session-cover-labels"><span className="session-type-badge">{s.session_type==='in_person'?'In Person':s.session_type==='hybrid'?'Hybrid':'Online'}</span>{isLive&&<span className="live-badge"><CircleDot size={10}/> LIVE</span>}{reg&&reg.status==='waitlisted'&&<span className="waitlist-badge">Waitlisted</span>}</div></div><span className="session-category-tag">{s.category}</span></div><div className="session-body"><div className="session-host"><span>{s.profiles?.avatar_url?<img src={s.profiles.avatar_url} alt=""/>:initials(s.profiles?.display_name||s.profiles?.full_name)}</span><div><b>{s.profiles?.display_name||s.profiles?.full_name||'Host'}</b><small>{isHost?'You':'Healer'}</small></div></div><h3>{s.title}</h3><p>{s.description.slice(0,120)}{s.description.length>120?'…':''}</p><div className="session-meta"><span><CalendarDays size={12}/> {fmtDate(s.starts_at)}</span><span><Clock3 size={12}/> {fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}</span><span>{duration(s.starts_at,s.ends_at)}</span><span><Users size={12}/> {s.capacity} spots</span>{s.price>0&&<span>${s.price}</span>}</div><div className="session-actions">{isLive&&<button className="join-live-btn" onClick={(e)=>{e.stopPropagation();setDetailId(s.id)}}><CircleDot size={14}/> Join Live</button>}{!isHost&&!reg&&!isRegistrationClosed(s)&&<button onClick={(e)=>{e.stopPropagation();register(s)}}>Register</button>}{!isHost&&!reg&&isRegistrationClosed(s)&&<button disabled className="reg-closed">Registration Closed</button>}{!isHost&&reg&&reg.status==='registered'&&<button className="registered-btn" onClick={(e)=>{e.stopPropagation();register(s)}}>Cancel</button>}{!isHost&&reg&&reg.status==='waitlisted'&&<button className="waitlisted-btn" onClick={(e)=>{e.stopPropagation();register(s)}}>Leave Waitlist</button>}{isHost&&<button onClick={(e)=>{e.stopPropagation();setDetailId(s.id)}}>Manage</button>}</div></div></article>})}</div>}</section></div>
}

function CreateSessionForm({userId,onCreated,onCancel}:{userId:string;onCreated:()=>void;onCancel:()=>void}){
  const [error,setError]=useState('')
  async function handle(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const fd=new FormData(e.currentTarget)
    const starts=new Date(String(fd.get('starts_at'))),ends=new Date(String(fd.get('ends_at')))
    if(starts<=new Date()){setError('Start time must be in the future.');return}
    if(ends<=starts){setError('End time must be after the start time.');return}
    const row={host_id:userId,title:String(fd.get('title')).trim(),description:String(fd.get('description')).trim(),category:String(fd.get('category')),language:String(fd.get('language')||'English'),starts_at:starts.toISOString(),ends_at:ends.toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,capacity:Number(fd.get('capacity')||20),visibility:String(fd.get('visibility')||'public'),registration_deadline:fd.get('registration_deadline')?new Date(String(fd.get('registration_deadline'))).toISOString():null,chat_enabled:true,participant_audio_enabled:true,participant_video_enabled:true,session_type:String(fd.get('session_type')||'online'),price:Number(fd.get('price')||0),currency:'USD',location:String(fd.get('location')||'')||null,meeting_url:String(fd.get('meeting_url')||'')||null}
    const {error}=await supabase.from('sessions').insert(row)
    if(error)setError(error.message);else onCreated()
  }
  return <form className="session-form" onSubmit={handle}><div className="form-row"><label>Title<input name="title" required minLength={3} placeholder="Session title"/></label><label>Category<select name="category">{categories.map(c=><option key={c}>{c}</option>)}</select></label></div><label>Description<textarea name="description" required placeholder="What will people experience?"/></label><div className="form-row"><label>Start<input type="datetime-local" name="starts_at" required defaultValue={localValue(new Date(Date.now()+86400000))}/></label><label>End<input type="datetime-local" name="ends_at" required defaultValue={localValue(new Date(Date.now()+90000000))}/></label></div><div className="form-row"><label>Timezone<input name="timezone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} readOnly/></label><label>Capacity<input name="capacity" type="number" min={1} defaultValue={20}/></label></div><div className="form-row"><label>Session type<select name="session_type"><option value="online">Online</option><option value="in_person">In Person</option><option value="hybrid">Hybrid</option></select></label><label>Price (0 = free)<input name="price" type="number" min={0} step="0.01" defaultValue={0}/></label></div><div className="form-row"><label>Location (optional)<input name="location" placeholder="Physical location"/></label><label>Meeting URL (optional)<input name="meeting_url" placeholder="https://…"/></label></div><div className="form-row"><label>Visibility<select name="visibility"><option value="public">Public</option><option value="private">Private</option></select></label><label>Registration deadline<input type="datetime-local" name="registration_deadline"/></label></div><div className="form-row"><label>Language<input name="language" defaultValue="English"/></label><span/></div>{error&&<div className="session-form-error">{error}</div>}<div className="form-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="submit" className="primary">Create session</button></div></form>
}

function EditSessionForm({session,onSaved,onCancel}:{session:SessionRow;onSaved:()=>void;onCancel:()=>void}){
  const [error,setError]=useState('')
  async function handle(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const fd=new FormData(e.currentTarget)
    const starts=new Date(String(fd.get('starts_at'))),ends=new Date(String(fd.get('ends_at')))
    if(ends<=starts){setError('End time must be after the start time.');return}
    const updates={title:String(fd.get('title')).trim(),description:String(fd.get('description')).trim(),category:String(fd.get('category')),language:String(fd.get('language')||'English'),starts_at:starts.toISOString(),ends_at:ends.toISOString(),capacity:Number(fd.get('capacity')||20),visibility:String(fd.get('visibility')||'public'),registration_deadline:fd.get('registration_deadline')?new Date(String(fd.get('registration_deadline'))).toISOString():null,session_type:String(fd.get('session_type')||'online'),price:Number(fd.get('price')||0),location:String(fd.get('location')||'')||null,meeting_url:String(fd.get('meeting_url')||'')||null}
    const {error}=await supabase.from('sessions').update(updates).eq('id',session.id)
    if(error)setError(error.message);else onSaved()
  }
  return <div className="feature-overlay"><section className="sessions-window"><header><button className="back-btn" onClick={onCancel}><ChevronRight size={18} style={{transform:'rotate(180deg)'}}/> Cancel</button><div><h2>Edit Session</h2><p>Update your session details.</p></div></header><form className="session-form" onSubmit={handle} style={{margin:'16px 20px'}}><div className="form-row"><label>Title<input name="title" required minLength={3} defaultValue={session.title}/></label><label>Category<select name="category" defaultValue={session.category}>{categories.map(c=><option key={c}>{c}</option>)}</select></label></div><label>Description<textarea name="description" required defaultValue={session.description}/></label><div className="form-row"><label>Start<input type="datetime-local" name="starts_at" required defaultValue={localValue(new Date(session.starts_at))}/></label><label>End<input type="datetime-local" name="ends_at" required defaultValue={localValue(new Date(session.ends_at))}/></label></div><div className="form-row"><label>Capacity<input name="capacity" type="number" min={1} defaultValue={session.capacity}/></label><label>Session type<select name="session_type" defaultValue={session.session_type}><option value="online">Online</option><option value="in_person">In Person</option><option value="hybrid">Hybrid</option></select></label></div><div className="form-row"><label>Price (0 = free)<input name="price" type="number" min={0} step="0.01" defaultValue={session.price}/></label><label>Visibility<select name="visibility" defaultValue={session.visibility}><option value="public">Public</option><option value="private">Private</option></select></label></div><div className="form-row"><label>Location (optional)<input name="location" defaultValue={session.location||''} placeholder="Physical location"/></label><label>Meeting URL (optional)<input name="meeting_url" defaultValue={session.meeting_url||''} placeholder="https://…"/></label></div><div className="form-row"><label>Language<input name="language" defaultValue={session.language}/></label><label>Registration deadline<input type="datetime-local" name="registration_deadline" defaultValue={session.registration_deadline?localValue(new Date(session.registration_deadline)):''}/></label></div>{error&&<div className="session-form-error">{error}</div>}<div className="form-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="submit" className="primary">Save changes</button></div></form></section></div>
}

function SessionDetail({session,userId,isHealer,mine,onBack,onJoinRoom,onOpenRoom,onOpenChat,onRegister,onCancelSession,onEdit,onUploadCover,load}:{session:SessionRow;userId:string;isHealer:boolean;mine:{session_id:string;status:string}[];onBack:()=>void;onJoinRoom:(id:string)=>void;onOpenRoom:(id:string)=>void;onOpenChat:(id:string)=>void;onRegister:(s:SessionRow)=>void;onCancelSession:(s:SessionRow)=>void;onEdit:(id:string)=>void;onUploadCover:(sessionId:string,file:File)=>void;load:()=>void}){
  const isHost=session.host_id===userId
  const reg=mine.find(r=>r.session_id===session.id)
  const isLive=session.session_room_state?.status==='live'
  const isEnded=session.status==='completed'||session.status==='cancelled'||(session.session_room_state?.status==='ended')
  const isBeforeStart=new Date(session.starts_at).getTime()>Date.now()
  const [countdown,setCountdown]=useState('')
  const [participants,setParticipants]=useState<{status:string;user_id:string;id:string}[]>([])
  const [attendance,setAttendance]=useState<Record<string,boolean>>({})
  const [coverFile,setCoverFile]=useState<File|null>(null)
  const [opening,setOpening]=useState(false)

  useEffect(()=>{
    if(!isBeforeStart||isLive)return
    const tick=()=>setCountdown(timeUntil(session.starts_at))
    tick();const id=setInterval(tick,30000)
    return()=>clearInterval(id)
  },[session.starts_at,isBeforeStart,isLive])

  useEffect(()=>{
    supabase.from('session_registrations').select('status,user_id,id').eq('session_id',session.id).in('status',['registered','waitlisted','attended']).then(({data})=>{
      if(data){setParticipants(data);const att:Record<string,boolean>={};data.forEach((r:any)=>{if(r.status==='attended')att[r.user_id]=true});setAttendance(att)}
    })
  },[session.id])

  async function markAttendance(uid:string,attended:boolean){
    const newStatus=attended?'attended':'registered'
    const {error}=await supabase.from('session_registrations').update({status:newStatus}).eq('session_id',session.id).eq('user_id',uid)
    if(!error)setAttendance(prev=>({...prev,[uid]:attended}))
  }

  function handleCoverChange(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]
    if(file){setCoverFile(file);onUploadCover(session.id,file)}
  }

  async function openRoom(){
    setOpening(true)
    const {error}=await supabase.rpc('open_session_room',{target_session:session.id})
    if(error){alert(error.message);setOpening(false);return}
    // Notify all registered participants that the room is open
    const {data:regs}=await supabase.from('session_registrations').select('user_id').eq('session_id',session.id).in('status',['registered','waitlisted'])
    if(regs){for(const r of regs){if(r.user_id!==userId)await supabase.rpc('notify_session_event',{target_session:session.id,event_type:'room_opened',target_user:r.user_id})}}
    await load()
    onOpenRoom(session.id)
  }

  return <div className="feature-overlay"><section className="sessions-window session-detail" role="dialog" aria-modal="true" aria-label="Session details"><header><button className="back-btn" onClick={onBack}><ChevronRight size={18} style={{transform:'rotate(180deg)'}}/> Back</button><div><h2>{session.title}</h2><p>{session.category} · {session.language}</p></div>{isHost&&<div className="detail-header-actions"><button onClick={()=>onEdit(session.id)} className="edit-btn"><Pencil size={14}/></button><button onClick={()=>onCancelSession(session)} className="cancel-btn"><Trash2 size={14}/></button></div>}</header><div className="detail-body"><div className="detail-main"><div className={`detail-cover ${isLive?'live-cover':''}`} style={session.cover_image_url?{backgroundImage:`url(${session.cover_image_url})`,backgroundSize:'cover',backgroundPosition:'center'}:undefined}><div className="detail-cover-content"><Video size={36}/>{isLive&&<span className="live-badge lg"><CircleDot size={14}/> LIVE</span>}{isHost&&!session.cover_image_url&&<label className="cover-upload-btn"><Image size={14}/> Upload cover<input type="file" accept="image/*" onChange={handleCoverChange} hidden/></label>}</div></div><div className="detail-info"><h3>{session.title}</h3><p className="detail-desc">{session.description}</p><div className="detail-meta-grid"><div className="detail-meta-item"><CalendarDays size={16}/><div><span>Date</span><b>{fmtDate(session.starts_at)}</b></div></div><div className="detail-meta-item"><Clock3 size={16}/><div><span>Time</span><b>{fmtTime(session.starts_at)} – {fmtTime(session.ends_at)}</b></div></div><div className="detail-meta-item"><Globe size={16}/><div><span>Duration</span><b>{duration(session.starts_at,session.ends_at)}</b></div></div><div className="detail-meta-item"><Users size={16}/><div><span>Capacity</span><b>{session.capacity} participants</b></div></div>{session.session_type!=='online'&&<div className="detail-meta-item"><MapPin size={16}/><div><span>Location</span><b>{session.location||'TBD'}</b></div></div>}{session.price>0&&<div className="detail-meta-item"><span className="price-tag">${session.price} {session.currency}</span></div>}</div></div></div><div className="detail-sidebar"><div className="detail-host-card"><div className="session-host lg"><span>{session.profiles?.avatar_url?<img src={session.profiles.avatar_url} alt=""/>:initials(session.profiles?.display_name||session.profiles?.full_name)}</span><div><b>{session.profiles?.display_name||session.profiles?.full_name||'Host'}</b><small>Session host</small></div></div></div><div className="detail-actions-row"><button className="detail-action-btn" onClick={()=>shareSession(session)}><Share2 size={14}/> Share</button><button className="detail-action-btn" onClick={()=>downloadICS(session)}><Download size={14}/> Add to Calendar</button></div>{isBeforeStart&&!isLive&&!isEnded&&<div className="detail-countdown"><Clock3 size={20}/><span>Starts in {countdown||timeUntil(session.starts_at)}</span></div>}{isHost&&!isLive&&!isEnded&&<button className="join-session-btn lg" disabled={opening} onClick={openRoom}><CircleDot size={18}/> {opening?'Opening…':'Open Session Room'}</button>}{isHost&&isLive&&<button className="join-session-btn lg" onClick={()=>onJoinRoom(session.id)}><Video size={18}/> Enter Session Room</button>}{isHost&&isLive&&<button className="join-session-btn lg" style={{marginTop:8}} onClick={()=>onOpenChat(session.id)}><MessageCircle size={18}/> Open Chat</button>}{isEnded&&<div className="detail-ended">This session has ended.</div>}{!isHost&&!reg&&!isEnded&&!isRegistrationClosed(session)&&<button className="join-session-btn" onClick={()=>onRegister(session)}>Register for this session</button>}{!isHost&&!reg&&!isEnded&&isRegistrationClosed(session)&&<button className="join-session-btn" disabled>Registration Closed</button>}{!isHost&&reg&&reg.status==='registered'&&!isEnded&&<button className="join-session-btn registered" onClick={()=>onRegister(session)}>Cancel registration</button>}{!isHost&&reg&&reg.status==='waitlisted'&&!isEnded&&<button className="join-session-btn waitlisted" onClick={()=>onRegister(session)}>Leave waitlist</button>}{!isHost&&reg&&isLive&&<button className="join-session-btn lg" onClick={()=>onJoinRoom(session.id)}><Video size={18}/> Join Session</button>}{!isHost&&reg&&isLive&&<button className="join-session-btn lg" style={{marginTop:8}} onClick={()=>onOpenChat(session.id)}><MessageCircle size={18}/> Open Chat</button>}{!isHost&&!isEnded&&<div className="host-info">The host will open the room when the session begins.</div>}{isHost&&participants.length>0&&<div className="detail-participants"><h4>Registered ({participants.length})</h4>{participants.map(p=>{const profileName=p.user_id.slice(0,8);return <div key={p.user_id} className="participant-row"><span className={`participant-status ${attendance[p.user_id]?'attended':p.status}`}>{attendance[p.user_id]?'attended':p.status}</span><span className="participant-id">{profileName}…</span>{isEnded&&<button className="attendance-toggle" onClick={()=>markAttendance(p.user_id,!attendance[p.user_id])}>{attendance[p.user_id]?<Check size={12}/>:<Check size={12}/>} {attendance[p.user_id]?'Attended':'Mark'}</button>}</div>})}</div>}</div></div></section></div>
}

function LiveRoom({session,userId,isHost,onClose}:{session:SessionRow;userId:string;isHost:boolean;onClose:()=>void}){
  const providerRef=useRef<LiveRoomProvider|null>(null)
  const [isMuted,setIsMuted]=useState(false)
  const [isVideoOn,setIsVideoOn]=useState(true)
  const [isScreenSharing,setIsScreenSharing]=useState(false)
  const [roomStatus,setRoomStatus]=useState<'waiting'|'live'|'closed'|'ended'>(session.session_room_state?.status==='live'?'live':session.session_room_state?.status==='ended'?'ended':session.session_room_state?.status==='closed'?'closed':'waiting')
  const [participants,setParticipants]=useState<LiveRoomParticipant[]>([])
  const [chatMessages,setChatMessages]=useState<ChatMsg[]>([])
  const [chatInput,setChatInput]=useState('')
  const [showChat,setShowChat]=useState(true)
  const [showMobileChat,setShowMobileChat]=useState(false)
  const [showParticipants,setShowParticipants]=useState(false)
  const [pinnedMsg,setPinnedMsg]=useState<ChatMsg|null>(null)
  const [participantProfiles,setParticipantProfiles]=useState<Record<string,{full_name:string;display_name:string|null;avatar_url:string|null}>>({})
  const [hasMoreChat,setHasMoreChat]=useState(true)
  const chatEndRef=useRef<HTMLDivElement>(null)

  const loadProfiles=useCallback(async(userIds:string[])=>{
    if(userIds.length===0)return
    const {data}=await supabase.from('profiles').select('id,full_name,display_name,avatar_url').in('id',userIds)
    if(data){const map:Record<string,any>={};data.forEach((p:any)=>{map[p.id]=p});setParticipantProfiles(prev=>({...prev,...map}))}
  },[])

  // Load initial chat messages
  useEffect(()=>{
    supabase.from('session_chat_messages').select('id,user_id,body,pinned,created_at,profiles:profiles!session_chat_messages_user_id_fkey(full_name,display_name,avatar_url)').eq('session_id',session.id).order('created_at',{ascending:true}).limit(200).then(({data})=>{
      if(data){setChatMessages(data as unknown as ChatMsg[]);loadProfiles(data.map((m:any)=>m.user_id))}
    })
  },[session.id,loadProfiles])

  // Load more chat messages
  async function loadMoreChat(){
    if(!hasMoreChat||chatMessages.length===0)return
    const oldest=chatMessages[0]
    const {data}=await supabase.from('session_chat_messages').select('id,user_id,body,pinned,created_at,profiles:profiles!session_chat_messages_user_id_fkey(full_name,display_name,avatar_url)').eq('session_id',session.id).lt('created_at',oldest.created_at).order('created_at',{ascending:false}).limit(50)
    if(data&&data.length>0){
      const older=data.reverse() as unknown as ChatMsg[]
      setChatMessages(prev=>[...older,...prev])
      if(data.length<50)setHasMoreChat(false)
      loadProfiles(older.map(m=>m.user_id))
    }else setHasMoreChat(false)
  }

  // Load existing participants
  useEffect(()=>{
    supabase.from('session_room_participants').select('user_id,role,is_muted,is_video_on,is_screen_sharing,joined_at,left_at,profiles:profiles!session_room_participants_user_id_fkey(full_name,display_name,avatar_url)').eq('session_id',session.id).is('left_at',null).then(({data})=>{
      if(data){
        const mapped=data.map((r:any)=>({userId:r.user_id,displayName:r.profiles?.display_name||r.profiles?.full_name||'',avatarUrl:r.profiles?.avatar_url||null,role:r.role,isMuted:r.is_muted,isVideoOn:r.is_video_on,isScreenSharing:r.is_screen_sharing,joinedAt:r.joined_at,leftAt:r.left_at})) as LiveRoomParticipant[]
        setParticipants(mapped);loadProfiles(data.map((r:any)=>r.user_id))
      }
    })
  },[session.id,loadProfiles])

  // Initialize provider and join
  useEffect(()=>{
    const provider=createLiveRoomProvider(session.live_room_provider)
    providerRef.current=provider
    provider.onEvents({
      onParticipantJoin:(p)=>{setParticipants(prev=>[...prev.filter(x=>x.userId!==p.userId),p]);if(p.userId)loadProfiles([p.userId])},
      onParticipantLeave:(uid)=>setParticipants(prev=>prev.map(p=>p.userId===uid?{...p,leftAt:new Date().toISOString()}:p)),
      onParticipantUpdate:(uid,upd)=>setParticipants(prev=>prev.map(p=>p.userId===uid?{...p,...upd}:p)),
      onChatMessage:(msg)=>{setChatMessages(prev=>[...prev,{id:msg.id,user_id:msg.userId,body:msg.body,pinned:msg.pinned,created_at:msg.createdAt,profiles:{full_name:msg.displayName,display_name:null,avatar_url:msg.avatarUrl}} as ChatMsg]);if(msg.userId)loadProfiles([msg.userId])},
      onRoomStateChange:(state)=>{setRoomStatus(state.status);if(state.status==='ended'||state.status==='closed')onClose()},
      onError:(err)=>console.error('LiveRoom error:',err)
    })
    provider.init(session.id,userId,isHost).then(()=>provider.join()).then(()=>{
      const local=provider.getLocalState()
      setIsMuted(local.isMuted);setIsVideoOn(local.isVideoOn)
    }).catch(err=>console.error('Failed to join:',err))
    return()=>{provider.destroy();providerRef.current=null}
  },[session.id,userId,isHost,session.live_room_provider,loadProfiles,onClose])

  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:'smooth'})},[chatMessages])

  async function sendMsg(){
    if(!chatInput.trim()||!providerRef.current)return
    const body=chatInput.trim();setChatInput('')
    await providerRef.current.sendChatMessage(body)
  }

  async function toggleCam(){
    const provider=providerRef.current;if(!provider)return
    const muted=await provider.toggleCamera();setIsVideoOn(!muted)
  }

  async function toggleMic(){
    const provider=providerRef.current;if(!provider)return
    const muted=await provider.toggleMicrophone();setIsMuted(muted)
  }

  async function toggleScreen(){
    const provider=providerRef.current;if(!provider)return
    if(isScreenSharing){await provider.stopScreenShare();setIsScreenSharing(false)}
    else{await provider.startScreenShare();setIsScreenSharing(true)}
  }

  async function startSession(){
    const {error}=await supabase.rpc('open_session_room',{target_session:session.id})
    if(error){console.error('Failed to start room:',error);return}
    const {data:regs}=await supabase.from('session_registrations').select('user_id').eq('session_id',session.id).in('status',['registered','waitlisted'])
    if(regs){for(const r of regs){if(r.user_id!==userId)await supabase.rpc('notify_session_event',{target_session:session.id,event_type:'room_opened',target_user:r.user_id})}}
    setRoomStatus('live')
  }

  async function endSession(){
    if(!confirm('End this session?'))return
    const {error}=await supabase.rpc('end_session_room',{target_session:session.id})
    if(error)alert(error.message);else onClose()
  }

  async function muteUser(uid:string){
    const provider=providerRef.current;if(!provider)return
    const p=participants.find(x=>x.userId===uid);if(!p)return
    await provider.muteParticipant(uid,!p.isMuted)
  }

  async function removeUser(uid:string){
    if(!confirm('Remove this participant?'))return
    const provider=providerRef.current;if(!provider)return
    await provider.removeParticipant(uid)
  }

  async function togglePin(msg:ChatMsg){
    const provider=providerRef.current;if(!provider)return
    await provider.pinMessage(msg.id,!msg.pinned)
    setPinnedMsg(msg.pinned?null:msg)
  }

  const otherParticipants=participants.filter(p=>p.userId!==userId&&!p.leftAt)

  return <div className="live-room-overlay"><div className="live-room"><div className="live-room-header"><div className="live-room-title"><CircleDot size={14} className={roomStatus==='live'?'pulse':''}/><span>{session.title}</span>{roomStatus==='live'&&<span className="live-tag">LIVE</span>}{roomStatus==='waiting'&&<span className="waiting-tag">Waiting to start…</span>}{roomStatus==='closed'&&<span className="closed-tag">Room Closed</span>}{roomStatus==='ended'&&<span className="ended-tag">Ended</span>}</div><div className="live-room-header-right"><span className="participant-count"><Users size={14}/> {otherParticipants.length+1}</span>{isHost&&roomStatus==='waiting'&&<button className="start-session-btn" onClick={startSession}><CircleDot size={14}/> Start session</button>}{isHost&&roomStatus==='live'&&<button className="end-session-btn" onClick={endSession}><X size={14}/> End</button>}<button className="mobile-chat-toggle" onClick={()=>setShowMobileChat(!showMobileChat)}>Chat</button><button className="leave-btn" onClick={()=>{providerRef.current?.leave();onClose()}}><X size={16}/></button></div></div>{pinnedMsg&&<div className="pinned-banner"><Pin size={12}/><span><b>{participantProfiles[pinnedMsg.user_id]?.display_name||participantProfiles[pinnedMsg.user_id]?.full_name||'User'}:</b> {pinnedMsg.body}</span></div>}<div className="live-room-body"><div className="video-area"><div id="jitsi-container" className="jitsi-container"/></div>{showChat&&<div className={`live-chat-panel ${showMobileChat?'show-mobile':''}`}><div className="live-chat-header"><h4>Chat</h4><button onClick={()=>setShowParticipants(!showParticipants)}><Users size={14}/></button>{showMobileChat&&<button className="mobile-close-chat" onClick={()=>setShowMobileChat(false)}><X size={14}/></button>}</div>{showParticipants&&<div className="live-participant-list">{participants.filter(p=>!p.leftAt).map(p=>{const prof=participantProfiles[p.userId];return <div key={p.userId} className="live-participant-item"><span>{prof?.avatar_url?<img src={prof.avatar_url} alt=""/>:initials(prof?.display_name||prof?.full_name||p.displayName)}</span><div><b>{prof?.display_name||prof?.full_name||p.displayName}</b><small>{p.role}</small></div>{isHost&&p.userId!==userId&&<div className="participant-controls"><button onClick={()=>muteUser(p.userId)}>{p.isMuted?<MicOff size={11}/>:<Mic size={11}/>}</button><button onClick={()=>removeUser(p.userId)}><UserX size={11}/></button></div>}</div>})}</div>}<div className="live-chat-messages" >{hasMoreChat&&chatMessages.length>0&&<button className="load-more-chat" onClick={loadMoreChat}>Load older messages</button>}{chatMessages.map(m=>{const prof=participantProfiles[m.user_id];return <div key={m.id} className={`chat-msg ${m.user_id===userId?'own':''} ${m.pinned?'pinned':''}`}><div className="chat-msg-avatar">{prof?.avatar_url?<img src={prof.avatar_url} alt=""/>:initials(prof?.display_name||prof?.full_name)}</div><div className="chat-msg-content"><div className="chat-msg-header"><span className="chat-msg-name">{prof?.display_name||prof?.full_name||'User'}</span>{m.pinned&&<Pin size={10}/>}</div><p>{m.body}</p></div>{isHost&&<button className="pin-btn" onClick={()=>togglePin(m)}>{m.pinned?<PinOff size={10}/>:<Pin size={10}/>}</button>}</div>})}<div ref={chatEndRef}/></div><div className="live-chat-input"><input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')sendMsg()}} placeholder="Type a message…"/><button onClick={sendMsg} disabled={!chatInput.trim()}><Send size={14}/></button></div></div>}</div><div className="live-room-controls"><button className={isMuted?'off':''} onClick={toggleMic}>{isMuted?<MicOff size={18}/>:<Mic size={18}/>}</button><button className={!isVideoOn?'off':''} onClick={toggleCam}>{isVideoOn?<Video size={18}/>:<VideoOff size={18}/>}</button><button className={isScreenSharing?'on':''} onClick={toggleScreen}><Monitor size={18}/></button><button className="chat-toggle" onClick={()=>{setShowChat(!showChat);setShowMobileChat(!showMobileChat)}}>Chat</button></div></div></div>
}

export default SessionsPage
