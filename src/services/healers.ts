import { supabase } from '../supabase'

export const PROFESSIONAL_ROLES = ['healer','therapist','coach','mindfulness_teacher','wellness_professional'] as const

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
