# Nova Resort — Restore Point

**Created:** 2026-07-23
**Purpose:** Complete rollback point before platform enhancements

---

## Backup Commit

| Field | Value |
|-------|-------|
| Commit Hash | `0a8e332e80245cd5ea319525e2a4e966b7067ec9` |
| Tag | `backup-pre-enhancement-20260723-1500` |
| Branch | `main` |
| Feature Branch | `feature/platform-enhancement` |
| GitHub | https://github.com/Shirkan84/NovaResort |
| Remote | `origin` → `https://github.com/Shirkan84/NovaResort.git` |

---

## Supabase Project

| Field | Value |
|-------|-------|
| Project Name | Nova Resort |
| Project Ref | `ytdkpbuzycvspexnkeci` |
| Region | Northeast Asia (Tokyo) |
| URL | https://ytdkpbuzycvspexnkeci.supabase.co |
| CLI Version | 2.109.1 |

---

## Database

- **Size:** 14 MB
- **Tables:** 33 (see table stats below)
- **Migrations Applied:** 24

### Table Inventory (33 tables)

| Table | Est. Rows | Total Size |
|-------|-----------|------------|
| messages | 24 | 160 kB |
| profiles | 5 | 112 kB |
| friendships | 5 | 96 kB |
| session_room_participants | 1 | 80 kB |
| podcast_tags | 18 | 80 kB |
| session_registrations | 2 | 80 kB |
| room_user_preferences | 14 | 72 kB |
| podcast_episodes | 0 | 64 kB |
| healer_applications | 0 | 64 kB |
| sessions | 3 | 64 kB |
| rooms | 19 | 64 kB |
| notifications | 29 | 48 kB |
| session_room_state | 1 | 48 kB |
| room_members | 14 | 48 kB |
| message_reactions | 1 | 48 kB |
| session_chat_messages | 1 | 48 kB |
| feedback_reports | 0 | 40 kB |
| podcast_comments | 0 | 40 kB |
| podcast_reports | 0 | 40 kB |
| healer_profiles | 1 | 32 kB |
| message_reports | 0 | 32 kB |
| podcasts | 0 | 32 kB |
| podcast_tag_links | 0 | 32 kB |
| podcast_group_members | 0 | 32 kB |
| healer_application_documents | 0 | 32 kB |
| session_reminders | 0 | 32 kB |
| podcast_groups | 0 | 24 kB |
| podcast_reactions | 0 | 24 kB |
| podcast_listens | 0 | 24 kB |
| video_sessions | 0 | 16 kB |
| member_profiles | 0 | 16 kB |
| podcast_follows | 0 | 16 kB |
| podcast_episode_saves | 0 | 16 kB |
| podcast_progress | 0 | 16 kB |
| user_blocks | 0 | 8192 bytes |

---

## Storage Buckets (8)

| Bucket | Type |
|--------|------|
| avatars | Public |
| podcast-covers | Public |
| healer-documents | Private |
| chat-media | Private |
| session-covers | Private |
| feedback-screenshots | Private |
| podcast-audio | Private |
| podcast-video | Private |

---

## Edge Functions (3)

| Function | Status | Version | Last Updated |
|----------|--------|---------|--------------|
| ai-chat | ACTIVE | 3 | 2026-07-20 |
| ai-companion | ACTIVE | 5 | 2026-07-22 |
| submit-feedback | ACTIVE | 1 | 2026-07-22 |

---

## Auth Configuration

- Email confirmation: **Enabled** (managed via database trigger)
- Providers: **Email only** (no OAuth)
- Redirect URLs: `https://novaresort.pages.dev/`
- JWT expiry: Default (1 hour)
- Refresh token rotation: Enabled

### Edge Function Secrets (names only — values redacted)

- AI_MODEL
- AI_PROVIDER
- GROQ_API_KEY
- SUPABASE_ANON_KEY
- SUPABASE_DB_URL
- SUPABASE_JWKS
- SUPABASE_PUBLISHABLE_KEYS
- SUPABASE_SECRET_KEYS
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_URL

---

## Configuration Snapshot

| Tool | Version |
|------|---------|
| Node.js | v26.5.0 |
| npm | 12.0.1 |
| Supabase CLI | 2.109.1 |
| TypeScript | ^5.8.3 |
| React | ^19.1.0 |
| Vite | ^6.3.5 |
| Vite Plugin Singlefile | ^2.0.3 |
| Supabase JS | ^2.110.6 |
| lucide-react | ^0.468.0 |

---

## Deployment

| Field | Value |
|-------|-------|
| Platform | Cloudflare Pages |
| Production URL | https://novaresort.pages.dev |
| Build Command | `npm run build` (`tsc -b && vite build`) |
| Output Directory | `dist/` |
| Build Type | Single HTML file (vite-plugin-singlefile) |
| Last Build Size | 943 KB (gzip 232 KB) |

---

## Migration History (24 migrations)

1. 20260716155327_remote.sql
2. 20260720053446_remote.sql
3. 20260720053603_remote.sql
4. 20260720064357_remote.sql
5. 20260720065549_remote.sql
6. 20260720065935_remote.sql
7. 20260720070629_remote.sql
8. 20260720073029_remote.sql
9. 20260720075507_remote.sql
10. 20260720075613_remote.sql
11. 20260721124158_podcast_episodes_enhancements.sql
12. 20260721150000_authorization_refactor.sql
13. 20260721170000_podcast_production.sql
14. 20260721180000_chat_media_columns.sql
15. 20260721190000_chat_media_public.sql
16. 20260722120000_live_sessions.sql
17. 20260722130000_session_covers_storage.sql
18. 20260722140000_ai_companion.sql
19. 20260722150000_drop_ai_companion_cleanup.sql
20. 20260722160000_session_room_lifecycle.sql
21. 20260722170000_feedback_reports.sql
22. 20260722180000_podcast_studio_production.sql
23. 20260723000000_registration_rewrite.sql
24. 20260723010000_fix_registration_and_session_rooms.sql

---

## Backed-Up Files

```
project-backups/
├── RESTORE.md                     (this file)
├── schema/
│   ├── complete_schema.sql        (107 KB — all 24 migrations concatenated)
│   └── schema_reference.sql       (original schema.sql)
├── migrations/
│   └── (24 migration SQL files)
└── database/
    └── (table stats — see above)
```

---

## How to Restore

### Restore Code Only
```bash
git checkout backup-pre-enhancement-20260723-1500
```

### Restore to Feature Branch
```bash
git checkout feature/platform-enhancement
git reset --hard backup-pre-enhancement-20260723-1500
```

### Restore Database Schema
1. Install Docker Desktop
2. Start local Supabase: `npx supabase start`
3. Apply all migrations in order from `project-backups/migrations/`
4. Or use `project-backups/schema/complete_schema.sql` as reference

### Restore Edge Functions
Edge Functions are deployed separately. The source code is in `supabase/functions/`.

### Restore Storage
Storage buckets must be recreated manually via Supabase Dashboard:
- Create buckets: avatars (public), podcast-covers (public), healer-documents, chat-media, session-covers, feedback-screenshots, podcast-audio, podcast-video

---

## Security Notes

- `.env` file is NOT in `.gitignore` — should be added
- `.env.example` contains only the publishable/anon key (safe)
- No service role keys or JWT secrets committed to git
- Edge Function secrets are stored in Supabase (not in repo)
- All database tables have RLS policies
