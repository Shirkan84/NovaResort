# Nova Resort — Agent Coding Conventions

## Architecture
- React + TypeScript + Vite SPA (single HTML file via `vite-plugin-singlefile`)
- Supabase backend (Auth, Postgres, Edge Functions, Storage)
- All source files live flat in `src/` (no subdirectories except `services/`)
- No React Router — uses hash-based routing (`#route`) via manual `hashchange` listener

## Code Style
- All functions/components use `camelCase` naming
- Type aliases for data models (e.g. `type Room = {...}`)
- All Supabase queries are inline in component files (no abstraction layer)
- CSS is plain CSS with CSS custom properties (no preprocessors, no CSS-in-JS)
- Dark mode via `.app.dark` class toggling CSS custom properties
- i18n via DOM MutationObserver on Hebrew/English text replacement

## Security Patterns
- RLS policies on every table — never bypass with `security definer` unless required
- ILIKE searches must sanitize `%` and `_` wildcards in user input
- Session registration uses `pg_advisory_xact_lock` to prevent overbooking
- Notifications created only via security definer functions (no direct INSERT)

## Routing
- Internal routes use `setRoute(path)` which sets `window.location.hash`
- `routeFromHash()` parses hash into `AppRoute` object
- `BASE_PATH` and `BASE_URL` are env-driven (default: `/NovaResort` and GitHub Pages URL)

## Environment Variables
- Frontend: `VITE_*` env vars (see `.env.example`)
- Edge Functions: `Deno.env` (Supabase-managed)

## Testing
- No test framework currently configured
- Run `npm run build` to verify TypeScript compilation

## File Structure
```
src/
  App.tsx              — Main app shell, auth, routing, homepage
  CommunityFeatures.tsx — Chat rooms, connections, profile editor, safety center
  AICompanion.tsx       — AI chat interface
  PrivateMessaging.tsx  — Private 1:1 messaging
  PeopleDiscovery.tsx   — People directory, healers directory
  SessionsEvents.tsx    — Sessions/events listing
  PodcastPlatform.tsx   — Podcast browsing, player, studio
  i18n.ts               — Hebrew/English translation
  routeLinks.ts         — URL-to-button mapping for deep links
  supabase.ts           — Supabase client initialization
  styles.css            — Main stylesheet
  social-home.css       — Homepage quick-actions styles
  services/
    members.ts          — Public member search
    healers.ts          — Healer search via RPC
```
