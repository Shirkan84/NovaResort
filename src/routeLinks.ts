const ROUTE_TO_BUTTON: Record<string, string> = {
  discover: 'Discover',
  community: 'Community',
  rooms: 'Discover',
  messages: 'Messages',
  members: 'Community',
  'members/online': 'Community',
  healers: 'Healers',
  podcasts: 'Podcasts',
  'podcasts/manage': 'Podcasts',
  connections: 'Connections',
  sessions: 'Sessions',
  'sessions/upcoming': 'Sessions',
  explore: 'Home',
  notifications: 'Bell',
  profile: 'Settings',
  settings: 'Settings',
  safety: 'Visit safety center',
  'community-guidelines': 'Visit safety center',
  privacy: 'Visit safety center',
  terms: 'Visit safety center',
  'community-feed': 'Discover',
  'notif-prefs': 'Bell',
}

function isPodcastRoute(route: string): boolean {
  if (route === 'podcasts' || route === 'podcasts/manage') return true
  if (route.startsWith('podcasts/manage/')) return true
  const parts = route.split('/')
  return parts[0] === 'podcasts' && (parts.length === 2 || (parts.length >= 3 && parts[2] === 'episodes'))
}

function isCategoryRoute(route: string): boolean {
  return route.startsWith('category/')
}

function isProfileRoute(route: string): boolean {
  return route.startsWith('profile/')
}

const BASE_PATH = import.meta.env.VITE_BASE_PATH || '/NovaResort'

function getRoute() {
  const fromHash = window.location.hash.replace(/^#\/?/, '')
  if (fromHash) return decodeURIComponent(fromHash)
  const pathRoute = window.location.pathname
    .replace(new RegExp('^' + BASE_PATH.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '/?'), '')
    .replace(/^\/+|\/+$/g, '')
  return decodeURIComponent(pathRoute || 'home')
}

function normalizePathRoute(route: string) {
  if (window.location.hash || route === 'home') return
  window.history.replaceState(null, '', `${BASE_PATH}/#/${route}`)
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
  if (route.startsWith('room/') || isProfileRoute(route)) return
  if (isCategoryRoute(route)) return
  if (isPodcastRoute(route)) {
    if (!clickMatchingButton('Podcasts') && attempt < 20) {
      window.setTimeout(() => applyRoute(attempt + 1), 250)
    }
    return
  }
  const label = ROUTE_TO_BUTTON[route]
  if (!label) return
  if (!clickMatchingButton(label) && attempt < 20) {
    window.setTimeout(() => applyRoute(attempt + 1), 250)
  }
}

window.addEventListener('hashchange', () => applyRoute())
window.addEventListener('load', () => applyRoute())
window.setTimeout(() => applyRoute(), 500)
