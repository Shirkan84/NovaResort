import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Camera, Check, ChevronLeft, Heart, MessageCircleMore, Send, UsersRound, Video, X } from 'lucide-react'
import { supabase } from './supabase'
import './community-lobby.css'

export type DbRoom = { id:string; name:string; description:string; icon:string; theme:string; is_private:boolean; tags?:string[]; total_members?:number; online_members?:number; pinned_message?:string|null; last_activity?:string|null }
type Profile = { id:string; full_name:string; display_name:string|null; avatar_url:string|null; country:string|null; profile_type:string; about:string; interests:string[]; specialties:string[]; online:boolean }
type Message = { id:string; body:string; sender_id:string; created_at:string; edited_at?:string|null; reply_to?:string|null; pinned?:boolean; profiles?:{full_name:string;avatar_url:string|null}|null }
type Reaction = { message_id:string; emoji:string; user_id:string }
type Notice = { id:string; type:string; title:string; body:string|null; entity_id:string|null; read_at:string|null; created_at:string }
type Friendship = { id:string; requester_id:string; addressee_id:string; status:string; created_at:string; updated_at:string }
type BlockedUser = { blocked_id:string; profiles?:Profile|null }

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

function connectionFor(personId:string, friendships:Friendship[]) {
  return friendships.find(f => f.requester_id === personId || f.addressee_id === personId)
}

function connectionState(userId:string, personId:string, friendships:Friendship[], blocked:string[]) {
  if (blocked.includes(personId)) return 'blocked'
  const connection = connectionFor(personId, friendships)
  if (!connection) return 'none'
  if (connection.status === 'accepted') return 'accepted'
  if (connection.status === 'pending' && connection.requester_id === userId) return 'sent'
  if (connection.status === 'pending' && connection.addres_id === userId) return 'incoming'
  return 'none'
}

function ConnectButton({userId,person,friendships,blocked,onChanged}:{userId:string;person:Profile;friendships:Friendship[];blocked:string[];onChanged:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const relationship=connectionFor(person.id,friendships)
  const state=connectionState(userId,person.id,friendships,blocked)
  async function run(action:()=>any) {
    setBusy(true);setError('')
    const result=await action()
    setBusy(false)
    if(result?.error)setError(result.error.message || 'Connect action failed.')
    else onChanged()
  }
  if(person.id===userId)return <button disabled>Connect unavailable</button>
  if(state==='blocked')return <button disabled>Blocked</button>
  return <span className="connect-control">{state==='none'&&<button disabled={busy} onClick={()=>run(()=>supabase.rpc('send_connection_request',{other_user:person.id}))}>{busy?'Sending…':'Connect'}</button>}{state==='sent'&&<button disabled={busy||!relationship} onClick={()=>relationship&&run(()=>supabase.rpc('cancel_connection_request',{request_id:relationship.id}))}>Request sent</button>}{state==='incoming'&&<><button disabled={busy||!relationship} onClick={()=>relationship&&run(()=>supabase.rpc('respond_connection_request',{request_id:relationship.id,next_status:'accepted'}))}>Accept connection</button><button disabled={busy||!relationship} onClick={()=>relationship&&run(()=>supabase.rpc('respond_connection_request',{request_id:relationship.id,next_status:'declined'}))}>Decline</button></>}{state==='accepted'&&<button disabled={busy||!relationship} onClick={()=>relationship&&window.confirm('Remove this connection?')&&run(()=>supabase.rpc('remove_connection',{request_id:relationship.id}))}>Connected</button>}{error&&<small>{error}</small>}</span>
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
