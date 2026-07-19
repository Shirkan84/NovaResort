import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, Copy, MessageCircleMore, Search, Send, X } from 'lucide-react'
import { supabase } from './supabase'
import type { DbRoom } from './CommunityFeatures'
import './private-messaging.css'

type Profile = { id:string; full_name:string; display_name:string|null; avatar_url:string|null; country:string|null; profile_type:string; about:string; interests:string[]; specialties:string[]; online:boolean }
type Message = { id:string; body:string; sender_id:string; created_at:string; edited_at?:string|null; read_at?:string|null; reply_to?:string|null; profiles?:{full_name:string;avatar_url:string|null}|null }
type PrivateRoom = DbRoom & { avatar_url:string|null; other_user_id?:string; other_online?:boolean; verified?:boolean; last_message:string|null; last_sender_id?:string|null; last_activity:string; unread_count?:number }

const initials = (name?:string|null) => (name || 'N').split(' ').map(x=>x[0]).join('').slice(0,2)
const displayName = (p:Profile) => p.display_name || p.full_name || 'Nova member'
const spam = (body:string) => (body.match(/https?:\/\//g)||[]).length>2 || /(.)\1{18,}/.test(body) || /(free money|crypto giveaway|click here now|telegram.me|whatsapp group)/i.test(body)
const announceNotificationsRead = () => window.dispatchEvent(new CustomEvent('nova-notifications-read'))

export function PrivateChats({onClose,onOpenRoom}:{onClose:()=>void;onOpenRoom:(room:DbRoom)=>void}) {
  const [rooms,setRooms]=useState<PrivateRoom[]>([])
  const [people,setPeople]=useState<Profile[]>([])
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

  useEffect(()=>{
    loadRooms()
    const channel=supabase.channel('private-inbox')
      .on('postgres_changes',{event:'*',schema:'public',table:'messages'},()=>loadRooms())
      .on('postgres_changes',{event:'*',schema:'public',table:'notifications'},()=>loadRooms())
      .on('postgres_changes',{event:'*',schema:'public',table:'room_user_preferences'},()=>loadRooms())
      .subscribe()
    return()=>{supabase.removeChannel(channel)}
  },[loadRooms])

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

  const q=query.trim().toLowerCase()
  const filteredPeople=people.filter(p=>displayName(p).toLowerCase().includes(q)||(p.country||'').toLowerCase().includes(q))
  const filteredRooms=rooms.filter(r=>r.name.toLowerCase().includes(q)||(r.last_message||'').toLowerCase().includes(q))

  return <div className="feature-overlay"><section className="directory-window private-messages-window">
    <header><div><h2>{creating?'Create private room':'Messages'}</h2><p>{creating?'Choose exactly one person. Only both of you can open this room.':'Recent private conversations, unread messages, and new rooms.'}</p></div><button className="private-new" onClick={()=>setCreating(!creating)}>{creating?'View chats':'New message'}</button><button onClick={onClose}><X/></button></header>
    <label className="private-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={creating?'Search for the second person...':'Search conversations...'}/></label>
    {creating?<div className="private-list">{filteredPeople.length===0?<div className="empty-state"><MessageCircleMore/><h3>No people found</h3><p>Try searching by name or country.</p></div>:filteredPeople.map(p=><article key={p.id} className="private-person"><span>{p.avatar_url?<img src={p.avatar_url} alt=""/>:initials(displayName(p))}<i className={p.online?'online':''}/></span><div><h3>{displayName(p)}{p.profile_type==='healer'&&<em>Verified healer</em>}</h3><p>{p.country||'Nova Resort community'} - Private room for 2 users only</p></div><button disabled={busy===p.id} onClick={()=>createRoom(p)}>{busy===p.id?'...':<MessageCircleMore/>}</button></article>)}</div>:
      loading?<div className="empty-state">Loading conversations...</div>:
      error?<div className="empty-state"><MessageCircleMore/><h3>Messages unavailable</h3><p>{error}</p></div>:
      rooms.length===0?<div className="empty-state"><MessageCircleMore/><h3>No private conversations yet</h3><p>Create a private room with one other member.</p><button className="save-profile" onClick={()=>setCreating(true)}>Create private room</button></div>:
      <div className="private-list">{filteredRooms.map(r=><button className={r.unread_count?'private-thread unread':'private-thread'} key={r.id} onClick={()=>{onClose();onOpenRoom(r)}}><span>{r.avatar_url?<img src={r.avatar_url} alt=""/>:r.name.slice(0,1)}<i className={r.other_online?'online':''}/></span><div><h3>{r.name}{r.verified&&<em>Verified healer</em>}</h3><p>{r.last_sender_id?`${r.last_sender_id===r.other_user_id?r.name:'You'}: `:''}{r.last_message||'Start your private conversation.'}</p>{r.other_online&&<small>Online now</small>}</div><time>{r.last_activity&&new Date(r.last_activity).toLocaleDateString()}</time>{Boolean(r.unread_count)&&<b>{r.unread_count}</b>}</button>)}</div>}
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
  const markRead=useCallback(async()=>{
    const { error } = await supabase.rpc('mark_room_read',{target_room:room.id})
    if (!error) announceNotificationsRead()
  },[room.id])

  const load=useCallback(async(show=false)=>{
    if(show)setLoading(true)
    const {data,error}=await supabase.from('messages')
      .select('id,body,sender_id,created_at,edited_at,read_at,reply_to,profiles!messages_sender_id_fkey(full_name,avatar_url)')
      .eq('room_id',room.id)
      .is('deleted_at',null)
      .order('created_at')
      .range(0,199)
    if(error){setError(error.message);setLoading(false);return}
    setMessages((data as unknown as Message[])||[])
    setLoading(false)
    markRead()
  },[room.id,markRead])

  useEffect(()=>{
    setMessages([]);setUnread(0);load(true)
    const channel=supabase.channel(`private-room-${room.id}`,{config:{presence:{key:userId}}})
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`room_id=eq.${room.id}`},payload=>{const next=payload.new as Message;if(next.sender_id!==userId&&!nearBottom())setUnread(x=>x+1);load()})
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'messages',filter:`room_id=eq.${room.id}`},()=>load())
      .on('presence',{event:'sync'},()=>{const state=channel.presenceState() as Record<string,any[]>;setTyping(Object.entries(state).filter(([id])=>id!==userId).flatMap(([,values])=>values.filter(v=>v.typing).map(v=>v.name||'Someone')))})
      .subscribe(async status=>{if(status==='SUBSCRIBED')await channel.track({typing:false,name:'Member'})})
    channelRef.current=channel
    return()=>{supabase.removeChannel(channel)}
  },[room.id,userId,load])

  useEffect(()=>{if(nearBottom()){bottom.current?.scrollIntoView({behavior:'smooth'});setUnread(0);markRead()}},[messages,markRead])

  function updateText(value:string){
    setText(value)
    channelRef.current?.track({typing:Boolean(value.trim()),name:'Member'})
    if(typingTimer.current)window.clearTimeout(typingTimer.current)
    typingTimer.current=window.setTimeout(()=>channelRef.current?.track({typing:false,name:'Member'}),1200)
  }

  async function send(event:FormEvent){
    event.preventDefault()
    const body=text.trim()
    if(!body)return
    if(spam(body)){setError('This looks like spam. Please rewrite it in a calmer, more personal way.');return}
    setText('')
    const optimistic={id:`local-${Date.now()}`,body,sender_id:userId,created_at:new Date().toISOString(),reply_to:replyTo?.id||null} as Message
    setMessages(items=>[...items,optimistic])
    const {error}=await supabase.from('messages').insert({room_id:room.id,sender_id:userId,body,reply_to:replyTo?.id||null})
    if(error){setError(error.message);setText(body);setMessages(items=>items.filter(m=>m.id!==optimistic.id))}
    else setReplyTo(null)
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
            <b>{m.sender_id===userId?'You':m.profiles?.full_name||'Member'} <small>{new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}{m.edited_at?' - edited':''}{m.sender_id===userId&&m.read_at?' - read':''}</small></b>
            <p>{m.body}</p>
            <nav><button onClick={()=>setReplyTo(m)}>Reply</button><button onClick={()=>navigator.clipboard?.writeText(m.body)}><Copy size={12}/> Copy</button>{m.sender_id===userId&&<button onClick={()=>{setEditing(m);setEditText(m.body)}}>Edit</button>}{m.sender_id===userId&&<button onClick={()=>remove(m)}>Delete</button>}</nav>
          </div>
        </article>
      </div>
    })
  }

  return <div className="feature-overlay"><section className="chat-window private-chat-window">
    <header><button onClick={onClose}><ChevronLeft/></button><div className="private-room-icon">{room.icon}</div><div><h2>{room.name}</h2><span><i/> Private room for 2 users - Be kind</span></div><button onClick={onClose}><X/></button></header>
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
