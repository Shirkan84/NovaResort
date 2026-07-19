import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Camera, Check, ChevronLeft, Heart, MessageCircleMore, Send, UserPlus, Video, X } from 'lucide-react'
import { supabase } from './supabase'
import './community-lobby.css'

export type DbRoom = { id:string; name:string; description:string; icon:string; theme:string; is_private:boolean; tags?:string[]; total_members?:number; online_members?:number; pinned_message?:string|null; last_activity?:string|null }
type Profile = { id:string; full_name:string; display_name:string|null; avatar_url:string|null; country:string|null; profile_type:string; about:string; interests:string[]; specialties:string[]; online:boolean }
type Message = { id:string; body:string; sender_id:string; created_at:string; edited_at?:string|null; reply_to?:string|null; pinned?:boolean; profiles?:{full_name:string;avatar_url:string|null}|null }
type Reaction = { message_id:string; emoji:string; user_id:string }
type Notice = { id:string; type:string; title:string; body:string|null; entity_id:string|null; read_at:string|null; created_at:string }

const QUICK_REACTIONS = ['❤️','🙏','🌿','✨']

function isLikelySpam(body:string) {
  const text = body.toLowerCase()
  const links = (text.match(/https?:\/\//g) || []).length
  const repeated = /(.)\1{18,}/.test(text)
  const bait = /(free money|crypto giveaway|click here now|earn \$|telegram.me|whatsapp group)/i.test(text)
  return links > 2 || repeated || bait
}

function initials(name?:string|null) {
  return (name || 'N').split(' ').map(x => x[0]).join('').slice(0,2)
}

export function ChatRoom({ room, userId, onClose }:{room:DbRoom;userId:string;onClose:()=>void}) {
  const [messages,setMessages]=useState<Message[]>([]), [reactions,setReactions]=useState<Reaction[]>([]), [text,setText]=useState(''), [loading,setLoading]=useState(true), [error,setError]=useState('')
  const [replyTo,setReplyTo]=useState<Message|null>(null), [editing,setEditing]=useState<Message|null>(null), [editText,setEditText]=useState(''), [muted,setMuted]=useState<string[]>([])
  const [typingUsers,setTypingUsers]=useState<string[]>([]), [unread,setUnread]=useState(0)
  const bottom=useRef<HTMLDivElement>(null), listRef=useRef<HTMLDivElement>(null), presenceRef=useRef<any>(null), typingTimer=useRef<number|null>(null)

  const nearBottom = () => {
    const el = listRef.current
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const loadMessages = useCallback(async (showLoading=false) => {
    if (showLoading) setLoading(true)
    setError('')
    const {data,error}=await supabase.from('messages').select('id,body,sender_id,created_at,edited_at,reply_to,pinned,profiles!messages_sender_id_fkey(full_name,avatar_url)').eq('room_id',room.id).is('deleted_at',null).order('created_at').limit(200)
    if(error){setError(error.message);setLoading(false);return}
    const rows=(data as unknown as Message[])||[]
    setMessages(rows)
    if(rows.length){
      const {data:reactionRows}=await supabase.from('message_reactions').select('message_id,emoji,user_id').in('message_id',rows.map(m=>m.id))
      setReactions((reactionRows as Reaction[])||[])
    } else setReactions([])
    setLoading(false)
  },[room.id])

  useEffect(()=>{
    setMessages([]);setReactions([]);setUnread(0);setReplyTo(null);setEditing(null)
    loadMessages(true)
    const channel=supabase.channel(`room-${room.id}`,{config:{presence:{key:userId}}})
      .on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:`room_id=eq.${room.id}`},()=>{ if(!nearBottom())setUnread(x=>x+1); loadMessages() })
      .on('presence',{event:'sync'},()=>{
        const state=channel.presenceState() as Record<string, any[]>
        const names=Object.entries(state).filter(([id])=>id!==userId).flatMap(([,metas])=>metas.filter(m=>m.typing).map(m=>m.name || 'Someone'))
        setTypingUsers([...new Set(names)])
      })
      .subscribe(async status=>{ if(status==='SUBSCRIBED') await channel.track({typing:false,name:'Member'}) })
    presenceRef.current=channel
    return()=>{supabase.removeChannel(channel)}
  },[room.id,userId,loadMessages])

  useEffect(()=>{ if(nearBottom()){bottom.current?.scrollIntoView({behavior:'smooth'});setUnread(0)} },[messages])

  function updateText(value:string) {
    setText(value)
    presenceRef.current?.track({typing:value.trim().length>0,name:'Member'})
    if(typingTimer.current) window.clearTimeout(typingTimer.current)
    typingTimer.current=window.setTimeout(()=>presenceRef.current?.track({typing:false,name:'Member'}),1200)
  }

  function reactionCounts(messageId:string) {
    return QUICK_REACTIONS.map(emoji=>({emoji,count:reactions.filter(r=>r.message_id===messageId&&r.emoji===emoji).length,me:reactions.some(r=>r.message_id===messageId&&r.emoji===emoji&&r.user_id===userId)}))
  }

  async function send(e:FormEvent){e.preventDefault();const body=text.trim();if(!body)return;if(isLikelySpam(body)){setError('This looks like spam. Please rewrite it in a calmer, more personal way.');return}setText('');setError('');const {error}=await supabase.from('messages').insert({room_id:room.id,sender_id:userId,body,reply_to:replyTo?.id||null});if(error){setError(error.message);setText(body)}else{setReplyTo(null);presenceRef.current?.track({typing:false,name:'Member'})}}
  async function saveEdit(e:FormEvent){e.preventDefault();if(!editing)return;const body=editText.trim();if(!body||isLikelySpam(body))return;const {error}=await supabase.from('messages').update({body,edited_at:new Date().toISOString()}).eq('id',editing.id).eq('sender_id',userId);if(error)setError(error.message);else{setEditing(null);setEditText('');loadMessages()}}
  async function deleteMessage(m:Message){const {error}=await supabase.from('messages').update({deleted_at:new Date().toISOString(),body:'Message deleted'}).eq('id',m.id).eq('sender_id',userId);if(error)setError(error.message);else loadMessages()}
  async function react(m:Message, emoji:string){await supabase.from('message_reactions').upsert({message_id:m.id,user_id:userId,emoji},{onConflict:'message_id,user_id,emoji'});loadMessages()}
  async function pin(m:Message){const {error}=await supabase.from('messages').update({pinned:!m.pinned,pinned_by:userId,pinned_at:!m.pinned?new Date().toISOString():null}).eq('id',m.id).eq('sender_id',userId);if(error)setError(error.message);else loadMessages()}
  async function report(m:Message){const reason=window.prompt('Tell the moderators what felt unsafe about this message.');if(!reason)return;const {error}=await supabase.from('message_reports').insert({message_id:m.id,reporter_id:userId,reason});alert(error?error.message:'Thank you. The message was reported.')}
  async function block(senderId:string){await supabase.from('user_blocks').insert({blocker_id:userId,blocked_id:senderId});setMuted(x=>[...new Set([...x,senderId])])}
  async function leave(){await supabase.from('room_members').delete().eq('room_id',room.id).eq('user_id',userId);onClose()}

  const pinned=messages.find(m=>m.pinned)
  const visible=messages.filter(m=>!muted.includes(m.sender_id))
  return <div className="feature-overlay"><section className="chat-window"><header><button onClick={onClose}><ChevronLeft/></button><div className={`chat-room-icon ${room.theme}`}>{room.icon}</div><div><h2>{room.name}</h2><span><i/> {room.is_private?'Private room for 2 users':`${room.online_members||0} online · ${room.total_members||0} members`} · Be kind</span></div><button onClick={onClose}><X/></button></header><div className="safety-strip"><button onClick={()=>alert('Community guidelines: be respectful, protect privacy, no harassment, no spam, and report harmful behavior.')}>Community Guidelines</button><button onClick={leave}>Leave room</button><span>{room.is_private?'Only you and the other selected member can open this room.':'This is a peer-support space. Protect your privacy and report harmful behaviour.'}</span></div>{pinned&&<div className="pinned-message"><b>Moderator announcement</b><span>{pinned.body}</span></div>}<div className="message-list" ref={listRef} onScroll={()=>{if(nearBottom())setUnread(0)}}>{loading?<p className="empty-state">Opening the room…</p>:error?<div className="empty-state"><MessageCircleMore/><h3>Room unavailable</h3><p>{error}</p></div>:visible.length===0?<div className="empty-state"><MessageCircleMore/><h3>Start the conversation</h3><p>Be the first to share something kind or meaningful.</p></div>:visible.map(m=>{const reply=messages.find(x=>x.id===m.reply_to);return <div key={m.id} className={m.sender_id===userId?'chat-message mine':'chat-message'}><span>{m.profiles?.avatar_url?<img src={m.profiles.avatar_url} alt=""/>:initials(m.profiles?.full_name)}</span><div>{reply&&<em className="reply-preview">Replying to {reply.sender_id===userId?'you':reply.profiles?.full_name||'member'}: {reply.body.slice(0,80)}</em>}<b>{m.sender_id===userId?'You':m.profiles?.full_name||'Member'} <small>{new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}{m.edited_at?' · edited':''}</small></b><p>{m.body}</p><div className="message-actions">{QUICK_REACTIONS.map(emoji=><button key={emoji} className={reactionCounts(m.id).find(r=>r.emoji===emoji)?.me?'active':''} onClick={()=>react(m,emoji)}>{emoji} {reactionCounts(m.id).find(r=>r.emoji===emoji)?.count||''}</button>)}<button onClick={()=>setReplyTo(m)}>Reply</button>{m.sender_id===userId&&<button onClick={()=>{setEditing(m);setEditText(m.body)}}>Edit</button>}{m.sender_id===userId&&<button onClick={()=>deleteMessage(m)}>Delete</button>}{m.sender_id===userId&&<button onClick={()=>pin(m)}>{m.pinned?'Unpin':'Pin'}</button>}{m.sender_id!==userId&&<button onClick={()=>report(m)}>Report</button>}{m.sender_id!==userId&&<button onClick={()=>setMuted(x=>[...new Set([...x,m.sender_id])])}>Mute</button>}{m.sender_id!==userId&&<button onClick={()=>block(m.sender_id)}>Block</button>}</div></div></div>})}<div ref={bottom}/></div>{unread>0&&<button className="unread-pill" onClick={()=>bottom.current?.scrollIntoView({behavior:'smooth'})}>{unread} new</button>}{typingUsers.length>0&&<div className="typing-indicator">{typingUsers.slice(0,2).join(', ')} typing…</div>}{replyTo&&<div className="compose-context">Replying to {replyTo.sender_id===userId?'your message':replyTo.profiles?.full_name||'member'} <button onClick={()=>setReplyTo(null)}>Cancel</button></div>}{editing&&<form className="message-compose edit-compose" onSubmit={saveEdit}><input value={editText} onChange={e=>setEditText(e.target.value)} maxLength={4000} autoFocus/><button aria-label="Save"><Check/></button><button type="button" onClick={()=>setEditing(null)} aria-label="Cancel"><X/></button></form>}<form className="message-compose" onSubmit={send}><input value={text} onChange={e=>updateText(e.target.value)} maxLength={4000} placeholder="Write a supportive message…"/><button aria-label="Send"><Send/></button></form></section></div>
}

export function PeopleDirectory({userId,onClose,onOpenRoom}:{userId:string;onClose:()=>void;onOpenRoom:(room:DbRoom)=>void}){
  const [people,setPeople]=useState<Profile[]>([]),[rooms,setRooms]=useState<DbRoom[]>([]),[sent,setSent]=useState<string[]>([]),[query,setQuery]=useState(''),[joining,setJoining]=useState('')
  useEffect(()=>{
    supabase.rpc('list_public_rooms').then(({data})=>setRooms((data as DbRoom[])||[]))
    supabase.from('profiles').select('id,full_name,display_name,avatar_url,country,profile_type,about,interests,online').neq('id',userId).limit(50).then(({data})=>setPeople((data as Profile[])||[]))
  },[userId])
  async function joinRoom(room:DbRoom){setJoining(room.id);const {error}=await supabase.from('room_members').insert({room_id:room.id,user_id:userId});if(error&&error.code!=='23505'){alert(error.message);setJoining('');return}await supabase.from('room_user_preferences').upsert({room_id:room.id,user_id:userId,last_read_at:new Date().toISOString()},{onConflict:'room_id,user_id'});setJoining('');onClose();onOpenRoom(room)}
  async function friend(person:Profile){const {data,error}=await supabase.from('friendships').insert({requester_id:userId,addressee_id:person.id}).select('id').single();if(!error&&data){setSent(x=>[...x,person.id]);await supabase.from('notifications').insert({user_id:person.id,actor_id:userId,type:'friend_request',title:'New friend request',body:'Tap to accept this community connection.',entity_id:data.id})}}
  async function video(person:Profile){const {data,error}=await supabase.from('video_sessions').insert({host_id:userId,guest_id:person.id}).select('id').single();if(!error&&data){await supabase.from('notifications').insert({user_id:person.id,actor_id:userId,type:'video_invite',title:'Private video invitation',body:'You have been invited to a private wellness conversation.',entity_id:data.id});alert('Video invitation sent safely.')}}
  async function message(person:Profile){const {data,error}=await supabase.rpc('create_private_room',{other_user:person.id});if(error){alert(error.message);return}onClose();onOpenRoom({id:data,name:person.display_name||person.full_name,description:'Private two-person conversation',icon:'♢',theme:'sage',is_private:true})}
  const filtered=people.filter(p=>(p.display_name||p.full_name).toLowerCase().includes(query.toLowerCase())||(p.country||'').toLowerCase().includes(query.toLowerCase()))
  return <div className="feature-overlay"><section className="directory-window community-lobby"><header><div><h2>Community Lobby</h2><p>Join peaceful public wellness rooms or connect one-to-one.</p></div><button onClick={onClose}><X/></button></header><div className="lobby-scroll"><div className="lobby-grid">{rooms.map(room=><article key={room.id} className={`room-card ${room.theme}`}><div className="room-art"><span>{room.icon}</span><i className="bubble b1"/><i className="bubble b2"/><i className="bubble b3"/></div><div className="room-info"><div className="tags"><span className="open-tag"><i/> Open</span>{(room.online_members||0)>0&&<span>LIVE</span>}{(room.tags||[]).slice(0,2).map(tag=><span key={tag}>{tag}</span>)}</div><h3>{room.name}</h3><p>{room.description}</p><div className="lobby-stats"><span>{room.online_members||0} online</span><span>{room.total_members||0} members</span></div><div className="room-bottom"><span><MessageCircleMore/> Community room</span><button disabled={joining===room.id} onClick={()=>joinRoom(room)}>{joining===room.id?'Joining…':'Join Room'} <ChevronLeft style={{transform:'rotate(180deg)'}}/></button></div></div></article>)}</div><div className="member-section"><div><h3>Members and healers</h3><p>Find people for private two-person conversations.</p></div><input className="people-search" placeholder="Search by name or country…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="people-list">{filtered.map(p=><article key={p.id}><span className="person-avatar">{p.avatar_url?<img src={p.avatar_url} alt=""/>:initials(p.display_name||p.full_name)}</span><div><h3>{p.display_name||p.full_name}{p.profile_type==='healer'&&<em>Healer / Therapist</em>}</h3><p>{p.country||'Nova Resort community'} · {p.about||'Here to connect and grow.'}</p></div><button title="Private message" onClick={()=>message(p)}><MessageCircleMore/></button><button disabled={sent.includes(p.id)} onClick={()=>friend(p)}>{sent.includes(p.id)?<Check/>:<UserPlus/>}</button><button onClick={()=>video(p)}><Video/></button></article>)}</div></div></div></section></div>
}

type PrivateRoom = DbRoom & { avatar_url:string|null;last_message:string|null;last_activity:string }
export function PrivateChats({onClose,onOpenRoom}:{onClose:()=>void;onOpenRoom:(room:DbRoom)=>void}){
  const [rooms,setRooms]=useState<PrivateRoom[]>([]),[loading,setLoading]=useState(true),[people,setPeople]=useState<Profile[]>([]),[creating,setCreating]=useState(false),[query,setQuery]=useState(''),[busy,setBusy]=useState('')
  const loadRooms=()=>supabase.rpc('list_private_rooms').then(({data})=>{setRooms((data as PrivateRoom[])||[]);setLoading(false)})
  useEffect(()=>{loadRooms()},[])
  useEffect(()=>{if(!creating)return;supabase.auth.getUser().then(({data})=>supabase.from('profiles').select('id,full_name,display_name,avatar_url,country,profile_type,about,interests,specialties,online').neq('id',data.user?.id||'').limit(80).then(({data})=>setPeople((data as Profile[])||[])))},[creating])
  async function createRoom(person:Profile){setBusy(person.id);const {data,error}=await supabase.rpc('create_private_room',{other_user:person.id});setBusy('');if(error){alert(error.message);return}onClose();onOpenRoom({id:data,name:person.display_name||person.full_name,description:'Private two-person conversation',icon:'♢',theme:'sage',is_private:true})}
  const filtered=people.filter(p=>(p.display_name||p.full_name).toLowerCase().includes(query.toLowerCase())||(p.country||'').toLowerCase().includes(query.toLowerCase()))
  return <div className="feature-overlay"><section className="directory-window private-chats"><header><div><h2>{creating?'Create private room':'Private messages'}</h2><p>{creating?'Choose exactly one person. Only both of you can open this room.':'Your private two-person conversations.'}</p></div><button style={{width:'auto',height:34,marginLeft:'auto',padding:'0 12px',whiteSpace:'nowrap'}} onClick={()=>setCreating(!creating)}>{creating?'View chats':'New private room'}</button><button onClick={onClose}><X/></button></header>{creating?<><input className="people-search" placeholder="Search for the second person…" value={query} onChange={e=>setQuery(e.target.value)}/><div className="people-list">{filtered.length===0?<div className="empty-state"><MessageCircleMore/><h3>No people found</h3><p>Try searching by name or country.</p></div>:filtered.map(p=><article key={p.id}><span className="person-avatar">{p.avatar_url?<img src={p.avatar_url} alt=""/>:initials(p.display_name||p.full_name)}</span><div><h3>{p.display_name||p.full_name}{p.profile_type==='healer'&&<em>Healer / Therapist</em>}</h3><p>{p.country||'Nova Resort community'} · Private room for 2 users only</p></div><button disabled={busy===p.id} onClick={()=>createRoom(p)}>{busy===p.id?'…':<MessageCircleMore/>}</button></article>)}</div></>:loading?<div className="empty-state">Loading conversations…</div>:rooms.length===0?<div className="empty-state"><MessageCircleMore/><h3>No private conversations yet</h3><p>Create a private room with one other member.</p><button className="save-profile" onClick={()=>setCreating(true)}>Create private room</button></div>:<><div style={{padding:'0 20px 8px'}}><button className="new-message" onClick={()=>setCreating(true)}><MessageCircleMore size={16}/> Create private room</button></div><div className="people-list">{rooms.map(r=><button className="private-chat-row" key={r.id} onClick={()=>{onClose();onOpenRoom(r)}}><span className="person-avatar">{r.avatar_url?<img src={r.avatar_url} alt=""/>:r.name.slice(0,1)}</span><div><h3>{r.name}</h3><p>{r.last_message||'Start your private conversation.'}</p></div><small>{r.last_activity&&new Date(r.last_activity).toLocaleDateString()}</small></button>)}</div></>}</section></div>
}

export function EditProfile({userId,onClose}:{userId:string;onClose:()=>void}){
  const [profile,setProfile]=useState<Profile|null>(null),[saved,setSaved]=useState(false),[uploading,setUploading]=useState(false)
  useEffect(()=>{supabase.from('profiles').select('*').eq('id',userId).single().then(({data})=>setProfile(data as Profile))},[userId])
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);const {error}=await supabase.from('profiles').update({display_name:d.get('display_name'),country:d.get('country'),profile_type:d.get('profile_type'),about:d.get('about'),interests:String(d.get('interests')||'').split(',').map(x=>x.trim()).filter(Boolean),specialties:String(d.get('specialties')||'').split(',').map(x=>x.trim()).filter(Boolean),updated_at:new Date().toISOString()}).eq('id',userId);if(!error)setSaved(true)}
  async function upload(file?:File){if(!file)return;if(file.size>5242880){alert('Please choose an image smaller than 5 MB.');return}setUploading(true);const ext=file.name.split('.').pop()?.toLowerCase()||'jpg',path=`${userId}/profile.${ext}`;const {error}=await supabase.storage.from('avatars').upload(path,file,{upsert:true,contentType:file.type});if(!error){const {data}=supabase.storage.from('avatars').getPublicUrl(path);const avatar_url=`${data.publicUrl}?v=${Date.now()}`;await supabase.from('profiles').update({avatar_url,updated_at:new Date().toISOString()}).eq('id',userId);setProfile(p=>p?{...p,avatar_url}:p)}else alert(error.message);setUploading(false)}
  return <div className="feature-overlay"><section className="profile-window"><header><div><h2>Your profile</h2><p>Help the right people connect with you.</p></div><button onClick={onClose}><X/></button></header>{profile&&<form onSubmit={save}><div className="profile-photo-editor"><span>{profile.avatar_url?<img src={profile.avatar_url} alt="Profile"/>:initials(profile.display_name||profile.full_name)}</span><label><Camera/>{uploading?'Uploading…':'Add profile picture'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>upload(e.target.files?.[0])}/></label><small>JPG, PNG or WebP · Max 5 MB</small></div><label>Display name<input name="display_name" defaultValue={profile.display_name||profile.full_name}/></label><div className="form-row"><label>Country<input name="country" defaultValue={profile.country||''}/></label><label>Profile type<select name="profile_type" defaultValue={profile.profile_type}><option value="member">Community member</option><option value="healer">Healer / Therapist</option></select></label></div><label>About me<textarea name="about" defaultValue={profile.about} placeholder="Share a little about yourself…"/></label><label>Interests <small>Separate with commas</small><input name="interests" defaultValue={(profile.interests||[]).join(', ')}/></label><label>Healing specialties <small>For healers: meditation, mindfulness, emotional support…</small><input name="specialties" defaultValue={(profile.specialties||[]).join(', ')}/></label><button className="save-profile">{saved?'Saved ✓':'Save profile'}</button></form>}</section></div>
}

export function Notifications({userId,onClose}:{userId:string;onClose:()=>void}){
  const [items,setItems]=useState<Notice[]>([])
  const load=()=>supabase.from('notifications').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(30).then(({data})=>setItems((data as Notice[])||[]))
  useEffect(()=>{load();const c=supabase.channel(`notices-${userId}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${userId}`},()=>load()).subscribe();return()=>{supabase.removeChannel(c)}},[userId])
  async function open(n:Notice){await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',n.id);if(n.type==='friend_request'&&n.entity_id){await supabase.from('friendships').update({status:'accepted',updated_at:new Date().toISOString()}).eq('id',n.entity_id)}if(n.type==='video_invite'&&n.entity_id){await supabase.from('video_sessions').update({status:'active',started_at:new Date().toISOString()}).eq('id',n.entity_id);window.open(`https://meet.jit.si/NovaResort-${n.entity_id}`,'_blank','noopener,noreferrer')}load()}
  return <div className="feature-overlay"><section className="notification-window"><header><div><h2>Notifications</h2><p>Invitations and connection updates.</p></div><button onClick={onClose}><X/></button></header>{items.length===0?<div className="empty-state"><Bell/><h3>You’re all caught up</h3></div>:items.map(n=><button className={n.read_at?'notice read':'notice'} key={n.id} onClick={()=>open(n)}><span>{n.type==='video_invite'?<Video/>:<Heart/>}</span><div><b>{n.title}</b><p>{n.body}</p><small>{new Date(n.created_at).toLocaleString()}</small></div></button>)}</section></div>
}

export function SafetyCenter({onClose}:{onClose:()=>void}){
  return <div className="feature-overlay"><section className="profile-window safety-window"><header><div><h2>Community safety</h2><p>A warm community depends on clear, caring boundaries.</p></div><button onClick={onClose}><X/></button></header><div className="safety-content"><Heart/><h3>Respect every person</h3><p>No harassment, bullying, hate speech, discrimination, explicit content or spam.</p><h3>Protect privacy</h3><p>Keep private conversations confidential. Never share another member’s personal information.</p><h3>Wellness support, not emergency care</h3><p>Members and healers must not provide an unsupported medical diagnosis. If someone is in immediate danger, contact local emergency services.</p><h3>Report harmful behaviour</h3><p>Block or report anyone who makes you feel unsafe. Serious violations may lead to suspension.</p><button className="save-profile" onClick={onClose}>I understand</button></div></section></div>
}
