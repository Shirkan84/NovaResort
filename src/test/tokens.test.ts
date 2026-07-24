import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf-8')

describe('Design Tokens', () => {
  it('tokens.css exists and contains core tokens', () => {
    const css = read('tokens.css')
    expect(css).toContain(':root')
    expect(css).toContain('--nr-primary')
    expect(css).toContain('--nr-surface')
    expect(css).toContain('--nr-text')
    expect(css).toContain('--nr-border')
    expect(css).toContain('--nr-error')
    expect(css).toContain('--nr-success')
  })

  it('tokens.css has dark mode overrides', () => {
    const css = read('tokens.css')
    expect(css).toContain('.app.dark')
    expect(css).toContain('--nr-page')
  })

  it('tokens.css has typography tokens', () => {
    const css = read('tokens.css')
    expect(css).toContain('--nr-font-body')
    expect(css).toContain('--nr-font-heading')
    expect(css).toContain('--nr-text-base')
    expect(css).toContain('--nr-weight-semibold')
  })

  it('tokens.css has spacing tokens', () => {
    const css = read('tokens.css')
    expect(css).toContain('--nr-space-1')
    expect(css).toContain('--nr-space-8')
    expect(css).toContain('--nr-radius-md')
  })

  it('tokens.css has motion tokens', () => {
    const css = read('tokens.css')
    expect(css).toContain('--nr-duration-fast')
    expect(css).toContain('--nr-ease-default')
  })

  it('tokens.css has legacy token aliases', () => {
    const css = read('tokens.css')
    expect(css).toContain('--green: var(--nr-primary)')
    expect(css).toContain('--card: var(--nr-surface)')
    expect(css).toContain('--page: var(--nr-page)')
  })
})

describe('Components CSS', () => {
  it('has button system', () => {
    const css = read('components.css')
    expect(css).toContain('.nr-btn')
    expect(css).toContain('.nr-btn-primary')
    expect(css).toContain('.nr-btn-secondary')
    expect(css).toContain('.nr-btn-ghost')
    expect(css).toContain('.nr-btn-danger')
    expect(css).toContain('.nr-btn-icon')
  })

  it('has card system', () => {
    const css = read('components.css')
    expect(css).toContain('.nr-card')
    expect(css).toContain('.nr-card-elevated')
    expect(css).toContain('.nr-card-interactive')
  })

  it('has badge system', () => {
    const css = read('components.css')
    expect(css).toContain('.nr-badge')
    expect(css).toContain('.nr-badge-success')
    expect(css).toContain('.nr-badge-error')
  })

  it('has form system', () => {
    const css = read('components.css')
    expect(css).toContain('.nr-input')
    expect(css).toContain('.nr-textarea')
    expect(css).toContain('.nr-select')
    expect(css).toContain('.nr-label')
  })

  it('has loading states', () => {
    const css = read('components.css')
    expect(css).toContain('.nr-spinner')
    expect(css).toContain('.nr-skeleton')
  })

  it('has empty/error states', () => {
    const css = read('components.css')
    expect(css).toContain('.nr-empty-state')
    expect(css).toContain('.nr-error-state')
  })
})
