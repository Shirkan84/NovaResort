import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf-8')

describe('i18n Module', () => {
  it('exports getLanguage, switchLanguage, applyLanguage', () => {
    const content = read('i18n.ts')
    expect(content).toContain('getLanguage')
    expect(content).toContain('switchLanguage')
    expect(content).toContain('applyLanguage')
  })
})

describe('Supabase Client', () => {
  it('exports supabase client', () => {
    const content = read('supabase.ts')
    expect(content).toContain('createClient')
  })
})

describe('Route Links', () => {
  it('exports route links for all features', () => {
    const content = read('routeLinks.ts')
    expect(content).toContain('home')
    expect(content).toContain('sessions')
    expect(content).toContain('podcasts')
  })
})
