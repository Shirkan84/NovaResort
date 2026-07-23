import { supabase } from '../supabase'

export const PROFESSIONAL_ROLES = ['healer'] as const

export type PublicHealer = {
  id:string; full_name:string; display_name:string|null; avatar_url:string|null; country:string|null;
  languages:string[]|null; profile_type:string; professional_title:string|null;
  professional_verification_status:string; about:string|null; specialties:string[]|null;
  availability:string|null; online:boolean|null; last_seen:string|null;
  next_session_id:string|null; next_session_title:string|null; next_session_starts_at:string|null;
  total_count:number
}

export type HealerSearchFilters = {
  query?:string
  professionalType?:string
  language?:string
  country?:string
  onlineOnly?:boolean
  verifiedOnly?:boolean
  availability?:string
  limit?:number
  offset?:number
}

export async function searchPublicHealers(filters:HealerSearchFilters = {}) {
  const { data, error } = await supabase.rpc('search_healers', {
    search_text: (filters.query || '').trim(),
    professional_type: filters.professionalType || 'all',
    language_filter: filters.language || 'all',
    country_filter: filters.country || 'all',
    online_only: Boolean(filters.onlineOnly),
    verified_only: filters.verifiedOnly ?? true,
    availability_filter: filters.availability || 'all',
    page_limit: filters.limit || 12,
    page_offset: filters.offset || 0,
  })
  if (error) throw error
  const rows = (data as PublicHealer[]) || []
  const total = rows.length > 0 ? rows[0].total_count : 0
  return { rows, total }
}

export async function getFeaturedHealers(limit = 12) {
  return searchPublicHealers({ limit, verifiedOnly:true })
}

export async function toggleFollowHealer(healerId: string) {
  const { data, error } = await supabase.rpc('toggle_follow_healer', { target_healer: healerId })
  if (error) throw error
  return data as boolean
}

export async function isFollowingHealer(healerId: string) {
  const { data, error } = await supabase.rpc('is_following_healer', { target_healer: healerId })
  if (error) throw error
  return data as boolean
}

export async function getHealerFollowerCount(healerId: string) {
  const { data, error } = await supabase.rpc('get_healer_follower_count', { target_healer: healerId })
  if (error) throw error
  return data as number
}

export async function toggleSaveHealer(healerId: string) {
  const { data, error } = await supabase.rpc('toggle_save_healer', { target_healer: healerId })
  if (error) throw error
  return data as boolean
}

export async function isSavedHealer(healerId: string) {
  const { data, error } = await supabase.rpc('is_saved_healer', { target_healer: healerId })
  if (error) throw error
  return data as boolean
}

export async function getHealerReviewStats(healerId: string) {
  const { data, error } = await supabase.rpc('get_healer_review_stats', { target_healer: healerId })
  if (error) throw error
  return data as { avg_rating: number | null; review_count: number }
}

export async function getHealerReviews(healerId: string, limit = 10, offset = 0) {
  const { data, error } = await supabase.rpc('get_healer_reviews', {
    target_healer: healerId,
    page_limit: limit,
    page_offset: offset
  })
  if (error) throw error
  return data as Array<{
    id: string; rating: number; title: string | null; content: string | null;
    created_at: string; reviewer_name: string; reviewer_avatar: string | null; total_count: number
  }>
}

export async function logProfileView(profileId: string) {
  const { error } = await supabase.rpc('log_profile_view', { target_profile: profileId })
  if (error) throw error
}

export async function getProfileViewCount(profileId: string, days = 30) {
  const { data, error } = await supabase.rpc('get_profile_view_count', { target_profile: profileId, days })
  if (error) throw error
  return data as number
}

export async function getHealerDashboardStats(healerId: string) {
  const { data, error } = await supabase.rpc('get_healer_dashboard_stats', { target_healer: healerId })
  if (error) throw error
  return data as {
    follower_count: number; review_count: number; avg_rating: number | null;
    profile_view_count: number; session_count: number; total_registrations: number
  }
}
