import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, Ban, Camera, Check, ChevronLeft, Copy, Flag, Image, Mic, MoreVertical, Paperclip, Search, Send, Smile, Sparkles, StopCircle, Trash2, UserCircle, X } from 'lucide-react'
import { supabase } from './supabase'
import type { DbRoom } from './CommunityFeatures'
import './private-messaging.css'
import { useFocusTrap } from './hooks/useFocusTrap'

type Profile = { id:string; full_name:string; display_name:string|null; avatar_url:string|null; country:string|null; profile_type:string; about:string; interests:string[]; specialties:string[]; online:boolean }
type MessageDeliveryStatus = 'sending'|'sent'|'failed'|'read'
type Message = { id:string; body:string; sender_id:string; created_at:string; edited_at?:string|null; read_at?:string|null; reply_to?:string|null; client_message_id?:string|null; media_url?:string|null; media_type?:string|null; media_mime_type?:string|null; media_size?:number|null; delivery_status?:MessageDeliveryStatus; profiles?:{full_name:string;display_name?:string|null;avatar_url:string|null}|null }
type PrivateRoom = DbRoom & { avatar_url:string|null; other_user_id?:string; other_online?:boolean; other_last_seen?:string|null; verified?:boolean; last_message:string|null; last_sender_id?:string|null; last_activity:string; unread_count?:number }
type ConnectionRequest = { id:string; requester_id:string; addressee_id:string; status:string; profiles?:Profile|null }
type Reaction = { message_id:string; emoji:string; user_id:string }

const initials = (name?:string|null) => (name || 'N').split(' ').map(x=>x[0]).join('').slice(0,2)
const displayName = (p:Profile) => p.display_name || p.full_name || 'Nova member'
const spam = (body:string) => (body.match(/https?:\/\//g)||[]).length>2 || /(.)\1{18,}/.test(body) || /(free money|crypto giveaway|click here now|telegram.me|whatsapp group)/i.test(body)
const announceNotificationsRead = () => window.dispatchEvent(new CustomEvent('nova-notifications-read'))
const messageSelect = 'id,body,sender_id,created_at,edited_at,read_at,reply_to,client_message_id,media_url,media_type,media_mime_type,media_size,profiles!messages_sender_id_fkey(full_name,display_name,avatar_url)'
const reactionEmojis = ['❤️','👍','🤗','🙏','😊','😂','🌿','✨']
const quickReactions = ['❤️','👍','🙏','😊']
const emojiGroups = [
  ['Recent','❤️','🙏','😊','🌿','✨','🤗','👍','😂'],
  ['Smileys','😀','🙂','😊','🥰','😌','😂','🥲','😍'],
  ['Gestures','👍','🙏','🤗','👏','🙌','🤝','💪','🫶'],
  ['Nature','🌿','🌱','🌸','☀️','🌙','🌊','🍃','🌎'],
  ['Symbols','❤️','✨','💞','☮️','💫','⭐','✅','♾️']
]
const gestures = [
  ['🤗','Sent a hug'],['✨','Sent encouragement'],['🙏','Sent gratitude'],
  ['💞','Sent support'],['🌿','Sent calm energy'],['☀️','Celebrated your progress']
]
const sortMessages = (items:Message[]) => [...items].sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())
const sameMessage = (a:Message,b:Message) => a.id === b.id || Boolean(a.client_message_id && b.client_message_id && a.client_message_id === b.client_message_id && a.sender_id === b.sender_id)
const mergeMessage = (items:Message[], incoming:Message) => {
  const next = items.some(item => sameMessage(item,incoming))
    ? items.map(item => sameMessage(item,incoming) ? {...incoming, delivery_status: incoming.read_at && incoming.sender_id === item.sender_id ? 'read' : incoming.delivery_status || 'sent'} : item)
    : [...items, incoming]
  return sortMessages(next)
}
function formatDuration(s:number){const m=Math.floor(s/60);const sec=s%60;return `${m}:${sec.toString().padStart(2,'0')}`}

export function PrivateChats({onClose,onOpenRoom}:{onClose:()=>void;onOpenRoom:(room:DbRoom)=>void}) {
  const [rooms,setRooms]=useState<PrivateRoom[]>([])
  const [people,setPeople]=useState<Profile[]>([])
  const [requests,setRequests]=useState<ConnectionRequest[]>([])
  const [query,setQuery]=useState('')
  const [creating,setCreating]=useState(false)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const containerRef = useFocusTrap(true)

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
      .eq('status','pending').eq('addressee_id',userData.user.id).order('created_at',{ascending:false})
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
        .neq('id',data.user?.id||'').limit(120)
        .then(({data})=>setPeople((data as Profile[])||[]))
    })
  },[creating])

  async function createRoom(person:Profile) {
    setBusy(person.id)
    const {data,error}=await supabase.rpc('create_private_room',{other_user:person.id})
    setBusy('')
    if(error){alert(error.message);return}
    onClose();onOpenRoom({id:data,name:displayName(person),description:'Private two-person conversation',icon:'<>',theme:'sage',is_private:true})
  }

  async function respond(request:ConnectionRequest,next_status:'accepted'|'declined') {
    setBusy(request.id)
    const {error}=await supabase.rpc('respond_connection_request',{request_id:request.id,next_status})
    setBusy('')
    if(error){alert(error.message);return}
    await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('entity_id',request.id).eq('type','connection_request')
    announceNotificationsRead();await loadRequests()
    if(next_status==='accepted'&&request.profiles)await createRoom(request.profiles)
  }

  const q=query.trim().toLowerCase()
  const filteredPeople=people.filter(p=>displayName(p).toLowerCase().includes(q)||(p.country||'').toLowerCase().includes(q))
  const filteredRooms=rooms.filter(r=>r.name.toLowerCase().includes(q)||(r.last_message||'').toLowerCase().includes(q))

  return <div className="pm-overlay" ref={containerRef}><section className="pm-inbox" role="dialog" aria-modal="true" aria-label="Private messages">
    <header className="pm-inbox-header"><div><h2>{creating?'New Conversation':'Messages'}</h2><p className="pm-subtitle">{creating?'Choose one person to start a private conversation.':'Your private conversations.'}</p></div><div className="pm-inbox-actions"><button className="pm-btn-sm" onClick={()=>setCreating(!creating)}>{creating?'Back':'New'}</button><button className="pm-icon-btn" onClick={onClose} aria-label="Close"><X size={18}/></button></div></header>
    <label className="pm-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={creating?'Search people...':'Search conversations...'}/></label>
    {!creating&&requests.length>0&&<section className="pm-requests"><h3>Connection requests</h3>{requests.map(request=>{const p=request.profiles;return <article key={request.id}><span className="pm-req-avatar">{p?.avatar_url?<img src={p.avatar_url} alt={displayName(p||{} as Profile) + " avatar"}/>:initials(displayName(p||{} as Profile))}</span><div className="pm-req-info"><b>{p?displayName(p):'Member'}</b><small>Wants to connect</small></div><div className="pm-req-actions"><button disabled={busy===request.id} onClick={()=>respond(request,'accepted')}>Accept</button><button disabled={busy===request.id} onClick={()=>respond(request,'declined')}>Decline</button></div></article>})}</section>}
    {creating?<div className="pm-list">{filteredPeople.length===0?<div className="pm-empty"><p>No people found.</p></div>:filteredPeople.map(p=><article key={p.id} className="pm-person-row"><span className="pm-avatar">{p.avatar_url?<img src={p.avatar_url} alt={displayName(p) + " avatar"}/>:initials(displayName(p))}<i className={p.online?'online':''}/></span><div className="pm-person-info"><h3>{displayName(p)}{p.profile_type==='healer'&&<em>Healer</em>}</h3><p>{p.country||'Community member'}</p></div><button className="pm-msg-btn" disabled={busy===p.id} onClick={()=>createRoom(p)}>{busy===p.id?'...':'Message'}</button></article>)}</div>:
      loading?<div className="pm-empty">Loading...</div>:
      error?<div className="pm-empty">{error}</div>:
      rooms.length===0?<div className="pm-empty"><p>No conversations yet.</p><button className="pm-btn-primary" onClick={()=>setCreating(true)}>Start a conversation</button></div>:
      <div className="pm-list">{filteredRooms.map(r=><button className={r.unread_count?'pm-room unread':'pm-room'} key={r.id} onClick={()=>{onClose();onOpenRoom(r)}}><span className="pm-avatar">{r.avatar_url?<img src={r.avatar_url} alt={r.name + " avatar"}/>:r.name.slice(0,1)}<i className={r.other_online?'online':''}/></span><div className="pm-room-info"><h3>{r.name}{r.verified&&<BadgeCheck size={12}/>}</h3><p>{r.last_message||'Start chatting'}</p></div><div className="pm-room-meta"><time>{r.last_activity?new Date(r.last_activity).toLocaleDateString():''}</time>{Boolean(r.unread_count)&&<b className="pm-unread">{r.unread_count}</b>}</div></button>)}</div>}
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
  const [menuOpen,setMenuOpen]=useState(false)
  const [notice,setNotice]=useState('')
  const [activeMessageMenu,setActiveMessageMenu]=useState<string|null>(null)

  const bottom=useRef<HTMLDivElement>(null)
  const listRef=useRef<HTMLDivElement>(null)
  const channelRef=useRef<any>(null)
  const typingTimer=useRef<number|null>(null)
  const messageIdsRef=useRef<string[]>([])

  const [recordingMode,setRecordingMode]=useState<'audio'|'video'|null>(null)
  const [recordingState,setRecordingState]=useState<'idle'|'recording'|'paused'|'preview'>('idle')
  const [recordedBlob,setRecordedBlob]=useState<Blob|null>(null)
  const [recordedUrl,setRecordedUrl]=useState<string|null>(null)
  const [recordingDuration,setRecordingDuration]=useState(0)
  const mediaRecorderRef=useRef<MediaRecorder|null>(null)
  const recordingChunksRef=useRef<BlobPart[]>([])
  const recordingStreamRef=useRef<MediaStream|null>(null)
  const recordingTimerRef=useRef<number|null>(null)

  const [cameraState,setCameraState]=useState<'idle'|'streaming'|'captured'>('idle')
  const [capturedBlob,setCapturedBlob]=useState<Blob|null>(null)
  const [capturedUrl,setCapturedUrl]=useState<string|null>(null)
  const [facingMode,setFacingMode]=useState<'user'|'environment'>('environment')
  const cameraStreamRef=useRef<MediaStream|null>(null)
  const videoRef=useRef<HTMLVideoElement>(null)
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const containerRef = useFocusTrap(true)

  const nearBottom=()=>{const el=listRef.current;return !el||el.scrollHeight-el.scrollTop-el.clientHeight<90}
  const privateRoom=room as PrivateRoom
  const presenceText=room.online_members&&room.online_members>1?'Online now':privateRoom.other_online?'Online now':privateRoom.other_last_seen?`Last active ${new Date(privateRoom.other_last_seen).toLocaleDateString()}`:'Offline'
  const profileName=room.name||'Private conversation'
  const otherUserId=privateRoom.other_user_id

  const markRead=useCallback(async()=>{
    const{error}=await supabase.rpc('mark_room_read',{target_room:room.id})
    if(!error)announceNotificationsRead()
  },[room.id])

  const fetchMessage=useCallback(async(id:string)=>{
    const{data,error}=await supabase.from('messages').select(messageSelect).eq('id',id).single()
    if(error)return null
    return{...(data as unknown as Message),delivery_status:'sent' as MessageDeliveryStatus}
  },[])

  const loadReactions=useCallback(async(ids:string[])=>{
    if(!ids.length){setReactions([]);return}
    const{data}=await supabase.from('message_reactions').select('message_id,emoji,user_id').in('message_id',ids)
    setReactions((data as Reaction[])||[])
  },[])

  const load=useCallback(async(show=false)=>{
    if(show)setLoading(true)
    const{data,error}=await supabase.from('messages').select(messageSelect).eq('room_id',room.id).is('deleted_at',null).order('created_at').range(0,199)
    if(error){setError(error.message);setLoading(false);return}
    const next=sortMessages(((data as unknown as Message[])||[]).map(m=>({...m,delivery_status:m.sender_id===userId&&m.read_at?'read':'sent'})))
    messageIdsRef.current=next.map(m=>m.id).filter(id=>!id.startsWith('local-'))
    setMessages(next);await loadReactions(messageIdsRef.current);setLoading(false);markRead()
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
    return()=>{supabase.removeChannel(channel);cleanupRecording();cleanupCamera()}
  },[room.id,userId])

  useEffect(()=>{
    messageIdsRef.current=messages.map(m=>m.id).filter(id=>!id.startsWith('local-'))
    if(nearBottom()){bottom.current?.scrollIntoView({behavior:'smooth'});setUnread(0);markRead()}
  },[messages,markRead])

  useEffect(()=>{
    const handler=()=>{if(window.visualViewport){document.documentElement.style.setProperty('--app-height',`${window.visualViewport.height}px`)}}
    window.visualViewport?.addEventListener('resize',handler);handler()
    return()=>window.visualViewport?.removeEventListener('resize',handler)
  },[])

  useEffect(()=>{
    const handler=(e:MouseEvent)=>{const target=e.target as HTMLElement;if(!target.closest('.pm-msg-menu')&&!target.closest('.pm-msg-menu-trigger'))setActiveMessageMenu(null);if(!target.closest('.pm-header-menu')&&!target.closest('.pm-menu-trigger'))setMenuOpen(false)}
    document.addEventListener('click',handler);return()=>document.removeEventListener('click',handler)
  },[])

  function updateText(value:string){
    setText(value);channelRef.current?.track({typing:Boolean(value.trim()),name:'Member'})
    if(typingTimer.current)window.clearTimeout(typingTimer.current)
    typingTimer.current=window.setTimeout(()=>channelRef.current?.track({typing:false,name:'Member'}),1200)
  }

  async function persistMessage(draft:Message){
    const{data,error}=await supabase.from('messages').insert({room_id:room.id,sender_id:userId,body:draft.body,reply_to:draft.reply_to||null,client_message_id:draft.client_message_id,media_url:draft.media_url||null,media_type:draft.media_type||null,media_mime_type:draft.media_mime_type||null,media_size:draft.media_size||null}).select(messageSelect).single()
    if(error){setError(error.message);setMessages(items=>items.map(i=>i.id===draft.id?{...i,delivery_status:'failed'}:i));return}
    setError('');setReplyTo(null);setMessages(items=>mergeMessage(items,{...(data as unknown as Message),delivery_status:'sent'}))
    window.dispatchEvent(new CustomEvent('nova-private-message-sent',{detail:{roomId:room.id}}))
  }

  async function send(event:FormEvent){
    event.preventDefault();const body=text.trim();if(!body)return
    if(spam(body)){setError('This looks like spam. Please rewrite it.');return}
    const clientId=crypto.randomUUID()
    const optimistic={id:`local-${clientId}`,body,sender_id:userId,created_at:new Date().toISOString(),reply_to:replyTo?.id||null,client_message_id:clientId,delivery_status:'sending' as MessageDeliveryStatus,profiles:{full_name:'You',display_name:'You',avatar_url:null}} as Message
    setText('');setMessages(items=>mergeMessage(items,optimistic));await persistMessage(optimistic)
  }

  async function uploadMedia(file:File, mediaType:'image'|'audio'|'video', caption:string){
    const path=`${userId}/${room.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'-')}`
    const{error:uploadErr}=await supabase.storage.from('chat-media').upload(path,file,{contentType:file.type,upsert:false})
    if(uploadErr){setError(uploadErr.message);return}
    const{data:urlData}=supabase.storage.from('chat-media').getPublicUrl(path)
    const mediaUrl=urlData?.publicUrl;if(!mediaUrl){setError('Could not get media URL.');return}
    const clientId=crypto.randomUUID()
    const optimistic={id:`local-${clientId}`,body:caption||`Shared ${mediaType}`,sender_id:userId,created_at:new Date().toISOString(),client_message_id:clientId,media_url:mediaUrl,media_type:mediaType,media_mime_type:file.type,media_size:file.size,delivery_status:'sending' as MessageDeliveryStatus,profiles:{full_name:'You',display_name:'You',avatar_url:null}} as Message
    setMessages(items=>mergeMessage(items,optimistic))
    const{data,error}=await supabase.from('messages').insert({room_id:room.id,sender_id:userId,body:caption||`Shared ${mediaType}`,client_message_id:clientId,media_url:mediaUrl,media_type:mediaType,media_mime_type:file.type,media_size:file.size}).select(messageSelect).single()
    if(error){setError(error.message);setMessages(items=>items.map(i=>i.id===optimistic.id?{...i,delivery_status:'failed'}:i))}
    else setMessages(items=>mergeMessage(items,{...(data as unknown as Message),delivery_status:'sent'}))
  }

  function handleImageUpload(){
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/gif,image/webp'
    input.onchange=async()=>{const file=input.files?.[0];if(file)await uploadMedia(file,'image','')};input.click()
  }

  function handleFileUpload(){
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/gif,image/webp,audio/mpeg,audio/mp4,audio/aac,audio/x-m4a,audio/webm,audio/ogg,video/webm,video/mp4,application/pdf'
    input.onchange=async()=>{const file=input.files?.[0];if(!file)return;if(file.size>50*1024*1024){setError('File must be under 50MB.');return}
      const type=file.type.startsWith('image/')?'image':file.type.startsWith('audio/')?'audio':file.type.startsWith('video/')?'video':'image';await uploadMedia(file,type as any,'')};input.click()
  }

  function cleanupRecording(){
    if(recordingTimerRef.current){clearInterval(recordingTimerRef.current);recordingTimerRef.current=null}
    recordingStreamRef.current?.getTracks().forEach(t=>t.stop());recordingStreamRef.current=null
    if(recordedUrl)URL.revokeObjectURL(recordedUrl)
    mediaRecorderRef.current=null;recordingChunksRef.current=[]
    setRecordingMode(null);setRecordingState('idle');setRecordedBlob(null);setRecordedUrl(null);setRecordingDuration(0)
  }

  async function startRecording(isVideo:boolean){
    if(recordingState!=='idle'){cleanupRecording();return}
    if(!navigator.mediaDevices?.getUserMedia){setError('Recording is not supported in this browser.');return}
    try{
      const constraints={audio:true,...(isVideo?{video:{width:{ideal:640},height:{ideal:480},facingMode:'user'}}:{})}
      const stream=await navigator.mediaDevices.getUserMedia(constraints)
      recordingStreamRef.current=stream
      const mimeType=isVideo?(MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')?'video/webm;codecs=vp8,opus':'video/webm'):(MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/webm')
      const recorder=new MediaRecorder(stream,{mimeType})
      recordingChunksRef.current=[]
      recorder.ondataavailable=e=>{if(e.data.size>0)recordingChunksRef.current.push(e.data)}
      recorder.onstop=()=>{
        const blob=new Blob(recordingChunksRef.current,{type:mimeType})
        stream.getTracks().forEach(t=>t.stop());recordingStreamRef.current=null
        const url=URL.createObjectURL(blob);setRecordedBlob(blob);setRecordedUrl(url);setRecordingState('preview')
      }
      mediaRecorderRef.current=recorder;recorder.start(200)
      setRecordingMode(isVideo?'video':'audio');setRecordingState('recording');setRecordingDuration(0)
      recordingTimerRef.current=window.setInterval(()=>setRecordingDuration(d=>d+1),1000)
    }catch{setError('Could not access microphone. Please check your browser settings.')}
  }

  function pauseRecording(){if(mediaRecorderRef.current?.state==='recording'){mediaRecorderRef.current.pause();setRecordingState('paused');if(recordingTimerRef.current)clearInterval(recordingTimerRef.current)}}
  function resumeRecording(){if(mediaRecorderRef.current?.state==='paused'){mediaRecorderRef.current.resume();setRecordingState('recording');recordingTimerRef.current=window.setInterval(()=>setRecordingDuration(d=>d+1),1000)}}
  function stopRecording(){if(mediaRecorderRef.current?.state==='recording'||mediaRecorderRef.current?.state==='paused')mediaRecorderRef.current.stop();if(recordingTimerRef.current){clearInterval(recordingTimerRef.current);recordingTimerRef.current=null}}

  async function sendRecording(){
    if(!recordedBlob||!recordingMode)return
    const file=new File([recordedBlob],`${recordingMode}-${Date.now()}.webm`,{type:recordedBlob.type})
    await uploadMedia(file,recordingMode,recordingMode==='video'?'Sent a video message':'Sent a voice message')
    cleanupRecording()
  }

  function cleanupCamera(){
    cameraStreamRef.current?.getTracks().forEach(t=>t.stop());cameraStreamRef.current=null
    if(capturedUrl)URL.revokeObjectURL(capturedUrl)
    setCameraState('idle');setCapturedBlob(null);setCapturedUrl(null)
  }

  async function openCamera(){
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode,width:{ideal:1280},height:{ideal:720}},audio:false})
      cameraStreamRef.current=stream;setCameraState('streaming')
      setTimeout(()=>{if(videoRef.current){videoRef.current.srcObject=stream;videoRef.current.play().catch(()=>{})}},100)
    }catch{handleImageUpload()}
  }

  function capturePhoto(){
    if(!videoRef.current||!canvasRef.current)return
    const v=videoRef.current,c=canvasRef.current;c.width=v.videoWidth;c.height=v.videoHeight
    const ctx=c.getContext('2d')!;ctx.drawImage(v,0,0)
    c.toBlob(blob=>{if(blob){setCapturedBlob(blob);setCapturedUrl(URL.createObjectURL(blob));setCameraState('captured')}},'image/jpeg',0.9)
  }

  function flipCamera(){setFacingMode(f=>f==='user'?'environment':'user');cameraStreamRef.current?.getTracks().forEach(t=>t.stop());openCamera()}

  async function sendCapturedPhoto(){
    if(!capturedBlob)return
    const file=new File([capturedBlob],`photo-${Date.now()}.jpg`,{type:'image/jpeg'})
    await uploadMedia(file,'image','');cleanupCamera()
  }

  function insertEmoji(emoji:string){setText(v=>v+emoji);setEmojiOpen(false)}
  async function sendGesture(emoji:string,label:string){
    const clientId=crypto.randomUUID()
    const optimistic={id:`local-${clientId}`,body:`${emoji} ${label}`,sender_id:userId,created_at:new Date().toISOString(),client_message_id:clientId,delivery_status:'sending' as MessageDeliveryStatus,profiles:{full_name:'You',display_name:'You',avatar_url:null}} as Message
    setEmojiOpen(false);setMessages(items=>mergeMessage(items,optimistic));await persistMessage(optimistic)
  }

  async function react(message:Message,emoji:string){
    if(message.id.startsWith('local-'))return
    const exists=reactions.some(r=>r.message_id===message.id&&r.user_id===userId&&r.emoji===emoji)
    if(exists)await supabase.from('message_reactions').delete().eq('message_id',message.id).eq('user_id',userId).eq('emoji',emoji)
    else await supabase.from('message_reactions').upsert({message_id:message.id,user_id:userId,emoji},{onConflict:'message_id,user_id,emoji'})
    await loadReactions(messageIdsRef.current);setActiveMessageMenu(null)
  }

  async function reportMessage(message:Message){
    if(message.id.startsWith('local-'))return;const reason=window.prompt('Why should moderators review this message?')
    if(reason){await supabase.from('message_reports').insert({message_id:message.id,reporter_id:userId,reason});setNotice('Thank you. This message has been reported.')}
    setActiveMessageMenu(null)
  }

  async function blockUser(){
    if(!otherUserId)return;if(!window.confirm(`Block ${profileName}?`))return
    const{error}=await supabase.rpc('block_member',{other_user:otherUserId})
    if(error)setNotice(error.message);else{setNotice(`${profileName} has been blocked.`);window.setTimeout(onClose,900)}
    setMenuOpen(false)
  }

  async function reportUser(){
    const reason=window.prompt(`Report ${profileName}? Describe the issue.`)
    const latest=messages.slice().reverse().find(m=>m.sender_id===otherUserId&&!m.id.startsWith('local-'))
    if(reason&&latest)await supabase.from('message_reports').insert({message_id:latest.id,reporter_id:userId,reason:`User report for ${profileName}: ${reason}`})
    else if(reason)setNotice('A report needs at least one message from this member.');setMenuOpen(false)
  }

  async function retry(message:Message){setMessages(items=>items.map(i=>i.id===message.id?{...i,delivery_status:'sending'}:i));await persistMessage({...message,client_message_id:message.client_message_id||crypto.randomUUID()})}
  function deleteDraft(message:Message){setMessages(items=>items.filter(i=>i.id!==message.id))}
  async function remove(message:Message){const{error}=await supabase.from('messages').update({deleted_at:new Date().toISOString(),body:'Message deleted'}).eq('id',message.id).eq('sender_id',userId);if(error)setError(error.message);else load();setActiveMessageMenu(null)}
  async function saveEdit(event:FormEvent){event.preventDefault();if(!editing)return;const body=editText.trim();if(!body)return;const{error}=await supabase.from('messages').update({body,edited_at:new Date().toISOString()}).eq('id',editing.id).eq('sender_id',userId);if(error)setError(error.message);else{setEditing(null);load()}}
  function composerKeyDown(event:KeyboardEvent<HTMLTextAreaElement>){if(event.key==='Escape'){setEmojiOpen(false);setActiveMessageMenu(null)}if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit()}}

  const rows=useMemo(()=>messages.filter(m=>!searchText.trim()||m.body.toLowerCase().includes(searchText.trim().toLowerCase())),[messages,searchText])
  const reactionState=(messageId:string,emoji:string)=>({count:reactions.filter(r=>r.message_id===messageId&&r.emoji===emoji).length,me:reactions.some(r=>r.message_id===messageId&&r.emoji===emoji&&r.user_id===userId)})
  const hasReaction=(messageId:string)=>reactions.some(r=>r.message_id===messageId)

  const groupedRows=useMemo(()=>{
    return rows.map((m,i)=>{
      const prev=rows[i-1];const next=rows[i+1]
      const sameSender=prev&&prev.sender_id===m.sender_id
      const closeInTime=prev&&new Date(m.created_at).getTime()-new Date(prev.created_at).getTime()<300000
      const noReply=!m.reply_to
      const isFirstInGroup=!sameSender||!closeInTime||!noReply
      const isLastInGroup=!next||next.sender_id!==m.sender_id||new Date(next.created_at).getTime()-new Date(m.created_at).getTime()>300000||!!next.reply_to
      const showDate=!prev||new Date(prev.created_at).toDateString()!==new Date(m.created_at).toDateString()
      return{message:m,isFirstInGroup,isLastInGroup,showDate}
    })
  },[rows])

  let messageContent
  if(loading){messageContent=<div className="pm-loading"><div className="pm-spinner"/><p>Loading conversation...</p></div>}
  else if(error&&rows.length===0){messageContent=<div className="pm-empty"><h3>Conversation unavailable</h3><p>{error}</p></div>}
  else if(rows.length===0){messageContent=<div className="pm-empty"><h3>Start the conversation</h3><p>This private room is ready.</p></div>}
  else{
    messageContent=groupedRows.map(({message:m,isFirstInGroup,isLastInGroup,showDate})=>{
      const isMine=m.sender_id===userId;const reply=rows.find(x=>x.id===m.reply_to)
      return <div key={m.id} className={`pm-msg-wrapper ${isMine?'mine':'theirs'}`}>
        {showDate&&<div className="pm-date-sep">{new Date(m.created_at).toLocaleDateString([],{dateStyle:'medium'})}</div>}
        {isFirstInGroup&&<div className={`pm-msg-group ${isMine?'mine':'theirs'}`}>
          {!isMine&&<span className="pm-msg-avatar">{m.profiles?.avatar_url?<img src={m.profiles.avatar_url} alt={(m.profiles?.full_name || 'Member') + " avatar"}/>:initials(m.profiles?.full_name)}</span>}
          <div className="pm-msg-identity">{!isMine&&<span className="pm-msg-name">{m.profiles?.full_name||'Member'}</span>}</div>
        </div>}
        <div className={`pm-msg-row ${isMine?'mine':'theirs'} ${isFirstInGroup?'first':''} ${isLastInGroup?'last':''}`}>
          {!isMine&&isFirstInGroup&&<span className="pm-msg-avatar-spacer"/>}
          <div className="pm-msg-bubble-wrap">
            {reply&&<div className="pm-reply-quote"><span>Replying to {reply.sender_id===userId?'you':reply.profiles?.full_name||'member'}</span><p>{reply.body.slice(0,100)}</p></div>}
            <div className={`pm-msg-bubble ${isMine?'mine':'theirs'}`}>
              {m.media_url&&m.media_type==='image'&&<div className="pm-media"><img src={m.media_url} alt={m.body||'Shared image'} loading="lazy" onClick={()=>window.open(m.media_url!,'_blank')}/></div>}
              {m.media_url&&m.media_type==='audio'&&<div className="pm-media"><audio controls preload="metadata" src={m.media_url}/></div>}
              {m.media_url&&m.media_type==='video'&&<div className="pm-media"><video controls preload="metadata" src={m.media_url}/></div>}
              {m.body&&m.body!=='Message deleted'&&<p className="pm-msg-text">{m.body}</p>}
              <div className="pm-msg-footer">
                <span className="pm-msg-time">{new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}{m.edited_at?' · edited':''}</span>
                {isMine&&<span className="pm-msg-status">{m.delivery_status==='failed'?'Failed':m.delivery_status==='sending'?'Sending':m.read_at?'Read':'Sent'}</span>}
              </div>
              {m.delivery_status==='failed'&&<div className="pm-msg-retry"><button onClick={()=>retry(m)}>Retry</button><button onClick={()=>deleteDraft(m)}>Remove</button></div>}
            </div>
            {isLastInGroup&&!m.id.startsWith('local-')&&hasReaction(m.id)&&<div className="pm-reactions-inline">{reactionEmojis.filter(e=>reactionState(m.id,e).count>0).map(e=><button key={e} className={reactionState(m.id,e).me?'active':''} onClick={()=>react(m,e)}>{e}{reactionState(m.id,e).count>1&&<span>{reactionState(m.id,e).count}</span>}</button>)}</div>}
            {isLastInGroup&&!m.id.startsWith('local-')&&<div className="pm-msg-actions">
              {quickReactions.map(e=><button key={e} className="pm-action-react" onClick={()=>react(m,e)} aria-label={`React ${e}`}>{e}</button>)}
              <button onClick={()=>setReplyTo(m)} aria-label="Reply"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg></button>
              <button onClick={()=>navigator.clipboard?.writeText(m.body)} aria-label="Copy"><Copy size={13}/></button>
              {!isMine&&<button className="pm-msg-menu-trigger" onClick={(e)=>{e.stopPropagation();setActiveMessageMenu(activeMessageMenu===m.id?null:m.id)}} aria-label="More"><MoreVertical size={13}/></button>}
              {isMine&&<button className="pm-msg-menu-trigger" onClick={(e)=>{e.stopPropagation();setActiveMessageMenu(activeMessageMenu===m.id?null:m.id)}} aria-label="More"><MoreVertical size={13}/></button>}
            </div>}
            {activeMessageMenu===m.id&&<div className="pm-msg-menu" onClick={e=>e.stopPropagation()}>
              {!isMine&&<button onClick={()=>reportMessage(m)}><Flag size={13}/> Report</button>}
              {isMine&&<button onClick={()=>{setEditing(m);setEditText(m.body);setActiveMessageMenu(null)}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg> Edit</button>}
              {isMine&&<button onClick={()=>remove(m)} className="pm-danger"><Trash2 size={13}/> Delete</button>}
            </div>}
          </div>
        </div>
      </div>
    })
  }

  return <div className="pm-overlay" ref={containerRef}><section className="pm-chat" role="dialog" aria-modal="true" aria-label="Private messages">
    <header className="pm-header">
      <button className="pm-back" onClick={onClose} aria-label="Back"><ChevronLeft size={20}/></button>
      <button className="pm-header-profile" onClick={()=>otherUserId&&onOpenProfile?.(otherUserId)}>
        <span className="pm-header-avatar">{privateRoom.avatar_url?<img src={privateRoom.avatar_url} alt={profileName + " avatar"}/>:initials(profileName)}<i className={`pm-status-dot ${presenceText==='Online now'?'online':''}`}/></span>
        <div className="pm-header-info"><h2>{profileName}{privateRoom.verified&&<BadgeCheck size={14}/>}</h2><span>{presenceText}</span></div>
      </button>
      <div className="pm-header-actions">
        <button className="pm-icon-btn" onClick={()=>setSearchOpen(v=>!v)} aria-label="Search messages"><Search size={17}/></button>
        <div className="pm-header-menu-wrap">
          <button className="pm-icon-btn pm-menu-trigger" onClick={(e)=>{e.stopPropagation();setMenuOpen(v=>!v)}} aria-label="More options"><MoreVertical size={17}/></button>
          {menuOpen&&<div className="pm-header-menu" onClick={e=>e.stopPropagation()}>
            {otherUserId&&<button onClick={()=>{onOpenProfile?.(otherUserId);setMenuOpen(false)}}><UserCircle size={14}/> View Profile</button>}
            <button onClick={reportUser}><Flag size={14}/> Report User</button>
            <button onClick={blockUser} className="pm-danger"><Ban size={14}/> Block User</button>
          </div>}
        </div>
      </div>
    </header>

    {searchOpen&&<div className="pm-search-bar"><Search size={14}/><input value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder="Search messages..." autoFocus aria-label="Search messages"/><button onClick={()=>{setSearchOpen(false);setSearchText('')}}><X size={14}/></button></div>}

    {recordingState!=='idle'&&<div className="pm-recording-bar">
      <div className="pm-rec-dot"/>
      <span className="pm-rec-timer">{formatDuration(recordingDuration)}</span>
      <span className="pm-rec-label">{recordingMode==='video'?'Recording video':'Recording audio'}</span>
      {recordingState==='recording'&&<button onClick={pauseRecording} className="pm-rec-btn" aria-label="Pause"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg></button>}
      {recordingState==='paused'&&<button onClick={resumeRecording} className="pm-rec-btn" aria-label="Resume"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21"/></svg></button>}
      {recordingState==='recording'||recordingState==='paused'?<button onClick={stopRecording} className="pm-rec-btn stop" aria-label="Stop"><StopCircle size={18}/></button>:null}
      <button onClick={cleanupRecording} className="pm-rec-btn cancel" aria-label="Cancel"><X size={16}/></button>
      {recordingState==='preview'&&recordedUrl&&<div className="pm-rec-preview">
        <audio controls src={recordedUrl} className="pm-rec-audio"/>
        <div className="pm-rec-preview-actions">
          <button onClick={()=>{cleanupRecording();startRecording(recordingMode==='video')}} className="pm-btn-outline"><Trash2 size={13}/> Retake</button>
          <button onClick={sendRecording} className="pm-btn-send"><Send size={13}/> Send</button>
        </div>
      </div>}
    </div>}

    {cameraState!=='idle'&&<div className="pm-camera-overlay">
      {cameraState==='streaming'&&<><div className="pm-camera-view"><video ref={videoRef} autoPlay playsInline muted className="pm-camera-video"/></div>
        <div className="pm-camera-controls">
          <button onClick={flipCamera} className="pm-cam-btn" aria-label="Flip camera"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg></button>
          <button onClick={capturePhoto} className="pm-cam-btn capture" aria-label="Capture photo"><div className="pm-cam-shutter"/></button>
          <button onClick={cleanupCamera} className="pm-cam-btn" aria-label="Cancel"><X size={20}/></button>
        </div></>}
      {cameraState==='captured'&&capturedUrl&&<><div className="pm-camera-view"><img src={capturedUrl} alt="Captured" className="pm-captured-img"/></div>
        <div className="pm-camera-controls">
          <button onClick={()=>{setCameraState('streaming');setCapturedBlob(null);if(capturedUrl)URL.revokeObjectURL(capturedUrl);setCapturedUrl(null)}} className="pm-cam-btn" aria-label="Retake"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg></button>
          <button onClick={sendCapturedPhoto} className="pm-cam-btn send" aria-label="Send photo"><Send size={20}/></button>
          <button onClick={cleanupCamera} className="pm-cam-btn" aria-label="Cancel"><X size={20}/></button>
        </div></>}
      <canvas ref={canvasRef} style={{display:'none'}}/>
    </div>}

    <div className="pm-messages" ref={listRef} onScroll={()=>{if(nearBottom()){setUnread(0);markRead()}}}>
      {messageContent}<div ref={bottom}/>
    </div>

    {unread>0&&<button className="pm-unread-pill" onClick={()=>{bottom.current?.scrollIntoView({behavior:'smooth'});setUnread(0);markRead()}}>{unread} new</button>}
    {typing.length>0&&<div className="pm-typing">{typing.slice(0,2).join(', ')} typing...</div>}
    {notice&&<div className="pm-notice">{notice} <button onClick={()=>setNotice('')}>Dismiss</button></div>}

    {replyTo&&<div className="pm-compose-context"><div className="pm-context-text"><span>Replying to {replyTo.sender_id===userId?'you':replyTo.profiles?.full_name||'member'}</span><p>{replyTo.body.slice(0,80)}</p></div><button onClick={()=>setReplyTo(null)} aria-label="Cancel reply"><X size={14}/></button></div>}
    {editing&&<form className="pm-edit-bar" onSubmit={saveEdit}><input value={editText} onChange={e=>setEditText(e.target.value)} maxLength={4000} autoFocus aria-label="Edit message"/><button type="submit" aria-label="Save"><Check size={16}/></button><button type="button" onClick={()=>setEditing(null)} aria-label="Cancel"><X size={16}/></button></form>}

    {emojiOpen&&<div className="pm-emoji-picker">
      {emojiGroups.map(group=><section key={group[0]}><h4>{group[0]}</h4><div className="pm-emoji-grid">{group.slice(1).map(e=><button key={`${group[0]}-${e}`} onClick={()=>insertEmoji(e)}>{e}</button>)}</div></section>)}
      <section><h4>Quick Gestures</h4><div className="pm-gesture-grid">{gestures.map(([e,label])=><button key={label} onClick={()=>sendGesture(e,label)} className="pm-gesture-btn"><span>{e}</span><small>{label}</small></button>)}</div></section>
    </div>}

    <form className="pm-composer" onSubmit={send}>
      <div className="pm-composer-toolbar">
        <button type="button" className="pm-tool-btn" onClick={()=>{setEmojiOpen(v=>!v)}} aria-label="Emoji"><Smile size={18}/></button>
        <button type="button" className="pm-tool-btn" onClick={handleImageUpload} aria-label="Share image"><Image size={18}/></button>
        <button type="button" className="pm-tool-btn" onClick={openCamera} aria-label="Camera"><Camera size={18}/></button>
        <button type="button" className="pm-tool-btn" onClick={handleFileUpload} aria-label="Attach file"><Paperclip size={18}/></button>
        <button type="button" className={`pm-tool-btn ${recordingState==='recording'||recordingState==='paused'?'recording':''}`} onClick={()=>startRecording(false)} aria-label="Record voice message"><Mic size={18}/></button>
      </div>
      <div className="pm-composer-input">
        <textarea value={text} onChange={e=>updateText(e.target.value)} onKeyDown={composerKeyDown} maxLength={4000} placeholder="Write a message..." rows={1} aria-label="Write a message"/>
        <button type="submit" className="pm-send-btn" disabled={!text.trim()} aria-label="Send"><Send size={18}/></button>
      </div>
    </form>
  </section></div>
}
