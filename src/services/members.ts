import { supabase } from '../supabase'

export type PublicMember = {
  id:string
  full_name:string
  display_name:string|null
  avatar_url:string|null
  country:string|null
  city:string|null
  profile_type:string
  professional_title:string|null
  professional_verification_status:string|null
  about:string|null
  interests:string[]|null
  specialties:string[]|null
  languages:string[]|null
  online:boolean|null
  last_seen:string|null
  created_at:string
}

export type MemberFilters = {
  query?:string
  memberType?:'all'|'regular'|'healers'
  country?:string
  language?:string
  specialty?:string
  sort?:'recently_joined'|'recently_active'|'name'|'healers_first'
  limit?:number
  offset?:number
}

const publicProfileFields = 'id,full_name,display_name,avatar_url,country,city,profile_type,professional_title,professional_verification_status,about,interests,specialties,languages,online,last_seen,created_at'
const approvedProfessional = (member:PublicMember) => member.professional_verification_status === 'approved' && ['healer','therapist','coach','mindfulness_teacher','wellness_professional'].includes(member.profile_type)

export function publicAccountLabel(member:PublicMember) {
  return approvedProfessional(member) ? 'Healer' : 'Regular Member'
}

export function isApprovedHealer(member:PublicMember) {
  return approvedProfessional(member)
}

export async function searchMembers(filters:MemberFilters = {}) {
  const limit = Math.min(Math.max(filters.limit || 24, 1), 48)
  const offset = Math.max(filters.offset || 0, 0)
  let query = supabase
    .from('profiles')
    .select(publicProfileFields, { count:'exact' })
    .eq('account_status','active')
    .eq('discoverable',true)
    .neq('visibility','private')

  const q = (filters.query || '').replace(/[,%()]/g, ' ').trim().replace(/%/g,'\\%').replace(/_/g,'\\_')
  if (q) query = query.or(`display_name.ilike.%${q}%,full_name.ilike.%${q}%,professional_title.ilike.%${q}%,about.ilike.%${q}%,country.ilike.%${q}%,city.ilike.%${q}%`)
  if (filters.country && filters.country !== 'all') query = query.eq('country', filters.country)
  if (filters.language && filters.language !== 'all') query = query.contains('languages', [filters.language])
  if (filters.specialty && filters.specialty !== 'all') query = query.contains('specialties', [filters.specialty])
  if (filters.memberType === 'healers') {
    query = query.eq('professional_verification_status','approved').in('profile_type',['healer','therapist','coach','mindfulness_teacher','wellness_professional'])
  } else if (filters.memberType === 'regular') {
    query = query.not('professional_verification_status','eq','approved')
  }

  if (filters.sort === 'name') query = query.order('display_name', { ascending:true, nullsFirst:false }).order('full_name', { ascending:true })
  else if (filters.sort === 'recently_active') query = query.order('online', { ascending:false }).order('last_seen', { ascending:false })
  else if (filters.sort === 'healers_first') query = query.order('professional_verification_status', { ascending:true }).order('updated_at', { ascending:false })
  else query = query.order('created_at', { ascending:false })

  const { data, error, count } = await query.range(offset, offset + limit - 1)
  if (error) throw error
  const rows = ((data as PublicMember[]) || [])
  return { rows, total: count ?? rows.length }
}
