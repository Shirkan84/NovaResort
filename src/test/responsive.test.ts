import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const readCSS = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf-8')

describe('Responsive Design: Mobile (max-width: 768px)', () => {
  it('styles.css has mobile breakpoint', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('max-width: 768px')
  })

  it('styles.css has mobile nav toggle button', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('.menu-btn')
  })

  it('styles.css has mobile close button', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('.close-mobile')
  })

  it('styles.css has touch-friendly button sizing', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('min-height: 44px')
    expect(css).toContain('min-width: 44px')
  })

  it('styles.css has responsive card layout', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('grid-template-columns')
  })

  it('components.css has responsive grid utilities', () => {
    const css = readCSS('components.css')
    expect(css).toContain('.nr-grid')
    expect(css).toContain('.nr-flex')
  })
})

describe('Responsive Design: Tablet (max-width: 800px)', () => {
  it('styles.css has tablet breakpoint', () => {
    const css = readCSS('styles.css')
    expect(css).toMatch(/max-width\s*:\s*800px/)
  })

  it('styles.css has tablet-specific sidebar behavior', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('.sidebar')
    expect(css).toMatch(/transform\s*:\s*translateX\(-100%\)/)
  })
})

describe('Responsive Design: Typography', () => {
  it('styles.css has body font-size declaration', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('font-size')
  })

  it('tokens.css defines font size tokens', () => {
    const css = readCSS('tokens.css')
    expect(css).toContain('--nr-text-xs')
    expect(css).toContain('--nr-text-sm')
    expect(css).toContain('--nr-text-md')
  })
})

describe('Responsive Design: Layout', () => {
  it('styles.css has sidebar class', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('.sidebar')
  })

  it('styles.css has sidebar width declaration', () => {
    const css = readCSS('styles.css')
    expect(css).toMatch(/\.sidebar[\s\S]*width:\s*2\d\dpx/)
  })

  it('styles.css has content area class', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('.content')
  })
})

describe('Responsive Design: Forms', () => {
  it('components.css has responsive input component', () => {
    const css = readCSS('components.css')
    expect(css).toContain('.nr-input')
  })

  it('components.css has responsive field component', () => {
    const css = readCSS('components.css')
    expect(css).toContain('.nr-field')
  })

  it('styles.css has input width 100%', () => {
    const css = readCSS('styles.css')
    expect(css).toMatch(/input[\s\S]*width\s*:\s*100%/)
  })
})

describe('Responsive Design: Feature Overlay', () => {
  it('styles.css has responsive overlay sizing', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('.feature-overlay')
  })

  it('styles.css has chat window class', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('.chat-window')
  })
})

describe('Responsive Design: Accessibility', () => {
  it('styles.css has sr-only utility', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('.sr-only')
  })

  it('tokens.css has skip-link styles', () => {
    const css = readCSS('tokens.css')
    expect(css).toContain('.skip-link')
  })

  it('tokens.css has focus-visible ring', () => {
    const css = readCSS('tokens.css')
    expect(css).toContain(':focus-visible')
  })

  it('tokens.css has reduced motion support', () => {
    const css = readCSS('tokens.css')
    expect(css).toContain('prefers-reduced-motion')
  })
})

describe('Responsive Design: RTL Support', () => {
  it('styles.css has RTL direction handling', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('[dir=rtl]')
  })

  it('styles.css flips flex direction for RTL', () => {
    const css = readCSS('styles.css')
    expect(css).toMatch(/flex-direction\s*:\s*row-reverse/)
  })
})

describe('Responsive Design: Dark Mode', () => {
  it('styles.css has dark mode class', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('.app.dark')
  })

  it('styles.css has dark mode background', () => {
    const css = readCSS('styles.css')
    expect(css).toContain('var(--page)')
  })
})
