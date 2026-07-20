import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, Ban, BellOff, Check, ChevronLeft, Copy, Flag, Gamepad2, Image, Info, Mic, MessageCircleMore, Paperclip, Phone, Search, Send, Smile, Sparkles, UserCircle, Video, X } from 'lucide-react'
import { supabase } from './supabase'
import type { DbRoom } from './CommunityFeatures'
import './private-messaging.css'

type Profile = { id:string; full_name:string; display_name:string|null; avatar_url:string|null; country:string|null; profile_type:string; about:string; interests:string[]; specialties:string[]; online:boolean }
type MessageDeliveryStatus = 'sending'|'sent'|'failed'|'read'
type Message = { id:string; body:string; sender_id:string; created_at:string; edited_at?:string|null; read_at?:string|null; reply_to?:string|null; client_message_id?:string|null; delivery_status?:MessageDeliveryStatus; profiles?:{full_name:string;display_name?:string|null;avatar_url:string|null}|null }
type PrivateRoom = DbRoom & { avatar_url:string|null; other_user_id?:string; other_online?:boolean; other_last_seen?:string|null; verified?:boolean; last_message:string|null; last_sender_id?:string|null; last_activity:string; unread_count?:number }
type ConnectionRequest = { id:string; requester_id:string; addressee_id:string; status:string; profiles?:Profile|null }
type Reaction = { message_id:string; emoji:string; user_id:string }

const initials = (name?:string|null) => (name || 'N').split(' ').map(x=>x[0]).join('').slice(0,2)
const displayName = (p:Profile) => p.display_name || p.full_name || 'Nova member'
const spam = (body:string) => (body.match(/https?:\/\//g)||[]).length>2 || /(.)\1{18,}/.test(body) || /(free money|crypto giveaway|click here now|telegram.me|whatsapp group)/i.test(body)
const announceNotificationsRead = () => window.dispatchEvent(new CustomEvent('nova-notifications-read'))
const messageSelect = 'id,body,sender_id,created_at,edited_at,read_at,reply_to,client_message_id,profiles!messages_sender_id_fkey(full_name,display_name,avatar_url)'
const reactionEmojis = ['❤️','👍','🤗','🙏','😊','😂','🌿','✨']
const emojiGroups = [
  ['Recent','❤️','🙏','😊','🌿','✨','🤗','👍','😂'],
  ['Smileys','😀','🙂','😊','🥰','😌','😂','🥲','😍'],
  ['Gestures','👍','🙏','🤗','👏','🙌','🤝','💪','🫶'],
  ['Nature','🌿','🌱','🌸','☀️','🌙','🌊','🍃','🌎'],
  ['Symbols','❤️','✨','💞','☮️','💫','⭐','✅','♾️']
]
const gestures = [
  ['🤗','Sent a hug'],
  ['✨','Sent encouragement'],
  ['🙏','Sent gratitude'],
  ['💞','Sent support'],
  ['🌿','Sent calm energy'],
  ['☀️','Celebrated your progress']
]
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

export function PrivateChatRoom({room,userId,onClose,onOpenProfile}:{room:DbRoom;userId:string;onClose:()=>void;onOpenProfile?:(id:string)=>void}) {
  const [messages,setMessages]=useState<Message[]>([])
  const [reactions,setReactions]=useState<Reaction[]>([])
  const [text,setText]=useState('')
  const [replyTo,setReplyTo]=useState<Message|null>(null)
  const [editing,setEditing]=useState<Message|null>(null)
  const [editText,setEditText]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [typing,setTyping]=useState<string[]>([])
  const [unread,setUnread]=useState(0)
  const [searchOpen,setSearchOpen]=useState(false)
  const [searchText,setSearchText]=useState('')
  const [emojiOpen,setEmojiOpen]=useState(false)
  const [gestureOpen,setGestureOpen]=useState(false)
  const [muted,setMuted]=useState(false)
  const [notice,setNotice]=useState('')
  const bottom=useRef<HTMLDivElement>(null)
  const listRef=useRef<HTMLDivElement>(null)
  const channelRef=useRef<any>(null)
  const typingTimer=useRef<number|null>(null)
  const messageIdsRef=useRef<string[]>([])
  const nearBottom=()=>{const el=listRef.current;return !el||el.scrollHeight-el.scrollTop-el.clientHeight<90}
  const privateRoom=room as PrivateRoom
  const presenceText=room.online_members&&room.online_members>1?'Online now':privateRoom.other_online?'Online now':privateRoom.other_last_seen?`Last active ${new Date(privateRoom.other_last_seen).toLocaleDateString()}`:'Offline - messages will be saved'
  const profileName=room.name || 'Private conversation'
  const unavailable=(feature:string)=>setNotice(`${feature} needs secure provider/storage setup before it can be used.`)
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

  const loadReactions=useCallback(async(ids:string[])=>{
    if(!ids.length){setReactions([]);return}
    const {data}=await supabase.from('message_reactions').select('message_id,emoji,user_id').in('message_id',ids)
    setReactions((data as Reaction[])||[])
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
    const next=sortMessages(((data as unknown as Message[])||[]).map(message=>({...message,delivery_status:message.sender_id===userId&&message.read_at?'read':'sent'})))
    messageIdsRef.current=next.map(message=>message.id).filter(id=>!id.startsWith('local-'))
    setMessages(next)
    await loadReactions(messageIdsRef.current)
    setLoading(false)
    markRead()
  },[room.id,userId,markRead,loadReactions])

  useEffect(()=>{
    setMessages([]);setUnread(0);load(true)
    const channel=supabase.channel(`private-room:${room.id}`,{config:{presence:{key:userId}}})
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`room_id=eq.${room.id}`},async payload=>{const raw=payload.new as Message;if(raw.sender_id!==userId&&!nearBottom())setUnread(x=>x+1);const full=await fetchMessage(raw.id);setMessages(items=>mergeMessage(items,full||{...raw,delivery_status:'sent'}))})
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'messages',filter:`room_id=eq.${room.id}`},async payload=>{const raw=payload.new as Message;const full=await fetchMessage(raw.id);setMessages(items=>mergeMessage(items,full||{...raw,delivery_status:'sent'}))})
      .on('postgres_changes',{event:'*',schema:'public',table:'message_reactions'},()=>loadReactions(messageIdsRef.current))
      .on('presence',{event:'sync'},()=>{const state=channel.presenceState() as Record<string,any[]>;setTyping(Object.entries(state).filter(([id])=>id!==userId).flatMap(([,values])=>values.filter(v=>v.typing).map(v=>v.name||'Someone')))})
      .subscribe(async status=>{if(status==='SUBSCRIBED')await channel.track({typing:false,name:'Member'})})
    channelRef.current=channel
    return()=>{supabase.removeChannel(channel)}
  },[room.id,userId,load,fetchMessage,loadReactions])

  useEffect(()=>{messageIdsRef.current=messages.map(message=>message.id).filter(id=>!id.startsWith('local-'));if(nearBottom()){bottom.current?.scrollIntoView({behavior:'smooth'});setUnread(0);markRead()}},[messages,markRead])

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

  function insertEmoji(emoji:string){
    setText(value=>`${value}${emoji}`)
    setEmojiOpen(false)
  }

  async function sendGesture(emoji:string,label:string){
    const clientId=crypto.randomUUID()
    const optimistic={id:`local-${clientId}`,body:`${emoji} ${label}`,sender_id:userId,created_at:new Date().toISOString(),client_message_id:clientId,delivery_status:'sending' as MessageDeliveryStatus,profiles:{full_name:'You',display_name:'You',avatar_url:null}} as Message
    setGestureOpen(false)
    setMessages(items=>mergeMessage(items,optimistic))
    await persistMessage(optimistic)
  }

  async function react(message:Message,emoji:string){
    if(message.id.startsWith('local-'))return
    const exists=reactions.some(item=>item.message_id===message.id&&item.user_id===userId&&item.emoji===emoji)
    if(exists)await supabase.from('message_reactions').delete().eq('message_id',message.id).eq('user_id',userId).eq('emoji',emoji)
    else await supabase.from('message_reactions').upsert({message_id:message.id,user_id:userId,emoji},{onConflict:'message_id,user_id,emoji'})
    await loadReactions(messageIdsRef.current)
  }

  async function reportMessage(message:Message){
    if(message.id.startsWith('local-'))return
    const reason=window.prompt('Tell moderators what felt unsafe about this message.')
    if(reason)await supabase.from('message_reports').insert({message_id:message.id,reporter_id:userId,reason})
  }

  async function reportUser(){
    const reason=window.prompt(`Report ${profileName}?`)
    const latest=messages.slice().reverse().find(message=>message.sender_id===privateRoom.other_user_id&&!message.id.startsWith('local-'))
    if(reason&&latest)await supabase.from('message_reports').insert({message_id:latest.id,reporter_id:userId,reason:`User report for ${profileName}: ${reason}`})
    else if(reason)setNotice('A report needs at least one message from this member.')
  }

  async function blockUser(){
    if(!privateRoom.other_user_id)return
    if(!window.confirm(`Block ${profileName}? They will not be able to message you.`))return
    const {error}=await supabase.rpc('block_member',{other_user:privateRoom.other_user_id})
    if(error)setNotice(error.message)
    else{setNotice(`${profileName} has been blocked.`);window.setTimeout(onClose,900)}
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

  function composerKeyDown(event:KeyboardEvent<HTMLTextAreaElement>){
    if(event.key==='Escape'){setEmojiOpen(false);setGestureOpen(false)}
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit()}
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

  const rows=useMemo(()=>messages.filter(message=>!searchText.trim()||message.body.toLowerCase().includes(searchText.trim().toLowerCase())),[messages,searchText])
  const reactionState=(messageId:string,emoji:string)=>({count:reactions.filter(item=>item.message_id===messageId&&item.emoji===emoji).length,me:reactions.some(item=>item.message_id===messageId&&item.emoji===emoji&&item.user_id===userId)})
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
            {!m.id.startsWith('local-')&&<div className="private-reactions">{reactionEmojis.map(emoji=>{const state=reactionState(m.id,emoji);return <button key={emoji} className={state.me?'active':''} onClick={()=>react(m,emoji)}>{emoji}{state.count>0&&<span>{state.count}</span>}</button>})}</div>}
            <nav>{m.delivery_status==='failed'?<><button onClick={()=>retry(m)}>Retry</button><button onClick={()=>deleteDraft(m)}>Delete draft</button></>:<><button onClick={()=>setReplyTo(m)}>Reply</button><button onClick={()=>navigator.clipboard?.writeText(m.body)}><Copy size={12}/> Copy</button>{m.sender_id!==userId&&!m.id.startsWith('local-')&&<button onClick={()=>reportMessage(m)}><Flag size={12}/> Report</button>}{m.sender_id===userId&&!m.id.startsWith('local-')&&<button onClick={()=>{setEditing(m);setEditText(m.body)}}>Edit</button>}{m.sender_id===userId&&!m.id.startsWith('local-')&&<button onClick={()=>remove(m)}>Delete</button>}</>}</nav>
          </div>
        </article>
      </div>
    })
  }

  return <div className="feature-overlay"><section className="chat-window private-chat-window messenger-window">
    <header className="messenger-header"><button onClick={onClose} aria-label="Back"><ChevronLeft/></button><button className="messenger-profile" onClick={()=>privateRoom.other_user_id&&onOpenProfile?.(privateRoom.other_user_id)}><span>{privateRoom.avatar_url?<img src={privateRoom.avatar_url} alt=""/>:initials(profileName)}<i className={presenceText.startsWith('Online')?'online':''}/></span><div><h2>{profileName}{privateRoom.verified&&<BadgeCheck size={14}/>}</h2><small>{presenceText}</small></div></button><div className="messenger-tools"><button disabled title="Live audio calls require secure provider setup"><Phone/></button><button disabled title="Live video calls require secure provider setup"><Video/></button><button onClick={()=>privateRoom.other_user_id&&onOpenProfile?.(privateRoom.other_user_id)} title="View profile"><UserCircle/></button><button onClick={()=>setSearchOpen(value=>!value)} title="Search messages"><Search/></button><button onClick={()=>{setMuted(value=>!value);setNotice(!muted?'Conversation muted on this device.':'Conversation unmuted.')}} title="Mute notifications"><BellOff/></button><button onClick={blockUser} title="Block"><Ban/></button><button onClick={reportUser} title="Report"><Flag/></button><button onClick={onClose} aria-label="Close"><X/></button></div></header>
    {searchOpen&&<label className="messenger-search"><Search size={15}/><input value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder="Search this conversation"/></label>}
    <div className="safety-strip messenger-safety"><button onClick={()=>alert('Community guidelines: be respectful, protect privacy, no harassment, no spam, and report harmful behavior.')}>Community Guidelines</button><button onClick={()=>setNotice('Conversation information: private room, two participants, messages save even when the other person is offline.')}><Info size={12}/> Info</button><span>{muted?'Muted on this device.':'Only you and the other selected member can open this room.'}</span></div>
    <div className="private-message-list" ref={listRef} onScroll={()=>{if(nearBottom()){setUnread(0);markRead()}}}>
      {messageContent}<div ref={bottom}/>
    </div>
    {unread>0&&<button className="unread-pill" onClick={()=>{bottom.current?.scrollIntoView({behavior:'smooth'});setUnread(0);markRead()}}>{unread} new</button>}
    {typing.length>0&&<div className="typing-indicator">{typing.slice(0,2).join(', ')} typing...</div>}
    {notice&&<div className="typing-indicator">{notice} <button onClick={()=>setNotice('')}>Dismiss</button></div>}
    {replyTo&&<div className="compose-context">Replying to {replyTo.sender_id===userId?'your message':replyTo.profiles?.full_name||'member'} <button onClick={()=>setReplyTo(null)}>Cancel</button></div>}
    {editing&&<form className="message-compose edit-compose" onSubmit={saveEdit}><input value={editText} onChange={e=>setEditText(e.target.value)} maxLength={4000} autoFocus/><button aria-label="Save"><Check/></button><button type="button" onClick={()=>setEditing(null)} aria-label="Cancel"><X/></button></form>}
    {emojiOpen&&<div className="messenger-picker emoji-picker">{emojiGroups.map(group=><section key={group[0]}><b>{group[0]}</b><div>{group.slice(1).map(emoji=><button key={`${group[0]}-${emoji}`} onClick={()=>insertEmoji(emoji)}>{emoji}</button>)}</div></section>)}</div>}
    {gestureOpen&&<div className="messenger-picker gesture-picker">{gestures.map(([emoji,label])=><button key={label} onClick={()=>sendGesture(emoji,label)}><span>{emoji}</span>{label}</button>)}</div>}
    <form className="message-compose messenger-compose" onSubmit={send}>
      <div className="composer-tools"><button type="button" onClick={()=>{setEmojiOpen(value=>!value);setGestureOpen(false)}} aria-label="Emoji picker"><Smile/></button><button type="button" onClick={()=>{setGestureOpen(value=>!value);setEmojiOpen(false)}} aria-label="Gesture picker"><Sparkles/></button><button type="button" disabled title="GIF search needs a configured provider"><MessageCircleMore/></button><button type="button" disabled title="Private image storage is not configured yet"><Image/></button><button type="button" disabled title="Attachment storage is not configured yet"><Paperclip/></button><button type="button" disabled title="Audio recording needs private media storage"><Mic/></button><button type="button" disabled title="Video recording needs private media storage"><Video/></button><button type="button" disabled title="Games begin after messaging reliability is confirmed"><Gamepad2/></button></div>
      <textarea value={text} onChange={e=>updateText(e.target.value)} onKeyDown={composerKeyDown} maxLength={4000} placeholder="Write a private message..." rows={1}/>
      <button aria-label="Send"><Send/></button>
    </form>
  </section></div>
}
