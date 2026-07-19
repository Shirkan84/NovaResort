import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bot, Copy, Edit3, MessageCircleMore, Plus, RefreshCw, Search, Send, ShieldCheck, Trash2, X } from 'lucide-react'
import { supabase } from './supabase'
import './ai-companion.css'

type Conversation = {
  id:string; user_id:string; title:string; use_profile_context:boolean;
  created_at:string; updated_at:string; last_message_at:string; deleted_at:string|null
}
type AiMessage = {
  id:string; conversation_id:string; user_id:string; role:'user'|'assistant'|'system';
  content:string; created_at:string; deleted_at:string|null
}

const starters = [
  'Talk through what is on my mind',
  'Guide me through a breathing exercise',
  'Create a mindfulness practice',
  'Help me prepare for a therapy or coaching session',
  'Give me journaling questions',
  'Help me set personal-growth goals',
  'Find useful Nova Resort rooms',
  'Find a suitable verified healer',
  'Reflect on my week',
]

function escapeHtml(value:string) {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] || char))
}

function markdown(value:string) {
  const escaped = escapeHtml(value)
  return escaped
    .replace(/^### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*)$/gm, '<h4>$1</h4>')
    .replace(/^# (.*)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\s*[-*]\s+(.*)$/gm, '<p>• $1</p>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>')
}

function timeLabel(value:string) {
  return new Date(value).toLocaleString([], { dateStyle:'medium', timeStyle:'short' })
}

export function AICompanion({ userId, onClose }:{ userId:string; onClose:()=>void }) {
  const [conversations,setConversations]=useState<Conversation[]>([])
  const [messages,setMessages]=useState<AiMessage[]>([])
  const [active,setActive]=useState<Conversation|null>(null)
  const [query,setQuery]=useState('')
  const [draft,setDraft]=useState('')
  const [loading,setLoading]=useState(true)
  const [sending,setSending]=useState(false)
  const [notice,setNotice]=useState('')
  const [crisis,setCrisis]=useState(false)
  const [localStream,setLocalStream]=useState('')
  const cancelled=useRef(false)
  const bottom=useRef<HTMLDivElement>(null)

  const loadConversations=useCallback(async()=>{
    const { data } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('last_message_at', { ascending:false })
      .limit(60)
    setConversations((data as Conversation[]) || [])
    setLoading(false)
  },[userId])

  const loadMessages=useCallback(async(id:string)=>{
    const { data } = await supabase
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending:true })
      .limit(160)
    setMessages((data as AiMessage[]) || [])
  },[])

  useEffect(()=>{loadConversations()},[loadConversations])
  useEffect(()=>{
    if(!active)return
    loadMessages(active.id)
    const channel=supabase.channel(`ai-${active.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'ai_messages',filter:`conversation_id=eq.${active.id}`},()=>loadMessages(active.id))
      .subscribe()
    return()=>{supabase.removeChannel(channel)}
  },[active,loadMessages])
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'})},[messages,localStream])

  const filtered=useMemo(()=>conversations.filter(c=>c.title.toLowerCase().includes(query.toLowerCase())),[conversations,query])
  const previews=useMemo(()=>new Map(conversations.map(c=>{
    const related=messages.filter(m=>m.conversation_id===c.id)
    return [c.id, related[related.length-1]?.content || 'Private AI conversation']
  })),[conversations,messages])

  async function createConversation(starter?:string) {
    const { data, error } = await supabase.from('ai_conversations').insert({
      user_id:userId,
      title:starter ? starter.slice(0,80) : 'New AI conversation',
    }).select('*').single()
    if(error){setNotice(error.message);return null}
    const row=data as Conversation
    setActive(row)
    setConversations(items=>[row,...items])
    setMessages([])
    if(starter) await sendToAi(starter,row)
    return row
  }

  async function sendToAi(text:string,conversation=active,retryLast=false) {
    if(!conversation || sending)return
    const body=text.trim()
    if(!body && !retryLast)return
    if(body.length>4000){setNotice('Please keep AI messages under 4,000 characters.');return}
    cancelled.current=false
    setSending(true);setNotice('');setCrisis(false);setLocalStream('')
    if(!retryLast){
      setDraft('')
      setMessages(items=>[...items,{id:`local-${Date.now()}`,conversation_id:conversation.id,user_id:userId,role:'user',content:body,created_at:new Date().toISOString(),deleted_at:null}])
    }
    const { data, error } = await supabase.functions.invoke('ai-chat', { body:{ conversationId:conversation.id, message:body, retryLast } })
    if(cancelled.current){setSending(false);return}
    if(error || data?.error){setNotice(data?.error || error?.message || 'Nova AI could not respond.');setSending(false);return}
    const content=String(data.message?.content || '')
    for(let i=0;i<=content.length;i+=8){
      if(cancelled.current)break
      setLocalStream(content.slice(0,i))
      await new Promise(resolve=>setTimeout(resolve,14))
    }
    setLocalStream('')
    setCrisis(Boolean(data.crisis))
    await Promise.all([loadMessages(conversation.id),loadConversations()])
    setSending(false)
  }

  function submit(event:FormEvent) {
    event.preventDefault()
    if(active) sendToAi(draft,active)
    else createConversation(draft || 'Talk through what is on my mind')
  }

  async function renameConversation(conversation:Conversation) {
    const title=window.prompt('Rename AI conversation',conversation.title)?.trim()
    if(!title)return
    const { error }=await supabase.from('ai_conversations').update({title,updated_at:new Date().toISOString()}).eq('id',conversation.id)
    if(error)setNotice(error.message);else loadConversations()
  }

  async function deleteConversation(conversation:Conversation) {
    if(!window.confirm('Delete this AI conversation?'))return
    const { error }=await supabase.from('ai_conversations').update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',conversation.id)
    if(error)setNotice(error.message);else{if(active?.id===conversation.id){setActive(null);setMessages([])}loadConversations()}
  }

  async function clearHistory() {
    if(!window.confirm('Delete all AI history?'))return
    const { error }=await supabase.from('ai_conversations').update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('user_id',userId).is('deleted_at',null)
    if(error)setNotice(error.message);else{setActive(null);setMessages([]);loadConversations()}
  }

  return <div className="feature-overlay"><section className="ai-window">
    <aside className="ai-sidebar">
      <header><div><h2>AI Companion</h2><p>Private reflection with Nova AI.</p></div><button onClick={onClose}><X/></button></header>
      <button className="ai-new" onClick={()=>createConversation()}><Plus size={16}/> New AI conversation</button>
      <label className="ai-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search AI conversations"/></label>
      <div className="ai-conversation-list">{loading?<p>Loading...</p>:filtered.length===0?<p>No AI conversations yet.</p>:filtered.map(c=><button key={c.id} className={active?.id===c.id?'active':''} onClick={()=>setActive(c)}><Bot size={17}/><span><b>{c.title}</b><small>{previews.get(c.id)}</small><em>{timeLabel(c.last_message_at)}</em></span></button>)}</div>
      <button className="ai-clear" onClick={clearHistory}><Trash2 size={14}/> Delete all AI history</button>
    </aside>
    <main className="ai-chat">
      {active ? <>
        <header><div className="ai-avatar"><Bot/></div><div><h2>{active.title}</h2><p>Nova AI Companion · AI-generated support</p></div><button onClick={()=>renameConversation(active)}><Edit3/></button><button onClick={()=>deleteConversation(active)}><Trash2/></button></header>
        {crisis&&<div className="ai-crisis"><AlertTriangle/><div><b>Emergency support</b><p>If there is immediate danger, contact local emergency services now and reach out to someone nearby. AI detection can make mistakes and is not a substitute for human help.</p></div></div>}
        <div className="ai-messages">{messages.length===0&&!sending?<div className="ai-empty"><Bot/><h3>Start gently</h3><p>Choose a starter or write what you want to reflect on.</p></div>:messages.map(m=><article key={m.id} className={m.role==='user'?'ai-message user':'ai-message assistant'}><span>{m.role==='user'?'You':'AI'}</span><div><div dangerouslySetInnerHTML={{__html:markdown(m.content)}}/><small>{timeLabel(m.created_at)}{m.role==='assistant'&&' · AI-generated'}</small>{m.role==='assistant'&&<button onClick={()=>navigator.clipboard?.writeText(m.content)}><Copy size={13}/> Copy</button>}</div></article>)}{localStream&&<article className="ai-message assistant streaming"><span>AI</span><div><div dangerouslySetInnerHTML={{__html:markdown(localStream)}}/><small>Writing...</small></div></article>}{sending&&!localStream&&<div className="ai-thinking">Nova AI is reflecting...</div>}<div ref={bottom}/></div>
        <div className="ai-tools"><button onClick={()=>sendToAi('',active,true)} disabled={sending||messages.length===0}><RefreshCw size={14}/> Retry response</button><button onClick={()=>{cancelled.current=true;setSending(false);setLocalStream('')}} disabled={!sending}>Stop generation</button></div>
        <form className="ai-compose" onSubmit={submit}><textarea value={draft} onChange={e=>setDraft(e.target.value)} maxLength={4000} placeholder="Write to Nova AI Companion..."/><button disabled={sending||!draft.trim()}><Send size={16}/></button></form>
        <div className="ai-notice"><ShieldCheck size={14}/> Nova AI can make mistakes and does not replace professional mental-health or medical support. OpenAI API billing is separate from ChatGPT Plus.</div>
      </> : <div className="ai-starters"><div className="ai-hero"><div className="ai-avatar"><Bot/></div><h2>Nova AI Companion</h2><p>A private AI room for mindfulness, journaling, session preparation, and gentle reflection.</p></div><div className="starter-grid">{starters.map(starter=><button key={starter} onClick={()=>createConversation(starter)}><MessageCircleMore size={16}/>{starter}</button>)}</div><div className="ai-privacy"><b>Privacy</b><p>AI conversations are private to you. Nova AI is not a verified healer and cannot access private messages, reports, blocked users, passwords, or personal data unless a future opt-in explicitly sends limited context.</p></div></div>}
      {notice&&<div className="ai-error">{notice}</div>}
    </main>
  </section></div>
}
