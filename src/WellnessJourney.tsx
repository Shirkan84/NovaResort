import { useCallback, useEffect, useState } from 'react'
import {
  X, Flame, Trophy, Target, Headphones, Video, Heart, Users, Bookmark,
  MessageCircle, Award, Zap, Calendar, TrendingUp, ChevronDown, ChevronUp,
  Clock, Star, CheckCircle, Sparkles, Crown, Sprout, TreePine, Mountain,
  Compass, Ear, Volume2, ListChecks, UserPlus, Archive, Globe, LayoutGrid,
  Sunrise, Sunset, Moon, CalendarCheck
} from 'lucide-react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { supabase } from './supabase'
import './analytics.css'

type Achievement = {
  id: string; title: string; description: string; icon_name: string;
  category: string; tier: string; points: number;
  requirement_type: string; requirement_value: number; is_hidden: boolean;
  earned: boolean; earned_at: string | null; progress: number
}

type JourneyEntry = {
  id: string; entry_type: string; title: string; description: string | null;
  category: string | null; entity_type: string | null; entity_id: string | null;
  points: number; created_at: string
}

type AnalyticsData = {
  listening: {
    total_minutes: number; total_plays: number; episodes_completed: number;
    unique_podcasts: number;
    daily_minutes: { date: string; minutes: number; episodes: number }[]
  }
  sessions: {
    registered: number; attended: number; upcoming: number; liked_sessions: number
  }
  community: {
    saved_sessions: number; saved_healers: number; saved_episodes: number;
    followed_podcasts: number; followed_healers: number;
    episode_reactions: number; comments: number
  }
  streak: { current: number; longest: number }
  wellness_points: number; achievement_count: number
}

type LearningData = {
  top_categories: { category: string; count: number }[]
  listening_by_weekday: { weekday: number; minutes: number }[]
  top_episodes: { title: string; podcast: string; duration: number }[]
  categories_explored: number
}

type StreakData = {
  current_streak: number; longest_streak: number;
  today_active: boolean; total_active_days: number
}

const ICON_MAP: Record<string, any> = {
  Award, Headphones, Compass, Moon, Ear, Volume2, CheckCircle, ListChecks,
  Video, CalendarCheck, Flame, Trophy, Heart, Users, UserPlus, Bookmark,
  Archive, Zap, Crown, Sparkles, Sprout, TreePine, Mountain, Globe,
  LayoutGrid, Sunrise, Sunset
}

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700'
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

function formatMinutes(mins: number) {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function WellnessJourney({ userId, onClose, onOpenFeature }: {
  userId: string; onClose: () => void; onOpenFeature: (f: string) => void
}) {
  const [tab, setTab] = useState<'overview' | 'journey' | 'achievements' | 'analytics'>('overview')
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [learning, setLearning] = useState<LearningData | null>(null)
  const [streak, setStreak] = useState<StreakData | null>(null)
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [journey, setJourney] = useState<JourneyEntry[]>([])
  const [journeyPage, setJourneyPage] = useState(0)
  const [hasMoreJourney, setHasMoreJourney] = useState(true)
  const [dateRange, setDateRange] = useState(30)
  const [loading, setLoading] = useState(true)
  const [newAchievements, setNewAchievements] = useState<Achievement[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [analyticsRes, learningRes, streakRes, achieveRes, journeyRes] = await Promise.all([
        supabase.rpc('get_member_analytics', { p_user_id: userId, p_days: dateRange }),
        supabase.rpc('get_learning_analytics', { p_user_id: userId, p_days: dateRange }),
        supabase.rpc('get_daily_streak'),
        supabase.rpc('get_achievements', { p_user_id: userId }),
        supabase.rpc('get_wellness_journey', { p_user_id: userId, p_limit: 20, p_offset: 0 })
      ])
      setAnalytics(analyticsRes.data as AnalyticsData)
      setLearning(learningRes.data as LearningData)
      setStreak(streakRes.data as StreakData)
      setAchievements((achieveRes.data as Achievement[]) || [])
      setJourney((journeyRes.data as JourneyEntry[]) || [])
      setJourneyPage(0)
      setHasMoreJourney((journeyRes.data as JourneyEntry[])?.length === 20)

      // Check for new achievements
      const checkRes = await supabase.rpc('check_and_award_achievements')
      if (checkRes.data?.newly_earned?.length > 0) {
        setNewAchievements(checkRes.data.newly_earned)
        setTimeout(() => setNewAchievements([]), 5000)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [userId, dateRange])

  useEffect(() => { load() }, [load])

  const loadMoreJourney = async () => {
    const nextPage = journeyPage + 1
    const { data } = await supabase.rpc('get_wellness_journey', { p_user_id: userId, p_limit: 20, p_offset: nextPage * 20 })
    if (data?.length) {
      setJourney(prev => [...prev, ...(data as JourneyEntry[])])
      setJourneyPage(nextPage)
      setHasMoreJourney(data.length === 20)
    } else {
      setHasMoreJourney(false)
    }
  }

  const earnedCount = achievements.filter(a => a.earned).length
  const totalPoints = achievements.filter(a => a.earned).reduce((s, a) => s + a.points, 0)
  const progressAchievements = achievements.filter(a => !a.earned && a.progress > 0)

  const chartData = (analytics?.listening?.daily_minutes || []).map(d => ({
    date: new Date(d.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    minutes: d.minutes, episodes: d.episodes
  }))

  const weekdayData = (learning?.listening_by_weekday || []).map(d => ({
    day: WEEKDAY_NAMES[d.weekday] || '', minutes: d.minutes
  }))

  const categoryData = (learning?.top_categories || []).map(c => ({
    category: c.category, count: c.count
  }))

  const getIcon = (name: string) => ICON_MAP[name] || Award

  const journeyTypeIcon = (t: string) => {
    switch (t) {
      case 'listening': return <Headphones size={14} />
      case 'session': return <Video size={14} />
      case 'community': return <Users size={14} />
      default: return <Sparkles size={14} />
    }
  }

  const tabs: [typeof tab, string, number?][] = [
    ['overview', 'Overview'],
    ['journey', 'Journey', journey.length],
    ['achievements', 'Achievements', earnedCount],
    ['analytics', 'Analytics']
  ]

  return (
    <div className="feature-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wj-window" role="dialog" aria-modal="true" aria-label="Wellness journey">
        {/* New Achievement Toast */}
        {newAchievements.length > 0 && (
          <div className="wj-achievement-toast">
            <Trophy size={20} />
            <div>
              <b>Achievement Unlocked!</b>
              <span>{newAchievements[0].title} — +{newAchievements[0].points} pts</span>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="wj-header">
          <div>
            <h2>Wellness Journey</h2>
            <p>Track your progress, earn achievements, and explore your wellness analytics.</p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </header>

        {/* Quick Stats */}
        <div className="wj-quick-stats">
          <div className="wj-stat">
            <Flame size={18} className="wj-streak-icon" />
            <div><b>{streak?.current_streak || 0}</b><span>Day Streak</span></div>
          </div>
          <div className="wj-stat">
            <Trophy size={18} style={{ color: '#ffd700' }} />
            <div><b>{totalPoints}</b><span>Points</span></div>
          </div>
          <div className="wj-stat">
            <Award size={18} style={{ color: '#cd7f32' }} />
            <div><b>{earnedCount}/{achievements.length}</b><span>Achievements</span></div>
          </div>
          <div className="wj-stat">
            <Clock size={18} style={{ color: 'var(--green)' }} />
            <div><b>{formatMinutes(analytics?.listening?.total_minutes || 0)}</b><span>Listened</span></div>
          </div>
        </div>

        {/* Tabs */}
        <nav className="wj-tabs">
          {tabs.map(([id, label, count]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label}{count !== undefined && <span>{count}</span>}
            </button>
          ))}
        </nav>

        <div className="wj-body">
          {loading ? (
            <div className="wj-loading">Loading...</div>
          ) : (
            <>
              {/* OVERVIEW TAB */}
              {tab === 'overview' && (
                <div className="wj-overview">
                  {/* Streak Section */}
                  <section className="wj-section">
                    <h3><Zap size={16} /> Activity Streak</h3>
                    <div className="wj-streak-grid">
                      <div className="wj-streak-card">
                        <Flame size={28} className="wj-flame" />
                        <b>{streak?.current_streak || 0}</b>
                        <span>Current Streak</span>
                      </div>
                      <div className="wj-streak-card">
                        <Crown size={28} style={{ color: '#ffd700' }} />
                        <b>{streak?.longest_streak || 0}</b>
                        <span>Longest Streak</span>
                      </div>
                      <div className="wj-streak-card">
                        <Target size={28} style={{ color: 'var(--green)' }} />
                        <b>{streak?.total_active_days || 0}</b>
                        <span>Total Active Days</span>
                      </div>
                      <div className="wj-streak-card">
                        <CheckCircle size={28} style={{ color: streak?.today_active ? 'var(--green)' : '#999' }} />
                        <b>{streak?.today_active ? 'Yes' : 'Not yet'}</b>
                        <span>Today</span>
                      </div>
                    </div>
                  </section>

                  {/* Listening Chart */}
                  {chartData.length > 0 && (
                    <section className="wj-section">
                      <h3><Headphones size={16} /> Listening Activity ({dateRange}d)</h3>
                      <div className="wj-date-range">
                        {[7, 14, 30, 90].map(d => (
                          <button key={d} className={dateRange === d ? 'active' : ''} onClick={() => setDateRange(d)}>
                            {d}d
                          </button>
                        ))}
                      </div>
                      <div className="wj-chart">
                        <ResponsiveContainer width="100%" height={200}>
                          <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" />
                            <Tooltip
                              contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                              labelStyle={{ color: 'var(--text)' }}
                            />
                            <Area type="monotone" dataKey="minutes" stroke="#dca15d" fill="#dca15d33" name="Minutes" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                  )}

                  {/* Quick Metrics */}
                  <section className="wj-section">
                    <h3><TrendingUp size={16} /> Quick Stats</h3>
                    <div className="wj-metrics-grid">
                      <div className="wj-metric"><b>{analytics?.listening?.total_plays || 0}</b><span>Total Plays</span></div>
                      <div className="wj-metric"><b>{analytics?.listening?.episodes_completed || 0}</b><span>Episodes Done</span></div>
                      <div className="wj-metric"><b>{analytics?.listening?.unique_podcasts || 0}</b><span>Podcasts Explored</span></div>
                      <div className="wj-metric"><b>{analytics?.sessions?.attended || 0}</b><span>Sessions Attended</span></div>
                      <div className="wj-metric"><b>{analytics?.sessions?.registered || 0}</b><span>Sessions Registered</span></div>
                      <div className="wj-metric"><b>{analytics?.community?.followed_podcasts || 0}</b><span>Podcasts Followed</span></div>
                      <div className="wj-metric"><b>{analytics?.community?.episode_reactions || 0}</b><span>Episode Likes</span></div>
                      <div className="wj-metric"><b>{learning?.categories_explored || 0}</b><span>Categories Tried</span></div>
                    </div>
                  </section>

                  {/* In Progress Achievements */}
                  {progressAchievements.length > 0 && (
                    <section className="wj-section">
                      <h3><Target size={16} /> In Progress</h3>
                      <div className="wj-progress-list">
                        {progressAchievements.slice(0, 5).map(a => {
                          const Icon = getIcon(a.icon_name)
                          const pct = Math.min(100, Math.round((a.progress / a.requirement_value) * 100))
                          return (
                            <div key={a.id} className="wj-progress-item">
                              <Icon size={18} style={{ color: TIER_COLORS[a.tier] }} />
                              <div className="wj-progress-info">
                                <span className="wj-progress-title">{a.title}</span>
                                <span className="wj-progress-desc">{a.progress}/{a.requirement_value}</span>
                                <div className="wj-progress-bar"><div style={{ width: `${pct}%` }} /></div>
                              </div>
                              <span className="wj-progress-pct">{pct}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )}
                </div>
              )}

              {/* JOURNEY TAB */}
              {tab === 'journey' && (
                <div className="wj-journey">
                  {journey.length === 0 ? (
                    <div className="wj-empty">
                      <Sparkles size={32} />
                      <h3>Your journey starts here</h3>
                      <p>Start listening to podcasts, attending sessions, or engaging with the community to build your wellness journey.</p>
                      <button onClick={() => onOpenFeature('sessions')} className="wj-btn-primary">Browse Sessions</button>
                    </div>
                  ) : (
                    <>
                      <div className="wj-journey-list">
                        {journey.map(entry => (
                          <article key={entry.id} className="wj-journey-item">
                            <div className={`wj-journey-icon ${entry.entry_type}`}>
                              {journeyTypeIcon(entry.entry_type)}
                            </div>
                            <div className="wj-journey-info">
                              <b>{entry.title}</b>
                              {entry.description && <p>{entry.description}</p>}
                              <span className="wj-journey-meta">
                                {entry.category && <span className="wj-tag">{entry.category}</span>}
                                <span>+{entry.points} pts</span>
                                <span>{timeAgo(entry.created_at)}</span>
                              </span>
                            </div>
                          </article>
                        ))}
                      </div>
                      {hasMoreJourney && (
                        <button className="wj-load-more" onClick={loadMoreJourney}>Load more</button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ACHIEVEMENTS TAB */}
              {tab === 'achievements' && (
                <div className="wj-achievements">
                  <div className="wj-achieve-header">
                    <Trophy size={20} />
                    <span>{earnedCount} of {achievements.length} earned — {totalPoints} points</span>
                  </div>
                  {(['listening', 'sessions', 'community', 'streak', 'journey', 'special', 'general'] as const).map(cat => {
                    const catAchievements = achievements.filter(a => a.category === cat)
                    if (catAchievements.length === 0) return null
                    return (
                      <div key={cat} className="wj-achieve-category">
                        <h3>{cat.charAt(0).toUpperCase() + cat.slice(1)}</h3>
                        <div className="wj-achieve-grid">
                          {catAchievements.map(a => {
                            const Icon = getIcon(a.icon_name)
                            const pct = a.earned ? 100 : Math.min(100, Math.round((a.progress / a.requirement_value) * 100))
                            return (
                              <div key={a.id} className={`wj-achieve-card ${a.earned ? 'earned' : 'locked'}`}>
                                <div className="wj-achieve-icon" style={{ borderColor: TIER_COLORS[a.tier] }}>
                                  <Icon size={24} style={{ color: a.earned ? TIER_COLORS[a.tier] : '#666' }} />
                                </div>
                                <b>{a.title}</b>
                                <p>{a.description}</p>
                                <div className="wj-achieve-progress">
                                  <div className="wj-progress-bar"><div style={{ width: `${pct}%`, background: TIER_COLORS[a.tier] }} /></div>
                                  <span>{a.earned ? `Earned ${a.earned_at ? timeAgo(a.earned_at) : ''}` : `${pct}%`}</span>
                                </div>
                                <span className="wj-achieve-points" style={{ color: TIER_COLORS[a.tier] }}>+{a.points} pts</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ANALYTICS TAB */}
              {tab === 'analytics' && (
                <div className="wj-analytics">
                  <div className="wj-date-range">
                    {[7, 14, 30, 90].map(d => (
                      <button key={d} className={dateRange === d ? 'active' : ''} onClick={() => setDateRange(d)}>
                        {d} days
                      </button>
                    ))}
                  </div>

                  {/* Listening Over Time */}
                  {chartData.length > 0 && (
                    <section className="wj-section">
                      <h3><Headphones size={16} /> Listening Over Time</h3>
                      <div className="wj-chart">
                        <ResponsiveContainer width="100%" height={220}>
                          <AreaChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--muted)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" />
                            <Tooltip
                              contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                              labelStyle={{ color: 'var(--text)' }}
                            />
                            <Area type="monotone" dataKey="minutes" stroke="#dca15d" fill="#dca15d33" name="Minutes" />
                            <Area type="monotone" dataKey="episodes" stroke="#4ecdc4" fill="#4ecdc433" name="Episodes" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                  )}

                  {/* Activity by Weekday */}
                  {weekdayData.length > 0 && (
                    <section className="wj-section">
                      <h3><Calendar size={16} /> Activity by Weekday</h3>
                      <div className="wj-chart">
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={weekdayData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                            <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted)" />
                            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" />
                            <Tooltip
                              contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                              labelStyle={{ color: 'var(--text)' }}
                            />
                            <Bar dataKey="minutes" fill="#dca15d" radius={[4, 4, 0, 0]} name="Minutes" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                  )}

                  {/* Category Distribution */}
                  {categoryData.length > 0 && (
                    <section className="wj-section">
                      <h3><LayoutGrid size={16} /> Categories Explored</h3>
                      <div className="wj-category-bars">
                        {categoryData.map(c => {
                          const max = categoryData[0]?.count || 1
                          const pct = Math.round((c.count / max) * 100)
                          return (
                            <div key={c.category} className="wj-category-bar">
                              <span>{c.category}</span>
                              <div className="wj-bar-track"><div style={{ width: `${pct}%` }} /></div>
                              <span>{c.count}</span>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )}

                  {/* Top Episodes */}
                  {learning?.top_episodes && learning.top_episodes.length > 0 && (
                    <section className="wj-section">
                      <h3><Star size={16} /> Recently Completed Episodes</h3>
                      <div className="wj-episode-list">
                        {learning.top_episodes.map((ep, i) => (
                          <div key={i} className="wj-episode-item">
                            <span className="wj-ep-rank">#{i + 1}</span>
                            <div>
                              <b>{ep.title}</b>
                              <span>{ep.podcast} · {formatMinutes(Math.round((ep.duration || 0) / 60))}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Community Stats */}
                  {analytics && (
                    <section className="wj-section">
                      <h3><Heart size={16} /> Community Engagement</h3>
                      <div className="wj-metrics-grid">
                        <div className="wj-metric"><b>{analytics.community.saved_sessions}</b><span>Saved Sessions</span></div>
                        <div className="wj-metric"><b>{analytics.community.saved_healers}</b><span>Saved Healers</span></div>
                        <div className="wj-metric"><b>{analytics.community.saved_episodes}</b><span>Saved Episodes</span></div>
                        <div className="wj-metric"><b>{analytics.community.followed_healers}</b><span>Healers Followed</span></div>
                        <div className="wj-metric"><b>{analytics.community.episode_reactions}</b><span>Reactions</span></div>
                        <div className="wj-metric"><b>{analytics.community.comments}</b><span>Comments</span></div>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
