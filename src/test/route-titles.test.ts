import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf-8')

describe('Route Title System', () => {
  it('App.tsx has title mapping via document.title', () => {
    const app = read('App.tsx')
    expect(app).toContain('document.title')
  })

  it('App.tsx sets title for all major features', () => {
    const app = read('App.tsx')
    expect(app).toContain('Nova Resort — Connect, Reflect & Grow')
    expect(app).toContain('Discover People — Nova Resort')
    expect(app).toContain('Healers — Nova Resort')
    expect(app).toContain('Podcasts — Nova Resort')
    expect(app).toContain('Sessions — Nova Resort')
    expect(app).toContain('Healer Dashboard — Nova Resort')
    expect(app).toContain('Wellness Journey — Nova Resort')
    expect(app).toContain('Page Not Found — Nova Resort')
  })
})

describe('Route Definitions', () => {
  it('App.tsx defines all feature routes', () => {
    const app = read('App.tsx')
    const features = [
      'discover', 'people', 'healers', 'podcasts', 'connections',
      'messages', 'sessions', 'healer', 'feedback', 'notifications',
      'profile', 'favorites', 'session-history', 'explore',
      'community-feed', 'wellness-journey', 'healer-analytics'
    ]
    for (const f of features) {
      expect(app).toContain(`'${f}'`)
    }
  })
})

describe('Performance: Lazy Loading', () => {
  it('App.tsx uses React.lazy for heavy components', () => {
    const app = read('App.tsx')
    expect(app).toContain('React.lazy')
  })

  it('App.tsx wraps content in Suspense', () => {
    const app = read('App.tsx')
    expect(app).toContain('Suspense')
  })

  it('App.tsx lazy-loads WellnessJourney', () => {
    const app = read('App.tsx')
    expect(app).toContain('LazyWellnessJourney')
  })

  it('App.tsx lazy-loads HealerAnalytics', () => {
    const app = read('App.tsx')
    expect(app).toContain('LazyHealerAnalytics')
  })

  it('App.tsx lazy-loads GlobalSearch', () => {
    const app = read('App.tsx')
    expect(app).toContain('LazyGlobalSearch')
  })
})
