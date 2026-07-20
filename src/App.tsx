import { FormEvent, useEffect, useState } from 'react'
import {
  Bell, CalendarDays, ChevronDown, ChevronRight, CircleUserRound, Clock3,
  Bot, Compass, Heart, Home, Leaf, LockKeyhole, Menu, MessageCircleMore, MoreHorizontal,
  Search, Send, Settings, ShieldCheck, Sparkles, UsersRound, Video, X, Moon, Sun, Languages, UserPlus, Headphones
} from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { ChatRoom, Connections, DbRoom, EditProfile, Notifications, PeopleDirectory, SafetyCenter } from './CommunityFeatures'
import { AICompanion } from './AICompanion'
import { PrivateChats, PrivateChatRoom } from './PrivateMessaging'
import { DiscoverPeople, HealersDirectory } from './PeopleDiscovery'
import { SessionsPage } from './SessionsEvents'
import { PodcastPlatform, PodcastMiniPlayer, PopularPodcastsStrip, ProfilePodcastSection, PlayerEpisode } from './PodcastPlatform'
import { getFeaturedHealers, PROFESSIONAL_ROLES } from './services/healers'
import { applyLanguage, getLanguage, switchLanguage } from './i18n'
import './social-home.css'

type Room = {
  title: string; description: string; people: number; color: string; icon: string; tags: string[]
}
type LiveProfile = { id:string;full_name:string;display_name:string|null;avatar_url:string|null;profile_type:string;specialties:string[]|null;interests?:string[]|null;about:string|null;country?:string|null;online:boolean|null;visibility?:string|null;next_session?:NextSession|null }
type RecentMessage = { id:string;body:string;created_at:string;profiles?:{full_name:string;avatar_url:string|null}|null;rooms?:{id:string;name:string}|null }
type Friendship = { id:string; requester_id:string; addressee_id:string; status:string }
type NextSession = { id:string; title:string; starts_at:string; host_id:string }
type Feature = 'discover'|'people'|'healers'|'profile'|'notifications'|'messages'|'safety'|'connections'|'sessions'|'ai'|'podcasts'
type AppRoute = { feature: Feature | null; roomId: string | null; profileId: string | null; podcastId: string | null; episodeId: string | null; podcastStudio: boolean }

function routeFromHash(): AppRoute {
  const pathRoute = window.location.pathname
    .replace(/^\/NovaResort\/?/, '')
    .replace(/^\/+|\/+$/g, '')
  const value = decodeURIComponent(window.location.hash.replace(/^#\/?/, '') || pathRoute || 'home')
  const base = { feature: null, roomId: null, profileId: null, podcastId: null, episodeId: null, podcastStudio: false }
  if (value.startsWith('room/')) return { ...base, roomId: value.slice(5) || null }
  if (value.startsWith('profile/')) return { ...base, profileId: value.slice(8) || null }
  if (value === 'podcasts/manage') return { ...base, feature: 'podcasts', podcastStudio: true }
  if (value.startsWith('podcasts/')) {
    const parts = value.split('/')
    return { ...base, feature: 'podcasts', podcastId: parts[1] || null, episodeId: parts[3] || null }
  }
  if (value === 'podcasts') return { ...base, feature: 'podcasts' }
  if (value === 'discover' || value === 'members' || value === 'members/online') return { ...base, feature: 'discover' }
  if (value === 'community' || value === 'rooms' || value === 'discover/rooms') return { ...base, feature: 'people' }
  if (value === 'healers' || value === 'community/healers') return { ...base, feature: 'healers' }
  if (value === 'connections') return { ...base, feature: 'connections' }
  if (value === 'messages') return { ...base, feature: 'messages' }
  if (value === 'ai' || value.startsWith('ai/')) return { ...base, feature: 'ai' }
  if (value === 'sessions' || value === 'sessions/upcoming') return { ...base, feature: 'sessions' }
  if (value === 'notifications') return { ...base, feature: 'notifications' }
  if (value === 'profile' || value === 'settings') return { ...base, feature: 'profile' }
  if (value === 'safety' || value === 'community-guidelines' || value === 'privacy' || value === 'terms') return { ...base, feature: 'safety' }
  return base
}

function setRoute(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const next = `#${normalized}`
  if (window.location.hash === next) window.dispatchEvent(new HashChangeEvent('hashchange'))
  else window.location.hash = next
}

function navFromFeature(feature: Feature | null) {
  if (feature === 'discover') return 'Discover'
  if (feature === 'people') return 'Community'
  if (feature === 'healers') return 'Healers'
  if (feature === 'messages') return 'Messages'
  if (feature === 'ai') return 'AI Companion'
  if (feature === 'connections') return 'Connections'
  if (feature === 'sessions') return 'Sessions'
  if (feature === 'podcasts') return 'Podcasts'
  return 'Home'
}

const rooms: Room[] = [
  { title: 'Heart to Heart', description: 'A gentle space for honest conversations and mutual support.', people: 28, color: 'peach', icon: '♡', tags: ['Open', 'Moderated'] },
  { title: 'Mindful Moments', description: 'Pause, breathe, and return to yourself with the community.', people: 16, color: 'sage', icon: '✦', tags: ['Open', 'Guided'] },
  { title: 'Self Growth', description: 'Celebrate progress, share intentions, and grow together.', people: 21, color: 'lavender', icon: '⌁', tags: ['Open', 'Community'] },
]

function Logo() {
  return <div className="logo"><div className="logo-mark"><Leaf size={20} /><Sparkles size={10} /></div><div><b>nova</b><span>resort</span></div></div>
}

const profileName = (profile:LiveProfile) => profile.display_name || profile.full_name || 'Nova member'
const profileInitials = (name?:string|null) => (name || 'N').split(' ').map(part => part[0]).join('').slice(0,2).toUpperCase()
const healerRoles = [...PROFESSIONAL_ROLES]
const roleLabel = (profile:LiveProfile) => profile.profile_type === 'healer' ? 'Healer / Therapist' : profile.profile_type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
const relationshipFor = (id:string, rows:Friendship[]) => rows.find(row => row.requester_id === id || row.addressee_id === id)

function AuthScreen() {
  const language = getLanguage()
  const [mode, setMode] = useState<'login'|'register'|'reset'>('login')
  const [profileType, setProfileType] = useState('member')
  const [professionalTitle, setProfessionalTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const professionalTitles = ['Psychologist','Therapist','Life Coach','Mental Health Counselor','Meditation Teacher','Mindfulness Coach','Holistic Therapist','Social Worker','Wellness Practitioner','Other']
  const specialties = ['Anxiety','Depression','Trauma','PTSD','Grief','Relationships','Marriage Counseling','Family Therapy','Parenting','ADHD','Addiction Recovery','Stress Management','Burnout','Mindfulness','Meditation','Self-Esteem','Personal Growth','Emotional Healing','Spiritual Guidance','Sleep',"Women's Health","Men's Health",'Teen Support','Career Coaching','Life Coaching','Wellness','Nutrition','Breathwork','Yoga','Other']
  const languages = ['English','Hebrew','Arabic','Spanish','French','Russian','German','Portuguese','Italian','Other']
  const cleanList = (value:FormDataEntryValue|null) => String(value||'').split(',').map(item=>item.trim()).filter(Boolean)
  const parseEntries = (value:FormDataEntryValue|null, keys:string[]) => String(value||'').split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const parts=line.split('|').map(item=>item.trim());return keys.reduce((entry,key,index)=>({...entry,[key]:parts[index]||''}),{} as Record<string,string>)})
  const safeFileName = (name:string) => name.replace(/[^a-zA-Z0-9._-]/g,'-')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') || '').trim()
    const password = String(data.get('password') || '')
    setLoading(true); setError(''); setMessage('')
    try {
      if (mode === 'register') {
        const fullName = String(data.get('fullName') || '').trim()
        const requestedType = String(data.get('profileType') || 'member')
        if (password !== String(data.get('confirmPassword') || '')) throw new Error('Passwords do not match.')
        if (!data.get('guidelines')) throw new Error('Please accept the community guidelines.')
        const healerDocuments = Array.from(data.getAll('healerDocuments')).filter((item): item is File => item instanceof File && item.size > 0)
        const selectedSpecialties = data.getAll('specialties').map(String).filter(Boolean)
        const selectedLanguages = data.getAll('languages').map(String).filter(Boolean)
        if (requestedType === 'healer') {
          if (!data.get('professionalTitle') || (data.get('professionalTitle') === 'Other' && !String(data.get('professionalTitleOther')||'').trim())) throw new Error('Please enter your professional title.')
          if (selectedSpecialties.length === 0 && cleanList(data.get('specialtiesOther')).length === 0) throw new Error('Please choose at least one area of expertise.')
          if (!String(data.get('professionalBiography')||'').trim()) throw new Error('Please enter your professional biography.')
          if (!String(data.get('education')||'').trim()) throw new Error('Please add at least one education entry.')
          if (!String(data.get('certifications')||'').trim()) throw new Error('Please add at least one professional certification.')
          if (healerDocuments.length === 0) throw new Error('Please attach at least one supporting document.')
          if (!Number(data.get('yearsExperience'))) throw new Error('Please enter your years of experience.')
          if (selectedLanguages.length === 0 && cleanList(data.get('languagesOther')).length === 0) throw new Error('Please choose at least one language.')
          if (!String(data.get('country')||'').trim()) throw new Error('Please enter your country.')
          if (!data.get('sessionAvailability')) throw new Error('Please choose your session availability.')
          if (data.getAll('sessionTypes').length === 0) throw new Error('Please choose at least one session type.')
        }
        const healerApplication = requestedType === 'healer' ? {
          professional_title: data.get('professionalTitle') === 'Other' ? String(data.get('professionalTitleOther')||'').trim() : String(data.get('professionalTitle')||'').trim(),
          specialties: [...selectedSpecialties.filter(item=>item!=='Other'), ...cleanList(data.get('specialtiesOther'))],
          biography: String(data.get('professionalBiography')||'').trim(),
          education: parseEntries(data.get('education'), ['institution_name','program_or_degree','country','graduation_year']),
          certifications: parseEntries(data.get('certifications'), ['certificate_name','issuing_organization','issue_date','expiration_date','certificate_number']),
          document_names: healerDocuments.map(file=>file.name),
          years_experience: Number(data.get('yearsExperience')||0),
          languages: [...selectedLanguages.filter(item=>item!=='Other'), ...cleanList(data.get('languagesOther'))],
          country: String(data.get('country')||'').trim(),
          city: String(data.get('city')||'').trim(),
          website: String(data.get('professionalWebsite')||'').trim(),
          linkedin: String(data.get('linkedinProfile')||'').trim(),
          professional_license: { license_number:String(data.get('licenseNumber')||'').trim(), licensing_authority:String(data.get('licensingAuthority')||'').trim(), country:String(data.get('licenseCountry')||'').trim() },
          insurance_accepted: cleanList(data.get('insuranceAccepted')),
          session_availability: String(data.get('sessionAvailability')||''),
          session_types: data.getAll('sessionTypes').map(String)
        } : null
        const { data:authData, error } = await supabase.auth.signUp({ email, password, options: {
          emailRedirectTo: 'https://shirkan84.github.io/NovaResort/',
          data: { full_name: fullName, profile_type: 'member', requested_profile_type: requestedType, country: data.get('country'), healer_application: healerApplication }
        }})
        if (error) throw error
        if (requestedType === 'healer' && authData.user && authData.session && healerDocuments.length) {
          const { data:application } = await supabase.from('healer_applications').select('id').eq('user_id',authData.user.id).single()
          for (const file of healerDocuments) {
            const path = `${authData.user.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`
            const { error:uploadError } = await supabase.storage.from('healer-documents').upload(path,file,{contentType:file.type})
            if (!uploadError) await supabase.from('healer_application_documents').insert({application_id:application?.id||null,user_id:authData.user.id,storage_path:path,original_name:file.name,mime_type:file.type,file_size:file.size})
          }
        }
        setMessage(requestedType === 'healer' ? 'Your account was created as a Regular Member and your healer application is pending administrator review. Please check your email to verify your account.' : 'Welcome to Nova Resort. Please check your email to verify your account.')
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'https://shirkan84.github.io/NovaResort/' })
        if (error) throw error
        setMessage('Password reset instructions have been sent to your email.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.') }
    finally { setLoading(false) }
  }

  return <div className="auth-page"><button className="language-toggle auth-language" onClick={()=>switchLanguage(language==='en'?'he':'en')}><Languages/>{language==='en'?'עברית':'English'}</button>
    <div className="auth-brand"><Logo/><div className="auth-hero-copy"><span className="auth-kicker"><Sparkles size={13}/> A SAFE SPACE TO BE HUMAN</span><h1>Connection can be<br/><em>part of the healing.</em></h1><p>Talk, listen, and grow in a thoughtful community built around emotional wellbeing and meaningful human connection.</p><div className="auth-values"><span><Heart/>Kind connection</span><span><ShieldCheck/>Safety first</span><span><Leaf/>Space to grow</span></div></div><p className="auth-disclaimer">Nova Resort is a peer-support community and is not a substitute for professional or emergency services.</p></div>
    <div className="auth-panel"><div className="auth-mobile-logo"><Logo/></div><div className="auth-form-wrap"><span className="welcome-icon"><Leaf size={22}/></span>
      <h2>{mode === 'register' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome to Nova Resort'}</h2>
      <p>{mode === 'register' ? 'Join a community where you can feel seen and supported.' : mode === 'reset' ? 'We’ll send a secure reset link to your email.' : 'Sign in to return to your community.'}</p>
      {message && <div className="form-message success"><ShieldCheck size={17}/>{message}</div>}{error && <div className="form-message error">{error}</div>}
      <form onSubmit={submit}>
        {mode === 'register' && <><label>Full name<input name="fullName" required placeholder="Your full name"/></label><div className="form-row"><label>Country<input name="country" required placeholder="Your country"/></label><label>Profile type<select name="profileType" value={profileType} onChange={event=>setProfileType(event.target.value)}><option value="member">Community member</option><option value="healer">Healer / Therapist</option></select></label></div>{profileType==='healer'&&<section className="healer-registration"><h3>Healer Registration Requirements</h3><p>Healer accounts are created as Regular Member accounts until an administrator reviews and approves the application.</p><div className="form-row"><label>Professional Title<select name="professionalTitle" required value={professionalTitle} onChange={event=>setProfessionalTitle(event.target.value)}><option value="">Choose title</option>{professionalTitles.map(title=><option key={title}>{title}</option>)}</select></label>{professionalTitle==='Other'&&<label>Custom title<input name="professionalTitleOther" required placeholder="Your professional title"/></label>}</div><fieldset><legend>Areas of Expertise</legend><div className="option-grid">{specialties.map(item=><label key={item}><input type="checkbox" name="specialties" value={item}/>{item}</label>)}</div><input name="specialtiesOther" placeholder="Other specialties, separated by commas"/></fieldset><label>Professional Biography<textarea name="professionalBiography" required maxLength={2000} placeholder="Who you are, your approach, experience, and how you help people."/></label><label>Education<textarea name="education" required placeholder="One per line: Institution | Program or Degree | Country | Graduation Year"/></label><label>Professional Certifications<textarea name="certifications" required placeholder="One per line: Certificate | Issuing Organization | Issue Date | Expiration Date | Certificate Number"/></label><label>Upload Supporting Documents<input type="file" name="healerDocuments" required multiple accept="application/pdf,image/jpeg,image/png"/></label><div className="form-row"><label>Years of Experience<input type="number" name="yearsExperience" required min={0}/></label><label>City<input name="city" placeholder="Optional"/></label></div><fieldset><legend>Languages Spoken</legend><div className="option-grid compact">{languages.map(item=><label key={item}><input type="checkbox" name="languages" value={item}/>{item}</label>)}</div><input name="languagesOther" placeholder="Other languages, separated by commas"/></fieldset><div className="form-row"><label>Professional Website<input type="url" name="professionalWebsite" placeholder="https://"/></label><label>LinkedIn Profile<input type="url" name="linkedinProfile" placeholder="https://linkedin.com/in/..."/></label></div><div className="form-row"><label>License Number<input name="licenseNumber"/></label><label>Licensing Authority<input name="licensingAuthority"/></label></div><label>License Country<input name="licenseCountry"/></label><label>Insurance Accepted<input name="insuranceAccepted" placeholder="Optional, separated by commas"/></label><fieldset><legend>Online Session Availability</legend><div className="option-grid compact"><label><input type="radio" name="sessionAvailability" value="online" required/>Online Sessions</label><label><input type="radio" name="sessionAvailability" value="in_person"/>In-Person Sessions</label><label><input type="radio" name="sessionAvailability" value="both"/>Both</label></div></fieldset><fieldset><legend>Session Types</legend><div className="option-grid compact">{['Individual','Couples','Family','Group','Workshops','Courses'].map(item=><label key={item}><input type="checkbox" name="sessionTypes" value={item}/>{item}</label>)}</div></fieldset></section>}</>}
        <label>Email address<input type="email" name="email" required placeholder="you@example.com"/></label>
        {mode !== 'reset' && <label>Password<input type="password" name="password" required minLength={8} placeholder="At least 8 characters"/></label>}
        {mode === 'register' && <><label>Confirm password<input type="password" name="confirmPassword" required minLength={8} placeholder="Repeat your password"/></label><label className="check-label"><input type="checkbox" name="guidelines"/>I agree to the Community Guidelines and Privacy Policy.</label></>}
        {mode === 'login' && <button type="button" className="forgot" onClick={() => {setMode('reset');setError('');setMessage('')}}>Forgot password?</button>}
        <button className="auth-submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}<ChevronRight size={17}/></button>
      </form>
      <div className="auth-switch">{mode === 'login' ? <>New to Nova Resort? <button onClick={() => setMode('register')}>Create an account</button></> : <>Already have an account? <button onClick={() => setMode('login')}>Sign in</button></>}</div>
    </div></div>
  </div>
}

function App() {
  const language = getLanguage()
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const [notice, setNotice] = useState('')
  const [activeNav, setActiveNav] = useState('Home')
  const [dbRooms, setDbRooms] = useState<DbRoom[]>([])
  const [selectedRoom, setSelectedRoom] = useState<DbRoom | null>(null)
  const [feature, setFeature] = useState<Feature | null>(null)
  const [route, setRouteState] = useState<AppRoute>(() => routeFromHash())
  const [showAllRooms,setShowAllRooms] = useState(false)
  const [liveHealers,setLiveHealers] = useState<LiveProfile[]>([])
  const [healersLoading,setHealersLoading] = useState(true)
  const [healersError,setHealersError] = useState('')
  const [recentMessages,setRecentMessages] = useState<RecentMessage[]>([])
  const [friendships,setFriendships] = useState<Friendship[]>([])
  const [profilePreview,setProfilePreview] = useState<LiveProfile|null>(null)
  const [currentAvatar,setCurrentAvatar] = useState<string|null>(null)
  const [podcastPlayer,setPodcastPlayer] = useState<PlayerEpisode|null>(null)
  const [metrics,setMetrics] = useState({members:0,online:0,healers:0,rooms:0,sessions:0,notifications:0,connections:0})

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    const syncRoute = () => setRouteState(routeFromHash())
    syncRoute()
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])
  useEffect(() => applyLanguage(language), [language])
  useEffect(() => {
    if (!session) return
    let cancelled = false
    async function applyRouteToState() {
      if (route.roomId) {
        setFeature(null)
        setActiveNav('Messages')
        const cached = selectedRoom?.id === route.roomId ? selectedRoom : dbRooms.find(room => room.id === route.roomId)
        if (cached) {
          setSelectedRoom(cached)
          return
        }
        const { data, error } = await supabase.from('rooms').select('id,name,description,icon,theme,is_private').eq('id', route.roomId).single()
        if (cancelled) return
        if (error || !data) {
          setSelectedRoom(null)
          setRoute('home')
          setNotice('That room link is no longer available.')
          return
        }
        setSelectedRoom(data as DbRoom)
        return
      }
      if (route.profileId) {
        setSelectedRoom(null)
        setFeature(null)
        setActiveNav('Healers')
        const cached = liveHealers.find(profile => profile.id === route.profileId)
        if (cached) {
          setProfilePreview(cached)
          return
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('id,full_name,display_name,avatar_url,country,profile_type,about,interests,specialties,online,visibility')
          .eq('id', route.profileId)
          .neq('visibility','private')
          .single()
        if (cancelled) return
        if (error || !data) {
          setProfilePreview(null)
          setRoute('home')
          setNotice('That profile is not available.')
          return
        }
        setProfilePreview(data as LiveProfile)
        return
      }
      setProfilePreview(null)
      setSelectedRoom(null)
      setFeature(route.feature)
      setActiveNav(navFromFeature(route.feature))
      if (!route.feature) window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    applyRouteToState()
    return () => { cancelled = true }
  }, [route, session, dbRooms, selectedRoom, liveHealers])
  useEffect(() => {
    if (!session) return
    const loadLiveData=async()=>{
      const fiveMinutesAgo=new Date(Date.now()-5*60*1000).toISOString()
      setHealersLoading(true)
      const [rooms,allMembers,online,healerCount,featuredHealersResult,activeRooms,sessions,notifications,connections,activity,me,relations]=await Promise.all([
        supabase.from('rooms').select('id,name,description,icon,theme,is_private').eq('is_private',false).limit(6),
        supabase.from('profiles').select('id',{count:'exact',head:true}),
        supabase.from('profiles').select('id',{count:'exact',head:true}).gte('last_seen',fiveMinutesAgo),
        supabase.from('profiles').select('id',{count:'exact',head:true}).in('profile_type',healerRoles).eq('professional_verification_status','approved').neq('visibility','private').eq('account_status','active').eq('discoverable',true),
        getFeaturedHealers(12).then(data=>({data,error:null as Error|null})).catch(error=>({data:[],error:error as Error})),
        supabase.from('rooms').select('id',{count:'exact',head:true}).eq('is_private',false),
        supabase.from('sessions').select('id',{count:'exact',head:true}).gte('starts_at',new Date().toISOString()).in('status',['published','live','registration_closed']),
        supabase.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',session.user.id).is('read_at',null),
        supabase.from('friendships').select('id',{count:'exact',head:true}).eq('addressee_id',session.user.id).eq('status','pending'),
        supabase.from('messages').select('id,body,created_at,profiles!messages_sender_id_fkey(full_name,avatar_url),rooms!messages_room_id_fkey(id,name)').order('created_at',{ascending:false}).limit(3),
        supabase.from('profiles').select('avatar_url').eq('id',session.user.id).single(),
        supabase.from('friendships').select('id,requester_id,addressee_id,status').or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`).in('status',['pending','accepted'])
      ])
      const healerRows = featuredHealersResult.data.map(profile => ({...profile,interests:null,visibility:'community',next_session:profile.next_session_id?{id:profile.next_session_id,title:profile.next_session_title||'Upcoming session',starts_at:profile.next_session_starts_at||new Date().toISOString(),host_id:profile.id}:null}))
      setDbRooms((rooms.data as DbRoom[])||[]);setLiveHealers(healerRows);setHealersError(featuredHealersResult.error?'We could not load healers right now. Please try again.':'');setHealersLoading(false);setRecentMessages((activity.data as unknown as RecentMessage[])||[]);setFriendships((relations.data as Friendship[])||[]);setCurrentAvatar(me.data?.avatar_url||null)
      setMetrics({members:allMembers.count||0,online:online.count||0,healers:healerCount.count||0,rooms:activeRooms.count||0,sessions:sessions.count||0,notifications:notifications.count||0,connections:connections.count||0})
    }
    const heartbeat=()=>supabase.from('profiles').update({online:true,last_seen:new Date().toISOString()}).eq('id',session.user.id)
    const refreshNotifications=()=>loadLiveData()
    heartbeat();loadLiveData();const timer=window.setInterval(()=>{heartbeat();loadLiveData()},60000)
    const notices=supabase.channel(`app-notifications-${session.user.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`user_id=eq.${session.user.id}`},()=>loadLiveData())
      .subscribe()
    window.addEventListener('nova-notifications-read',refreshNotifications)
    return()=>{window.clearInterval(timer);window.removeEventListener('nova-notifications-read',refreshNotifications);supabase.removeChannel(notices);supabase.from('profiles').update({online:false,last_seen:new Date().toISOString()}).eq('id',session.user.id)}
  }, [session])

  const act = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2800) }
  const openFeature = (next: Feature | null) => setRoute(next === 'people' ? 'community' : next || 'home')
  const openRoom = (room: DbRoom) => { setSelectedRoom(room); setFeature(null); setRoute(`room/${room.id}`) }
  const closeOverlay = () => setRoute('home')
  const openProfile = (id:string) => setRoute(`profile/${id}`)
  const openHealers = () => setRoute('healers')
  const openPodcast = (id?:string) => setRoute(id === 'manage' ? 'podcasts/manage' : id ? `podcasts/${id}` : 'podcasts')
  const openPodcastEpisode = (podcastId:string, episodeId:string) => setRoute(`podcasts/${podcastId}/episodes/${episodeId}`)
  async function startPrivateMessage(person:LiveProfile){const {data,error}=await supabase.rpc('create_private_room',{other_user:person.id});if(error){act(error.message);return}openRoom({id:data,name:profileName(person),description:'Private two-person conversation',icon:'♢',theme:'sage',is_private:true})}
  async function connectWith(person:LiveProfile){
    if (!session) return
    const row = relationshipFor(person.id, friendships)
    if (row?.status === 'accepted') return
    if (row?.status === 'pending' && row.requester_id === session.user.id) {
      const { error } = await supabase.rpc('cancel_connection_request',{request_id:row.id})
      if (error) act(error.message); else {act('Connection request cancelled.');setFriendships(items=>items.filter(item=>item.id!==row.id))}
      return
    }
    if (row?.status === 'pending' && row.addressee_id === session.user.id) {
      const { error } = await supabase.rpc('respond_connection_request',{request_id:row.id,next_status:'accepted'})
      if (error) act(error.message); else {act('Connection accepted.');setFriendships(items=>items.map(item=>item.id===row.id?{...item,status:'accepted'}:item))}
      return
    }
    const { error } = await supabase.rpc('send_connection_request',{other_user:person.id})
    if (error) act(error.message)
    else act('Connection request sent.')
  }

  if (authLoading) return <div className="auth-loader"><Logo/><span/></div>
  if (!session) return <AuthScreen/>
  const name = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Member'
  const initials = name.split(' ').map((part: string) => part[0]).join('').slice(0,2).toUpperCase()

  return <div className={dark ? 'app dark' : 'app'}>
    <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
      <div className="side-top"><Logo/><button className="icon-btn close-mobile" onClick={() => setMenuOpen(false)}><X size={20}/></button></div>
      <nav>
        {[
          [Home, 'Home'], [Compass, 'Discover'], [UsersRound, 'Community'], [Sun, 'Healers'], [Headphones, 'Podcasts'], [Heart, 'Connections'], [MessageCircleMore, 'Messages'], [Bot, 'AI Companion'], [CalendarDays, 'Sessions']
        ].map(([Icon, label]) => <button key={label as string} className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => {setMenuOpen(false);setRoute(label==='Community'?'community':label==='Discover'?'discover':label==='Healers'?'healers':label==='Podcasts'?'podcasts':label==='Connections'?'connections':label==='Messages'?'messages':label==='AI Companion'?'ai':label==='Sessions'?'sessions':'home')}}><Icon size={19}/><span>{label as string}</span>{label === 'Connections' && metrics.connections > 0 && <i>{metrics.connections}</i>}</button>)}
      </nav>
      <div className="side-card">
        <div className="side-card-icon"><ShieldCheck size={20}/></div>
        <b>Your safety matters</b>
        <p>Explore our community guidelines and support resources.</p>
        <button onClick={() => openFeature('safety')}>Visit safety center <ChevronRight size={14}/></button>
      </div>
      <div className="side-bottom">
        <button className="nav-item" onClick={() => openFeature('profile')}><Settings size={19}/><span>Settings</span></button>
        <button className="profile-mini" onClick={() => openFeature('profile')}><div className="avatar user">{currentAvatar?<img src={currentAvatar} alt=""/>:initials}</div><div><b>{name}</b><span>Community member</span></div><MoreHorizontal size={18}/></button>
        <button className="signout" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </aside>

    <main>
      <header>
        <button className="icon-btn menu-btn" onClick={() => setMenuOpen(true)}><Menu size={22}/></button>
        <div className="mobile-logo"><Logo/></div>
        <div className="search" onClick={()=>openFeature('discover')}><Search size={18}/><input aria-label="Search" readOnly placeholder="Search people, rooms, or topics..."/><span>⌘ K</span></div>
        <div className="header-actions">
          <button className="language-toggle" onClick={()=>switchLanguage(language==='en'?'he':'en')}><Languages size={17}/>{language==='en'?'עברית':'English'}</button>
          <button className="icon-btn" aria-label="Toggle theme" onClick={() => setDark(!dark)}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
          <button className="icon-btn notification" aria-label="Notifications" onClick={() => openFeature(metrics.connections>0?'messages':'notifications')}><Bell size={20}/>{metrics.notifications>0&&<i>{metrics.notifications}</i>}</button>
          <button className="user-chip" onClick={()=>openFeature('profile')}><div className="avatar user">{currentAvatar?<img src={currentAvatar} alt=""/>:initials}</div><ChevronDown size={15}/></button>
        </div>
      </header>

      <div className="content">
        <section className="welcome">
          <div><p className="eyebrow">WELCOME TO NOVA RESORT</p><h1>Good to see you, {name.split(' ')[0]} <span>✦</span></h1><p className="platform-intro">A caring space where members and wellness professionals connect, talk, heal, grow, and support one another. Therapists, healers, and coaches can also host <mark>online sessions and workshops</mark> for the community.</p></div>
          <button className="primary" onClick={() => openFeature('people')}><Compass size={17}/> Explore the community</button>
        </section>

        <div className="stats">
          <div><span className="stat-icon green"><UsersRound/></span><p><b>{metrics.online}</b><small>Members online</small></p><em>{metrics.members} registered</em></div>
          <button className="stat-link" onClick={openHealers}><span className="stat-icon purple"><Sun/></span><p><b>{metrics.healers}</b><small>Healers available</small></p><em>Registered guides</em></button>
          <div><span className="stat-icon amber"><MessageCircleMore/></span><p><b>{metrics.rooms}</b><small>Active rooms</small></p><em>Join anytime</em></div>
          <div><span className="stat-icon blue"><CalendarDays/></span><p><b>{metrics.sessions}</b><small>Upcoming sessions</small></p><button onClick={() => openFeature('sessions')}>View sessions</button></div>
        </div>

        <div className="quick-actions">
          <button onClick={() => openFeature('discover')}><UsersRound size={16}/> Find people</button>
          <button onClick={openHealers}><Sun size={16}/> Find a healer</button>
          <button onClick={() => openFeature('podcasts')}><Headphones size={16}/> Podcasts</button>
          <button onClick={() => openFeature('sessions')}><CalendarDays size={16}/> Create session</button>
          <button onClick={() => openFeature('ai')}><Bot size={16}/> AI Companion</button>
          <button onClick={() => openFeature('messages')}><MessageCircleMore size={16}/> Private rooms</button>
        </div>

        <div className="layout">
          <div className="main-col">
            <section className="healer-section">
              <div className="section-head"><div><button className="section-title-link" onClick={openHealers}><h2>Meet our healers</h2></button><p>Connect with registered wellness professionals, explore their profiles, and discover their upcoming sessions and workshops.</p></div><button onClick={openHealers}>View all healers <ChevronRight size={16}/></button></div>
              {healersLoading?<div className="healer-strip"><div className="healer-card wide skeleton"/><div className="healer-card wide skeleton"/><div className="healer-card wide skeleton"/></div>:healersError?<div className="inline-empty">{healersError}</div>:liveHealers.length===0?<div className="inline-empty">No verified healers are available yet.</div>:<div className="healer-strip" role="list" aria-label="Registered healers">{liveHealers.map(h=>{const relation=relationshipFor(h.id,friendships),connectLabel=relation?.status==='accepted'?'Connected':relation?.status==='pending'&&relation.requester_id===session.user.id?'Request sent':relation?.status==='pending'?'Accept request':'Connect';return <article className="healer-card wide" role="listitem" key={h.id}>
                <button className="healer-photo-button" onClick={()=>openProfile(h.id)} aria-label={`View ${profileName(h)} profile`}><span className="avatar healer rose">{h.avatar_url?<img src={h.avatar_url} alt={`${profileName(h)} profile photo`} loading="lazy" onError={event=>{event.currentTarget.style.display='none'}}/>:profileInitials(profileName(h))}<i className={h.online?'online':''}/><span className="sr-only">{h.online?'Online now':'Offline'}</span></span></button>
                <div className="healer-info">
                  <button className="healer-name" onClick={()=>openProfile(h.id)}>{profileName(h)}</button>
                  <p>{roleLabel(h)}{h.country?` · ${h.country}`:''}</p>
                  <div className="healer-tags">{(h.specialties||h.interests||['Emotional wellness']).slice(0,3).map(tag=><span key={tag}>{tag}</span>)}</div>
                  <p className="healer-bio">{h.about||'Registered wellness professional in the Nova Resort community.'}</p>
                  {h.next_session&&<button className="next-session" onClick={()=>openFeature('sessions')}><CalendarDays size={13}/><span>{h.next_session.title}</span><time>{new Date(h.next_session.starts_at).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}</time></button>}
                  <div className="healer-actions"><button onClick={()=>openProfile(h.id)}>View profile</button><button onClick={()=>connectWith(h)} disabled={relation?.status==='accepted'}><UserPlus size={13}/>{connectLabel}</button><button onClick={()=>startPrivateMessage(h)}><MessageCircleMore size={13}/> Message</button>{h.next_session&&<button onClick={()=>openFeature('sessions')}>View sessions</button>}</div>
                </div>
              </article>})}</div>}
            </section>

            <PopularPodcastsStrip onOpenPodcast={openPodcast} onPlayEpisode={setPodcastPlayer} onOpenProfile={openProfile}/>

            <section>
              <div className="section-head"><div><h2>Find your space</h2><p>Join a conversation that feels right for you today.</p></div><button onClick={() => setShowAllRooms(!showAllRooms)}>{showAllRooms?'Show fewer rooms':'View all rooms'} <ChevronRight size={16}/></button></div>
              <div className="room-grid">
                {(dbRooms.length ? dbRooms.slice(0,showAllRooms?6:3).map(r=>({title:r.name,description:r.description,people:0,color:r.theme,icon:r.icon,tags:['Open','Live'],db:r})) : rooms.map(r=>({...r,db:null as DbRoom|null}))).map(room => <article className={`room-card ${room.color}`} key={room.title}>
                  <div className="room-art"><span>{room.icon}</span><div className="bubble b1"></div><div className="bubble b2"></div><div className="bubble b3"></div></div>
                  <div className="room-info"><div className="tags">{room.tags.map((t,i) => <span key={t} className={i === 0 ? 'open-tag' : ''}>{i === 0 && <i/>}{t}</span>)}</div><h3>{room.title}</h3><p>{room.description}</p><div className="room-bottom"><span><UsersRound size={15}/>{room.people ? `${room.people} here now` : 'Real-time room'}</span><button onClick={() => room.db ? openRoom(room.db) : act('Database setup is required first')}>Join room <ChevronRight size={15}/></button></div></div>
                </article>)}
              </div>
            </section>

            <section className="quote-card"><div className="quote-icon">“</div><div><p>“You don’t have to see the whole staircase. Just take the first step.”</p><span>A gentle reminder for today</span></div><Leaf size={55}/></section>
          </div>

          <aside className="right-col">
            <section className="panel conversations"><div className="panel-head"><h3>Recent conversations</h3><button onClick={() => openFeature('messages')}>View all</button></div>
              {recentMessages.length===0?<p className="mini-empty">No community messages yet.</p>:recentMessages.map(c => <button className="conversation" key={c.id} onClick={() => c.rooms&&openRoom({id:c.rooms.id,name:c.rooms.name,description:'Community conversation',icon:'♡',theme:'sage',is_private:false})}><div className="avatar soft">{c.profiles?.avatar_url?<img src={c.profiles.avatar_url} alt=""/>:(c.profiles?.full_name||'N').slice(0,1)}</div><div><b>{c.profiles?.full_name||'Community member'}</b><p>{c.body}</p></div><span>{new Date(c.created_at).toLocaleDateString()}</span></button>)}
              <button className="new-message" onClick={() => openFeature('discover')}><Send size={16}/> Start a new message</button>
            </section>

            <section className="panel session"><div className="panel-head"><h3>Upcoming wellness sessions</h3><button onClick={()=>openFeature('sessions')}><MoreHorizontal size={18}/></button></div>
              <div className="date-box"><b>{metrics.sessions}</b><span>OPEN</span></div><div className="session-copy"><h4>{metrics.sessions?'Sessions open now':'Create the first session'}</h4><p>{metrics.sessions?'Join a group event or host your own.':'Events can be public, private, live, or waitlisted.'}</p><span><Clock3 size={14}/> Community workshops and rooms</span></div>
              <button className="join-session" onClick={() => openFeature('sessions')}><Video size={16}/> Open sessions</button>
            </section>

            <section className="checkin"><span><CircleUserRound size={21}/></span><div><h3>How are you feeling?</h3><p>A small check-in can make a big difference.</p><div className="moods">{['😔','😕','😐','🙂','😊'].map(x => <button key={x} onClick={() => act('Thank you for checking in')}>{x}</button>)}</div></div></section>

            <section className="disclaimer"><LockKeyhole size={17}/><p><b>A safe space, not a medical service.</b> Nova Resort offers peer support and wellness connection. If you are in immediate danger, please contact local emergency services.</p></section>
          </aside>
        </div>
      </div>
    </main>
    {menuOpen && <button className="backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)}/>} 
    {feature==='discover' && <DiscoverPeople userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {selectedRoom && (selectedRoom.is_private ? <PrivateChatRoom room={selectedRoom} userId={session.user.id} onClose={closeOverlay} onOpenProfile={openProfile}/> : <ChatRoom room={selectedRoom} userId={session.user.id} onClose={closeOverlay}/>)} 
    {feature==='people' && <PeopleDirectory userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {feature==='healers' && <HealersDirectory userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom} onOpenProfile={openProfile} onOpenSessions={()=>openFeature('sessions')}/>} 
    {feature==='connections' && <Connections userId={session.user.id} onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {feature==='messages' && <PrivateChats onClose={closeOverlay} onOpenRoom={openRoom}/>} 
    {feature==='ai' && <AICompanion userId={session.user.id} onClose={closeOverlay}/>} 
    {feature==='podcasts' && <PodcastPlatform userId={session.user.id} podcastId={route.podcastId} episodeId={route.episodeId} studio={route.podcastStudio} onClose={closeOverlay} onOpenPodcast={openPodcast} onOpenEpisode={openPodcastEpisode} onOpenProfile={openProfile} onPlayEpisode={setPodcastPlayer}/>} 
    {feature==='profile' && <EditProfile userId={session.user.id} onClose={closeOverlay}/>} 
    {feature==='sessions' && <SessionsPage userId={session.user.id} onClose={closeOverlay}/>} 
    {feature==='notifications' && <Notifications userId={session.user.id} onClose={closeOverlay}/>} 
    {feature==='safety' && <SafetyCenter onClose={closeOverlay}/>} 
    {profilePreview && <div className="feature-overlay"><section className="profile-window public-profile-window"><header><div><h2>{profileName(profilePreview)}</h2><p>{roleLabel(profilePreview)}{profilePreview.country?` · ${profilePreview.country}`:''}</p></div><button onClick={closeOverlay}><X/></button></header><div className="public-profile-body"><span className="avatar healer rose public-profile-avatar">{profilePreview.avatar_url?<img src={profilePreview.avatar_url} alt={`${profileName(profilePreview)} profile photo`} loading="lazy"/>:profileInitials(profileName(profilePreview))}<i className={profilePreview.online?'online':''}/></span><p>{profilePreview.about||'This professional has not added a bio yet.'}</p><div className="healer-tags">{[...(profilePreview.specialties||[]),...(profilePreview.interests||[])].slice(0,6).map(tag=><span key={tag}>{tag}</span>)}</div><div className="healer-actions"><button onClick={()=>connectWith(profilePreview)}><UserPlus size={13}/> Connect</button><button onClick={()=>startPrivateMessage(profilePreview)}><MessageCircleMore size={13}/> Message</button><button onClick={()=>openFeature('sessions')}>View sessions</button></div></div></section></div>} 
    {profilePreview && <div className="profile-podcast-sidecar"><ProfilePodcastSection profileId={profilePreview.id} onOpenPodcast={openPodcast}/></div>}
    <PodcastMiniPlayer episode={podcastPlayer} onClose={() => setPodcastPlayer(null)}/>
    {notice && <div className="toast"><ShieldCheck size={17}/>{notice}</div>}
  </div>
}

export default App
