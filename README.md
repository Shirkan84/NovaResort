# Nova Resort

Nova Resort is a responsive wellness and peer-support community experience designed to feel calm, safe, and welcoming.

## Features

- Community healing-room discovery
- Verified healer profiles
- Conversations and upcoming sessions
- Emotional check-in and safety guidance
- Responsive mobile navigation
- Light and dark appearance modes

## Local development

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Deployment

The included GitHub Actions workflow builds and publishes the site to GitHub Pages whenever `main` is updated.

## Supabase setup

Run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL Editor. It creates the application tables, starter community rooms, user-profile trigger, real-time publications, and row-level security policies required by the live community features.

> Nova Resort is a peer-support and wellness community concept. It is not a substitute for medical, psychological, psychiatric, or emergency services.
