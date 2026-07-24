import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, ChevronRight, Clock3, Sun, X, XCircle } from 'lucide-react'
import { supabase } from './supabase'
import { useFocusTrap } from './hooks/useFocusTrap'

type MySession = {
  id: string; session_id: string; registration_status: string; registered_at: string;
  session_title: string; session_category: string | null; session_language: string | null;
  session_starts_at: string; session_ends_at: string | null; session_status: string;
  session_type: string | null; session_price: number | null; session_cover_url: string | null;
  host_name: string; host_avatar: string | null; host_id: string
}

const initials = (name?: string | null) => (name || 'N').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
const formatDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const timeUntil = (iso: string) => {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'now'
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000)
  return h > 24 ? `${Math.floor(h / 24)}d` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

type SessionHistoryProps = {
  userId: string; onClose: () => void; onNotice: (t: string) => void
}

export function SessionHistory({ userId, onClose, onNotice }: SessionHistoryProps) {
  const [tab, setTab] = useState<'upcoming' | 'completed' | 'cancelled'>('upcoming')
  const [sessions, setSessions] = useState<MySession[]>([])
  const [loading, setLoading] = useState(true)
  const containerRef = useFocusTrap(true)

  const load = useCallback(async () => {
    setLoading(true)
    const status = tab === 'upcoming' ? 'registered' : tab === 'completed' ? 'attended' : 'cancelled'
    const { data } = await supabase.rpc('get_my_sessions', { status_filter: status, page_limit: 50, page_offset: 0 })
    setSessions(((data as any[]) || []).map(s => ({
      id: s.id, session_id: s.session_id, registration_status: s.registration_status, registered_at: s.registered_at,
      session_title: s.session_title, session_category: s.session_category, session_language: s.session_language,
      session_starts_at: s.session_starts_at, session_ends_at: s.session_ends_at, session_status: s.session_status,
      session_type: s.session_type, session_price: s.session_price, session_cover_url: s.session_cover_url,
      host_name: s.host_name, host_avatar: s.host_avatar, host_id: s.host_id
    })))
    setLoading(false)
  }, [userId, tab])

  useEffect(() => { load() }, [load])

  async function cancelRegistration(sessionId: string) {
    if (!confirm('Cancel this registration?')) return
    const { error } = await supabase.rpc('cancel_session_registration', { target_session: sessionId })
    if (error) onNotice(error.message)
    else { onNotice('Registration cancelled.'); load() }
  }

  const tabs: [typeof tab, string][] = [['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]

  return (
    <div className="feature-overlay" ref={containerRef} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="directory-window session-history-window" role="dialog" aria-modal="true" aria-label="Session history">
        <header>
          <div>
            <h2>My Sessions</h2>
            <p>Your session history and upcoming registrations.</p>
          </div>
          <button onClick={onClose}><X /></button>
        </header>
        <div className="history-tabs">
          {tabs.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="history-content">
          {loading ? <div className="empty-state">Loading...</div> : (
            sessions.length === 0 ? (
              <div className="empty-state">
                <CalendarDays />
                <h3>{tab === 'upcoming' ? 'No upcoming sessions' : tab === 'completed' ? 'No completed sessions' : 'No cancelled sessions'}</h3>
                <p>{tab === 'upcoming' ? 'Register for sessions to see them here.' : 'Your session history will appear here.'}</p>
              </div>
            ) : sessions.map(s => {
              const isUpcoming = new Date(s.session_starts_at) > new Date()
              const isCompleted = s.registration_status === 'attended'
              return (
                <article className="history-row" key={s.id}>
                  <div className={`history-status ${isCompleted ? 'completed' : isUpcoming ? 'upcoming' : 'cancelled'}`}>
                    {isCompleted ? <CheckCircle2 size={16} /> : isUpcoming ? <Clock3 size={16} /> : <XCircle size={16} />}
                  </div>
                  <div className="history-info">
                    <h3>{s.session_title}</h3>
                    <p>{s.host_name}{s.session_category ? ` · ${s.session_category}` : ''}{s.session_type ? ` · ${s.session_type}` : ''}</p>
                    <div className="history-meta">
                      <span><CalendarDays size={12} /> {formatDate(s.session_starts_at)}</span>
                      <span><Clock3 size={12} /> {formatTime(s.session_starts_at)}</span>
                      {s.session_language && <span><Sun size={12} /> {s.session_language}</span>}
                      <span>{s.session_price && s.session_price > 0 ? `$${s.session_price}` : 'Free'}</span>
                    </div>
                    {isUpcoming && (
                      <div className="history-actions">
                        <span className="time-until">{timeUntil(s.session_starts_at)} away</span>
                        <button className="cancel-btn" onClick={() => cancelRegistration(s.session_id)}>Cancel</button>
                      </div>
                    )}
                  </div>
                </article>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}
