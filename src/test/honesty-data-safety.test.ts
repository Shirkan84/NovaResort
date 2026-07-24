import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf-8')

describe('Honesty Rule Audit', () => {
  it('auth page has peer-support disclaimer', () => {
    const app = read('App.tsx')
    expect(app).toContain('peer-support community')
    expect(app).toContain('not a substitute for professional or emergency services')
  })

  it('footer has honest description', () => {
    const app = read('App.tsx')
    expect(app).toContain('peer-support community and wellness platform')
  })

  it('registration has disclaimer', () => {
    const reg = read('Registration.tsx')
    expect(reg).toContain('peer-support community')
    expect(reg).toContain('not a substitute')
  })

  it('podcasts have disclaimer', () => {
    const pods = read('PodcastPlatform.tsx')
    expect(pods).toContain('does not replace professional diagnosis')
  })

  it('no misleading "100%" claims', () => {
    const files = ['App.tsx', 'Homepage.tsx', 'MemberDashboard.tsx', 'Registration.tsx']
    for (const file of files) {
      const content = read(file)
      expect(content).not.toMatch(/100%\s*(safe|secure|free|guaranteed)/i)
    }
  })

  it('no "guarantee" claims', () => {
    const files = ['App.tsx', 'Homepage.tsx', 'MemberDashboard.tsx', 'Registration.tsx']
    for (const file of files) {
      const content = read(file)
      expect(content.toLowerCase()).not.toContain('guarantee')
    }
  })
})

describe('Data Safety Audit', () => {
  it('supabase client uses env vars with safe fallback', () => {
    const content = read('supabase.ts')
    expect(content).toContain('import.meta.env.VITE_SUPABASE_URL')
    expect(content).toContain('import.meta.env.VITE_SUPABASE_ANON_KEY')
    expect(content).not.toContain('service_role')
  })

  it('no hardcoded secrets in source files', () => {
    const files = ['App.tsx', 'Homepage.tsx', 'MemberDashboard.tsx', 'HealerDashboard.tsx']
    for (const file of files) {
      const content = read(file)
      expect(content.toLowerCase()).not.toContain('api_key')
      expect(content.toLowerCase()).not.toContain('secret_key')
      expect(content.toLowerCase()).not.toContain('private_key')
    }
  })

  it('no console.log statements in production code', () => {
    const files = ['App.tsx', 'Homepage.tsx', 'MemberDashboard.tsx', 'HealerDashboard.tsx',
      'CommunityFeatures.tsx', 'SessionsEvents.tsx', 'PodcastPlatform.tsx', 'PrivateMessaging.tsx',
      'WellnessJourney.tsx', 'HealerAnalytics.tsx', 'Favorites.tsx', 'Explore.tsx',
      'PeopleDiscovery.tsx', 'GlobalSearch.tsx']
    for (const file of files) {
      const content = read(file)
      expect(content).not.toContain('console.log')
    }
  })

  it('localStorage only stores safe non-sensitive data', () => {
    const app = read('App.tsx')
    const i18n = read('i18n.ts')
    expect(app).toContain("localStorage.setItem('nova-theme'")
    expect(i18n).toContain("localStorage.setItem('nova-language'")
    const allContent = app + i18n
    const storeMatches = allContent.match(/localStorage\.setItem\(/g)
    expect(storeMatches?.length).toBe(2)
  })

  it('password fields use type=password with minLength', () => {
    const reg = read('Registration.tsx')
    expect(reg).toContain('type="password"')
    expect(reg).toContain('minLength')
  })

  it('no SQL injection risks in raw queries', () => {
    const files = ['App.tsx', 'CommunityFeatures.tsx', 'SessionsEvents.tsx', 'PodcastPlatform.tsx']
    for (const file of files) {
      const content = read(file)
      // Check for raw SQL with string interpolation (not parameterized)
      expect(content).not.toMatch(/\.from\(['"][^'"]+['"]\)\.select\([^)]*\$\{[^}]+\}/)
    }
  })
})
