import { useCallback, useEffect, useState } from 'react'
import {
  X, Heart, Eye, Star, Users, Video, Headphones, MessageCircle,
  TrendingUp, Play, UserPlus, DollarSign, BarChart3, Clock, CheckCircle,
  ChevronDown
} from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from './supabase'
import './analytics.css'
import { useFocusTrap } from './hooks/useFocusTrap'

type HealerAnalyticsData = {
  profile: {
    followers: number; profile_views: number; avg_rating: number | null;
    review_count: number; new_followers: number
  }
  sessions: {
    total: number; upcoming: number; total_registrations: number;
    attended: number; total_revenue: number
  }
  podcasts: {
    total: number; total_episodes: number; total_plays: number;
    total_followers: number; plays_last_30_days: number
  }
  engagement: { total_reactions: number; total_comments: number }
}

export function HealerAnalytics({ healerId, onClose }: {
  healerId: string; onClose: () => void
}) {
  const [analytics, setAnalytics] = useState<HealerAnalyticsData | null>(null)
  const [dateRange, setDateRange] = useState(30)
  const [loading, setLoading] = useState(true)
  const containerRef = useFocusTrap(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase.rpc('get_healer_analytics', { p_healer_id: healerId, p_days: dateRange })
      setAnalytics(data as HealerAnalyticsData)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [healerId, dateRange])

  useEffect(() => { load() }, [load])

  const attendanceRate = analytics?.sessions.total_registrations
    ? Math.round((analytics.sessions.attended / analytics.sessions.total_registrations) * 100)
    : 0

  return (
    <div className="feature-overlay" ref={containerRef} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ha-window" role="dialog" aria-modal="true" aria-label="Healer analytics">
        <header className="ha-header">
          <div>
            <h2><BarChart3 size={20} /> Analytics Dashboard</h2>
            <p>Track your platform performance and engagement.</p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </header>

        <div className="ha-date-range">
          {[7, 14, 30, 90].map(d => (
            <button key={d} className={dateRange === d ? 'active' : ''} onClick={() => setDateRange(d)}>
              {d}d
            </button>
          ))}
        </div>

        {loading ? (
          <div className="ha-loading">Loading analytics...</div>
        ) : !analytics ? (
          <div className="ha-empty">No analytics data available.</div>
        ) : (
          <div className="ha-body">
            {/* Profile Metrics */}
            <section className="ha-section">
              <h3><Heart size={16} /> Profile Performance</h3>
              <div className="ha-metrics-grid">
                <div className="ha-metric-card">
                  <Heart size={20} style={{ color: '#dca15d' }} />
                  <b>{analytics.profile.followers}</b>
                  <span>Total Followers</span>
                  {analytics.profile.new_followers > 0 && (
                    <small className="ha-change positive">+{analytics.profile.new_followers} new</small>
                  )}
                </div>
                <div className="ha-metric-card">
                  <Eye size={20} style={{ color: '#4ecdc4' }} />
                  <b>{analytics.profile.profile_views}</b>
                  <span>Profile Views</span>
                  <small>Last {dateRange} days</small>
                </div>
                <div className="ha-metric-card">
                  <Star size={20} style={{ color: '#ffd700' }} />
                  <b>{analytics.profile.avg_rating?.toFixed(1) || '-'}</b>
                  <span>Avg Rating</span>
                  <small>{analytics.profile.review_count} reviews</small>
                </div>
                <div className="ha-metric-card">
                  <Users size={20} style={{ color: '#9b59b6' }} />
                  <b>{analytics.profile.new_followers}</b>
                  <span>New Followers</span>
                  <small>Last {dateRange} days</small>
                </div>
              </div>
            </section>

            {/* Session Metrics */}
            <section className="ha-section">
              <h3><Video size={16} /> Session Analytics</h3>
              <div className="ha-metrics-grid">
                <div className="ha-metric-card">
                  <Video size={20} style={{ color: '#dca15d' }} />
                  <b>{analytics.sessions.total}</b>
                  <span>Total Sessions</span>
                </div>
                <div className="ha-metric-card">
                  <Clock size={20} style={{ color: '#4ecdc4' }} />
                  <b>{analytics.sessions.upcoming}</b>
                  <span>Upcoming</span>
                </div>
                <div className="ha-metric-card">
                  <Users size={20} style={{ color: '#9b59b6' }} />
                  <b>{analytics.sessions.total_registrations}</b>
                  <span>Registrations</span>
                </div>
                <div className="ha-metric-card">
                  <CheckCircle size={20} style={{ color: '#27ae60' }} />
                  <b>{attendanceRate}%</b>
                  <span>Attendance Rate</span>
                  <small>{analytics.sessions.attended}/{analytics.sessions.total_registrations}</small>
                </div>
                {analytics.sessions.total_revenue > 0 && (
                  <div className="ha-metric-card">
                    <DollarSign size={20} style={{ color: '#27ae60' }} />
                    <b>${analytics.sessions.total_revenue}</b>
                    <span>Session Revenue</span>
                  </div>
                )}
              </div>
            </section>

            {/* Podcast Metrics */}
            {analytics.podcasts.total > 0 && (
              <section className="ha-section">
                <h3><Headphones size={16} /> Podcast Analytics</h3>
                <div className="ha-metrics-grid">
                  <div className="ha-metric-card">
                    <Headphones size={20} style={{ color: '#dca15d' }} />
                    <b>{analytics.podcasts.total}</b>
                    <span>Podcasts</span>
                  </div>
                  <div className="ha-metric-card">
                    <Play size={20} style={{ color: '#e74c3c' }} />
                    <b>{analytics.podcasts.total_plays}</b>
                    <span>Total Plays</span>
                  </div>
                  <div className="ha-metric-card">
                    <TrendingUp size={20} style={{ color: '#4ecdc4' }} />
                    <b>{analytics.podcasts.plays_last_30_days}</b>
                    <span>Plays ({dateRange}d)</span>
                  </div>
                  <div className="ha-metric-card">
                    <UserPlus size={20} style={{ color: '#9b59b6' }} />
                    <b>{analytics.podcasts.total_followers}</b>
                    <span>Podcast Followers</span>
                  </div>
                  <div className="ha-metric-card">
                    <Video size={20} style={{ color: '#f39c12' }} />
                    <b>{analytics.podcasts.total_episodes}</b>
                    <span>Total Episodes</span>
                  </div>
                </div>
              </section>
            )}

            {/* Engagement */}
            <section className="ha-section">
              <h3><MessageCircle size={16} /> Engagement</h3>
              <div className="ha-metrics-grid">
                <div className="ha-metric-card">
                  <Heart size={20} style={{ color: '#e74c3c' }} />
                  <b>{analytics.engagement.total_reactions}</b>
                  <span>Total Reactions</span>
                </div>
                <div className="ha-metric-card">
                  <MessageCircle size={20} style={{ color: '#4ecdc4' }} />
                  <b>{analytics.engagement.total_comments}</b>
                  <span>Total Comments</span>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
