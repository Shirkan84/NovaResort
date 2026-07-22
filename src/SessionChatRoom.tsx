import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Bell, Copy, Pin, PinOff, Send, ShieldCheck, Trash2, Users, X } from 'lucide-react'
import { supabase } from './supabase'
import './sessions-events.css'

type Session = {
  id:string; host_id:string; title:string; description:string; category:string; language:string;
  starts_at:string; ends_at:string; status:string; capacity:number;
  profiles?:{full_name:string;display_name:string|null;avatar_url:string|null}|null;
}
type ChatMsg = {
  id:string; user_id:string; body:string; pinned:boolean; created_at:string;
  profiles?:{full_name:string;display_name:string|null;avatar_url:string|null}|null;
}
type RoomState = { status:string; started_at:string|null; ended_at:string|null }
type Participant = { user_id:string; status:string; profiles?:{display_name:string|null;full_name:string|null;avatar_url:string|null}|null }

function initials(name?:string|null){return (name||'U').split(' ').map(x=>x[0]).join('').slice(0,2)}
function fmtTime(iso:string){return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function fmtDate(iso:string){return new Date(iso).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}
function escapeHtml(v:string){return v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))}

export function SessionChatRoom({userId,isHealer,sessionId,onBack}:{userId:string;isHealer:boolean;sessionId:string;onBack:()=>void}) {
  const [session,setSession]=useState<Session|null>(null)
  const [roomState,setRoomState]=useState<RoomState|null>(null)
  const [messages,setMessages]=useState<ChatMsg[]>([])
  const [participants,setParticipants]=useState<Participant[]>([])
  const [input,setInput]=useState('')
  const [sending,setSending]=useState(false)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [showParticipants,setShowParticipants]=useState(false)
  const [pinnedMsg,setPinnedMsg]=useState<ChatMsg|null>(null)
  const [isRegistered,setIsRegistered]=useState(false)
  const bottomRef=useRef<HTMLDivElement>(null)
  const inputRef=useRef<HTMLTextAreaElement>(null)
  const isHost=session?.host_id===userId
  const roomOpen=roomState?.status==='live'
  const roomEnded=roomState?.status==='ended'
  const sessionEnded=session?.status==='completed'||session?.status==='cancelled'

  const loadSession=useCallback(async()=>{
    const {data,error}=await supabase.from('sessions').select('id,host_id,title,description,category,language,starts_at,ends_at,status,capacity,profiles!sessions_host_id_fkey(full_name,display_name,avatar_url)').eq('id',sessionId).single()
    if(error||!data){setError('Session not found.');setLoading(false);return}
    setSession(data as unknown as Session)
    setLoading(false)
  },[sessionId])

  const loadRoomState=useCallback(async()=>{
    const {data}=await supabase.from('session_room_state').select('status,started_at,ended_at').eq('session_id',sessionId).maybeSingle()
    setRoomState(data as RoomState|null)
  },[sessionId])

  const loadMessages=useCallback(async()=>{
    const {data}=await supabase.from('session_chat_messages').select('id,user_id,body,pinned,created_at,profiles:profiles!session_chat_messages_user_id_fkey(full_name,display_name,avatar_url)').eq('session_id',sessionId).order('created_at',{ascending:true}).limit(300)
    if(data){
      setMessages(data as unknown as ChatMsg[])
      const pinned=(data as any[]).find(m=>m.pinned)
      setPinnedMsg(pinned||null)
    }
  },[sessionId])

  const loadParticipants=useCallback(async()=>{
    const {data}=await supabase.from('session_registrations').select('user_id,status,profiles:profiles!session_registrations_user_id_fkey(full_name,display_name,avatar_url)').eq('session_id',sessionId).in('status',['registered','waitlisted','attended'])
    if(data)setParticipants(data as unknown as Participant[])
  },[sessionId])

  const checkRegistration=useCallback(async()=>{
    const {data}=await supabase.from('session_registrations').select('status').eq('session_id',sessionId).eq('user_id',userId).in('status',['registered','waitlisted','attended']).maybeSingle()
    setIsRegistered(!!data)
  },[sessionId,userId])

  useEffect(()=>{loadSession();loadRoomState();loadMessages();loadParticipants();checkRegistration()},[loadSession,loadRoomState,loadMessages,loadParticipants,checkRegistration])

  useEffect(()=>{
    const channel=supabase.channel(`session-chat-${sessionId}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'session_chat_messages',filter:`session_id=eq.${sessionId}`},(payload)=>{
        const msg=payload.new as any
        setMessages(prev=>{if(prev.some(m=>m.id===msg.id))return prev;return[...prev,{id:msg.id,user_id:msg.user_id,body:msg.body,pinned:msg.pinned,created_at:msg.created_at}]})
      })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'session_chat_messages',filter:`session_id=eq.${sessionId}`},(payload)=>{
        const old=payload.old as any
        setMessages(prev=>prev.filter(m=>m.id!==old.id))
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'session_chat_messages',filter:`session_id=eq.${sessionId}`},(payload)=>{
        const updated=payload.new as any
        setMessages(prev=>prev.map(m=>m.id===updated.id?{...m,pinned:updated.pinned}:m))
        if(updated.pinned)setPinnedMsg({id:updated.id,user_id:updated.user_id,body:updated.body,pinned:true,created_at:updated.created_at})
        else setPinnedMsg(prev=>prev?.id===updated.id?null:prev)
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'session_room_state',filter:`session_id=eq.${sessionId}`},(payload)=>{
        const state=payload.new as any
        setRoomState({status:state.status,started_at:state.started_at,ended_at:state.ended_at})
      })
      .subscribe()
    return()=>{supabase.removeChannel(channel)}
  },[sessionId])

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'})},[messages])

  async function sendMessage(e:FormEvent){
    e.preventDefault()
    const body=input.trim()
    if(!body||sending)return
    setSending(true);setInput('')
    const {error}=await supabase.rpc('send_session_chat',{target_session:sessionId,message_body:body})
    if(error){setError('Failed to send message.');setInput(body);console.error('send_session_chat error:',error.message)}
    setSending(false)
    inputRef.current?.focus()
  }

  async function openChat(){
    const {error}=await supabase.rpc('start_session_room',{target_session:sessionId})
    if(error){setError(error.message);return}
    setRoomState({status:'live',started_at:new Date().toISOString(),ended_at:null})
  }

  async function closeChat(){
    if(!confirm('Close the session chat? Participants will lose write access.'))return
    const {error}=await supabase.rpc('end_session_room',{target_session:sessionId})
    if(error){setError(error.message);return}
    setRoomState(prev=>prev?{...prev,status:'ended',ended_at:new Date().toISOString()}:{status:'ended',started_at:null,ended_at:new Date().toISOString()})
  }

  async function togglePin(msg:ChatMsg){
    const {error}=await supabase.rpc('pin_session_chat',{target_message:msg.id,pin:!msg.pinned})
    if(error)setError(error.message)
  }

  async function deleteMessage(msg:ChatMsg){
    if(!confirm('Delete this message?'))return
    const {error}=await supabase.from('session_chat_messages').delete().eq('id',msg.id)
    if(error)setError(error.message)
    else setMessages(prev=>prev.filter(m=>m.id!==msg.id))
  }

  async function sendAnnouncement(){
    const text=window.prompt('Send an announcement to all participants:')
    if(!text?.trim())return
    setSending(true)
    const {error}=await supabase.rpc('send_session_chat',{target_session:sessionId,message_body:`📢 ANNOUNCEMENT: ${text.trim()}`})
    if(error)setError('Failed to send announcement.')
    setSending(false)
  }

  async function sendReminder(){
    if(!confirm('Send a reminder to all registered participants?'))return
    const {error}=await supabase.rpc('send_session_reminders',{target_session:sessionId,reminder_type:'start'})
    if(error)setError(error.message)
    else alert('Reminder sent to all registered participants.')
  }

  function copyJoinLink(){
    const url=`${window.location.origin}${window.location.pathname}#/sessions/${sessionId}`
    navigator.clipboard?.writeText(url).then(()=>alert('Link copied!')).catch(()=>{})
  }

  if(loading)return <div className="feature-overlay"><section className="sessions-window session-chat-room"><div className="chat-loading">Loading session…</div></section></div>
  if(error&&!session)return <div className="feature-overlay"><section className="sessions-window session-chat-room"><div className="chat-error-state"><AlertTriangle size={28}/><p>{error}</p><button onClick={onBack}>Go Back</button></div></section></div>

  return <div className="feature-overlay"><section className="sessions-window session-chat-room">
    <header className="chat-room-header">
      <button className="back-btn" onClick={onBack}><ArrowLeft size={18}/> Back</button>
      <div className="chat-room-info">
        <h2>{session?.title||'Session Chat'}</h2>
        <p>{session?.category} · {fmtDate(session?.starts_at||'')} · {fmtTime(session?.starts_at||'')} – {fmtTime(session?.ends_at||'')}</p>
      </div>
      <div className="chat-room-status">
        {roomOpen&&<span className="room-status-badge live"><span className="pulse-dot"/> Chat Open</span>}
        {!roomOpen&&!roomEnded&&!sessionEnded&&<span className="room-status-badge scheduled">Not Opened Yet</span>}
        {roomEnded&&<span className="room-status-badge ended">Chat Closed</span>}
        {sessionEnded&&!roomEnded&&<span className="room-status-badge ended">Session Ended</span>}
      </div>
      <div className="chat-room-actions">
        <button className="chat-action-btn" onClick={()=>setShowParticipants(!showParticipants)}><Users size={16}/> <span>{participants.length}</span></button>
        <button className="chat-action-btn" onClick={copyJoinLink}><Copy size={16}/> Copy Link</button>
        {isHost&&!roomOpen&&!roomEnded&&!sessionEnded&&<button className="chat-action-btn primary" onClick={openChat}>Open Chat</button>}
        {isHost&&roomOpen&&<button className="chat-action-btn" onClick={sendAnnouncement}>Announce</button>}
        {isHost&&roomOpen&&<button className="chat-action-btn danger" onClick={closeChat}>Close Chat</button>}
        {isHost&&<button className="chat-action-btn" onClick={sendReminder}><Bell size={16}/> Remind</button>}
      </div>
    </header>

    {!isRegistered&&!isHost&&<div className="chat-access-denied"><ShieldCheck size={24}/><h3>Registration Required</h3><p>You must register for this session before joining the chat.</p><button onClick={onBack}>Go Back</button></div>}

    {(isRegistered||isHost)&&(<>
      {pinnedMsg&&<div className="pinned-msg-banner"><Pin size={12}/><span><b>{pinnedMsg.profiles?.display_name||pinnedMsg.profiles?.full_name||'User'}:</b> {pinnedMsg.body}</span>{isHost&&<button onClick={()=>togglePin(pinnedMsg)}><PinOff size={12}/></button>}</div>}

      {!roomOpen&&!roomEnded&&!sessionEnded&&<div className="chat-waiting-state"><AlertTriangle size={20}/><p>{isHost?'Click "Open Chat" to let participants in.':'The session chat has not opened yet. The host will open it soon.'}</p></div>}

      {(roomOpen||roomEnded||sessionEnded)&&(<>
        <div className="chat-messages-container">
          {messages.length===0&&<div className="chat-empty"><p>No messages yet. {isHost?'Send the first message to start the conversation.':'Wait for the host to start.'}</p></div>}
          {messages.map(msg=>{
            const isOwn=msg.user_id===userId
            const isMsgHost=session?.host_id===msg.user_id
            return <div key={msg.id} className={`chat-msg ${isOwn?'own':''} ${msg.pinned?'pinned':''} ${msg.body.startsWith('📢')?'announcement':''}`}>
              <div className="chat-msg-avatar">{msg.profiles?.avatar_url?<img src={msg.profiles.avatar_url} alt=""/>:initials(msg.profiles?.display_name||msg.profiles?.full_name)}</div>
              <div className="chat-msg-content">
                <div className="chat-msg-header">
                  <span className="chat-msg-name">{msg.profiles?.display_name||msg.profiles?.full_name||'User'}</span>
                  {isMsgHost&&<span className="host-badge">HOST</span>}
                  {msg.pinned&&<span className="pinned-badge"><Pin size={10}/> Pinned</span>}
                  <span className="chat-msg-time">{fmtTime(msg.created_at)}</span>
                </div>
                <p>{escapeHtml(msg.body)}</p>
                {isHost&&<div className="chat-msg-actions">
                  <button onClick={()=>togglePin(msg)}>{msg.pinned?<PinOff size={11}/>:<Pin size={11}/>}</button>
                  <button onClick={()=>deleteMessage(msg)}><Trash2 size={11}/></button>
                </div>}
              </div>
            </div>
          })}
          <div ref={bottomRef}/>
        </div>

        {roomOpen&&!roomEnded&&!sessionEnded&&(<form className="chat-composer" onSubmit={sendMessage}>
          <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(e)}}} maxLength={2000} placeholder={isHost?"Send a message or announcement…":"Type a message…"} rows={1}/>
          <button type="submit" disabled={sending||!input.trim()}><Send size={16}/></button>
        </form>)}

        {roomEnded&&<div className="chat-closed-notice"><p>This session chat is closed.</p></div>}
        {sessionEnded&&!roomEnded&&<div className="chat-closed-notice"><p>This session has ended.</p></div>}
      </>)}

      {showParticipants&&<div className="chat-participants-panel">
        <div className="panel-header"><h4>Participants ({participants.length})</h4><button onClick={()=>setShowParticipants(false)}><X size={14}/></button></div>
        <div className="panel-list">{participants.map(p=><div key={p.user_id} className="participant-row">
          <div className="participant-avatar">{p.profiles?.avatar_url?<img src={p.profiles.avatar_url} alt=""/>:initials(p.profiles?.display_name||p.profiles?.full_name)}</div>
          <div><b>{p.profiles?.display_name||p.profiles?.full_name||'User'}</b><small>{p.status}</small></div>
          {session?.host_id===p.user_id&&<span className="host-badge">HOST</span>}
        </div>)}</div>
      </div>}

      {error&&<div className="chat-error-toast">{error}<button onClick={()=>setError('')}>×</button></div>}
    </>)}
  </section></div>
}
