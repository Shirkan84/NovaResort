import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import {
  BadgeCheck, Bookmark, ChevronLeft, ChevronRight, Edit3, Eye, EyeOff,
  FileAudio, Headphones, Heart, List, Mic, Pause, Play, Plus, Radio, Search,
  Send, Share2, ShieldAlert, SkipBack, SkipForward, Square, Trash2, Upload,
  Video, Volume2, X
} from 'lucide-react'
import { supabase } from './supabase'
import './podcasts.css'

type Podcast = {
  id: string; title: string; slug: string; short_description: string; description: string; cover_image_url: string | null;
  category: string; language: string; creator_id: string; creator_name: string; creator_avatar_url: string | null;
  professional_title: string | null; verified: boolean; follower_count: number; episode_count: number; total_plays: number;
  latest_episode_id: string | null; latest_episode_title: string | null; latest_episode_published_at: string | null;
  tags: string[]; popularity_score: number; total_count: number; status?: string; visibility?: string; cover_path?: string
}
type Episode = {
  id: string; podcast_id: string; title: string; description: string; episode_number: number; season_number: number | null;
  audio_path: string | null; audio_url: string | null; audio_duration_seconds: number; cover_image_url: string | null;
  visibility: string; status: string; published_at: string | null; comments_enabled: boolean; reactions_enabled: boolean;
  transcript: string | null; saved: boolean; listen_position_seconds: number; tags: string[]; total_count: number;
  content_warning?: string | null; explicit_content?: boolean; show_notes?: string | null;
  video_path?: string | null; video_url?: string | null; media_kind?: string;
  media_mime_type?: string | null; media_size_bytes?: number | null
}
type ProfilePodcast = Pick<Podcast, 'id' | 'title' | 'short_description' | 'cover_image_url' | 'follower_count' | 'episode_count' | 'total_plays' | 'latest_episode_title' | 'tags'>
export type PlayerEpisode = Episode & { podcast_title: string; creator_name: string }
type Comment = { id: string; body: string; created_at: string; user_id: string; profiles?: any }
type CreatorStatus = { eligible: boolean; profile_type?: string; professional_verification_status?: string; profile?: { display_name: string | null; full_name: string } | null }
type StudioEpisode = {
  id: string; podcast_id: string; title: string; description: string; episode_number: number; season_number: number | null;
  audio_path: string | null; audio_url: string | null; audio_duration_seconds: number; cover_image_url: string | null;
  cover_path: string | null; visibility: string; status: string; published_at: string | null;
  comments_enabled: boolean; reactions_enabled: boolean; transcript: string | null; show_notes: string | null;
  content_warning: string | null; explicit_content: boolean; created_at: string; deleted_at: string | null;
  video_path: string | null; video_url: string | null; media_kind: string;
  media_mime_type: string | null; media_size_bytes: number | null
}

const categories = ['all', 'Mindfulness', 'Meditation', 'Emotional Healing', 'Personal Coaching', 'Relationships', 'Stress Management', 'Anxiety Support', 'Self Growth', 'Breathwork', 'Sleep', 'Confidence', 'Parenting', 'Grief', 'Trauma Awareness', 'Wellness Education', 'Spiritual Growth', 'Motivation', 'Healthy Habits']
const languages = ['all', 'English', 'Hebrew', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Hindi', 'Japanese', 'Chinese']
const speeds = [0.75, 1, 1.25, 1.5, 2]
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/webm', 'audio/ogg', 'audio/wav']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_AUDIO = 100 * 1024 * 1024
const MAX_VIDEO = 500 * 1024 * 1024
const MAX_IMAGE = 5 * 1024 * 1024
const MAX_DURATION = 3600
const SIGNED_URL_EXPIRY = 31536000

const initials = (name?: string | null) => (name || 'N').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
const duration = (seconds?: number | null) => {
  const value = Math.max(seconds || 0, 0), h = Math.floor(value / 3600), m = Math.floor((value % 3600) / 60), s = value % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || `podcast-${Date.now()}`
const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '-')
function setPreviewWithCleanup(prev: string | null, setter: (v: string | null) => void, next: string | null) {
  if (prev && prev.startsWith('blob:')) try { URL.revokeObjectURL(prev) } catch {}
  setter(next)
}

async function refreshEpisodeUrls<T extends { audio_path?: string | null; audio_url?: string | null; video_path?: string | null; video_url?: string | null; cover_image_url?: string | null; cover_path?: string | null }>(episode: T): Promise<T> {
  const updates: Record<string, string | null> = {}
  if (episode.audio_path) { const { data } = await supabase.storage.from('podcast-audio').createSignedUrl(episode.audio_path, SIGNED_URL_EXPIRY); if (data?.signedUrl) updates.audio_url = data.signedUrl }
  if (episode.video_path) { const { data } = await supabase.storage.from('podcast-video').createSignedUrl(episode.video_path, SIGNED_URL_EXPIRY); if (data?.signedUrl) updates.video_url = data.signedUrl }
  if (episode.cover_path) { const { data } = await supabase.storage.from('podcast-covers').createSignedUrl(episode.cover_path, SIGNED_URL_EXPIRY); if (data?.signedUrl) updates.cover_image_url = data.signedUrl }
  return Object.keys(updates).length > 0 ? { ...episode, ...updates } : episode
}

function Cover({ src, title }: { src?: string | null; title: string }) {
  return <span className="podcast-cover">{src ? <img src={src} alt={`${title} cover`} loading="lazy" /> : <Headphones aria-hidden="true" />}</span>
}

function Creator({ podcast, onOpenProfile }: { podcast: Podcast; onOpenProfile: (id: string) => void }) {
  return <button className="podcast-creator" onClick={() => onOpenProfile(podcast.creator_id)}>
    <span>{podcast.creator_avatar_url ? <img src={podcast.creator_avatar_url} alt="" /> : initials(podcast.creator_name)}</span>
    <b>{podcast.creator_name}</b>
    {podcast.verified && <BadgeCheck size={14} />}
  </button>
}

function PodcastCard({ podcast, onOpen, onPlay, onOpenProfile }: {
  podcast: Podcast; onOpen: (id: string) => void; onPlay: (podcast: Podcast) => void; onOpenProfile: (id: string) => void
}) {
  return <article className="podcast-card">
    <Cover src={podcast.cover_image_url} title={podcast.title} />
    <div className="podcast-card-body">
      <div className="podcast-meta-line"><span>{podcast.category}</span><span>{podcast.language}</span></div>
      <button className="podcast-title-button" onClick={() => onOpen(podcast.id)}>{podcast.title}</button>
      <p>{podcast.short_description || podcast.description || 'This creator has not added a podcast description yet.'}</p>
      <Creator podcast={podcast} onOpenProfile={onOpenProfile} />
      <div className="podcast-tags">{podcast.tags.slice(0, 3).map(tag => <button key={tag} onClick={() => onOpen(podcast.id)}>{tag}</button>)}</div>
      <div className="podcast-stats">
        <span>{podcast.follower_count} followers</span>
        <span>{podcast.total_plays} plays</span>
        <span>{podcast.episode_count} episodes</span>
      </div>
      <div className="podcast-actions">
        <button onClick={() => onPlay(podcast)} disabled={!podcast.latest_episode_id}><Play size={14} /> Play latest</button>
        <button onClick={() => onOpen(podcast.id)}>View podcast <ChevronRight size={14} /></button>
      </div>
    </div>
  </article>
}

export function PopularPodcastsStrip({ onOpenPodcast, onPlayEpisode, onOpenProfile }: {
  onOpenPodcast: (id: string) => void; onPlayEpisode: (episode: PlayerEpisode) => void; onOpenProfile: (id: string) => void
}) {
  const [items, setItems] = useState<Podcast[]>([])
  const [loading, setLoading] = useState(true)
  const rail = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    let live = true
    supabase.rpc('search_podcasts', { search_text: '', category_filter: 'all', language_filter: 'all', tag_filter: 'all', sort_by: 'popular', page_limit: 10, page_offset: 0 }).then(({ data }) => {
      if (live) { setItems((data as Podcast[]) || []); setLoading(false) }
    })
    return () => { live = false }
  }, [])
  const playLatest = async (podcast: Podcast) => {
    if (!podcast.latest_episode_id) return
    const { data } = await supabase.rpc('list_podcast_episodes', { podcast_ref: podcast.id, page_limit: 1, page_offset: 0 })
    const ep = ((data as Episode[]) || []).find(e => e.id === podcast.latest_episode_id) || ((data as Episode[]) || [])[0]
    if (ep) onPlayEpisode({ ...ep, podcast_title: podcast.title, creator_name: podcast.creator_name })
  }
  if (loading) return <section className="podcast-home"><div className="section-head"><div><h2>Popular Podcasts</h2><p>Loading trusted creator audio...</p></div></div><div className="podcast-rail"><article className="podcast-card skeleton" /></div></section>
  return <section className="podcast-home">
    <div className="section-head"><div><button className="section-title-link" onClick={() => onOpenPodcast('')}><h2>Popular Podcasts</h2></button><p>Listen to trusted healers, coaches, and mindfulness professionals from the Nova Resort community.</p></div><button onClick={() => onOpenPodcast('')}>View all podcasts <ChevronRight size={16} /></button></div>
    {items.length === 0 ? <div className="inline-empty">No published podcasts yet. Healer accounts can publish from Podcast Studio.</div> : <div className="podcast-strip-wrap">
      <button aria-label="Previous podcasts" onClick={() => rail.current?.scrollBy({ left: -340, behavior: 'smooth' })}><ChevronLeft /></button>
      <div className="podcast-rail" ref={rail} tabIndex={0}>{items.map(item => <PodcastCard key={item.id} podcast={item} onOpen={onOpenPodcast} onPlay={playLatest} onOpenProfile={onOpenProfile} />)}</div>
      <button aria-label="Next podcasts" onClick={() => rail.current?.scrollBy({ left: 340, behavior: 'smooth' })}><ChevronRight /></button>
    </div>}
  </section>
}

let currentAudio: HTMLAudioElement | null = null

export function PodcastMiniPlayer({ episode, onClose }: { episode: PlayerEpisode | null; onClose: () => void }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [durationState, setDurationState] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [muted, setMuted] = useState(false)
  useEffect(() => { if (audio.current) { audio.current.playbackRate = speed; audio.current.muted = muted } }, [speed, muted])
  useEffect(() => { setPlaying(false); setPosition(episode?.listen_position_seconds || 0) }, [episode?.id])
  if (!episode) return null
  const src = episode.audio_url || ''
  const saveProgress = () => supabase.rpc('record_podcast_play', { episode_ref: episode.id, position_seconds: Math.floor(position), duration_seconds: Math.floor(durationState || episode.audio_duration_seconds || 0) })
  return <aside className="podcast-player" aria-label="Podcast player">
    {src && <audio ref={audio} src={src} onLoadedMetadata={e => { setDurationState(Math.floor(e.currentTarget.duration || episode.audio_duration_seconds || 0)); if (episode.listen_position_seconds) e.currentTarget.currentTime = episode.listen_position_seconds }} onTimeUpdate={e => setPosition(Math.floor(e.currentTarget.currentTime))} onPause={saveProgress} onEnded={() => { setPlaying(false); saveProgress() }} />}
    <button aria-label={playing ? 'Pause episode' : 'Play episode'} disabled={!src} onClick={() => { if (!audio.current) return; if (playing) { audio.current.pause(); setPlaying(false) } else { if (currentAudio && currentAudio !== audio.current) { currentAudio.pause() }; currentAudio = audio.current; audio.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) } }}>{playing ? <Pause /> : <Play />}</button>
    <div><b>{episode.title}</b><span>{episode.podcast_title} by {episode.creator_name}</span><input aria-label="Seek podcast" type="range" min={0} max={durationState || episode.audio_duration_seconds || 1} value={position} onChange={e => { const next = Number(e.target.value); setPosition(next); if (audio.current) audio.current.currentTime = next }} /><small>{duration(position)} / {duration(durationState || episode.audio_duration_seconds)}</small></div>
    <button aria-label="Skip back 15 seconds" onClick={() => { if (audio.current) audio.current.currentTime = Math.max(0, audio.current.currentTime - 15) }}><SkipBack /></button>
    <button aria-label="Skip forward 30 seconds" onClick={() => { if (audio.current) audio.current.currentTime = Math.min(durationState || 999999, audio.current.currentTime + 30) }}><SkipForward /></button>
    <select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{speeds.map(item => <option key={item} value={item}>{item}x</option>)}</select>
    <button aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}><Volume2 /></button>
    <button aria-label="Close player" onClick={onClose}><X /></button>
  </aside>
}

function EpisodeList({ podcast, userId, onPlay, selectedEpisodeId }: { podcast: Podcast; userId: string; onPlay: (episode: PlayerEpisode) => void; selectedEpisodeId?: string | null }) {
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [pageOffset, setPageOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [comment, setComment] = useState('')
  const [editingCommentId, setEditingCommentId] = useState<string|null>(null)
  const [editingCommentBody, setEditingCommentBody] = useState('')
  const [reportingId, setReportingId] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({})
  const [myReactions, setMyReactions] = useState<string[]>([])
  const selected = episodes.find(e => e.id === selectedEpisodeId) || episodes[0]
  const EP_PAGE = 20

  const load = useCallback((offset = 0, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true)
    supabase.rpc('list_podcast_episodes', { podcast_ref: podcast.id, page_limit: EP_PAGE, page_offset: offset }).then(async ({ data }) => {
      const rows = ((data as Episode[]) || [])
      const refreshed = await Promise.all(rows.map(e => refreshEpisodeUrls(e)))
      const total = refreshed.length > 0 ? refreshed[0].total_count || refreshed.length : 0
      setEpisodes(prev => append ? [...prev, ...refreshed] : refreshed)
      setTotalCount(total)
      setPageOffset(offset)
      setLoading(false)
      setLoadingMore(false)
    })
  }, [podcast.id])

  useEffect(() => { load(0) }, [load])

  useEffect(() => {
    if (!selected?.comments_enabled) return
    supabase.from('podcast_comments').select('id,body,created_at,user_id,profiles(display_name,full_name,avatar_url)').eq('episode_id', selected.id).is('deleted_at', null).order('created_at', { ascending: true }).limit(50).then(({ data }) => setComments((data as unknown as Comment[]) || []))
  }, [selected?.id, selected?.comments_enabled])

  async function save(ep: Episode) {
    if (ep.saved) {
      await supabase.from('podcast_episode_saves').delete().eq('episode_id', ep.id).eq('user_id', userId)
    } else {
      await supabase.from('podcast_episode_saves').upsert({ episode_id: ep.id, user_id: userId })
    }
    load()
  }

  async function react(ep: Episode) {
    const { data } = await supabase.rpc('toggle_episode_reaction', { p_episode_id: ep.id, p_reaction: 'heart' })
    if (data) {
      setMyReactions(data.user_reactions || [])
      setReactionCounts(data.reaction_counts || {})
    }
  }

  useEffect(() => {
    if (!selected?.reactions_enabled || !selected?.id) return
    supabase.rpc('get_episode_reactions', { p_episode_id: selected.id }).then(({ data }) => {
      if (data) {
        setMyReactions(data.user_reactions || [])
        setReactionCounts(data.reaction_counts || {})
      }
    })
  }, [selected?.id, selected?.reactions_enabled])

  async function submitReport(ep: Episode) {
    if (!reportReason.trim()) return
    await supabase.from('podcast_reports').insert({ episode_id: ep.id, reporter_id: userId, reason: reportReason.trim() })
    setReportingId(null)
    setReportReason('')
  }

  async function addComment(event: FormEvent) {
    event.preventDefault()
    if (!selected || !comment.trim()) return
    await supabase.from('podcast_comments').insert({ episode_id: selected.id, user_id: userId, body: comment.trim() })
    setComment('')
    supabase.from('podcast_comments').select('id,body,created_at,user_id,profiles(display_name,full_name,avatar_url)').eq('episode_id', selected.id).order('created_at', { ascending: true }).limit(50).then(({ data }) => setComments((data as unknown as Comment[]) || []))
  }

  async function editComment(commentId: string) {
    if (!editingCommentBody.trim()) return
    await supabase.rpc('edit_podcast_comment', { p_comment_id: commentId, p_body: editingCommentBody.trim() })
    setEditingCommentId(null)
    setEditingCommentBody('')
    if (selected) {
      const { data } = await supabase.from('podcast_comments').select('id,body,created_at,user_id,profiles(display_name,full_name,avatar_url)').eq('episode_id', selected.id).order('created_at', { ascending: true }).limit(50)
      setComments((data as unknown as Comment[]) || [])
    }
  }

  async function deleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return
    await supabase.rpc('delete_podcast_comment', { p_comment_id: commentId })
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  async function shareEpisode(ep: Episode) {
    const url = `${location.origin}${location.pathname}#/podcasts/${podcast.id}/episodes/${ep.id}`
    if (navigator.share) { try { await navigator.share({ title: ep.title, url }); return } catch {} }
    await navigator.clipboard?.writeText(url)
  }

  if (loading) return <div className="empty-state">Loading episodes...</div>
  if (episodes.length === 0) return <div className="empty-state"><Radio /><h3>No published episodes yet</h3><p>Drafts and restricted episodes are hidden unless you have access.</p></div>

  return <div className="episode-layout">
    <div className="episode-list">{episodes.map(ep => <article key={ep.id} className={selected?.id === ep.id ? 'active' : ''}>
      <div className="episode-card-header">
        <button onClick={() => onPlay({ ...ep, podcast_title: podcast.title, creator_name: podcast.creator_name })}><Play size={14} /> Play</button>
        <button title={ep.saved ? 'Unsave episode' : 'Save episode'} onClick={() => save(ep)} className={ep.saved ? 'saved' : ''}><Bookmark size={15} fill={ep.saved ? 'currentColor' : 'none'} /></button>
        <button title="Share episode" onClick={() => shareEpisode(ep)}><Share2 size={15} /></button>
        <button title="Report episode" onClick={() => { setReportingId(reportingId === ep.id ? null : ep.id); setReportReason('') }}><ShieldAlert size={15} /></button>
      </div>
      <div>
        <div className="episode-meta-line">
          {ep.season_number != null && <span>S{ep.season_number}</span>}
          <span>E{ep.episode_number}</span>
          <span>{duration(ep.audio_duration_seconds)}</span>
          {ep.media_kind === 'video' && <span className="explicit-tag" style={{ background: '#7c3aed', color: '#fff' }}>Video</span>}
          {ep.explicit_content && <span className="explicit-tag">Explicit</span>}
        </div>
        <h3>{ep.title}</h3>
        <p>{ep.description}</p>
        <small>{ep.published_at ? new Date(ep.published_at).toLocaleDateString() : 'Unpublished'} &middot; {ep.visibility}</small>
        <div className="podcast-tags">{ep.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
      </div>
      {reportingId === ep.id && <form className="report-inline" onSubmit={e => { e.preventDefault(); submitReport(ep) }}>
        <input value={reportReason} onChange={e => setReportReason(e.target.value)} placeholder="Describe your concern..." required />
        <div className="report-actions">
          <button type="submit"><Send size={12} /> Submit</button>
          <button type="button" onClick={() => { setReportingId(null); setReportReason('') }}>Cancel</button>
        </div>
      </form>}
    </article>)}
      {episodes.length < totalCount && <div className="podcast-load-more"><button onClick={() => load(pageOffset + EP_PAGE, true)} disabled={loadingMore}>{loadingMore ? 'Loading...' : 'Load more episodes'}</button></div>}
    </div>
    {selected && <section className="episode-detail">
      <h3>{selected.title}</h3>
      <div className="episode-meta-line">
        {selected.season_number != null && <span>Season {selected.season_number}</span>}
        <span>Episode {selected.episode_number}</span>
        <span>{duration(selected.audio_duration_seconds)}</span>
      </div>
      {selected.content_warning && <div className="content-warning"><ShieldAlert size={13} /> {selected.content_warning}</div>}
      <p>{selected.description}</p>
      <div className="episode-tools">
        <button onClick={() => onPlay({ ...selected, podcast_title: podcast.title, creator_name: podcast.creator_name })}><Play size={14} /> Play episode</button>
        {selected.reactions_enabled && <button className={myReactions.includes('heart') ? 'active' : ''} onClick={() => react(selected)}><Heart size={14} fill={myReactions.includes('heart') ? 'currentColor' : 'none'} /> {reactionCounts.heart || 0} {myReactions.includes('heart') ? 'Liked' : 'Like'}</button>}
        <button onClick={() => shareEpisode(selected)}><Share2 size={14} /> Share</button>
        {selected.saved && <button onClick={() => save(selected)}><Bookmark size={14} fill="currentColor" /> Saved</button>}
      </div>
      {selected.video_url && <div className="episode-video-player"><video controls src={selected.video_url} preload="none" style={{ width: '100%', maxHeight: 400, borderRadius: 8 }} /></div>}
      {selected.transcript && <details className="transcript-details"><summary><FileAudio size={14} /> Transcript</summary><p>{selected.transcript}</p></details>}
      {selected.show_notes && <details className="transcript-details"><summary><FileAudio size={14} /> Show Notes</summary><p>{selected.show_notes}</p></details>}
      {selected.comments_enabled ? <form className="comment-form" onSubmit={addComment}><input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a calm, respectful comment" /><button><Send size={14} /> Comment</button></form> : <p className="muted">Comments are disabled for this episode.</p>}
      {selected.comments_enabled && <div className="comment-list">{comments.map(c => <article key={c.id}><b>{c.profiles?.display_name || c.profiles?.full_name || 'Nova member'}</b>
        {editingCommentId === c.id ? <div className="comment-edit"><input value={editingCommentBody} onChange={e => setEditingCommentBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') editComment(c.id); if (e.key === 'Escape') setEditingCommentId(null) }}/><div className="comment-edit-actions"><button onClick={() => editComment(c.id)}>Save</button><button onClick={() => setEditingCommentId(null)}>Cancel</button></div></div> :
        <p>{c.body}</p>}
        <time>{new Date(c.created_at).toLocaleString()}{c.user_id === userId && editingCommentId !== c.id && <span className="comment-actions"><button onClick={() => { setEditingCommentId(c.id); setEditingCommentBody(c.body) }}>Edit</button><button onClick={() => deleteComment(c.id)}>Delete</button></span>}</time>
      </article>)}</div>}
    </section>}
  </div>
}

function PodcastStudio({ userId, initialAction = 'list', initialPodcastId, initialEpisodeId, onNavigate }: { userId: string; initialAction?: string; initialPodcastId?: string | null; initialEpisodeId?: string | null; onNavigate?: (id: string) => void }) {
  const [creatorStatus, setCreatorStatus] = useState<CreatorStatus | null>(null)
  const [podcasts, setPodcasts] = useState<Podcast[]>([])
  const [message, setMessage] = useState('')
  const [studioView, setStudioView] = useState<'list' | 'create' | 'edit' | 'episodes' | 'create-episode' | 'edit-episode'>('list')
  const [selectedPodcast, setSelectedPodcast] = useState<Podcast | null>(null)
  const [episodes, setEpisodes] = useState<StudioEpisode[]>([])
  const [episodesLoading, setEpisodesLoading] = useState(false)
  const [editingEpisodeId, setEditingEpisodeId] = useState<string | null>(null)
  const [episodeFilter, setEpisodeFilter] = useState<'all' | 'draft' | 'published'>('all')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [storageBytes, setStorageBytes] = useState<number>(0)
  const [podcastStats, setPodcastStats] = useState<Record<string, { plays: number; followers: number; episodes: number }>>({})

  const loadCreatorStatus = useCallback(async () => {
    const [{ data: eligible }, { data: profile }] = await Promise.all([
      supabase.rpc('can_create_content', { check_user: userId }),
      supabase.from('profiles').select('display_name,full_name,profile_type,professional_verification_status').eq('id', userId).single()
    ])
    setCreatorStatus({ eligible: Boolean(eligible), ...(profile as any) })
  }, [userId])

  const loadPodcasts = useCallback(async () => {
    const { data: list } = await supabase.from('podcasts').select('*').eq('creator_id', userId).order('updated_at', { ascending: false })
    setPodcasts(((list as any[]) || []).map(p => ({
      ...p, creator_id: userId, creator_name: (p as any).profiles?.display_name || 'You', creator_avatar_url: null,
      verified: false, follower_count: 0, episode_count: 0, total_plays: 0, tags: [], popularity_score: 0, total_count: 0
    })))
  }, [userId])

  const loadEpisodes = useCallback(async (podcastId: string) => {
    setEpisodesLoading(true)
    const { data } = await supabase.from('podcast_episodes').select('*').eq('podcast_id', podcastId).eq('creator_id', userId).is('deleted_at', null).order('episode_number', { ascending: true })
    const rows = ((data as StudioEpisode[]) || [])
    const refreshed = await Promise.all(rows.map(e => refreshEpisodeUrls(e)))
    setEpisodes(refreshed)
    setEpisodesLoading(false)
  }, [userId])

  useEffect(() => { loadCreatorStatus() }, [loadCreatorStatus])
  useEffect(() => { if (creatorStatus?.eligible) { loadPodcasts(); supabase.rpc('get_podcast_storage_usage', { creator: userId }).then(({ data }) => setStorageBytes(Number(data) || 0)) } }, [creatorStatus, loadPodcasts, userId])

  const loadStats = useCallback(async (podcastIds: string[]) => {
    if (podcastIds.length === 0) return
    const stats: Record<string, { plays: number; followers: number; episodes: number }> = {}
    await Promise.all(podcastIds.map(async (pid) => {
      const [{ count: followers }, { count: episodes }, { count: plays }] = await Promise.all([
        supabase.from('podcast_follows').select('podcast_id', { count: 'exact', head: true }).eq('podcast_id', pid),
        supabase.from('podcast_episodes').select('id', { count: 'exact', head: true }).eq('podcast_id', pid).eq('status', 'published').is('deleted_at', null),
        supabase.from('podcast_listens').select('id', { count: 'exact', head: true }).in('episode_id',
          (await supabase.from('podcast_episodes').select('id').eq('podcast_id', pid)).data?.map(e => e.id) || [])
      ])
      stats[pid] = { plays: plays || 0, followers: followers || 0, episodes: episodes || 0 }
    }))
    setPodcastStats(stats)
  }, [])

  useEffect(() => { if (podcasts.length > 0) loadStats(podcasts.map(p => p.id)) }, [podcasts, loadStats])

  const goToStudio = useCallback((action: string, podcastId?: string, episodeId?: string) => {
    if (!onNavigate) return
    if (action === 'list') onNavigate('manage')
    else if (action === 'create') onNavigate('manage/new')
    else if (action === 'episodes' && podcastId) onNavigate(`manage/${podcastId}`)
    else if (action === 'edit' && podcastId) onNavigate(`manage/${podcastId}/edit`)
    else if (action === 'create-episode' && podcastId) onNavigate(`manage/${podcastId}/episodes/new`)
    else if (action === 'edit-episode' && podcastId && episodeId) onNavigate(`manage/${podcastId}/episodes/${episodeId}`)
  }, [onNavigate])

  useEffect(() => {
    if (!initialAction) return
    const viewMap: Record<string, typeof studioView> = {
      'list': 'list', 'create': 'create', 'edit': 'edit',
      'episodes': 'episodes', 'create-episode': 'create-episode', 'edit-episode': 'edit-episode'
    }
    setStudioView(viewMap[initialAction] || 'list')
    if (initialEpisodeId && initialAction === 'edit-episode') setEditingEpisodeId(initialEpisodeId)
    if (initialPodcastId && podcasts.length > 0) {
      const found = podcasts.find(p => p.id === initialPodcastId)
      if (found) {
        setSelectedPodcast(found)
        setCoverPreview(found.cover_image_url)
        if (['episodes', 'create-episode', 'edit-episode'].includes(initialAction)) {
          loadEpisodes(initialPodcastId)
        }
      }
    }
  }, [initialAction, initialPodcastId, podcasts, loadEpisodes])

  function showMsg(text: string) { setMessage(text); setTimeout(() => setMessage(''), 4000) }

  function navigateStudio(view: typeof studioView, podcast?: Podcast | null, episodeId?: string | null) {
    setStudioView(view)
    if (view === 'list') { setSelectedPodcast(null); setCoverPreview(null); goToStudio('list') }
    else if (view === 'create') { setSelectedPodcast(null); setCoverPreview(null); goToStudio('create') }
    else if (view === 'episodes' && podcast) { setSelectedPodcast(podcast); loadEpisodes(podcast.id); goToStudio('episodes', podcast.id) }
    else if (view === 'edit' && podcast) { setSelectedPodcast(podcast); setCoverPreview(podcast.cover_image_url); goToStudio('edit', podcast.id) }
    else if (view === 'create-episode' && podcast) { setSelectedPodcast(podcast); goToStudio('create-episode', podcast.id) }
    else if (view === 'edit-episode' && podcast && episodeId) { setSelectedPodcast(podcast); setEditingEpisodeId(episodeId); goToStudio('edit-episode', podcast.id, episodeId) }
  }

  async function uploadCoverImage(file: File): Promise<{ path: string; url: string } | null> {
    if (!IMAGE_TYPES.includes(file.type)) { showMsg('Unsupported image type. Use JPG, PNG, or WebP.'); return null }
    if (file.size > MAX_IMAGE) { showMsg('Image must be under 5MB.'); return null }
    const path = `${userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const { error } = await supabase.storage.from('podcast-covers').upload(path, file, { contentType: file.type })
    if (error) { showMsg(error.message); return null }
    const { data: urlData } = await supabase.storage.from('podcast-covers').createSignedUrl(path, SIGNED_URL_EXPIRY)
    if (!urlData?.signedUrl) { showMsg('Failed to get cover URL.'); return null }
    return { path, url: urlData.signedUrl }
  }

  async function uploadAudioFile(file: File): Promise<{ path: string; url: string; duration: number } | null> {
    if (!AUDIO_TYPES.includes(file.type)) { showMsg('Unsupported audio type. Supported: MP3, M4A, AAC, WebM, OGG, WAV.'); return null }
    if (file.size > MAX_AUDIO) { showMsg('Audio must be under 100MB.'); return null }
    const audioDuration = await new Promise<number>(resolve => {
      const a = new Audio()
      a.src = URL.createObjectURL(file)
      a.onloadedmetadata = () => { resolve(Math.floor(a.duration || 0)); URL.revokeObjectURL(a.src) }
      a.onerror = () => { resolve(0); URL.revokeObjectURL(a.src) }
    })
    if (audioDuration > MAX_DURATION) { showMsg(`Episode duration is ${duration(audioDuration)}. Maximum allowed is 60 minutes.`); return null }
    const path = `${userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    setUploadProgress(0)
    const { error } = await supabase.storage.from('podcast-audio').upload(path, file, { contentType: file.type })
    setUploadProgress(null)
    if (error) { showMsg(error.message); return null }
    const { data: urlData } = await supabase.storage.from('podcast-audio').createSignedUrl(path, SIGNED_URL_EXPIRY)
    if (!urlData?.signedUrl) { showMsg('Failed to get audio URL.'); return null }
    return { path, url: urlData.signedUrl, duration: audioDuration }
  }

  async function uploadVideoFile(file: File): Promise<{ path: string; url: string; duration: number } | null> {
    if (!VIDEO_TYPES.includes(file.type)) { showMsg('Unsupported video type. Supported: MP4, WebM, MOV.'); return null }
    if (file.size > MAX_VIDEO) { showMsg('Video must be under 500MB.'); return null }
    const videoDuration = await new Promise<number>(resolve => {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.src = URL.createObjectURL(file)
      v.onloadedmetadata = () => { resolve(Math.floor(v.duration || 0)); URL.revokeObjectURL(v.src) }
      v.onerror = () => { resolve(0); URL.revokeObjectURL(v.src) }
    })
    if (videoDuration > MAX_DURATION) { showMsg(`Episode duration is ${duration(videoDuration)}. Maximum allowed is 60 minutes.`); return null }
    const path = `${userId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    setUploadProgress(0)
    const { error } = await supabase.storage.from('podcast-video').upload(path, file, { contentType: file.type })
    setUploadProgress(null)
    if (error) { showMsg(error.message); return null }
    const { data: urlData } = await supabase.storage.from('podcast-video').createSignedUrl(path, SIGNED_URL_EXPIRY)
    if (!urlData?.signedUrl) { showMsg('Failed to get video URL.'); return null }
    return { path, url: urlData.signedUrl, duration: videoDuration }
  }

  async function createPodcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') || '')
    const coverFile = form.get('cover_image') as File | null
    let cover_url: string | null = null, cover_path: string | null = null
    if (coverFile && coverFile.size > 0) {
      const result = await uploadCoverImage(coverFile)
      if (result) { cover_url = result.url; cover_path = result.path }
    }
    const { error } = await supabase.from('podcasts').insert({
      creator_id: userId, title, slug: slugify(title),
      short_description: String(form.get('short_description') || ''),
      description: String(form.get('description') || ''),
      category: String(form.get('category') || 'Wellness Education'),
      language: String(form.get('language') || 'English'),
      visibility: String(form.get('visibility') || 'public'),
      status: 'draft', cover_image_url: cover_url, cover_path,
      professional_disclaimer_accepted: Boolean(form.get('disclaimer')),
      rights_confirmed: Boolean(form.get('rights'))
    })
    if (error) { showMsg(error.message); return }
    showMsg('Podcast draft created successfully.')
    loadPodcasts()
    navigateStudio('list')
  }

  async function updatePodcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPodcast) return
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') || '')
    const coverFile = form.get('cover_image') as File | null
    let cover_url = selectedPodcast.cover_image_url, cover_path = selectedPodcast.cover_path || null
    if (coverFile && coverFile.size > 0) {
      const result = await uploadCoverImage(coverFile)
      if (result) { cover_url = result.url; cover_path = result.path }
    }
    const { error } = await supabase.from('podcasts').update({
      title, slug: slugify(title), short_description: String(form.get('short_description') || ''),
      description: String(form.get('description') || ''), category: String(form.get('category') || 'Wellness Education'),
      language: String(form.get('language') || 'English'), visibility: String(form.get('visibility') || 'public'),
      cover_image_url: cover_url, cover_path, updated_at: new Date().toISOString()
    }).eq('id', selectedPodcast.id)
    if (error) { showMsg(error.message); return }
    showMsg('Podcast updated.')
    loadPodcasts()
    navigateStudio('list')
  }

  async function togglePublishPodcast(podcast: Podcast) {
    const newStatus = podcast.status === 'published' ? 'draft' : 'published'
    if (newStatus === 'published' && !window.confirm(`Publish "${podcast.title}"? It will become visible to all members.`)) return
    if (newStatus === 'draft' && !window.confirm(`Unpublish "${podcast.title}"? It will be hidden from public listings.`)) return
    const { error } = await supabase.from('podcasts').update({
      status: newStatus,
      published_at: newStatus === 'published' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq('id', podcast.id)
    if (error) { showMsg(error.message); return }
    showMsg(`Podcast ${newStatus === 'published' ? 'published' : 'unpublished'}.`)
    loadPodcasts()
  }

  async function deletePodcast(podcast: Podcast) {
    if (!window.confirm(`Are you sure you want to archive "${podcast.title}"? This will hide it from public listings.`)) return
    const { error } = await supabase.from('podcasts').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', podcast.id)
    if (error) { showMsg(error.message); return }
    showMsg('Podcast archived.')
    loadPodcasts()
  }

  async function togglePublishEpisode(ep: StudioEpisode) {
    const newStatus = ep.status === 'published' ? 'draft' : 'published'
    if (newStatus === 'published') {
      if (!ep.audio_url && !ep.video_url) { showMsg('Cannot publish: episode has no media file. Upload audio or video first.'); return }
      if (!window.confirm(`Publish episode "${ep.title}"? It will become publicly available.`)) return
    }
    if (newStatus === 'draft' && !window.confirm(`Unpublish episode "${ep.title}"? It will be hidden from listeners.`)) return
    const { error } = await supabase.from('podcast_episodes').update({
      status: newStatus, published_at: newStatus === 'published' ? new Date().toISOString() : null, updated_at: new Date().toISOString()
    }).eq('id', ep.id)
    if (error) { showMsg(error.message); return }
    showMsg(`Episode ${newStatus === 'published' ? 'published' : 'unpublished'}.`)
    if (selectedPodcast) loadEpisodes(selectedPodcast.id)
  }

  async function deleteEpisode(ep: StudioEpisode) {
    if (!window.confirm(`Delete episode "${ep.title}"?`)) return
    const { error } = await supabase.from('podcast_episodes').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', ep.id)
    if (error) { showMsg(error.message); return }
    showMsg('Episode deleted.')
    if (selectedPodcast) loadEpisodes(selectedPodcast.id)
  }

  if (!creatorStatus) return <div className="empty-state">Checking creator status...</div>
  if (!creatorStatus.eligible) return <div className="podcast-studio-denied"><ShieldAlert /><h3>Podcast Studio is for healers</h3><p>Only healer accounts can create and manage podcasts.</p><small>Current account type: {creatorStatus.profile_type || 'member'}</small></div>

  return <div className="podcast-studio">
    {message && <p className="studio-message">{message}</p>}
    {uploadProgress !== null && <div className="upload-progress"><small>Uploading…</small></div>}
    {storageBytes > 0 && <div className="storage-usage">Storage used: {(storageBytes / (1024 * 1024)).toFixed(1)} MB</div>}

    {studioView === 'list' && <>
      <div className="studio-section-header">
        <h3>My Podcasts</h3>
        <button onClick={() => navigateStudio('create')}><Plus size={14} /> New podcast</button>
      </div>
      {podcasts.length === 0 ? <div className="empty-state">No podcasts yet. Create your first podcast to get started.</div> : <div className="studio-list">{podcasts.map(p => <article key={p.id} className="studio-podcast-card">
        <div className="studio-podcast-info">
          <Cover src={p.cover_image_url} title={p.title} />
          <div>
            <b>{p.title}</b>
            <span className={`status-badge ${p.status}`}>{p.status}</span>
            <span>{p.visibility}</span>
            {podcastStats[p.id] && <div className="studio-podcast-stats"><span>{podcastStats[p.id].plays} plays</span><span>{podcastStats[p.id].followers} followers</span><span>{podcastStats[p.id].episodes} episodes</span></div>}
            <small>{p.short_description || 'No description'}</small>
          </div>
        </div>
        <div className="studio-podcast-actions">
          <button onClick={() => navigateStudio('episodes', p)}><List size={14} /> Episodes</button>
          <button onClick={() => navigateStudio('edit', p)}><Edit3 size={14} /> Edit</button>
          <button onClick={() => togglePublishPodcast(p)}>{p.status === 'published' ? <><EyeOff size={14} /> Unpublish</> : <><Eye size={14} /> Publish</>}</button>
          <button onClick={() => deletePodcast(p)} className="danger"><Trash2 size={14} /> Archive</button>
        </div>
      </article>)}</div>}
    </>}

    {studioView === 'create' && <>
      <div className="studio-section-header">
        <h3>Create Podcast</h3>
        <button onClick={() => navigateStudio('list')}><ChevronLeft size={14} /> Back</button>
      </div>
      <form onSubmit={createPodcast} className="podcast-form">
        <label>Title<input name="title" required minLength={3} maxLength={120} placeholder="Podcast title" /></label>
        <label>Short description<input name="short_description" maxLength={220} placeholder="Brief summary (shown in listings)" /></label>
        <label>Full description<textarea name="description" maxLength={5000} placeholder="Detailed description of your podcast" /></label>
        <div className="form-row">
          <label>Category<select name="category">{categories.filter(c => c !== 'all').map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Language<input name="language" defaultValue="English" /></label>
          <label>Visibility<select name="visibility"><option value="public">Public</option><option value="connections">Connections only</option><option value="group">Selected group</option><option value="private">Private draft</option></select></label>
        </div>
        <label>Cover image<small>Max 5MB. JPG, PNG, or WebP.</small>
          <div className="cover-upload">{coverPreview ? <img src={coverPreview} alt="Cover preview" /> : <div className="cover-placeholder"><Upload size={20} /> Click to upload cover</div>}
            <input type="file" name="cover_image" accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) setPreviewWithCleanup(coverPreview, setCoverPreview, URL.createObjectURL(f)) }} />
          </div>
        </label>
        <label className="check-label"><input type="checkbox" name="disclaimer" required /> Podcast content is general wellbeing education and not emergency care.</label>
        <label className="check-label"><input type="checkbox" name="rights" required /> I own or have permission for all audio, guests, music, and effects.</label>
        <button><Plus size={14} /> Save draft</button>
      </form>
    </>}

    {studioView === 'edit' && selectedPodcast && <>
      <div className="studio-section-header">
        <h3>Edit Podcast</h3>
        <button onClick={() => navigateStudio('list')}><ChevronLeft size={14} /> Back</button>
      </div>
      <form onSubmit={updatePodcast} className="podcast-form">
        <label>Title<input name="title" required minLength={3} maxLength={120} defaultValue={selectedPodcast.title} /></label>
        <label>Short description<input name="short_description" maxLength={220} defaultValue={selectedPodcast.short_description} /></label>
        <label>Full description<textarea name="description" maxLength={5000} defaultValue={selectedPodcast.description} /></label>
        <div className="form-row">
          <label>Category<select name="category" defaultValue={selectedPodcast.category}>{categories.filter(c => c !== 'all').map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Language<input name="language" defaultValue={selectedPodcast.language} /></label>
          <label>Visibility<select name="visibility" defaultValue={selectedPodcast.visibility}><option value="public">Public</option><option value="connections">Connections only</option><option value="group">Selected group</option><option value="private">Private draft</option></select></label>
        </div>
        <label>Cover image<small>Leave empty to keep current cover.</small>
          <div className="cover-upload">{coverPreview ? <img src={coverPreview} alt="Cover preview" /> : <div className="cover-placeholder"><Upload size={20} /> Click to upload cover</div>}
            <input type="file" name="cover_image" accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) setPreviewWithCleanup(coverPreview, setCoverPreview, URL.createObjectURL(f)) }} />
          </div>
        </label>
        <button><Edit3 size={14} /> Update podcast</button>
      </form>
    </>}

    {studioView === 'episodes' && selectedPodcast && <>
      <div className="studio-section-header">
        <h3>Episodes — {selectedPodcast.title}</h3>
        <div className="header-btns">
          <button onClick={() => navigateStudio('create-episode', selectedPodcast)}><Plus size={14} /> New episode</button>
          <button onClick={() => navigateStudio('list')}><ChevronLeft size={14} /> Back</button>
        </div>
      </div>
      <div className="episode-filter-tabs">
        {(['all', 'draft', 'published'] as const).map(tab => <button key={tab} className={episodeFilter === tab ? 'active' : ''} onClick={() => setEpisodeFilter(tab)}>{tab === 'all' ? 'All' : tab === 'draft' ? 'Drafts' : 'Published'}{tab !== 'all' && <span className="filter-count">{episodes.filter(e => e.status === tab).length}</span>}</button>)}
      </div>
      {episodesLoading ? <div className="empty-state">Loading episodes...</div> : episodes.length === 0 ? <div className="empty-state"><Radio /><h3>No episodes yet</h3><p>Create your first episode to start sharing audio content.</p></div> : <div className="studio-list">{episodes.filter(ep => episodeFilter === 'all' || ep.status === episodeFilter).map(ep => <article key={ep.id} className="studio-episode-card">
        <div className="studio-episode-info">
          <div className="episode-meta-line"><span>E{ep.episode_number}</span>{ep.season_number != null && <span>S{ep.season_number}</span>}<span>{duration(ep.audio_duration_seconds)}</span><span className={`status-badge ${ep.status}`}>{ep.status}</span>{ep.media_kind === 'video' && <span><Video size={10} /> Video</span>}</div>
          <b>{ep.title}</b>
          <small>{ep.description ? ep.description.slice(0, 100) + (ep.description.length > 100 ? '...' : '') : 'No description'}</small>
          {ep.audio_url && <audio controls src={ep.audio_url} preload="none" style={{ height: 32, marginTop: 6 }} />}
          {ep.video_url && <video controls src={ep.video_url} preload="none" style={{ width: '100%', maxHeight: 120, borderRadius: 8, marginTop: 6 }} />}
        </div>
        <div className="studio-episode-actions">
          <button onClick={() => navigateStudio('edit-episode', selectedPodcast, ep.id)}><Edit3 size={14} /> Edit</button>
          <button onClick={() => togglePublishEpisode(ep)}>{ep.status === 'published' ? <><EyeOff size={14} /> Unpublish</> : <><Eye size={14} /> Publish</>}</button>
          {ep.status !== 'published' && <button onClick={() => deleteEpisode(ep)} className="danger"><Trash2 size={14} /> Delete</button>}
        </div>
      </article>)}</div>}
    </>}

    {studioView === 'create-episode' && selectedPodcast && <EpisodeCreateForm
      podcast={selectedPodcast} userId={userId} uploadAudioFile={uploadAudioFile} uploadVideoFile={uploadVideoFile} uploadCoverImage={uploadCoverImage}
      onBack={() => navigateStudio('episodes', selectedPodcast)} onSaved={() => { loadEpisodes(selectedPodcast.id); navigateStudio('episodes', selectedPodcast) }}
      showMsg={showMsg}
    />}

    {studioView === 'edit-episode' && selectedPodcast && editingEpisodeId && <EpisodeEditForm
      podcast={selectedPodcast} episodeId={editingEpisodeId} userId={userId} uploadCoverImage={uploadCoverImage}
      onBack={() => { navigateStudio('episodes') }}
      onSaved={() => { loadEpisodes(selectedPodcast.id); navigateStudio('episodes', selectedPodcast) }}
      showMsg={showMsg}
    />}
  </div>
}

function EpisodeCreateForm({ podcast, userId, uploadAudioFile, uploadVideoFile, uploadCoverImage, onBack, onSaved, showMsg }: {
  podcast: Podcast; userId: string;
  uploadAudioFile: (file: File) => Promise<{ path: string; url: string; duration: number } | null>;
  uploadVideoFile: (file: File) => Promise<{ path: string; url: string; duration: number } | null>;
  uploadCoverImage: (file: File) => Promise<{ path: string; url: string } | null>;
  onBack: () => void; onSaved: () => void; showMsg: (msg: string) => void
}) {
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [recordingMode, setRecordingMode] = useState<'idle' | 'audio' | 'video'>('idle')
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'preview'>('idle')
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState('')
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFileType, setSelectedFileType] = useState<'audio' | 'video' | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    }
  }, [recordedUrl])

  function formatRecTimer(s: number) { const m = Math.floor(s / 60), sec = s % 60; return `${m}:${String(sec).padStart(2, '0')}` }

  async function startRecording(mode: 'audio' | 'video') {
    if (!navigator.mediaDevices || !window.MediaRecorder) { showMsg('Browser recording is not supported in this browser.'); return }
    try {
      const constraints: MediaStreamConstraints = mode === 'video'
        ? { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: true }
        : { audio: true }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (mode === 'video' && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream
        videoPreviewRef.current.play()
      }
      const mimeType = mode === 'video'
        ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm')
        : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm')
      chunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setRecordedBlob(blob)
        setRecordedUrl(URL.createObjectURL(blob))
        setRecordingState('preview')
        stream.getTracks().forEach(t => t.stop())
      }
      recorder.start(200)
      setRecordingMode(mode)
      setRecordingState('recording')
      setRecordingDuration(0)
      timerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000)
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') showMsg(mode === 'video' ? 'Camera/microphone permission denied.' : 'Microphone permission denied.')
      else showMsg('Could not start recording: ' + (err?.message || 'Unknown error'))
    }
  }

  function pauseRecording() {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause()
      if (timerRef.current) clearInterval(timerRef.current)
      setRecordingState('paused')
    }
  }

  function resumeRecording() {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume()
      timerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000)
      setRecordingState('recording')
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
  }

  function discardRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    setRecordedBlob(null); setRecordedUrl(''); setRecordingMode('idle'); setRecordingState('idle'); setRecordingDuration(0)
  }

  function useRecording() {
    if (!recordedBlob) return
    const ext = recordingMode === 'video' ? 'webm' : 'webm'
    const mime = recordingMode === 'video' ? 'video/webm' : 'audio/webm'
    const file = new File([recordedBlob], `recording-${Date.now()}.${ext}`, { type: mime })
    setSelectedFile(file)
    setSelectedFileType(recordingMode === 'video' ? 'video' : 'audio')
    setRecordingMode('idle'); setRecordingState('idle')
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (VIDEO_TYPES.includes(file.type)) { setSelectedFile(file); setSelectedFileType('video') }
    else if (AUDIO_TYPES.includes(file.type)) { setSelectedFile(file); setSelectedFileType('audio') }
    else { showMsg('Unsupported file type.') }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>, status: 'draft' | 'published') {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') || '')
    if (!title.trim()) { showMsg('Episode title is required.'); return }
    if (status === 'published' && !selectedFile && !recordedBlob) { showMsg('Cannot publish: record audio/video or upload a file first.'); return }
    let audio_path: string | null = null, audio_url: string | null = null, audio_duration = 0
    let video_path: string | null = null, video_url: string | null = null, media_kind = 'audio'
    let media_mime_type: string | null = null, media_size_bytes: number | null = null
    if (selectedFile) {
      if (selectedFileType === 'video') {
        const r = await uploadVideoFile(selectedFile)
        if (!r) return
        video_path = r.path; video_url = r.url; audio_duration = r.duration; media_kind = 'video'
        media_mime_type = selectedFile.type; media_size_bytes = selectedFile.size
      } else {
        const r = await uploadAudioFile(selectedFile)
        if (!r) return
        audio_path = r.path; audio_url = r.url; audio_duration = r.duration
        media_mime_type = selectedFile.type; media_size_bytes = selectedFile.size
      }
    }
    const coverFile = form.get('cover_image') as File | null
    let cover_url: string | null = null, cover_path: string | null = null
    if (coverFile && coverFile.size > 0) {
      const result = await uploadCoverImage(coverFile)
      if (result) { cover_url = result.url; cover_path = result.path }
    }
    const tagsRaw = String(form.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean)
    const { error } = await supabase.from('podcast_episodes').insert({
      podcast_id: podcast.id, creator_id: userId, title,
      description: String(form.get('description') || ''),
      show_notes: String(form.get('show_notes') || ''),
      season_number: form.get('season_number') ? Number(form.get('season_number')) : null,
      episode_number: Number(form.get('episode_number') || 1),
      audio_path, audio_url, audio_duration_seconds: audio_duration,
      video_path, video_url, media_kind, media_mime_type, media_size_bytes,
      cover_image_url: cover_url, cover_path,
      transcript: String(form.get('transcript') || '') || null,
      content_warning: String(form.get('content_warning') || '') || null,
      explicit_content: Boolean(form.get('explicit_content')),
      visibility: String(form.get('visibility') || 'public'),
      comments_enabled: Boolean(form.get('comments_enabled') ?? true),
      reactions_enabled: Boolean(form.get('reactions_enabled') ?? true),
      status, published_at: status === 'published' ? new Date().toISOString() : null
    })
    if (error) { showMsg(error.message); return }
    const { data: insertedEpisode } = await supabase.from('podcast_episodes').select('id').eq('podcast_id', podcast.id).eq('creator_id', userId).order('created_at', { ascending: false }).limit(1).single()
    if (tagsRaw.length > 0 && insertedEpisode) {
      for (const tagName of tagsRaw) {
        const slug = tagName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-')
        const { data: existingTag } = await supabase.from('podcast_tags').select('id').eq('slug', slug).single()
        let tagId = existingTag?.id
        if (!tagId) { const { data: nt } = await supabase.from('podcast_tags').insert({ name: tagName, slug }).select('id').single(); tagId = nt?.id }
        if (tagId) await supabase.from('podcast_tag_links').upsert({ tag_id: tagId, episode_id: insertedEpisode.id })
      }
    }
    showMsg(status === 'published' ? 'Episode published!' : 'Episode draft saved.')
    onSaved()
  }

  return <>
    <div className="studio-section-header">
      <h3>Create Episode — {podcast.title}</h3>
      <button onClick={onBack}><ChevronLeft size={14} /> Back</button>
    </div>

    {/* Recording Section */}
    {recordingState === 'idle' && recordingMode === 'idle' && <div className="record-section">
      <h4><Mic size={14} /> Record or Upload Media</h4>
      <p className="record-hint">Record directly in your browser, or upload an existing file. Media is optional for drafts.</p>
      <div className="record-buttons">
        {typeof navigator !== 'undefined' && navigator.mediaDevices && window.MediaRecorder && <>
          <button type="button" className="record-btn audio" onClick={() => startRecording('audio')} disabled={!MediaRecorder.isTypeSupported('audio/webm;codecs=opus') && !MediaRecorder.isTypeSupported('audio/webm')}><Mic size={16} /> Record Audio</button>
          <button type="button" className="record-btn video" onClick={() => startRecording('video')} disabled={!MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') && !MediaRecorder.isTypeSupported('video/webm')}><Video size={16} /> Record Video</button>
        </>}
        <label className="record-btn upload"><Upload size={16} /> Upload file<input type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/x-m4a,audio/webm,audio/ogg,audio/wav,video/mp4,video/webm,video/quicktime" onChange={handleFileSelect} /></label>
      </div>
      {typeof navigator === 'undefined' || !navigator.mediaDevices || !window.MediaRecorder && <p className="record-hint" style={{ color: '#e57373' }}>Recording is not supported in this browser. Please upload a file instead.</p>}
    </div>}

    {/* Active Recording */}
    {(recordingState === 'recording' || recordingState === 'paused') && <div className={`record-active ${recordingMode}`}>
      <div className="record-indicator"><span className="pulse-dot" />{recordingState === 'recording' ? 'Recording' : 'Paused'} — {recordingMode === 'video' ? 'Video' : 'Audio'}</div>
      <div className="record-timer">{formatRecTimer(recordingDuration)}</div>
      {recordingMode === 'video' && <video ref={videoPreviewRef} autoPlay playsInline muted className="record-video-preview" />}
      <div className="record-controls">
        {recordingState === 'recording' ? <button type="button" onClick={pauseRecording}><Pause size={14} /> Pause</button> : <button type="button" onClick={resumeRecording}><Play size={14} /> Resume</button>}
        <button type="button" className="stop" onClick={stopRecording}><Square size={14} /> Stop</button>
        <button type="button" className="cancel" onClick={discardRecording}><X size={14} /> Cancel</button>
      </div>
    </div>}

    {/* Recording Preview */}
    {recordingState === 'preview' && <div className="record-preview">
      <h4>Recording preview</h4>
      {recordingMode === 'audio' ? <audio controls src={recordedUrl} className="record-audio-preview" /> : <video controls src={recordedUrl} className="record-video-preview" />}
      <div className="record-preview-actions">
        <button type="button" onClick={useRecording}><Play size={14} /> Use this recording</button>
        <button type="button" className="cancel" onClick={discardRecording}><Trash2 size={14} /> Discard</button>
      </div>
    </div>}

    {/* Selected File Display */}
    {selectedFile && <div className="selected-file">
      <div className="selected-file-info">
        {selectedFileType === 'video' ? <Video size={16} /> : <FileAudio size={16} />}
        <span><b>{selectedFile.name}</b><small>{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · {selectedFileType === 'video' ? 'Video' : 'Audio'}</small></span>
      </div>
      <button type="button" className="cancel" onClick={() => { setSelectedFile(null); setSelectedFileType(null) }}><X size={14} /> Remove</button>
    </div>}

    <form ref={formRef} onSubmit={(e) => handleSubmit(e, 'draft')} className="podcast-form">
      <label>Title<input name="title" required minLength={3} maxLength={160} placeholder="Episode title" /></label>
      <div className="form-row">
        <label>Season number<input name="season_number" type="number" min="1" placeholder="Optional" /></label>
        <label>Episode number<input name="episode_number" type="number" min="1" defaultValue="1" required /></label>
      </div>
      <label>Description<textarea name="description" maxLength={8000} placeholder="Episode description" /></label>
      <label>Show notes<small>Optional detailed notes for this episode.</small><textarea name="show_notes" maxLength={10000} placeholder="Detailed show notes (optional)" /></label>
      <label>Cover image<small>Optional. Leave empty to use podcast cover.</small>
        <div className="cover-upload">{coverPreview ? <img src={coverPreview} alt="Cover preview" /> : <div className="cover-placeholder"><Upload size={20} /> Click to upload cover</div>}
          <input type="file" name="cover_image" accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) setPreviewWithCleanup(coverPreview, setCoverPreview, URL.createObjectURL(f)) }} />
        </div>
      </label>
      <label>Transcript<textarea name="transcript" maxLength={50000} placeholder="Optional transcript for accessibility" /></label>
      <label>Tags<input name="tags" placeholder="Comma-separated tags" /></label>
      <label>Content warning<input name="content_warning" placeholder="Optional content warning" /></label>
      <div className="form-row">
        <label>Visibility<select name="visibility"><option value="public">Public</option><option value="connections">Connections only</option><option value="group">Selected group</option><option value="private">Private draft</option></select></label>
        <label className="check-label"><input type="checkbox" name="comments_enabled" defaultChecked /> Enable comments</label>
        <label className="check-label"><input type="checkbox" name="reactions_enabled" defaultChecked /> Enable reactions</label>
        <label className="check-label"><input type="checkbox" name="explicit_content" /> Explicit content</label>
      </div>
      <div className="episode-submit-row">
        <button type="submit"><Upload size={14} /> Save as draft</button>
        <button type="button" className="publish-btn" onClick={() => { if (formRef.current) handleSubmit({ preventDefault: () => {}, currentTarget: formRef.current } as any, 'published') }}><Send size={14} /> Publish now</button>
      </div>
    </form>
  </>
}

function EpisodeEditForm({ podcast, episodeId, userId, uploadCoverImage, onBack, onSaved, showMsg }: {
  podcast: Podcast; episodeId: string; userId: string; uploadCoverImage: (file: File) => Promise<{ path: string; url: string } | null>
  onBack: () => void; onSaved: () => void; showMsg: (msg: string) => void
}) {
  const [episode, setEpisode] = useState<StudioEpisode | null>(null)
  const [loading, setLoading] = useState(true)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  useEffect(() => {
    supabase.from('podcast_episodes').select('*').eq('id', episodeId).eq('creator_id', userId).is('deleted_at', null).single().then(async ({ data }) => {
      if (data) {
        const refreshed = await refreshEpisodeUrls(data as StudioEpisode)
        setEpisode(refreshed)
        setCoverPreview(data.cover_image_url || null)
      } else {
        setEpisode(null)
      }
      setLoading(false)
    })
  }, [episodeId, userId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!episode) return
    const form = new FormData(event.currentTarget)
    const audioFile = form.get('audio_file') as File | null
    const videoFile = form.get('video_file') as File | null
    let audio_path = episode.audio_path, audio_url = episode.audio_url, audio_duration = episode.audio_duration_seconds
    let video_path = episode.video_path, video_url = episode.video_url, media_kind = episode.media_kind || 'audio'
    let media_mime_type = episode.media_mime_type, media_size_bytes = episode.media_size_bytes
    if (videoFile && videoFile.size > 0) {
      if (!VIDEO_TYPES.includes(videoFile.type)) { showMsg('Unsupported video type. Supported: MP4, WebM, MOV.'); return }
      if (videoFile.size > MAX_VIDEO) { showMsg('Video must be under 500MB.'); return }
      if (episode.video_path) supabase.storage.from('podcast-video').remove([episode.video_path]).catch(() => {})
      const videoDuration = await new Promise<number>(resolve => {
        const v = document.createElement('video'); v.preload = 'metadata'
        v.src = URL.createObjectURL(videoFile)
        v.onloadedmetadata = () => { resolve(Math.floor(v.duration || 0)); URL.revokeObjectURL(v.src) }
        v.onerror = () => { resolve(0); URL.revokeObjectURL(v.src) }
      })
      if (videoDuration > MAX_DURATION) { showMsg(`Episode duration is ${Math.floor(videoDuration / 60)}:${String(videoDuration % 60).padStart(2, '0')}. Maximum allowed is 60 minutes.`); return }
      const path = `${userId}/${crypto.randomUUID()}-${safeFileName(videoFile.name)}`
      setUploadProgress(0)
      const { error } = await supabase.storage.from('podcast-video').upload(path, videoFile, { contentType: videoFile.type })
      setUploadProgress(null)
      if (error) { showMsg(error.message); return }
      const { data: urlData } = await supabase.storage.from('podcast-video').createSignedUrl(path, SIGNED_URL_EXPIRY)
      if (!urlData?.signedUrl) { showMsg('Failed to get video URL.'); return }
      video_path = path; video_url = urlData.signedUrl; audio_duration = videoDuration
      media_kind = 'video'; media_mime_type = videoFile.type; media_size_bytes = videoFile.size
    } else if (audioFile && audioFile.size > 0) {
      if (!AUDIO_TYPES.includes(audioFile.type)) { showMsg('Unsupported audio type. Supported: MP3, M4A, AAC, WebM, OGG, WAV.'); return }
      if (audioFile.size > MAX_AUDIO) { showMsg('Audio must be under 100MB.'); return }
      if (episode.audio_path) supabase.storage.from('podcast-audio').remove([episode.audio_path]).catch(() => {})
      const audioDuration = await new Promise<number>(resolve => {
        const a = new Audio(); a.src = URL.createObjectURL(audioFile)
        a.onloadedmetadata = () => { resolve(Math.floor(a.duration || 0)); URL.revokeObjectURL(a.src) }
        a.onerror = () => { resolve(0); URL.revokeObjectURL(a.src) }
      })
      if (audioDuration > MAX_DURATION) { showMsg(`Episode duration is ${Math.floor(audioDuration / 60)}:${String(audioDuration % 60).padStart(2, '0')}. Maximum allowed is 60 minutes.`); return }
      const path = `${userId}/${crypto.randomUUID()}-${safeFileName(audioFile.name)}`
      setUploadProgress(0)
      const { error } = await supabase.storage.from('podcast-audio').upload(path, audioFile, { contentType: audioFile.type })
      setUploadProgress(null)
      if (error) { showMsg(error.message); return }
      const { data: urlData } = await supabase.storage.from('podcast-audio').createSignedUrl(path, SIGNED_URL_EXPIRY)
      if (!urlData?.signedUrl) { showMsg('Failed to get audio URL.'); return }
      audio_path = path; audio_url = urlData.signedUrl; audio_duration = audioDuration
      media_kind = 'audio'; media_mime_type = audioFile.type; media_size_bytes = audioFile.size
    }
    const coverFile = form.get('cover_image') as File | null
    let cover_url = episode.cover_image_url, cover_path_val = episode.cover_path
    if (coverFile && coverFile.size > 0) {
      const result = await uploadCoverImage(coverFile)
      if (result) { cover_url = result.url; cover_path_val = result.path }
    }
    const { error } = await supabase.from('podcast_episodes').update({
      title: String(form.get('title') || ''), description: String(form.get('description') || ''),
      show_notes: String(form.get('show_notes') || ''),
      season_number: form.get('season_number') ? Number(form.get('season_number')) : null,
      episode_number: Number(form.get('episode_number') || 1),
      audio_path, audio_url, audio_duration_seconds: audio_duration,
      video_path, video_url, media_kind, media_mime_type, media_size_bytes,
      cover_image_url: cover_url, cover_path: cover_path_val,
      transcript: String(form.get('transcript') || '') || null,
      content_warning: String(form.get('content_warning') || '') || null,
      explicit_content: Boolean(form.get('explicit_content')),
      visibility: String(form.get('visibility') || 'public'),
      comments_enabled: Boolean(form.get('comments_enabled') ?? true),
      reactions_enabled: Boolean(form.get('reactions_enabled') ?? true),
      updated_at: new Date().toISOString()
    }).eq('id', episode.id)
    if (error) { showMsg(error.message); return }
    showMsg('Episode updated.')
    onSaved()
  }

  if (loading) return <div className="empty-state">Loading episode...</div>
  if (!episode) return <div className="empty-state">Episode not found.</div>

  return <>
    <div className="studio-section-header">
      <h3>Edit Episode</h3>
      <button onClick={onBack}><ChevronLeft size={14} /> Back</button>
    </div>
    {uploadProgress !== null && <div className="upload-progress"><small>Uploading…</small></div>}
    <form onSubmit={handleSubmit} className="podcast-form">
      <label>Title<input name="title" required minLength={3} maxLength={160} defaultValue={episode.title} /></label>
      <div className="form-row">
        <label>Season number<input name="season_number" type="number" min="1" defaultValue={episode.season_number ?? ''} placeholder="Optional" /></label>
        <label>Episode number<input name="episode_number" type="number" min="1" defaultValue={episode.episode_number} required /></label>
      </div>
      <label>Description<textarea name="description" maxLength={8000} defaultValue={episode.description} /></label>
      <label>Show notes<small>Optional detailed notes.</small><textarea name="show_notes" maxLength={10000} defaultValue={episode.show_notes || ''} placeholder="Detailed show notes" /></label>
      {episode.audio_url && <div className="current-audio"><small>Current audio:</small><audio controls src={episode.audio_url} preload="none" /></div>}
      {episode.video_url && <div className="current-audio"><small>Current video:</small><video controls src={episode.video_url} preload="none" style={{ width: '100%', maxHeight: 200, borderRadius: 8 }} /></div>}
      <label>Replace audio file<small>Leave empty to keep current. Max 100MB, max 60 minutes.</small><input type="file" name="audio_file" accept="audio/mpeg,audio/mp4,audio/aac,audio/x-m4a,audio/webm,audio/ogg,audio/wav" /></label>
      <label>Replace video file<small>Leave empty to keep current. Max 500MB, max 60 minutes.</small><input type="file" name="video_file" accept="video/mp4,video/webm,video/quicktime" /></label>
      <label>Cover image<small>Leave empty to keep current cover.</small>
        <div className="cover-upload">{coverPreview ? <img src={coverPreview} alt="Cover preview" /> : <div className="cover-placeholder"><Upload size={20} /> Click to upload cover</div>}
          <input type="file" name="cover_image" accept="image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) setPreviewWithCleanup(coverPreview, setCoverPreview, URL.createObjectURL(f)) }} />
        </div>
      </label>
      <label>Transcript<textarea name="transcript" maxLength={50000} defaultValue={episode.transcript || ''} placeholder="Optional transcript" /></label>
      <label>Content warning<input name="content_warning" defaultValue={episode.content_warning || ''} placeholder="Optional content warning" /></label>
      <div className="form-row">
        <label>Visibility<select name="visibility" defaultValue={episode.visibility}><option value="public">Public</option><option value="connections">Connections only</option><option value="group">Selected group</option><option value="private">Private draft</option></select></label>
        <label className="check-label"><input type="checkbox" name="comments_enabled" defaultChecked={episode.comments_enabled} /> Enable comments</label>
        <label className="check-label"><input type="checkbox" name="reactions_enabled" defaultChecked={episode.reactions_enabled} /> Enable reactions</label>
        <label className="check-label"><input type="checkbox" name="explicit_content" defaultChecked={episode.explicit_content} /> Explicit content</label>
      </div>
      <button><Edit3 size={14} /> Save changes</button>
    </form>
  </>
}

export function PodcastPlatform({ userId, isHealer, podcastId, episodeId, studio, studioAction, studioPodcastId, studioEpisodeId, onClose, onOpenPodcast, onOpenEpisode, onOpenProfile, onPlayEpisode }: {
  userId: string; isHealer?: boolean; podcastId?: string | null; episodeId?: string | null; studio?: boolean;
  studioAction?: string | null; studioPodcastId?: string | null; studioEpisodeId?: string | null;
  onClose: () => void;
  onOpenPodcast: (id: string) => void; onOpenEpisode: (podcastId: string, episodeId: string) => void;
  onOpenProfile: (id: string) => void; onPlayEpisode: (episode: PlayerEpisode) => void
}) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [language, setLanguage] = useState('all')
  const [sort, setSort] = useState('popular')
  const [items, setItems] = useState<Podcast[]>([])
  const [selected, setSelected] = useState<Podcast | null>(null)
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [pageOffset, setPageOffset] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [following, setFollowing] = useState(false)
  const [reportMode, setReportMode] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const PAGE_LIMIT = 18

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  const load = useCallback((offset = 0, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true)
    supabase.rpc('search_podcasts', { search_text: debouncedQuery, category_filter: category, language_filter: language, tag_filter: 'all', sort_by: sort, page_limit: PAGE_LIMIT, page_offset: offset }).then(({ data }) => {
      const rows = (data as Podcast[]) || []
      const total = rows.length > 0 ? rows[0].total_count || rows.length : 0
      setItems(prev => append ? [...prev, ...rows] : rows)
      setTotalCount(total)
      setPageOffset(offset)
      setLoading(false)
      setLoadingMore(false)
    })
  }, [debouncedQuery, category, language, sort])

  useEffect(() => { load(0) }, [load])

  useEffect(() => {
    if (!podcastId) { setSelected(null); return }
    let live = true
    supabase.from('podcasts').select('*').eq('id', podcastId).single().then(async ({ data }) => {
      if (!live || !data) { if (live) setSelected(null); return }
      const { data: creator } = await supabase.from('profiles').select('display_name,full_name,avatar_url,professional_verification_status').eq('id', data.creator_id).single()
      const [{ count: followerCount }, { count: episodeCount }] = await Promise.all([
        supabase.from('podcast_follows').select('podcast_id', { count: 'exact', head: true }).eq('podcast_id', podcastId),
        supabase.from('podcast_episodes').select('id', { count: 'exact', head: true }).eq('podcast_id', podcastId).eq('status', 'published').is('deleted_at', null)
      ])
      if (!live) return
      setSelected({
        ...data,
        creator_name: creator?.display_name || creator?.full_name || 'Unknown',
        creator_avatar_url: creator?.avatar_url || null,
        professional_title: creator?.display_name || null,
        verified: creator?.professional_verification_status === 'approved',
        follower_count: followerCount || 0,
        episode_count: episodeCount || 0,
        total_plays: 0,
        tags: [],
        popularity_score: 0,
        total_count: 1
      })
      supabase.from('podcast_follows').select('podcast_id').eq('podcast_id', podcastId).eq('user_id', userId).maybeSingle().then(({ data: followData }) => { if (live) setFollowing(Boolean(followData)) })
    })
    return () => { live = false }
  }, [podcastId, userId])

  async function follow() {
    if (!selected) return
    if (following) await supabase.from('podcast_follows').delete().eq('podcast_id', selected.id).eq('user_id', userId)
    else await supabase.from('podcast_follows').insert({ podcast_id: selected.id, user_id: userId })
    setFollowing(!following)
  }

  async function submitReport() {
    if (!selected || !reportReason.trim()) return
    await supabase.from('podcast_reports').insert({ podcast_id: selected.id, reporter_id: userId, reason: reportReason.trim() })
    setReportMode(false)
    setReportReason('')
  }

  return <div className="feature-overlay"><section className="directory-window podcasts-window">
    <header>
      <div><h2>{studio ? 'Podcast Studio' : selected ? 'Podcast' : 'Podcasts'}</h2><p>{studio ? 'Create, record, upload, and manage your podcast content.' : 'Discover real wellness audio from Nova Resort professionals.'}</p></div>
      {!studio && !selected && isHealer && <button className="healer-create-action" style={{ width: 'auto', padding: '0 12px' }} onClick={() => onOpenPodcast('manage')}><Mic size={14} /> Create Podcast</button>}
      <button onClick={onClose}><X /></button>
    </header>

    {studio ? <PodcastStudio userId={userId} initialAction={studioAction || 'list'} initialPodcastId={studioPodcastId} initialEpisodeId={studioEpisodeId} onNavigate={onOpenPodcast} /> : selected ? <div className="podcast-detail-view">
      <button className="back-link" onClick={() => onOpenPodcast('')}><ChevronLeft size={14} /> All podcasts</button>
      {selected.creator_id === userId && <div className="podcast-owner-actions"><button onClick={() => onOpenPodcast('manage')}><Mic size={14} /> Manage in Studio</button></div>}
      <section className="podcast-hero">
        <Cover src={selected.cover_image_url} title={selected.title} />
        <div>
          <div className="podcast-meta-line">
            <span>{selected.category}</span><span>{selected.language}</span>
            {selected.verified && <span><BadgeCheck size={13} /> Verified creator</span>}
          </div>
          <h3>{selected.title}</h3>
          <Creator podcast={selected} onOpenProfile={onOpenProfile} />
          <p>{selected.description || selected.short_description}</p>
          <div className="podcast-tags">{selected.tags.map(tag => <button key={tag} onClick={() => { setQuery(tag); onOpenPodcast('') }}>{tag}</button>)}</div>
          <div className="podcast-stats">
            <span>{selected.follower_count} followers</span>
            <span>{selected.episode_count} episodes</span>
            <span>{selected.total_plays} plays</span>
          </div>
          <div className="podcast-actions">
            <button onClick={follow}>{following ? 'Following' : 'Follow'}</button>
            <button onClick={async () => {
              const url = `${location.origin}${location.pathname}#/podcasts/${selected.id}`
              if (navigator.share) { try { await navigator.share({ title: selected.title, url }) } catch {} }
              else { await navigator.clipboard?.writeText(url) }
            }}><Share2 size={14} /> Share</button>
            <button onClick={() => setReportMode(!reportMode)}><ShieldAlert size={14} /> Report</button>
          </div>
          {reportMode && <form className="report-inline" onSubmit={e => { e.preventDefault(); submitReport() }}>
            <input value={reportReason} onChange={e => setReportReason(e.target.value)} placeholder="Describe your concern..." required />
            <div className="report-actions">
              <button type="submit"><Send size={12} /> Submit</button>
              <button type="button" onClick={() => { setReportMode(false); setReportReason('') }}>Cancel</button>
            </div>
          </form>}
        </div>
      </section>
      <p className="podcast-disclaimer">Podcast content is provided for general education and wellbeing support and does not replace professional diagnosis, treatment, or emergency care.</p>
      <EpisodeList podcast={selected} userId={userId} selectedEpisodeId={episodeId} onPlay={episode => { onOpenEpisode(selected.id, episode.id); onPlayEpisode(episode) }} />
    </div> : <div className="podcast-directory">
      <div className="podcast-filters">
        <label><Search size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title, healer, topic, tag, language, or description" /></label>
        <select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}</select>
        <select value={language} onChange={e => setLanguage(e.target.value)}>{languages.map(l => <option key={l} value={l}>{l === 'all' ? 'All languages' : l}</option>)}</select>
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="popular">Most popular</option>
          <option value="newest">Newest</option>
          <option value="followed">Most followed</option>
          <option value="played">Most played</option>
        </select>
      </div>
      {!loading && totalCount > 0 && <div className="podcast-result-count">{totalCount} podcast{totalCount !== 1 ? 's' : ''} found</div>}
      {loading ? <div className="podcast-grid">{Array.from({ length: 6 }).map((_, i) => <article key={i} className="podcast-card skeleton" />)}</div> : items.length === 0 ? <div className="empty-state"><Radio /><h3>No podcasts found</h3><p>{query ? 'Try a different search or category.' : 'No published podcasts yet. Healer accounts can create from Podcast Studio.'}</p></div> : <>
        <div className="podcast-grid">{items.map(item => <PodcastCard key={item.id} podcast={item} onOpen={onOpenPodcast} onPlay={async (podcast) => { if (!podcast.latest_episode_id) return; const { data } = await supabase.rpc('list_podcast_episodes', { podcast_ref: podcast.id, page_limit: 1, page_offset: 0 }); const ep = ((data as Episode[]) || []).find(e => e.id === podcast.latest_episode_id) || ((data as Episode[]) || [])[0]; if (ep) onPlayEpisode({ ...ep, podcast_title: podcast.title, creator_name: podcast.creator_name }) }} onOpenProfile={onOpenProfile} />)}</div>
        {items.length < totalCount && <div className="podcast-load-more"><button onClick={() => load(pageOffset + PAGE_LIMIT, true)} disabled={loadingMore}>{loadingMore ? 'Loading...' : 'Load more podcasts'}</button></div>}
      </>}
    </div>}
  </section></div>
}

export function ProfilePodcastSection({ profileId, onOpenPodcast }: { profileId: string; onOpenPodcast: (id: string) => void }) {
  const [items, setItems] = useState<ProfilePodcast[]>([])
  useEffect(() => {
    supabase.from('podcasts').select('id,title,short_description,cover_image_url,follower_count,episode_count,total_plays').eq('creator_id', profileId).eq('status', 'published').limit(6).then(({ data }) => setItems(((data as any[]) || []).map(p => ({ ...p, latest_episode_title: null, tags: [] }))))
  }, [profileId])
  if (items.length === 0) return null
  return <section className="profile-podcasts"><h3>Podcasts</h3><div>{items.map(p => <button key={p.id} onClick={() => onOpenPodcast(p.id)}><Cover src={p.cover_image_url} title={p.title} /><span><b>{p.title}</b><small>{p.short_description}</small></span></button>)}</div></section>
}
