import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf-8')

describe('Accessibility Audit', () => {
  it('tokens.css has prefers-reduced-motion', () => {
    const css = read('tokens.css')
    expect(css).toContain('prefers-reduced-motion')
  })

  it('tokens.css has .sr-only class', () => {
    const css = read('tokens.css')
    expect(css).toContain('.sr-only')
    expect(css).toContain('clip: rect(0, 0, 0, 0)')
  })

  it('tokens.css has .skip-link class', () => {
    const css = read('tokens.css')
    expect(css).toContain('.skip-link')
  })

  it('tokens.css has focus-visible styles', () => {
    const css = read('tokens.css')
    expect(css).toContain(':focus-visible')
  })

  it('App.tsx has skip link element', () => {
    const app = read('App.tsx')
    expect(app).toContain('skip-link')
    expect(app).toContain('main-content')
  })

  it('App.tsx has role="dialog" on overlays', () => {
    const app = read('App.tsx')
    expect(app).toContain('role="dialog"')
    expect(app).toContain('aria-modal="true"')
  })

  it('App.tsx has aria-live on toast', () => {
    const app = read('App.tsx')
    expect(app).toContain('aria-live="polite"')
  })

  it('App.tsx has aria-labels on icon buttons', () => {
    const app = read('App.tsx')
    expect(app).toContain('aria-label="Open menu"')
    expect(app).toContain('aria-label="Toggle theme"')
    expect(app).toContain('aria-label="Notifications"')
    expect(app).toContain('aria-label="Activity Feed"')
    expect(app).toContain('aria-label="Close menu"')
    expect(app).toContain('aria-label="Close profile"')
  })

  it('App.tsx has aria-current on nav items', () => {
    const app = read('App.tsx')
    expect(app).toContain('aria-current=')
  })

  it('App.tsx has no dead href="#" links', () => {
    const app = read('App.tsx')
    expect(app).not.toContain('href="#"')
  })

  it('App.tsx has RTL dir attribute', () => {
    const app = read('App.tsx')
    expect(app).toContain('dir={language')
  })

  it('App.tsx has role="contentinfo" on footer', () => {
    const app = read('App.tsx')
    expect(app).toContain('role="contentinfo"')
  })

  it('App.tsx has role="navigation" on sidebar', () => {
    const app = read('App.tsx')
    expect(app).toContain('role="navigation"')
    expect(app).toContain('aria-label="Main navigation"')
  })

  it('GlobalSearch has aria-label', () => {
    const gs = read('GlobalSearch.tsx')
    expect(gs).toContain('aria-label="Search"')
    expect(gs).toContain('aria-label="Global search"')
  })

  it('Focus trap hook exists', () => {
    const fs = require('fs')
    const hookPath = resolve(__dirname, '../hooks/useFocusTrap.ts')
    expect(fs.existsSync(hookPath)).toBe(true)
  })

  it('GlobalSearch uses focus trap', () => {
    const gs = read('GlobalSearch.tsx')
    expect(gs).toContain('useFocusTrap')
  })
})

describe('Alt Text Audit', () => {
  const filesWithAlts = [
    'Homepage.tsx',
    'Explore.tsx',
    'Favorites.tsx',
    'HealerProfile.tsx',
    'MemberDashboard.tsx',
    'PodcastPlatform.tsx',
    'CommunityFeed.tsx',
    'GlobalSearch.tsx',
    'HealerDashboard.tsx',
    'CategoryPage.tsx',
  ]

  it.each(filesWithAlts)('%s has meaningful alt text on images', (file) => {
    const content = read(file)
    const imgTags = content.match(/<img\s[^>]*>/g) || []
    const emptyAlts = imgTags.filter(tag => tag.includes('alt=""'))
    const totalImgs = imgTags.length
    if (totalImgs > 0) {
      const ratio = emptyAlts.length / totalImgs
      expect(ratio).toBeLessThan(0.3)
    }
  })
})
