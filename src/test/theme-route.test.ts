import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf-8')
const readProject = (file: string) => readFileSync(resolve(__dirname, '../..', file), 'utf-8')

describe('Theme System', () => {
  it('default theme is light (dark defaults to false)', () => {
    const app = read('App.tsx')
    expect(app).toContain('return false')
  })

  it('theme persists via localStorage', () => {
    const app = read('App.tsx')
    expect(app).toContain("localStorage.getItem('nova-theme')")
    expect(app).toContain("localStorage.setItem('nova-theme'")
  })

  it('dark mode only activates via explicit toggle', () => {
    const app = read('App.tsx')
    expect(app).toContain('Toggle theme')
  })

  it('no automatic system prefers-color-scheme detection', () => {
    const app = read('App.tsx')
    expect(app).not.toContain('prefers-color-scheme')
  })

  it('index.html has theme-blocking script to prevent flash', () => {
    const html = readProject('index.html')
    expect(html).toContain("localStorage.getItem('nova-theme')")
    expect(html).toContain("classList.add('dark')")
  })

  it('tokens.css has light mode in :root', () => {
    const css = read('tokens.css')
    expect(css).toContain(':root')
    expect(css).toContain('--nr-page')
    expect(css).toContain('--nr-surface')
  })

  it('tokens.css has dark mode in .app.dark', () => {
    const css = read('tokens.css')
    expect(css).toContain('.app.dark')
  })

  it('tokens.css maps legacy tokens to new tokens', () => {
    const css = read('tokens.css')
    expect(css).toContain('--green: var(--nr-primary)')
    expect(css).toContain('--card: var(--nr-surface)')
  })

  it('styles.css has dark mode overrides', () => {
    const css = read('styles.css')
    expect(css).toContain('.app.dark')
  })
})

describe('RTL Support', () => {
  it('App.tsx sets dir attribute based on language', () => {
    const app = read('App.tsx')
    expect(app).toContain("dir={language === 'he' ? 'rtl' : 'ltr'}")
  })

  it('i18n.ts sets document direction', () => {
    const i18n = read('i18n.ts')
    expect(i18n).toContain('dir')
  })

  it('index.html has lang attribute', () => {
    const html = readProject('index.html')
    expect(html).toContain('lang="en"')
  })
})

describe('Security Headers', () => {
  it('_headers has CSP', () => {
    const headers = readProject('_headers')
    expect(headers).toContain('Content-Security-Policy')
    expect(headers).toContain("default-src 'self'")
  })

  it('_headers has HSTS', () => {
    const headers = readProject('_headers')
    expect(headers).toContain('Strict-Transport-Security')
  })

  it('_headers has X-Frame-Options', () => {
    const headers = readProject('_headers')
    expect(headers).toContain('X-Frame-Options: DENY')
  })

  it('_headers has Permissions-Policy', () => {
    const headers = readProject('_headers')
    expect(headers).toContain('Permissions-Policy')
  })
})

describe('SEO Metadata', () => {
  it('has meta description', () => {
    const html = readProject('index.html')
    expect(html).toContain('meta name="description"')
  })

  it('has Open Graph tags', () => {
    const html = readProject('index.html')
    expect(html).toContain('og:title')
    expect(html).toContain('og:description')
    expect(html).toContain('og:type')
  })

  it('has canonical URL', () => {
    const html = readProject('index.html')
    expect(html).toContain('rel="canonical"')
  })

  it('has structured data', () => {
    const html = readProject('index.html')
    expect(html).toContain('application/ld+json')
    expect(html).toContain('WebApplication')
  })

  it('has color-scheme meta', () => {
    const html = readProject('index.html')
    expect(html).toContain('color-scheme')
  })

  it('has Twitter card', () => {
    const html = readProject('index.html')
    expect(html).toContain('twitter:card')
  })
})
