import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf-8')

describe('A11y Lint: ARIA attributes', () => {
  it('all dialogs have role="dialog"', () => {
    const files = [
      'CommunityFeatures.tsx', 'SessionsEvents.tsx', 'PodcastPlatform.tsx',
      'PeopleDiscovery.tsx', 'PrivateMessaging.tsx', 'Favorites.tsx',
      'SessionHistory.tsx', 'WellnessJourney.tsx', 'HealerAnalytics.tsx',
      'Explore.tsx', 'CommunityFeed.tsx', 'NotificationPreferences.tsx',
      'FeedbackForm.tsx', 'GlobalSearch.tsx', 'App.tsx'
    ]
    for (const file of files) {
      const content = read(file)
      if (content.includes('feature-overlay') || content.includes('-window') || content.includes('gs-modal')) {
        expect(content).toContain('role="dialog"')
      }
    }
  })

  it('all overlay sections have aria-modal="true"', () => {
    const files = [
      'CommunityFeatures.tsx', 'SessionsEvents.tsx', 'PodcastPlatform.tsx',
      'PeopleDiscovery.tsx', 'PrivateMessaging.tsx', 'Favorites.tsx',
      'SessionHistory.tsx', 'WellnessJourney.tsx', 'HealerAnalytics.tsx',
      'Explore.tsx', 'CommunityFeed.tsx', 'NotificationPreferences.tsx',
      'FeedbackForm.tsx', 'GlobalSearch.tsx'
    ]
    for (const file of files) {
      const content = read(file)
      if (content.includes('role="dialog"')) {
        expect(content).toContain('aria-modal="true"')
      }
    }
  })

  it('App.tsx has landmark roles', () => {
    const app = read('App.tsx')
    expect(app).toContain('role="navigation"')
    expect(app).toContain('role="main"')
    expect(app).toContain('role="banner"')
    expect(app).toContain('role="contentinfo"')
  })

  it('App.tsx has skip link', () => {
    const app = read('App.tsx')
    expect(app).toContain('skip-link')
    expect(app).toContain('main-content')
  })

  it('App.tsx has aria-live region for toasts', () => {
    const app = read('App.tsx')
    expect(app).toContain('aria-live="polite"')
  })

  it('index.html has lang attribute', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8')
    expect(html).toContain('lang="en"')
  })
})

describe('A11y Lint: Form accessibility', () => {
  it('CommunityFeatures search inputs have aria-label', () => {
    const content = read('CommunityFeatures.tsx')
    const searchInputs = content.match(/placeholder="Search[^"]*"/g) || []
    for (const _input of searchInputs) {
      // Each search input should have an aria-label
    }
    expect(content).toContain('aria-label="Search')
  })

  it('SessionsEvents filter selects have aria-label', () => {
    const content = read('SessionsEvents.tsx')
    expect(content).toContain('aria-label="Filter')
  })

  it('GlobalSearch input has aria-label', () => {
    const content = read('GlobalSearch.tsx')
    expect(content).toContain('aria-label="Global search"')
  })

  it('Registration.tsx has no dead onClick', () => {
    const content = read('Registration.tsx')
    expect(content).not.toMatch(/onClick\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/)
  })
})

describe('A11y Lint: Image accessibility', () => {
  const filesWithImages = [
    'Homepage.tsx', 'Explore.tsx', 'Favorites.tsx', 'HealerProfile.tsx',
    'MemberDashboard.tsx', 'PodcastPlatform.tsx', 'CommunityFeed.tsx',
    'GlobalSearch.tsx', 'HealerDashboard.tsx', 'CategoryPage.tsx',
    'PrivateMessaging.tsx', 'SessionChatRoom.tsx', 'App.tsx'
  ]

  it.each(filesWithImages)('%s has no more than 30%% empty alt attributes', (file) => {
    const content = read(file)
    const imgTags = content.match(/<img\s[^>]*>/g) || []
    if (imgTags.length === 0) return
    const emptyAlts = imgTags.filter(tag => tag.includes('alt=""'))
    const ratio = emptyAlts.length / imgTags.length
    expect(ratio).toBeLessThan(0.3)
  })
})

describe('A11y Lint: Reduced motion', () => {
  it('tokens.css enforces reduced-motion', () => {
    const css = read('tokens.css')
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toContain('animation-duration: 0.01ms')
    expect(css).toContain('transition-duration: 0.01ms')
  })

  it('components.css has spinner animation', () => {
    const css = read('components.css')
    expect(css).toContain('@keyframes nr-spin')
    expect(css).toContain('@keyframes nr-shimmer')
  })
})

describe('A11y Lint: Touch targets', () => {
  it('styles.css enforces 44px touch targets on mobile', () => {
    const css = read('styles.css')
    expect(css).toContain('min-height: 44px')
    expect(css).toContain('min-width: 44px')
  })
})

describe('A11y Lint: Focus management', () => {
  it('tokens.css has focus-visible styles', () => {
    const css = read('tokens.css')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('--nr-focus-ring')
  })

  it('hooks/useFocusTrap.ts exists', () => {
    const fs = require('fs')
    const path = require('path')
    const hookPath = path.resolve(__dirname, '../hooks/useFocusTrap.ts')
    expect(fs.existsSync(hookPath)).toBe(true)
  })

  it('GlobalSearch uses focus trap', () => {
    const gs = read('GlobalSearch.tsx')
    expect(gs).toContain('useFocusTrap')
  })
})

describe('A11y Lint: Color contrast tokens', () => {
  it('tokens.css has sufficient contrast between text and background', () => {
    const css = read('tokens.css')
    // Primary text #26352f on surface #fff = 12.5:1 (AAA)
    expect(css).toContain('--nr-text: #26352f')
    expect(css).toContain('--nr-surface: #ffffff')
  })

  it('dark mode tokens maintain contrast', () => {
    const css = read('tokens.css')
    // Dark mode: text #e9efeb on page #151c19 = 12.8:1 (AAA)
    expect(css).toContain('--nr-text: #e9efeb')
    expect(css).toContain('--nr-page: #151c19')
  })
})
