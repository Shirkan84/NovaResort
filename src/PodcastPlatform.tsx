import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeCheck, Bookmark, ChevronLeft, ChevronRight, Headphones, Heart, Mic, Pause,
  Play, Plus, Radio, Search, Send, Share2, ShieldAlert, SkipBack, SkipForward, Upload, Volume2, X
} from 'lucide-react'
import { supabase } from './supabase'
import './podcasts.css'

type Podcast = {
  id:string; title:string; slug:string; short_description:string; description:string; cover_image_url:string|null;
  category:string; language:string; creator_id:string; creator_name:string; creator_avatar_url:string|null;
  professional_title:string|null; verified:boolean; follower_count:number; episode_count:number; total_plays:number;
  latest_episode_id:string|null; latest_episode_title:string|null; latest_episode_published_at:string|null;
  tags:string[]; popularity_score:number; total_count:number; status?:string; visibility?:string
}
type Episode = {
  id:string; podcast_id:string; title:string; description:string; episode_number:number; season_number:number|null;
  audio_path:string|null; audio_url:string|null; audio_duration_seconds:number; cover_image_url:string|null;
  visibility:string; status:string; published_at:string|null; comments_enabled:boolean; reactions_enabled:boolean;
  transcript:string|null; saved:boolean; listen_position_seconds:number; tags:string[]; total_count:number
}
type ProfilePodcast = Pick<Podcast,'id'|'title'|'short_description'|'cover_image_url'|'follower_count'|'episode_count'|'total_plays'|'latest_episode_title'|'tags'>
export type PlayerEpisode = Episode & { podcast_title:string; creator_name:string }
type Comment = { id:string; body:string; created_at:string; user_id:string; profiles?:any }
type CreatorStatus = { eligible:boolean; profile_type?:string; professional_verification_status?:string; profile?:{display_name:string|null;full_name:string}|null }

const categories = ['all','Mindfulness','Meditation','Emotional Healing','Personal Coaching','Relationships','Stress Management','Anxiety Support','Self Growth','Breathwork','Sleep','Confidence','Parenting','Grief','Trauma Awareness','Wellness Education','Spiritual Growth','Motivation','Healthy Habits']
const speeds = [0.75, 1, 1.25, 1.5, 2]
const initials = (name?:string|null) => (name || 'N').split(' ').map(part => part[0]).join('').slice(0,2).toUpperCase()
const duration = (seconds?:number|null) => {
  const value = Math.max(seconds || 0, 0), h = Math.floor(value / 3600), m = Math.floor((value % 3600) / 60), s = value % 60
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`
}
const slugify = (value:string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80) || `podcast-${Date.now()}`

function Cover({ src, title }:{src?:string|null; title:string}) {
  return <span className="podcast-cover">{src ? <img src={src} alt={`${title} cover`}/> : <Headphones aria-hidden="true"/>}</span>
}

function Creator({ podcast, onOpenProfile }:{podcast:Podcast; onOpenProfile:(id:string)=>void}) {
  return <button className="podcast-creator" onClick={() => onOpenProfile(podcast.creator_id)}>
    <span>{podcast.creator_avatar_url ? <img src={podcast.creator_avatar_url} alt=""/> : initials(podcast.creator_name)}</span>
    <b>{podcast.creator_name}</b>
    {podcast.verified && <BadgeCheck size={14}/>}
  </button>
}

function PodcastCard({ podcast, onOpen, onPlay, onOpenProfile }:{
  podcast:Podcast; onOpen:(id:string)=>void; onPlay:(podcast:Podcast)=>void; onOpenProfile:(id:string)=>void
}) {
  return <article className="podcast-card">
    <Cover src={podcast.cover_image_url} title={podcast.title}/>
    <div className="podcast-card-body">
      <div className="podcast-meta-line"><span>{podcast.category}</span><span>{podcast.language}</span></div>
      <button className="podcast-title-button" onClick={() => onOpen(podcast.id)}>{podcast.title}</button>
      <p>{podcast.short_description || podcast.description || 'This creator has not added a podcast description yet.'}</p>
      <Creator podcast={podcast} onOpenProfile={onOpenProfile}/>
      <div className="podcast-tags">{podcast.tags.slice(0,3).map(tag => <button key={tag} onClick={() => onOpen(podcast.id)}>{tag}</button>)}</div>
      <div className="podcast-stats"><span>{podcast.follower_count} followers</span><span>{podcast.total_plays} plays</span><span>{podcast.episode_count} episodes</span></div>
      <div className="podcast-actions">
        <button onClick={() => onPlay(podcast)} disabled={!podcast.latest_episode_id}><Play size={14}/> Play latest</button>
        <button onClick={() => onOpen(podcast.id)}>View podcast <ChevronRight size={14}/></button>
      </div>
    </div>
  </article>
}

export function PopularPodcastsStrip({ onOpenPodcast, onPlayEpisode, onOpenProfile }:{
  onOpenPodcast:(id:string)=>void; onPlayEpisode:(episode:PlayerEpisode)=>void; onOpenProfile:(id:string)=>void
}) {
  const [items,setItems]=useState<Podcast[]>([])
  const [loading,setLoading]=useState(true)
  const rail=useRef<HTMLDivElement|null>(null)
  useEffect(()=>{let live=true;supabase.rpc('search_podcasts',{search_text:'',category_filter:'all',language_filter:'all',tag_filter:'all',sort_by:'popular',page_limit:10,page_offset:0}).then(({data})=>{if(live){setItems((data as Podcast[])||[]);setLoading(false)}});return()=>{live=false}},[])
  const playLatest=async(podcast:Podcast)=>{if(!podcast.latest_episode_id)return;const {data}=await supabase.rpc('list_podcast_episodes',{podcast_ref:podcast.id,page_limit:1,page_offset:0});const ep=((data as Episode[])||[]).find(e=>e.id===podcast.latest_episode_id)||((data as Episode[])||[])[0];if(ep)onPlayEpisode({...ep,podcast_title:podcast.title,creator_name:podcast.creator_name})}
  if (loading) return <section className="podcast-home"><div className="section-head"><div><h2>Popular Podcasts</h2><p>Loading trusted creator audio...</p></div></div><div className="podcast-rail"><article className="podcast-card skeleton"/></div></section>
  return <section className="podcast-home">
    <div className="section-head"><div><button className="section-title-link" onClick={()=>onOpenPodcast('')}><h2>Popular Podcasts</h2></button><p>Listen to trusted healers, coaches, and mindfulness professionals from the Nova Resort community.</p></div><button onClick={()=>onOpenPodcast('')}>View all podcasts <ChevronRight size={16}/></button></div>
    {items.length === 0 ? <div className="inline-empty">No published podcasts yet. Approved professionals can publish from Podcast Studio.</div> : <div className="podcast-strip-wrap">
      <button aria-label="Previous podcasts" onClick={()=>rail.current?.scrollBy({left:-340,behavior:'smooth'})}><ChevronLeft/></button>
      <div className="podcast-rail" ref={rail} tabIndex={0}>{items.map(item => <PodcastCard key={item.id} podcast={item} onOpen={onOpenPodcast} onPlay={playLatest} onOpenProfile={onOpenProfile}/>)}</div>
      <button aria-label="Next podcasts" onClick={()=>rail.current?.scrollBy({left:340,behavior:'smooth'})}><ChevronRight/></button>
    </div>}
  </section>
}

export function PodcastMiniPlayer({ episode, onClose }:{episode:PlayerEpisode|null; onClose:()=>void}) {
  const audio=useRef<HTMLAudioElement|null>(null)
  const [playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[durationState,setDurationState]=useState(0),[speed,setSpeed]=useState(1),[muted,setMuted]=useState(false)
  useEffect(()=>{if(audio.current){audio.current.playbackRate=speed;audio.current.muted=muted}},[speed,muted])
  useEffect(()=>{setPlaying(false);setPosition(episode?.listen_position_seconds||0)},[episode?.id])
  if(!episode)return null
  const src=episode.audio_url || ''
  const saveProgress=()=>supabase.rpc('record_podcast_play',{episode_ref:episode.id,position_seconds:Math.floor(position),duration_seconds:Math.floor(durationState||episode.audio_duration_seconds||0)})
  return <aside className="podcast-player" aria-label="Podcast player">
    <audio ref={audio} src={src} onLoadedMetadata={e=>{setDurationState(Math.floor(e.currentTarget.duration||episode.audio_duration_seconds||0));if(episode.listen_position_seconds)e.currentTarget.currentTime=episode.listen_position_seconds}} onTimeUpdate={e=>setPosition(Math.floor(e.currentTarget.currentTime))} onPause={saveProgress} onEnded={()=>{setPlaying(false);saveProgress()}}/>
    <button aria-label={playing?'Pause episode':'Play episode'} disabled={!src} onClick={()=>{if(!audio.current)return;if(playing){audio.current.pause();setPlaying(false)}else{audio.current.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false))}}}>{playing?<Pause/>:<Play/>}</button>
    <div><b>{episode.title}</b><span>{episode.podcast_title} by {episode.creator_name}</span><input aria-label="Seek podcast" type="range" min={0} max={durationState||episode.audio_duration_seconds||1} value={position} onChange={e=>{const next=Number(e.target.value);setPosition(next);if(audio.current)audio.current.currentTime=next}}/><small>{duration(position)} / {duration(durationState||episode.audio_duration_seconds)}</small></div>
    <button aria-label="Skip back 15 seconds" onClick={()=>{if(audio.current)audio.current.currentTime=Math.max(0,audio.current.currentTime-15)}}><SkipBack/></button>
    <button aria-label="Skip forward 30 seconds" onClick={()=>{if(audio.current)audio.current.currentTime=Math.min(durationState||999999,audio.current.currentTime+30)}}><SkipForward/></button>
    <select aria-label="Playback speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{speeds.map(item=><option key={item} value={item}>{item}x</option>)}</select>
    <button aria-label={muted?'Unmute':'Mute'} onClick={()=>setMuted(!muted)}><Volume2/></button>
    <button aria-label="Close player" onClick={onClose}><X/></button>
  </aside>
}

function EpisodeList({ podcast, onPlay, selectedEpisodeId }:{podcast:Podcast; onPlay:(episode:PlayerEpisode)=>void; selectedEpisodeId?:string|null}) {
  const [episodes,setEpisodes]=useState<Episode[]>([]),[loading,setLoading]=useState(true),[comments,setComments]=useState<Comment[]>([]),[comment,setComment]=useState('')
  const selected=episodes.find(e=>e.id===selectedEpisodeId) || episodes[0]
  const load=useCallback(()=>{setLoading(true);supabase.rpc('list_podcast_episodes',{podcast_ref:podcast.id,page_limit:20,page_offset:0}).then(({data})=>{setEpisodes((data as Episode[])||[]);setLoading(false)})},[podcast.id])
  useEffect(()=>{load()},[load])
  useEffect(()=>{if(!selected?.comments_enabled)return;supabase.from('podcast_comments').select('id,body,created_at,user_id,profiles(display_name,full_name,avatar_url)').eq('episode_id',selected.id).is('deleted_at',null).order('created_at',{ascending:true}).limit(50).then(({data})=>setComments((data as unknown as Comment[])||[]))},[selected?.id,selected?.comments_enabled])
  async function save(ep:Episode){await supabase.from('podcast_episode_saves').upsert({episode_id:ep.id,user_id:(await supabase.auth.getUser()).data.user?.id});load()}
  async function react(ep:Episode){await supabase.from('podcast_reactions').upsert({episode_id:ep.id,user_id:(await supabase.auth.getUser()).data.user?.id,reaction:'supportive'})}
  async function report(ep:Episode){const reason=window.prompt('Report category or concern');if(reason)await supabase.from('podcast_reports').insert({episode_id:ep.id,reporter_id:(await supabase.auth.getUser()).data.user?.id,reason})}
  async function addComment(event:FormEvent){event.preventDefault();if(!selected||!comment.trim())return;await supabase.from('podcast_comments').insert({episode_id:selected.id,user_id:(await supabase.auth.getUser()).data.user?.id,body:comment.trim()});setComment('');supabase.from('podcast_comments').select('id,body,created_at,user_id,profiles(display_name,full_name,avatar_url)').eq('episode_id',selected.id).is('deleted_at',null).order('created_at',{ascending:true}).limit(50).then(({data})=>setComments((data as unknown as Comment[])||[]))}
  if(loading)return <div className="empty-state">Loading episodes...</div>
  if(episodes.length===0)return <div className="empty-state"><Radio/><h3>No published episodes yet</h3><p>Drafts and restricted episodes are hidden unless you have access.</p></div>
  return <div className="episode-layout">
    <div className="episode-list">{episodes.map(ep=><article key={ep.id} className={selected?.id===ep.id?'active':''}>
      <button onClick={()=>onPlay({...ep,podcast_title:podcast.title,creator_name:podcast.creator_name})}><Play size={14}/> Play</button>
      <div><h3>{ep.title}</h3><p>{ep.description}</p><small>{ep.published_at ? new Date(ep.published_at).toLocaleDateString() : 'Published'} - {duration(ep.audio_duration_seconds)} - {ep.visibility}</small><div className="podcast-tags">{ep.tags.map(tag=><span key={tag}>{tag}</span>)}</div></div>
      <button title="Save episode" onClick={()=>save(ep)}><Bookmark size={15}/></button><button title="Share episode" onClick={()=>navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/podcasts/${podcast.id}/episodes/${ep.id}`)}><Share2 size={15}/></button><button title="Report episode" onClick={()=>report(ep)}><ShieldAlert size={15}/></button>
    </article>)}</div>
    {selected && <section className="episode-detail">
      <h3>{selected.title}</h3><p>{selected.description}</p><div className="episode-tools"><button onClick={()=>onPlay({...selected,podcast_title:podcast.title,creator_name:podcast.creator_name})}><Play size={14}/> Play episode</button>{selected.reactions_enabled&&<button onClick={()=>react(selected)}><Heart size={14}/> React</button>}</div>
      {selected.transcript && <details><summary>Transcript</summary><p>{selected.transcript}</p></details>}
      {selected.comments_enabled ? <form className="comment-form" onSubmit={addComment}><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a calm, respectful comment"/><button><Send size={14}/> Comment</button></form> : <p className="muted">Comments are disabled for this episode.</p>}
      {selected.comments_enabled && <div className="comment-list">{comments.map(c=><article key={c.id}><b>{c.profiles?.display_name||c.profiles?.full_name||'Nova member'}</b><p>{c.body}</p><time>{new Date(c.created_at).toLocaleString()}</time></article>)}</div>}
    </section>}
  </div>
}

function PodcastStudio({ userId }:{userId:string}) {
  const [status,setStatus]=useState<CreatorStatus|null>(null),[podcasts,setPodcasts]=useState<Podcast[]>([]),[message,setMessage]=useState(''),[recording,setRecording]=useState(false),[recordedUrl,setRecordedUrl]=useState(''),recorder=useRef<MediaRecorder|null>(null),chunks=useRef<Blob[]>([])
  const load=useCallback(async()=>{const [{data:eligible},{data:profile},{data:list}]=await Promise.all([supabase.rpc('is_approved_podcast_creator',{check_user:userId}),supabase.from('profiles').select('display_name,full_name,profile_type,professional_verification_status').eq('id',userId).single(),supabase.from('podcasts').select('*').eq('creator_id',userId).order('updated_at',{ascending:false})]);setStatus({eligible:Boolean(eligible),...(profile as any)});setPodcasts(((list as any[])||[]).map(p=>({...p,creator_id:userId,creator_name:profile?.display_name||profile?.full_name||'You',creator_avatar_url:null,verified:profile?.professional_verification_status==='approved',follower_count:0,episode_count:0,total_plays:0,tags:[],popularity_score:0,total_count:0})))},[userId])
  useEffect(()=>{load()},[load])
  async function createPodcast(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget), title=String(form.get('title')||'');const {error}=await supabase.from('podcasts').insert({creator_id:userId,title,slug:slugify(title),short_description:String(form.get('short_description')||''),description:String(form.get('description')||''),category:String(form.get('category')||'Wellness Education'),language:String(form.get('language')||'English'),visibility:String(form.get('visibility')||'public'),status:'draft',professional_disclaimer_accepted:Boolean(form.get('disclaimer')),rights_confirmed:Boolean(form.get('rights'))});setMessage(error?error.message:'Podcast draft created.');if(!error)(event.currentTarget as HTMLFormElement).reset();load()}
  async function uploadAudio(file:File,podcastId:string){if(!file)return;const ok=['audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/aac','audio/x-m4a'].includes(file.type);if(!ok){setMessage('Unsupported audio type. Use MP3, M4A, WAV, WebM, or AAC.');return}const path=`${userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'')}`;const {error}=await supabase.storage.from('podcast-audio').upload(path,file);if(error){setMessage(error.message);return}await supabase.from('podcast_episodes').insert({podcast_id:podcastId,creator_id:userId,title:file.name.replace(/\.[^.]+$/,''),description:'',audio_path:path,audio_url:'',status:'draft',visibility:'public'});setMessage('Audio uploaded and saved as an episode draft.');load()}
  async function startRecording(){try{if(!navigator.mediaDevices||!window.MediaRecorder){setMessage('Browser recording is not supported here.');return}const stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks.current=[];recorder.current=new MediaRecorder(stream);recorder.current.ondataavailable=e=>chunks.current.push(e.data);recorder.current.onstop=()=>{const blob=new Blob(chunks.current,{type:'audio/webm'});setRecordedUrl(URL.createObjectURL(blob));stream.getTracks().forEach(track=>track.stop())};recorder.current.start();setRecording(true);setMessage('Recording...')}catch(error){setMessage(error instanceof Error?error.message:'Microphone permission was denied.')}}
  function stopRecording(){recorder.current?.stop();setRecording(false);setMessage('Recording stopped. Preview it, then upload the file from your device or publish after processing.')}
  if(!status)return <div className="empty-state">Checking creator status...</div>
  if(!status.eligible)return <div className="podcast-studio-denied"><ShieldAlert/><h3>Podcast Studio is for approved professionals</h3><p>Your profile must be an approved healer, therapist, coach, mindfulness teacher, wellness professional, or community facilitator before creator controls are available.</p><small>Current status: {status.profile_type || 'member'} / {status.professional_verification_status || 'unverified'}</small></div>
  return <div className="podcast-studio">
    <section><h3>Create podcast</h3><form onSubmit={createPodcast} className="podcast-form"><input name="title" required minLength={3} maxLength={120} placeholder="Podcast title"/><input name="short_description" maxLength={220} placeholder="Short description"/><textarea name="description" maxLength={5000} placeholder="Full description"/><div className="form-row"><select name="category">{categories.filter(c=>c!=='all').map(c=><option key={c}>{c}</option>)}</select><input name="language" defaultValue="English"/><select name="visibility"><option value="public">Public</option><option value="connections">Connections only</option><option value="group">Selected group</option><option value="private">Private draft</option></select></div><label className="check-label"><input type="checkbox" name="disclaimer" required/> Podcast content is general wellbeing education and not emergency care.</label><label className="check-label"><input type="checkbox" name="rights" required/> I own or have permission for all audio, guests, music, and effects.</label><button><Plus size={14}/> Save draft</button></form>{message&&<p className="studio-message">{message}</p>}</section>
    <section><h3>Record episode</h3><div className="recording-panel"><button onClick={recording?stopRecording:startRecording}>{recording?<Pause/>:<Mic/>}{recording?'Stop recording':'Start recording'}</button>{recordedUrl&&<audio controls src={recordedUrl}/>}<small>Nova uploads recordings only after you confirm a file upload. Heavy audio processing should run in an Edge Function or media service.</small></div></section>
    <section><h3>My Podcasts</h3>{podcasts.length===0?<div className="empty-state">No podcast drafts yet.</div>:<div className="studio-list">{podcasts.map(p=><article key={p.id}><b>{p.title}</b><span>{p.status} - {p.visibility}</span><label><Upload size={14}/> Upload episode audio<input type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/aac,audio/x-m4a" onChange={e=>e.target.files?.[0]&&uploadAudio(e.target.files[0],p.id)}/></label></article>)}</div>}</section>
  </div>
}

export function PodcastPlatform({ userId, podcastId, episodeId, studio, onClose, onOpenPodcast, onOpenEpisode, onOpenProfile, onPlayEpisode }:{
  userId:string; podcastId?:string|null; episodeId?:string|null; studio?:boolean; onClose:()=>void; onOpenPodcast:(id:string)=>void; onOpenEpisode:(podcastId:string,episodeId:string)=>void; onOpenProfile:(id:string)=>void; onPlayEpisode:(episode:PlayerEpisode)=>void
}) {
  const [query,setQuery]=useState(''),[category,setCategory]=useState('all'),[sort,setSort]=useState('popular'),[items,setItems]=useState<Podcast[]>([]),[selected,setSelected]=useState<Podcast|null>(null),[loading,setLoading]=useState(true),[following,setFollowing]=useState(false)
  const load=useCallback(()=>{setLoading(true);supabase.rpc('search_podcasts',{search_text:query,category_filter:category,language_filter:'all',tag_filter:'all',sort_by:sort,page_limit:18,page_offset:0}).then(({data})=>{setItems((data as Podcast[])||[]);setLoading(false)})},[query,category,sort])
  useEffect(()=>{load()},[load])
  useEffect(()=>{if(!podcastId){setSelected(null);return}supabase.rpc('search_podcasts',{search_text:'',category_filter:'all',language_filter:'all',tag_filter:'all',sort_by:'popular',page_limit:24,page_offset:0}).then(({data})=>{const podcast=((data as Podcast[])||[]).find(p=>p.id===podcastId)||null;setSelected(podcast);if(podcast)supabase.from('podcast_follows').select('podcast_id').eq('podcast_id',podcast.id).eq('user_id',userId).maybeSingle().then(({data})=>setFollowing(Boolean(data)))})},[podcastId,userId])
  async function follow(){if(!selected)return;if(following)await supabase.from('podcast_follows').delete().eq('podcast_id',selected.id).eq('user_id',userId);else await supabase.from('podcast_follows').insert({podcast_id:selected.id,user_id:userId});setFollowing(!following)}
  async function reportPodcast(){if(!selected)return;const reason=window.prompt('Report category or concern');if(reason)await supabase.from('podcast_reports').insert({podcast_id:selected.id,reporter_id:userId,reason})}
  return <div className="feature-overlay"><section className="directory-window podcasts-window"><header><div><h2>{studio?'Podcast Studio':selected?'Podcast':'Podcasts'}</h2><p>{studio?'Create, record, upload, and manage healer-only podcast content.':'Discover real wellness audio from approved Nova Resort professionals.'}</p></div><button style={{width:'auto',padding:'0 12px'}} onClick={()=>onOpenPodcast('manage')}>Podcast Studio</button><button onClick={onClose}><X/></button></header>
    {studio ? <PodcastStudio userId={userId}/> : selected ? <div className="podcast-detail-view"><button className="back-link" onClick={()=>onOpenPodcast('')}><ChevronLeft size={14}/> All podcasts</button><section className="podcast-hero"><Cover src={selected.cover_image_url} title={selected.title}/><div><div className="podcast-meta-line"><span>{selected.category}</span><span>{selected.language}</span>{selected.verified&&<span><BadgeCheck size={13}/> Verified creator</span>}</div><h3>{selected.title}</h3><Creator podcast={selected} onOpenProfile={onOpenProfile}/><p>{selected.description||selected.short_description}</p><div className="podcast-tags">{selected.tags.map(tag=><button key={tag} onClick={()=>{setQuery(tag);onOpenPodcast('')}}>{tag}</button>)}</div><div className="podcast-stats"><span>{selected.follower_count} followers</span><span>{selected.episode_count} episodes</span><span>{selected.total_plays} plays</span></div><div className="podcast-actions"><button onClick={follow}>{following?'Following':'Follow'}</button><button onClick={()=>navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/podcasts/${selected.id}`)}><Share2 size={14}/> Share</button><button onClick={reportPodcast}><ShieldAlert size={14}/> Report</button></div></div></section><p className="podcast-disclaimer">Podcast content is provided for general education and wellbeing support and does not replace professional diagnosis, treatment, or emergency care.</p><EpisodeList podcast={selected} selectedEpisodeId={episodeId} onPlay={episode=>{onOpenEpisode(selected.id,episode.id);onPlayEpisode(episode)}}/></div> : <div className="podcast-directory"><div className="podcast-filters"><label><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search title, healer, topic, tag, language, or description"/></label><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c} value={c}>{c==='all'?'All categories':c}</option>)}</select><select value={sort} onChange={e=>setSort(e.target.value)}><option value="popular">Most popular</option><option value="newest">Newest</option><option value="played">Most played</option><option value="followed">Most followed</option></select></div>{loading?<div className="empty-state">Loading podcasts...</div>:items.length===0?<div className="empty-state"><Headphones/><h3>No podcasts found</h3><p>Try another search or check back when approved professionals publish episodes.</p></div>:<div className="podcast-grid">{items.map(item=><PodcastCard key={item.id} podcast={item} onOpen={onOpenPodcast} onPlay={async(p)=>{const {data}=await supabase.rpc('list_podcast_episodes',{podcast_ref:p.id,page_limit:1,page_offset:0});const ep=((data as Episode[])||[])[0];if(ep)onPlayEpisode({...ep,podcast_title:p.title,creator_name:p.creator_name})}} onOpenProfile={onOpenProfile}/>)}</div>}</div>}
  </section></div>
}

export function ProfilePodcastSection({ profileId, onOpenPodcast }:{profileId:string; onOpenPodcast:(id:string)=>void}) {
  const [items,setItems]=useState<ProfilePodcast[]>([])
  useEffect(()=>{supabase.from('podcasts').select('id,title,short_description,cover_image_url').eq('creator_id',profileId).eq('status','published').limit(6).then(({data})=>setItems(((data as any[])||[]).map(p=>({...p,follower_count:0,episode_count:0,total_plays:0,latest_episode_title:null,tags:[]}))))},[profileId])
  if(items.length===0)return null
  return <section className="profile-podcasts"><h3>Podcasts</h3><div>{items.map(p=><button key={p.id} onClick={()=>onOpenPodcast(p.id)}><Cover src={p.cover_image_url} title={p.title}/><span><b>{p.title}</b><small>{p.short_description}</small></span></button>)}</div></section>
}
