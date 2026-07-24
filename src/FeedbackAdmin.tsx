import { useCallback, useEffect, useState } from 'react'
import { Bug, Clock3, Eye, Filter, Lightbulb, Loader2, MessageCircleQuestion, Send, Star, X, ChevronRight, Flag, ExternalLink } from 'lucide-react'
import { supabase } from './supabase'
import { useUserRole } from './hooks/useUserRole'

type FeedbackReport = {
  id: string
  user_id: string
  category: string
  subject: string
  description: string
  priority: string
  screenshot_url: string | null
  browser: string | null
  os: string | null
  current_page: string | null
  status: string
  admin_notes: string | null
  created_at: string
  updated_at: string
  profiles?: { full_name: string; display_name: string | null; email?: string } | null
}

const CATEGORY_ICONS: Record<string, any> = {
  bug_report: Bug, feature_request: Lightbulb, improvement: Star,
  question: MessageCircleQuestion, general: Send, other: Flag
}
const CATEGORY_LABELS: Record<string, string> = {
  bug_report: 'Bug Report', feature_request: 'Feature Request', improvement: 'Improvement',
  question: 'Question', general: 'General', other: 'Other'
}
const PRIORITY_COLORS: Record<string, string> = {
  low: '#5a7b87', medium: '#a67a45', high: '#cf685f'
}
const STATUS_OPTIONS = ['new', 'in_review', 'resolved', 'closed'] as const

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function FeedbackAdmin({ onClose }: { onClose: () => void }) {
  const [userId, setUserId] = useState<string | null>(null)
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null)) }, [])
  const { isAdmin, isLoading: roleLoading } = useUserRole(userId)
  const [items, setItems] = useState<FeedbackReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('feedback_reports')
      .select('*, profiles!feedback_reports_user_id_fkey(full_name, display_name)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) { setError(err.message); setLoading(false); return }
    setItems((data as unknown as FeedbackReport[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id)
    const { error } = await supabase.rpc('update_feedback_status', { p_feedback_id: id, p_status: status })
    if (error) { alert(error.message); setUpdatingId(null); return }
    setItems(prev => prev.map(item => item.id === id ? { ...item, status, updated_at: new Date().toISOString() } : item))
    setUpdatingId(null)
  }

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter)
  const counts = STATUS_OPTIONS.reduce((acc, s) => { acc[s] = items.filter(i => i.status === s).length; return acc }, {} as Record<string, number>)

  if (!roleLoading && !isAdmin) {
    return (
      <div className="feature-overlay" role="dialog" aria-modal="true" aria-label="Access denied">
        <section className="feedback-admin">
          <header>
            <div><h2>Access Denied</h2><p>You do not have permission to view this page.</p></div>
            <button aria-label="Close" onClick={onClose}><X /></button>
          </header>
          <div className="empty-state" style={{ padding: '40px 20px', textAlign: 'center' }}>
            <p>This page is restricted to administrators.</p>
            <button className="nr-btn nr-btn-primary" onClick={onClose} style={{ marginTop: 12 }}>Go back</button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="feature-overlay">
      <section className="feedback-admin">
        <header>
          <div>
            <h2>Feedback Management</h2>
            <p>{items.length} total reports · {counts.new || 0} new</p>
          </div>
          <button onClick={onClose}><X /></button>
        </header>

        <div className="feedback-admin-filters">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All ({items.length})</button>
          {STATUS_OPTIONS.map(s => (
            <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>
              {s.replace('_', ' ')} ({counts[s] || 0})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="feedback-loading"><Loader2 size={20} className="spin" /> Loading reports…</div>
        ) : error ? (
          <div className="feedback-error-banner">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="feedback-empty">
            <Filter size={28} />
            <p>No reports match this filter.</p>
          </div>
        ) : (
          <div className="feedback-list">
            {filtered.map(item => {
              const Icon = CATEGORY_ICONS[item.category] || Flag
              const isExpanded = expandedId === item.id
              const userName = item.profiles?.display_name || item.profiles?.full_name || 'Unknown'
              return (
                <article key={item.id} className={`feedback-row ${item.status === 'new' ? 'is-new' : ''}`}>
                  <div className="feedback-row-main" onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                    <div className="feedback-row-icon" style={{ color: PRIORITY_COLORS[item.priority] }}>
                      <Icon size={16} />
                    </div>
                    <div className="feedback-row-info">
                      <div className="feedback-row-title">
                        <h4>{item.subject}</h4>
                        <span className="feedback-status-badge" data-status={item.status}>{item.status.replace('_', ' ')}</span>
                      </div>
                      <div className="feedback-row-meta">
                        <span>{CATEGORY_LABELS[item.category] || item.category}</span>
                        <span>·</span>
                        <span>{userName}</span>
                        <span>·</span>
                        <span><Clock3 size={11} /> {fmtTime(item.created_at)}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} className={isExpanded ? 'rotated' : ''} />
                  </div>

                  {isExpanded && (
                    <div className="feedback-expanded">
                      <div className="feedback-detail-grid">
                        <div><b>Description</b><p className="feedback-desc">{item.description}</p></div>
                        {item.screenshot_url && (
                          <div><b>Screenshot</b><a href={item.screenshot_url} target="_blank" rel="noopener noreferrer" className="feedback-screenshot-link"><ExternalLink size={13} /> View screenshot</a></div>
                        )}
                        <div className="feedback-detail-row">
                          <div><b>User</b><p>{userName} ({item.user_id.slice(0, 8)}…)</p></div>
                          <div><b>Browser</b><p>{item.browser || 'Unknown'}</p></div>
                          <div><b>OS</b><p>{item.os || 'Unknown'}</p></div>
                          <div><b>Page</b><p className="feedback-page-url">{item.current_page || 'Unknown'}</p></div>
                        </div>
                      </div>
                      <div className="feedback-status-actions">
                        <label>Update status:</label>
                        <div className="feedback-status-buttons">
                          {STATUS_OPTIONS.map(s => (
                            <button
                              key={s}
                              className={item.status === s ? 'active' : ''}
                              disabled={updatingId === item.id || item.status === s}
                              onClick={() => updateStatus(item.id, s)}
                            >
                              {updatingId === item.id ? <Loader2 size={12} className="spin" /> : null}
                              {s.replace('_', ' ')}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
