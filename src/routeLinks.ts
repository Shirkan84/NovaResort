const ROUTE_TO_BUTTON: Record<string, string> = {
  discover: 'Discover',
  community: 'Community',
  rooms: 'Discover',
  messages: 'Messages',
  members: 'Community',
  'members/online': 'Community',
  healers: 'Community',
  connections: 'Connections',
  sessions: 'Sessions',
  'sessions/upcoming': 'Sessions',
  notifications: 'Notifications',
  profile: 'Settings',
  'profile/edit': 'Settings',
  settings: 'Settings',
  safety: 'Visit safety center',
  'community-guidelines': 'Visit safety center',
  privacy: 'Visit safety center',
  terms: 'Visit safety center',
}

function getRoute() {
  const fromHash = window.location.hash.replace(/^#\/?/, '')
  if (fromHash) return decodeURIComponent(fromHash)
  const pathRoute = window.location.pathname
    .replace(/^\/NovaResort\/?/, '')
    .replace(/^\/+|\/+$/g, '')
  return decodeURIComponent(pathRoute || 'home')
}

function normalizePathRoute(route: string) {
  if (window.location.hash || route === 'home') return
  window.history.replaceState(null, '', `/NovaResort/#${route}`)
}

function clickMatchingButton(label: string) {
  const buttons = Array.from(document.querySelectorAll('button'))
  const target = buttons.find((button) => button.textContent?.trim().includes(label))
  target?.click()
  return Boolean(target)
}

function applyRoute(attempt = 0) {
  const route = getRoute().split('?')[0]
  normalizePathRoute(route)
  if (route === 'home') {
    clickMatchingButton('Home')
    return
  }
  if (route.startsWith('room/')) return
  const label = ROUTE_TO_BUTTON[route]
  if (!label) return
  if (!clickMatchingButton(label) && attempt < 20) {
    window.setTimeout(() => applyRoute(attempt + 1), 250)
  }
}

window.addEventListener('hashchange', () => applyRoute())
window.addEventListener('load', () => applyRoute())
window.setTimeout(() => applyRoute(), 500)
