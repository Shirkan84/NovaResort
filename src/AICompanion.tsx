import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
type AiError = { code:string; message:string; requestId?:string; limitReached?:boolean }

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

const MAX_MESSAGE = 4000
const hashConversationId = () => {
  const value = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''))
  return value.startsWith('ai/') ? value.slice(3) : ''
}
const setAiRoute = (id?:string) => {
  const next = id ? `#ai/${id}` : '#ai'
  if (window.location.hash !== next) window.location.hash = next
}
const tempId = () => `local-${Date.now()}-${Math.random().toString(16).slice(2)}`

function escapeHtml(value:string) {
  return value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] || char))
}

function markdown(value:string) {
  const escaped = escapeHtml(value)
  return escaped
    .replace(/^### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^## (.*)$/gm, '<h3>$1</h3>')
    .replace(/^# (.*)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\s*[-*]\s+(.*)$/gm, '<p>- $1</p>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>')
}

function timeLabel(value:string) {
  return new Date(value).toLocaleString([], { dateStyle:'medium', timeStyle:'short' })
}

function normalizeError(data:any, error:any):AiError {
  if (data?.error?.message) return { code: data.error.code || 'EDGE_ERROR', message: data.error.message, requestId: data.error.requestId || data.requestId, limitReached: data.limitReached }
  if (typeof data?.error === 'string') return { code: data.code || 'EDGE_ERROR', message: data.error, requestId: data.requestId }
  if (error?.message?.includes('auth') || error?.message?.includes('401') || error?.message?.includes('expired')) {
    return { code: 'AUTH_EXPIRED', message: 'Your session has expired. Please sign in again.' }
  }
  if (error?.message) return { code: 'NETWORK_ERROR', message: error.message }
  return { code: 'UNKNOWN', message: 'Nova AI could not respond right now. Please try again.' }
}

function friendlyErrorMessage(err: AiError): string {
  switch (err.code) {
    case 'AUTH_EXPIRED': return 'Your session expired. Please sign in again.'
    case 'DAILY_LIMIT_REACHED': return err.message || 'You have reached the daily AI message limit.'
    case 'RATE_LIMITED': return err.message || 'Please wait a moment before sending another message.'
    case 'RATE_LIMITED_PROVIDER': return 'The AI service is busy. Please try again shortly.'
    case 'AI_NOT_CONFIGURED': return 'Nova AI is not connected yet. Please contact support.'
    case 'AI_SERVICE_NOT_CONFIGURED': return 'Nova AI is not configured on the server.'
    case 'AI_REQUEST_FAILED': return 'Nova AI could not respond right now. Please try again.'
    case 'NETWORK_ERROR': return 'Connection issue. Please check your internet and try again.'
    case 'AUTH_REQUIRED': return 'Please sign in to use Nova AI.'
    case 'MESSAGE_TOO_LONG': return err.message || 'Your message is too long.'
    case 'CONVERSATION_NOT_FOUND': return 'Conversation not found. Try creating a new one.'
    default: return err.message || 'Something went wrong. Please try again.'
  }
}

export function AICompanion({ userId, onClose }:{ userId:string; onClose:()=>void }) {
  const [conversations,setConversations]=useState<Conversation[]>([])
  const [messages,setMessages]=useState<AiMessage[]>([])
  const [active,setActive]=useState<Conversation|null>(null)
  const [query,setQuery]=useState('')
  const [draft,setDraft]=useState('')
  const [loadingList,setLoadingList]=useState(true)
  const [loadingMessages,setLoadingMessages]=useState(false)
  const [creating,setCreating]=useState(false)
  const [sending,setSending]=useState(false)
  const [notice,setNotice]=useState<AiError|null>(null)
  const [crisis,setCrisis]=useState(false)
  const [routeConversationId,setRouteConversationId]=useState(()=>hashConversationId())
  const [lastUserMessage,setLastUserMessage]=useState('')
  const noticeRef=useRef<HTMLDivElement>(null)
  const bottom=useRef<HTMLDivElement>(null)
  const listRef=useRef<HTMLDivElement>(null)
  const nearBottom=()=>{const el=listRef.current;return !el||el.scrollHeight-el.scrollTop-el.clientHeight<110}

  const loadConversations=useCallback(async()=>{
    setLoadingList(true)
    const { data,error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('last_message_at', { ascending:false })
      .limit(60)
    if (error) setNotice({code:'LOAD_CONVERSATIONS_FAILED',message:error.message})
    else setConversations((data as Conversation[]) || [])
    setLoadingList(false)
  },[userId])

  const loadMessages=useCallback(async(id:string,show=true)=>{
    if(show)setLoadingMessages(true)
    const { data,error } = await supabase
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', id)
      .is('deleted_at', null)
      .order('created_at', { ascending:true })
      .limit(160)
    if(error){setNotice({code:'LOAD_MESSAGES_FAILED',message:error.message});setMessages([])}
    else setMessages((data as AiMessage[]) || [])
    setLoadingMessages(false)
  },[])

  const openConversation=useCallback(async(id:string)=>{
    setNotice(null);setCrisis(false);setRouteConversationId(id)
    const cached=conversations.find(c=>c.id===id)
    if(cached){setActive(cached);loadMessages(id);return}
    const {data,error}=await supabase.from('ai_conversations').select('*').eq('id',id).eq('user_id',userId).is('deleted_at',null).single()
    if(error||!data){setActive(null);setMessages([]);setAiRoute();setNotice({code:'CONVERSATION_NOT_FOUND',message:'That AI conversation is not available.'});return}
    const row=data as Conversation
    setActive(row);setConversations(items=>items.some(c=>c.id===row.id)?items:[row,...items]);loadMessages(row.id)
  },[conversations,loadMessages,userId])

  useEffect(()=>{loadConversations()},[loadConversations])
  useEffect(()=>{
    const sync=()=>setRouteConversationId(hashConversationId())
    window.addEventListener('hashchange',sync)
    return()=>window.removeEventListener('hashchange',sync)
  },[])
  useEffect(()=>{
    if(routeConversationId) openConversation(routeConversationId)
    else {setActive(null);setMessages([]);setNotice(null)}
  },[routeConversationId,openConversation])
  useEffect(()=>{
    if(!active)return
    const channel=supabase.channel(`ai-${active.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'ai_messages',filter:`conversation_id=eq.${active.id}`},()=>loadMessages(active.id,false))
      .on('postgres_changes',{event:'*',schema:'public',table:'ai_conversations',filter:`id=eq.${active.id}`},()=>loadConversations())
      .subscribe()
    return()=>{supabase.removeChannel(channel)}
  },[active,loadMessages,loadConversations])
  useEffect(()=>{if(nearBottom())bottom.current?.scrollIntoView({behavior:'smooth'})},[messages,sending])
  useEffect(()=>{
    if(notice && noticeRef.current) noticeRef.current.focus()
  },[notice])

  const filtered=useMemo(()=>conversations.filter(c=>c.title.toLowerCase().includes(query.toLowerCase())),[conversations,query])
  const remaining=MAX_MESSAGE-draft.length

  async function createConversation(open=true) {
    if(creating)return active
    setCreating(true);setNotice(null)
    const { data, error } = await supabase.from('ai_conversations').insert({
      user_id:userId,
      title:'New AI conversation',
    }).select('*').single()
    setCreating(false)
    if(error){setNotice({code:'CREATE_FAILED',message:error.message});return null}
    const row=data as Conversation
    setConversations(items=>[row,...items.filter(item=>item.id!==row.id)])
    if(open){setActive(row);setMessages([]);setAiRoute(row.id)}
    return row
  }

  async function sendToAi(text:string,conversation=active,retryLast=false) {
    if(sending)return
    let current=conversation
    const body=text.trim()
    if(!current) current=await createConversation(true)
    if(!current)return
    if(!body && !retryLast)return
    if(body.length>MAX_MESSAGE){setNotice({code:'MESSAGE_TOO_LONG',message:`Please keep messages under ${MAX_MESSAGE.toLocaleString()} characters.`});return}
    setSending(true);setNotice(null);setCrisis(false)
    const optimisticId=tempId()
    if(!retryLast){
      setDraft('')
      setLastUserMessage(body)
      setMessages(items=>[...items,{id:optimisticId,conversation_id:current.id,user_id:userId,role:'user',content:body,created_at:new Date().toISOString(),deleted_at:null}])
    }
    const { data, error } = await supabase.functions.invoke('ai-companion', { body:{ conversationId:current.id, message:body, retryLast } })
    console.log('ai-companion response:', { hasData:!!data, hasError:!!error, crisis:data?.crisis, hasUserMsg:!!data?.userMessage, hasAssistantMsg:!!data?.assistantMessage, errorCode:data?.error?.code })
    if(error || data?.error){
      const normalized=normalizeError(data,error)
      setNotice(normalized)
      if(normalized.code==='AUTH_EXPIRED'){
        setSending(false)
        return
      }
      await loadMessages(current.id,false)
      setSending(false)
      return
    }
    setCrisis(Boolean(data.crisis))
    const srvUser=data?.userMessage as {id:string;role:string;content:string;created_at:string}|undefined
    const srvAssistant=data?.assistantMessage as {id:string;role:string;content:string;created_at:string}|undefined
    if(srvUser||srvAssistant){
      setMessages(prev=>{
        let next=[...prev]
        if(srvUser){
          const idx=next.findIndex(m=>m.id===optimisticId)
          if(idx>=0){next[idx]={...next[idx],id:srvUser.id,created_at:srvUser.created_at}}
          else{next.push({id:srvUser.id,conversation_id:current!.id,user_id:userId,role:'user',content:srvUser.content,created_at:srvUser.created_at,deleted_at:null})}
        }
        if(srvAssistant){
          const alreadyHas=next.some(m=>m.id===srvAssistant!.id)
          if(!alreadyHas) next.push({id:srvAssistant.id,conversation_id:current!.id,user_id:userId,role:'assistant',content:srvAssistant.content,created_at:srvAssistant.created_at,deleted_at:null})
        }
        return next
      })
    }
    await Promise.all([loadMessages(current.id,false),loadConversations()])
    setSending(false)
  }

  async function startFromPrompt(starter:string) {
    const conversation=active || await createConversation(true)
    if(conversation) await sendToAi(starter,conversation)
  }

  function submit(event:FormEvent) {
    event.preventDefault()
    sendToAi(draft,active)
  }

  function handleKeyDown(event:KeyboardEvent<HTMLTextAreaElement>) {
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendToAi(draft,active)}
  }

  async function renameConversation(conversation:Conversation) {
    const title=window.prompt('Rename AI conversation',conversation.title)?.trim()
    if(!title)return
    const { error }=await supabase.from('ai_conversations').update({title,updated_at:new Date().toISOString()}).eq('id',conversation.id).eq('user_id',userId)
    if(error)setNotice({code:'RENAME_FAILED',message:error.message});else{setActive({...conversation,title});loadConversations()}
  }

  async function deleteConversation(conversation:Conversation) {
    if(!window.confirm('Delete this AI conversation?'))return
    const { error }=await supabase.from('ai_conversations').update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',conversation.id).eq('user_id',userId)
    if(error)setNotice({code:'DELETE_FAILED',message:error.message});else{if(active?.id===conversation.id){setActive(null);setMessages([]);setAiRoute()}loadConversations()}
  }

  async function clearHistory() {
    if(!window.confirm('Delete all AI history? This cannot be undone.'))return
    const { error }=await supabase.from('ai_conversations').update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('user_id',userId).is('deleted_at',null)
    if(error)setNotice({code:'CLEAR_FAILED',message:error.message});else{setActive(null);setMessages([]);setAiRoute();loadConversations()}
  }

  const retryDisabled=sending||(!lastUserMessage&&messages.filter(m=>m.role==='user').length===0)

  return <div className="feature-overlay"><section className="ai-window">
    <aside className="ai-sidebar">
      <header><div><h2>AI Companion</h2><p>Private reflection with Nova AI.</p></div><button onClick={onClose} aria-label="Close AI Companion"><X/></button></header>
      <button className="ai-new" disabled={creating} onClick={()=>createConversation()}><Plus size={16}/> {creating?'Creating...':'New AI conversation'}</button>
      <label className="ai-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search AI conversations"/></label>
      <div className="ai-conversation-list">{loadingList?<p>Loading conversations...</p>:filtered.length===0?<p>No AI conversations yet.</p>:filtered.map(c=><button key={c.id} className={active?.id===c.id?'active':''} onClick={()=>setAiRoute(c.id)}><Bot size={17}/><span><b>{c.title}</b><small>Private AI conversation</small><em>{timeLabel(c.last_message_at)}</em></span></button>)}</div>
      <div className="ai-danger"><button className="ai-clear" onClick={clearHistory}><Trash2 size={14}/> Delete all AI history</button></div>
    </aside>
    <main className="ai-chat">
      {active ? <>
        <header><div className="ai-avatar"><Bot/></div><div><h2>{active.title}</h2><p>Nova AI Companion - AI-generated support</p></div><button aria-label="Rename conversation" onClick={()=>renameConversation(active)}><Edit3/></button><button aria-label="Delete conversation" onClick={()=>deleteConversation(active)}><Trash2/></button></header>
        {crisis&&<div className="ai-crisis"><AlertTriangle/><div><b>Emergency support</b><p>If there is immediate danger, contact local emergency services now and reach out to someone nearby. Nova AI is not emergency or professional care.</p></div></div>}
        <div className="ai-messages" ref={listRef}>{loadingMessages?<div className="ai-thinking">Loading messages...</div>:messages.length===0&&!sending?<div className="ai-empty"><Bot/><h3>Start gently</h3><p>Choose a starter below or write what you want to reflect on.</p><div className="starter-row">{starters.slice(0,4).map(starter=><button key={starter} onClick={()=>startFromPrompt(starter)}>{starter}</button>)}</div></div>:messages.map(m=><article key={m.id} className={m.role==='user'?'ai-message user':'ai-message assistant'}><span>{m.role==='user'?'You':'AI'}</span><div><div dangerouslySetInnerHTML={{__html:markdown(m.content)}}/><small>{timeLabel(m.created_at)}{m.role==='assistant'&&' - AI-generated'}{m.id.startsWith('local-')&&' - sending'}</small>{m.role==='assistant'&&<button onClick={()=>navigator.clipboard?.writeText(m.content)}><Copy size={13}/> Copy</button>}</div></article>)}{sending&&<div className="ai-thinking">Nova AI is reflecting...</div>}<div ref={bottom}/></div>
        <div className="ai-tools"><button onClick={()=>sendToAi('',active,true)} disabled={retryDisabled}><RefreshCw size={14}/> Retry response</button><button onClick={()=>setSending(false)} disabled={!sending}>Stop generation</button></div>
        <form className="ai-compose" onSubmit={submit}><textarea value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={handleKeyDown} maxLength={MAX_MESSAGE} placeholder="Write to Nova AI Companion..."/><button disabled={sending||!draft.trim()} aria-label="Send message"><Send size={16}/></button><small>{remaining.toLocaleString()} characters left</small></form>
        <div className="ai-notice"><ShieldCheck size={14}/> Nova AI can make mistakes and does not replace professional mental-health, medical, or emergency support.</div>
      </> : <div className="ai-starters"><div className="ai-hero"><div className="ai-avatar"><Bot/></div><h2>Nova AI Companion</h2><p>A private AI room for mindfulness, journaling, session preparation, and gentle reflection.</p></div><div className="starter-grid">{starters.map(starter=><button key={starter} disabled={creating||sending} onClick={()=>startFromPrompt(starter)}><MessageCircleMore size={16}/>{starter}</button>)}</div><div className="ai-privacy"><b>Privacy</b><p>AI conversations are private to you. Nova AI is not a verified healer and cannot access private messages, reports, blocked users, passwords, or unrelated personal data.</p></div></div>}
      {notice&&<div className="ai-error" role="alert" ref={noticeRef} tabIndex={-1}><b>{notice.code}</b><span>{friendlyErrorMessage(notice)}{notice.requestId?` (${notice.requestId.slice(0,8)})`:''}{notice.limitReached&&' Limit resets in 24 hours.'}</span><button className="ai-error-close" onClick={()=>setNotice(null)} aria-label="Dismiss error"><X size={12}/></button></div>}
    </main>
  </section></div>
}
