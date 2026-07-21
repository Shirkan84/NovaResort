import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

type UserRole = {
  user: { id: string; email?: string } | null
  profile: { profile_type: string; account_status: string } | null
  isLoading: boolean
  isAuthenticated: boolean
  accountType: 'member' | 'healer' | 'admin' | null
  isMember: boolean
  isHealer: boolean
  isAdmin: boolean
  canCreateContent: boolean
}

export function useUserRole(sessionUserId: string | null): UserRole {
  const [profile, setProfile] = useState<{ profile_type: string; account_status: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!sessionUserId) { setProfile(null); setIsLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.from('profiles').select('profile_type,account_status').eq('id', sessionUserId).single()
        if (!cancelled) setProfile(data)
      } catch {
        if (!cancelled) setProfile(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [sessionUserId])

  const accountType = profile?.profile_type === 'healer' ? 'healer'
    : profile?.profile_type === 'admin' ? 'admin'
    : profile?.profile_type === 'member' ? 'member'
    : null

  return {
    user: sessionUserId ? { id: sessionUserId } : null,
    profile,
    isLoading,
    isAuthenticated: Boolean(sessionUserId),
    accountType,
    isMember: accountType === 'member',
    isHealer: accountType === 'healer',
    isAdmin: accountType === 'admin',
    canCreateContent: accountType === 'healer' || accountType === 'admin',
  }
}
