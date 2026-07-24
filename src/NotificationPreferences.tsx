import { useCallback, useEffect, useState } from 'react'
import { Bell, X, Loader2 } from 'lucide-react'
import { supabase } from './supabase'
import { useFocusTrap } from './hooks/useFocusTrap'

type Prefs = {
  comment_notifications: boolean
  reaction_notifications: boolean
  follow_notifications: boolean
  session_reminders: boolean
  message_notifications: boolean
  announcement_notifications: boolean
}

const PREF_KEYS: {key: keyof Prefs; label: string; desc: string}[] = [
  {key: 'comment_notifications', label: 'Comments', desc: 'When someone comments on a podcast episode'},
  {key: 'reaction_notifications', label: 'Reactions', desc: 'When someone reacts to your content'},
  {key: 'follow_notifications', label: 'New followers', desc: 'When someone follows you'},
  {key: 'session_reminders', label: 'Session reminders', desc: 'Reminders before your registered sessions'},
  {key: 'message_notifications', label: 'Messages', desc: 'When you receive a new private message'},
  {key: 'announcement_notifications', label: 'Announcements', desc: 'Platform updates and community announcements'},
]

export function NotificationPreferences({userId, onClose}:{
  userId:string; onClose:()=>void
}){
  const [prefs, setPrefs] = useState<Prefs|null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string|null>(null)
  const containerRef = useFocusTrap(true)

  const load = useCallback(async()=>{
    setLoading(true)
    const {data} = await supabase.rpc('get_notification_preferences', {p_user_id: userId})
    if(data) setPrefs(data as Prefs)
    setLoading(false)
  }, [userId])

  useEffect(()=>{ load() }, [load])

  async function toggle(key:keyof Prefs){
    if(!prefs) return
    const newVal = !prefs[key]
    setPrefs({...prefs, [key]: newVal})
    setSaving(key)
    const {error} = await supabase.rpc('update_notification_preference', {p_key: key, p_value: newVal})
    if(error){
      setPrefs({...prefs, [key]: !newVal})
      console.error('Failed to update preference:', error)
    }
    setSaving(null)
  }

  return <div className="feature-overlay" ref={containerRef}><section className="npref-window" role="dialog" aria-modal="true" aria-label="Notification preferences">
    <header>
      <div><h2><Bell size={18}/> Notification Preferences</h2></div>
      <button onClick={onClose}><X size={18}/></button>
    </header>
    <div className="npref-body">
      {loading ? <div style={{textAlign:'center',padding:'40px',color:'var(--muted)'}}><Loader2 size={20} className="spin"/></div> :
        prefs && PREF_KEYS.map(({key, label, desc}) => <div key={key} className="npref-item">
          <div>
            <div className="npref-label">{label}</div>
            <div className="npref-desc">{desc}</div>
          </div>
          <label className="npref-toggle">
            <input type="checkbox" checked={prefs[key]} disabled={saving===key} onChange={()=>toggle(key)}/>
            <span className="npref-slider"/>
          </label>
        </div>)
      }
    </div>
  </section></div>
}
