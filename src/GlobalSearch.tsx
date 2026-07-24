import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, X, CalendarDays, Headphones, User, ArrowRight, Loader2 } from 'lucide-react'
import { searchGlobal, type GlobalSearchResult } from './services/search'

type GroupedResults = {
  sessions: GlobalSearchResult[];
  podcasts: GlobalSearchResult[];
  healers: GlobalSearchResult[];
}

export function GlobalSearch({onClose,onSelect}:{onClose:()=>void;onSelect:(type:string,id:string)=>void}){
  const [query,setQuery]=useState('')
  const [results,setResults]=useState<GroupedResults>({sessions:[],podcasts:[],healers:[]})
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [activeIndex,setActiveIndex]=useState(-1)
  const inputRef=useRef<HTMLInputElement>(null)
  const debounceRef=useRef<ReturnType<typeof setTimeout>|null>(null)
  const listRef=useRef<HTMLDivElement>(null)

  const allResults=[...results.sessions,...results.podcasts,...results.healers]
  const totalResults=allResults.length

  const doSearch=useCallback(async(text:string)=>{
    if(!text.trim()){setResults({sessions:[],podcasts:[],healers:[]});return}
    setLoading(true);setError('')
    try{
      const data=await searchGlobal(text,15)
      const grouped:GroupedResults={sessions:[],podcasts:[],healers:[]}
      data.forEach(r=>{
        if(r.entity_type==='session')grouped.sessions.push(r)
        else if(r.entity_type==='podcast')grouped.podcasts.push(r)
        else if(r.entity_type==='healer')grouped.healers.push(r)
      })
      setResults(grouped)
    }catch(e:any){setError(e.message||'Search failed')}finally{setLoading(false)}
  },[])

  useEffect(()=>{
    if(debounceRef.current)clearTimeout(debounceRef.current)
    debounceRef.current=setTimeout(()=>doSearch(query),300)
    return()=>{if(debounceRef.current)clearTimeout(debounceRef.current)}
  },[query,doSearch])

  useEffect(()=>{inputRef.current?.focus()},[])

  useEffect(()=>{setActiveIndex(-1)},[query])

  function handleKeyDown(e:React.KeyboardEvent){
    if(e.key==='Escape'){onClose();return}
    if(e.key==='ArrowDown'){e.preventDefault();setActiveIndex(i=>Math.min(i+1,totalResults-1))}
    if(e.key==='ArrowUp'){e.preventDefault();setActiveIndex(i=>Math.max(i-1,-1))}
    if(e.key==='Enter'&&activeIndex>=0&&activeIndex<allResults.length){
      const r=allResults[activeIndex];onSelect(r.entity_type,r.id)
    }
  }

  function getIcon(type:string){
    if(type==='session')return <CalendarDays size={14}/>
    if(type==='podcast')return <Headphones size={14}/>
    return <User size={14}/>
  }
  function getLabel(type:string){
    if(type==='session')return 'Sessions'
    if(type==='podcast')return 'Podcasts'
    return 'Healers'
  }

  let idx=-1

  return <div className="gs-overlay" onClick={onClose}>
    <div className="gs-modal" onClick={e=>e.stopPropagation()} onKeyDown={handleKeyDown}>
      <div className="gs-search-bar">
        <Search size={18}/>
        <input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search healers, sessions, podcasts…" aria-label="Global search"/>
        {query&&<button className="gs-clear" onClick={()=>{setQuery('');inputRef.current?.focus()}}><X size={16}/></button>}
        <button className="gs-close" onClick={onClose}>Esc</button>
      </div>
      <div className="gs-results" ref={listRef}>
        {loading&&<div className="gs-loading"><Loader2 size={18} className="spin"/><span>Searching…</span></div>}
        {!loading&&error&&<div className="gs-empty">{error}</div>}
        {!loading&&!error&&query&&totalResults===0&&<div className="gs-empty"><p>No results found for "{query}"</p><p className="gs-empty-hint">Try different keywords or check spelling</p></div>}
        {!loading&&!error&&totalResults>0&&<>{(['sessions','podcasts','healers'] as const).map(type=>{
          const items=results[type]
          if(items.length===0)return null
          return <div key={type} className="gs-group">
            <div className="gs-group-header"><span>{getLabel(type)}</span><span className="gs-group-count">{items.length}</span></div>
            {items.map((r:GlobalSearchResult)=>{
              idx++
              const isActive=idx===activeIndex
              return <button key={r.id} className={`gs-result ${isActive?'active':''}`}
                onClick={()=>onSelect(r.entity_type,r.id)}
                onMouseEnter={()=>setActiveIndex(idx)}
                data-index={idx}>
                <div className="gs-result-icon">{r.image_url?<img src={r.image_url} alt=""/>:getIcon(r.entity_type)}</div>
                <div className="gs-result-info">
                  <div className="gs-result-title">{r.title}{r.badge&&<span className={`gs-badge ${r.badge==='LIVE'?'live':r.badge==='Verified'?'verified':''}`}>{r.badge}</span>}</div>
                  <div className="gs-result-subtitle">{r.subtitle}</div>
                </div>
                <ArrowRight size={14} className="gs-result-arrow"/>
              </button>
            })}
          </div>
        })}</>}
        {!loading&&!error&&!query&&<div className="gs-empty"><p className="gs-empty-hint">Type to search across healers, sessions, and podcasts</p></div>}
      </div>
    </div>
  </div>
}
