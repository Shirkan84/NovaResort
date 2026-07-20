import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, Copy, MessageCircleMore, Search, Send, X } from 'lucide-react'
import { supabase } from './supabase'
import type { DbRoom } from './CommunityFeatures'
import './private-messaging.css'

type Profile = { id:string; full_name:string; display_name:string|null; avatar_url:string|null; country:string|null; profile_type:string; about:string; interests:string[]; specialties:string[]; online:boolean }
type MessageDeliveryStatus = 'sending'|'sent'|'failed'|'read'
type Message = { id:string; body:string; sender_id:string; created_at:string; edited_at?:string|null; read_at?:string|null; reply_to?:string|null; client_message_id?:string|null; delivery_status?:MessageDeliveryStatus; profiles?:{full_name:string;display_name?:string|null;avatar_url:string|null}|null }
type PrivateRoom = DbRoom & { avatar_url:string|null; other_user_id?:string; other_online?:boolean; other_last_seen?:string|null; verified?:boolean; last_message:string|null; last_sender_id?:string|null; last_activity:string; unread_count?:number }
type ConnectionRequest = { id:string; requester_id:string; addressee_id:string; status:string; profiles?:Profile|null }

const initials = (name?:string|null) => (name || 'N').split(' ').map(x=>x[0]).join('').slice(0,2)
const displayName = (p:Profile) => p.display_name || p.full_name || 'Nova member'
const spam = (body:string) => (body.match(/https?:\/\//g)||[]).length>2 || /(.)\1{18,}/.test(body) || /(free money|crypto giveaway|click here now|telegram.me|whatsapp group)/i.test(body)
const announceNotificationsRead = () => window.dispatchEvent(new CustomEvent('nova-notifications-read'))
const messageSelect = 'id,body,sender_id,created_at,edited_at,read_at,reply_to,client_message_id,profiles!messages_sender_id_fkey(full_name,display_name,avatar_url)'
const sortMessages = (items:Message[]) => [...items].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())
const sameMessage = (a:Message,b:Message) => a.id === b.id || Boolean(a.client_message_id && b.client_message_id && a.client_message_id === b.client_message_id && a.sender_id === b.sender_id)
const mergeMessage = (items:Message[], incoming:Message) => {
  const next = items.some(item => sameMessage(item,incoming))
    ? items.map(item => sameMessage(item,incoming) ? {...incoming, delivery_status: incoming.read_at && incoming.sender_id === item.sender_id ? 'read' : incoming.delivery_status || 'sent'} : item)
    : [...items, incoming]
  return sortMessages(next)
}

export function PrivateChats({onClose,onOpenRoom}:{onClose:()=>void;onOpenRoom:(room:DbRoom)=>void}) {
  const [rooms,setRooms]=useState<PrivateRoom[]>([])
  const [people,setPeople]=useState<Profile[]>([])
  const [requests,setRequests]=useState<ConnectionRequest[]>([])
  const [query,setQuery]=useState('')
  const [creating,setCreating]=useState(false)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')

  const loadRooms=useCallback(async()=>{
    const {data,error}=await supabase.rpc('list_private_rooms')
    if(error)setError(error.message)
    else{setRooms((data as PrivateRoom[])||[]);setError('')}
    setLoading(false)
  },[])

  const loadRequests=useCallback(async()=>{
    const {data:userData}=await supabase.auth.getUser()
    if(!userData.user){setRequests([]);return}
    const {data,error}=await supabase.from('friendships')
      .select('id,requester_id,addressee_id,status,profiles!friendships_requester_id_fkey(id,full_name,display_name,avatar_url,country,profile_type,about,interests,specialties,online)')
      .eq('status','pending')
      .eq('addressee_id',userData.user.id)
      .order('created_at',{ascending:false})
    if(!error)setRequests((data as unknown as ConnectionRequest[])||[])
  },[])

  useEffect(()=>{
    loadRooms();loadRequests()
    const refresh=()=>loadRooms()
    window.addEventListener('nova-private-message-sent',refresh)
    const channel=supabase.channel('private-inbox')
      .on('postgres_changes',{event:'*',schema:'public',table:'messages'},()=>loadRooms())
      .on('postgres_changes',{event:'*',schema:'public',table:'notifications'},()=>loadRooms())
      .on('postgres_changes',{event:'*',schema:'public',table:'room_user_preferences'},()=>loadRooms())
      .on('postgres_changes',{event:'*',schema:'public',table:'friendships'},()=>loadRequests())
      .subscribe()
    return()=>{window.removeEventListener('nova-private-message-sent',refresh);supabase.removeChannel(channel)}
  },[loadRooms,loadRequests])

  useEffect(()=>{
    if(!creating)return
    supabase.auth.getUser().then(({data})=>{
      supabase.from('profiles')
        .select('id,full_name,display_name,avatar_url,country,profile_type,about,interests,specialties,online')
        .neq('id',data.user?.id||'')
        .limit(120)
        .then(({data})=>setPeople((data as Profile[])||[]))
    })
  },[creating])

  async function createRoom(person:Profile) {
    setBusy(person.id)
    const {data,error}=await supabase.rpc('create_private_room',{other_user:person.id})
    setBusy('')
    if(error){alert(error.message);return}
    onClose()
    onOpenRoom({id:data,name:displayName(person),description:'Private two-person conversation',icon:'<>',theme:'sage',is_private:true})
  }

  async function respond(request:ConnectionRequest,next_status:'accepted'|'declined') {
    setBusy(request.id)
    const {error}=await supabase.rpc('respond_connection_request',{request_id:request.id,next_status})
    setBusy('')
    if(error){alert(error.message);return}
    await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('entity_id',request.id).eq('type','connection_request')
    announceNotificationsRead()
    await loadRequests()
    if(next_status==='accepted'&&request.profiles)await createRoom(request.profiles)
  }

  const q=query.trim().toLowerCase()
  const filteredPeople=people.filter(p=>displayName(p).toLowerCase().includes(q)||(p.country||'').toLowerCase().includes(q))
  const filteredRooms=rooms.filter(r=>r.name.toLowerCase().includes(q)||(r.last_message||'').toLowerCase().includes(q))

  return <div className="feature-overlay"><section className="directory-window private-messages-window">
    <header><div><h2>{creating?'Create private room':'Messages'}</h2><p>{creating?'Choose exactly one person. Only both of you can open this room.':'Recent private conversations, unread messages, and new rooms.'}</p></div><button className="private-new" onClick={()=>setCreating(!creating)}>{creating?'View chats':'New message'}</button><button onClick={onClose}><X/></button></header>
    <label className="private-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={creating?'Search for the second person...':'Search conversations...'}/></label>
    {!creating&&requests.length>0&&<section className="connection-requests"><h3>Connection requests</h3><p>Approve a request to open a private two-person message room.</p>{requests.map(request=>{const p=request.profiles;return <article key={request.id}><span>{p?.avatar_url?<img src={p.avatar_url} alt=""/>:initials(displayName(p||{} as Profile))}</span><div><b>{p?displayName(p):'Nova member'}</b><small>Wants to connect with you</small></div><button disabled={busy===request.id} onClick={()=>respond(request,'accepted')}>Accept</button><button disabled={busy===request.id} onClick={()=>respond(request,'declined')}>Deny</button></article>})}</section>}
    {creating?<div className="private-list">{filteredPeople.length===0?<div className="empty-state"><MessageCircleMore/><h3>No people found</h3><p>Try searching by name or country.</p></div>:filteredPeople.map(p=><article key={p.id} className="private-person"><span>{p.avatar_url?<img src={p.avatar_url} alt=""/>:initials(displayName(p))}<i className={p.online?'online':''}/></span><div><h3>{displayName(p)}{p.profile_type==='healer'&&<em>Verified healer</em>}</h3><p>{p.country||'Nova Resort community'} - Private room for 2 users only</p></div><button disabled={busy===p.id} onClick={()=>createRoom(p)}>{busy===p.id?'...':<MessageCircleMore/>}</button></article>)}</div>:
      loading?<div className="empty-state">Loading conversations...</div>:
      error?<div className="empty-state"><MessageCircleMore/><h3>Messages unavailable</h3><p>{error}</p></div>:
      rooms.length===0?<div className="empty-state"><MessageCircleMore/><h3>No private conversations yet</h3><p>Create a private room with one other member.</p><button className="save-profile" onClick={()=>setCreating(true)}>Create private room</button></div>:
      <div className="private-list">{filteredRooms.map(r=><button className={r.unread_count?'private-thread unread':'private-thread'} key={r.id} onClick={()=>{onClose();onOpenRoom(r)}}><span>{r.avatar_url?<img src={r.avatar_url} alt=""/>:r.name.slice(0,1)}<i className={r.other_online?'online':''}/></span><div><h3>{r.name}{r.verified&&<em>Verified healer</em>}</h3><p>{r.last_sender_id?`${r.last_sender_id===r.other_user_id?r.name:'You'}: `:''}{r.last_message||'Start your private conversation.'}</p><small>{r.other_online?'Online now':'Messages deliver even when offline'}</small></div><time>{r.last_activity&&new Date(r.last_activity).toLocaleDateString()}</time>{Boolean(r.unread_count)&&<b>{r.unread_count}</b>}</button>)}</div>}
  </section></div>
}

export function PrivateChatRoom({room,userId,onClose}:{room:DbRoom;userId:string;onClose:()=>void}) {
  const [messages,setMessages]=useState<Message[]>([])
  const [text,setText]=useState('')
  const [replyTo,setReplyTo]=useState<Message|null>(null)
  const [editing,setEditing]=useState<Message|null>(null)
  const [editText,setEditText]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [typing,setTyping]=useState<string[]>([])
  const [unread,setUnread]=useState(0)
  const bottom=useRef<HTMLDivElement>(null)
  const listRef=useRef<HTMLDivElement>(null)
  const channelRef=useRef<any>(null)
  const typingTimer=useRef<number|null>(null)
  const nearBottom=()=>{const el=listRef.current;return !el||el.scrollHeight-el.scrollTop-el.clientHeight<90}
  const presenceText=room.online_members&&room.online_members>1?'Online now':(room as PrivateRoom).other_online?'Online now':'Offline - messages will be saved'
  const markRead=useCallback(async()=>{
    const { error } = await supabase.rpc('mark_room_read',{target_room:room.id})
    if (!error) announceNotificationsRead()
  },[room.id])

  const fetchMessage=useCallback(async(id:string)=>{
    const {data,error}=await supabase.from('messages')
      .select(messageSelect)
      .eq('id',id)
      .single()
    if(error)return null
    return {...(data as unknown as Message),delivery_status:'sent' as MessageDeliveryStatus}
  },[])

  const load=useCallback(async(show=false)=>{
    if(show)setLoading(true)
    const {data,error}=await supabase.from('messages')
      .select(messageSelect)
      .eq('room_id',room.id)
      .is('deleted_at',null)
      .order('created_at')
      .range(0,199)
    if(error){setError(error.message);setLoading(false);return}
    setMessages(sortMessages(((data as unknown as Message[])||[]).map(message=>({...message,delivery_status:message.sender_id===userId&&message.read_at?'read':'sent'}))))
    setLoading(false)
    markRead()
  },[room.id,userId,markRead])

  useEffect(()=>{
    setMessages([]);setUnread(0);load(true)
    const channel=supabase.channel(`private-room:${room.id}`,{config:{presence:{key:userId}}})
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`room_id=eq.${room.id}`},async payload=>{const raw=payload.new as Message;if(raw.sender_id!==userId&&!nearBottom())setUnread(x=>x+1);const full=await fetchMessage(raw.id);setMessages(items=>mergeMessage(items,full||{...raw,delivery_status:'sent'}))})
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'messages',filter:`room_id=eq.${room.id}`},async payload=>{const raw=payload.new as Message;const full=await fetchMessage(raw.id);setMessages(items=>mergeMessage(items,full||{...raw,delivery_status:'sent'}))})
      .on('presence',{event:'sync'},()=>{const state=channel.presenceState() as Record<string,any[]>;setTyping(Object.entries(state).filter(([id])=>id!==userId).flatMap(([,values])=>values.filter(v=>v.typing).map(v=>v.name||'Someone')))})
      .subscribe(async status=>{if(status==='SUBSCRIBED')await channel.track({typing:false,name:'Member'})})
    channelRef.current=channel
    return()=>{supabase.removeChannel(channel)}
  },[room.id,userId,load,fetchMessage])

  useEffect(()=>{if(nearBottom()){bottom.current?.scrollIntoView({behavior:'smooth'});setUnread(0);markRead()}},[messages,markRead])

  function updateText(value:string){
    setText(value)
    channelRef.current?.track({typing:Boolean(value.trim()),name:'Member'})
    if(typingTimer.current)window.clearTimeout(typingTimer.current)
    typingTimer.current=window.setTimeout(()=>channelRef.current?.track({typing:false,name:'Member'}),1200)
  }

  async function persistMessage(draft:Message){
    const {data,error}=await supabase.from('messages')
      .insert({room_id:room.id,sender_id:userId,body:draft.body,reply_to:draft.reply_to||null,client_message_id:draft.client_message_id})
      .select(messageSelect)
      .single()
    if(error){
      setError(error.message)
      setMessages(items=>items.map(item=>item.id===draft.id?{...item,delivery_status:'failed'}:item))
      return
    }
    setError('')
    setReplyTo(null)
    setMessages(items=>mergeMessage(items,{...(data as unknown as Message),delivery_status:'sent'}))
    window.dispatchEvent(new CustomEvent('nova-private-message-sent',{detail:{roomId:room.id}}))
  }

  async function send(event:FormEvent){
    event.preventDefault()
    const body=text.trim()
    if(!body)return
    if(spam(body)){setError('This looks like spam. Please rewrite it in a calmer, more personal way.');return}
    const clientId=crypto.randomUUID()
    const optimistic={id:`local-${clientId}`,body,sender_id:userId,created_at:new Date().toISOString(),reply_to:replyTo?.id||null,client_message_id:clientId,delivery_status:'sending' as MessageDeliveryStatus,profiles:{full_name:'You',display_name:'You',avatar_url:null}} as Message
    setText('')
    setMessages(items=>mergeMessage(items,optimistic))
    await persistMessage(optimistic)
  }

  async function retry(message:Message){
    setMessages(items=>items.map(item=>item.id===message.id?{...item,delivery_status:'sending'}:item))
    await persistMessage({...message,client_message_id:message.client_message_id||crypto.randomUUID()})
  }

  function deleteDraft(message:Message){
    setMessages(items=>items.filter(item=>item.id!==message.id))
  }

  async function saveEdit(event:FormEvent){
    event.preventDefault()
    if(!editing)return
    const body=editText.trim()
    if(!body)return
    const {error}=await supabase.from('messages').update({body,edited_at:new Date().toISOString()}).eq('id',editing.id).eq('sender_id',userId)
    if(error)setError(error.message)
    else{setEditing(null);load()}
  }

  async function remove(message:Message){
    const {error}=await supabase.from('messages').update({deleted_at:new Date().toISOString(),body:'Message deleted'}).eq('id',message.id).eq('sender_id',userId)
    if(error)setError(error.message)
    else load()
  }

  const rows=useMemo(()=>messages,[messages])
  let messageContent
  if (loading) {
    messageContent = <p className="empty-state">Opening the room...</p>
  } else if (error) {
    messageContent = <div className="empty-state"><MessageCircleMore/><h3>Room unavailable</h3><p>{error}</p></div>
  } else if (rows.length===0) {
    messageContent = <div className="empty-state"><MessageCircleMore/><h3>Start the conversation</h3><p>This private room is ready for both of you.</p></div>
  } else {
    messageContent = rows.map((m,index)=>{
      const previous=rows[index-1],reply=rows.find(x=>x.id===m.reply_to),showDate=!previous||new Date(previous.created_at).toDateString()!==new Date(m.created_at).toDateString()
      return <div key={m.id}>
        {showDate&&<div className="date-separator">{new Date(m.created_at).toLocaleDateString([], {dateStyle:'medium'})}</div>}
        <article className={m.sender_id===userId?'private-message mine':'private-message'}>
          <span>{m.profiles?.avatar_url?<img src={m.profiles.avatar_url} alt=""/>:initials(m.profiles?.full_name)}</span>
          <div>
            {reply&&<em>Replying to {reply.sender_id===userId?'you':reply.profiles?.full_name||'member'}: {reply.body.slice(0,80)}</em>}
              <b>{m.sender_id===userId?'You':m.profiles?.full_name||'Member'} <small>{new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}{m.edited_at?' - edited':''}{m.sender_id===userId?(m.delivery_status==='failed'?' - failed':m.delivery_status==='sending'?' - sending':m.read_at?' - read':' - sent'):''}</small></b>
            <p>{m.body}</p>
            <nav>{m.delivery_status==='failed'?<><button onClick={()=>retry(m)}>Retry</button><button onClick={()=>deleteDraft(m)}>Delete draft</button></>:<><button onClick={()=>setReplyTo(m)}>Reply</button><button onClick={()=>navigator.clipboard?.writeText(m.body)}><Copy size={12}/> Copy</button>{m.sender_id===userId&&!m.id.startsWith('local-')&&<button onClick={()=>{setEditing(m);setEditText(m.body)}}>Edit</button>}{m.sender_id===userId&&!m.id.startsWith('local-')&&<button onClick={()=>remove(m)}>Delete</button>}</>}</nav>
          </div>
        </article>
      </div>
    })
  }

  return <div className="feature-overlay"><section className="chat-window private-chat-window">
    <header><button onClick={onClose}><ChevronLeft/></button><div className="private-room-icon">{room.icon}</div><div><h2>{room.name}</h2><span><i className={presenceText.startsWith('Online')?'online':''}/> {presenceText} - Private room for 2 users</span></div><button onClick={onClose}><X/></button></header>
    <div className="safety-strip"><button onClick={()=>alert('Community guidelines: be respectful, protect privacy, no harassment, no spam, and report harmful behavior.')}>Community Guidelines</button><button onClick={onClose}>Close room</button><span>Only you and the other selected member can open this room.</span></div>
    <div className="private-message-list" ref={listRef} onScroll={()=>{if(nearBottom()){setUnread(0);markRead()}}}>
      {messageContent}<div ref={bottom}/>
    </div>
    {unread>0&&<button className="unread-pill" onClick={()=>{bottom.current?.scrollIntoView({behavior:'smooth'});setUnread(0);markRead()}}>{unread} new</button>}
    {typing.length>0&&<div className="typing-indicator">{typing.slice(0,2).join(', ')} typing...</div>}
    {replyTo&&<div className="compose-context">Replying to {replyTo.sender_id===userId?'your message':replyTo.profiles?.full_name||'member'} <button onClick={()=>setReplyTo(null)}>Cancel</button></div>}
    {editing&&<form className="message-compose edit-compose" onSubmit={saveEdit}><input value={editText} onChange={e=>setEditText(e.target.value)} maxLength={4000} autoFocus/><button aria-label="Save"><Check/></button><button type="button" onClick={()=>setEditing(null)} aria-label="Cancel"><X/></button></form>}
    <form className="message-compose" onSubmit={send}><input value={text} onChange={e=>updateText(e.target.value)} maxLength={4000} placeholder="Write a private message..."/><button aria-label="Send"><Send/></button></form>
  </section></div>
}
