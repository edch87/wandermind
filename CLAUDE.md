# Lark — Project Instructions

## What is this
Lark ("Do it on a lark") is a smart personal bucket list app. Users save places/activities, and the app recommends what to do based on weather, time, mood, group, transport, and accessibility. All APIs are free. No server-side code — frontend + Supabase only.

## Stack
React 19 + TypeScript + Tailwind 4 + Vite 8, Supabase (auth + Postgres + RLS), deployed on Vercel with auto-deploy from GitHub.

## Repo & deployment
- GitHub: `edch87/wandermind` (name predates rename to Lark)
- Vercel: `wandermind-wine.vercel.app`
- Supabase project: `ihizwxytvlfsvakzrqck` (EU region)
- Push to `main` → Vercel auto-deploys

## Key constraints
- **Free tier only** — no paid APIs, no paid hosting
- **No server-side** — everything runs in the browser + Supabase
- **APIs (hybrid)**: place search, opening hours and detail-view photos use **Google Places API (New)** (needs `VITE_GOOGLE_MAPS_API_KEY`; falls back to HERE search if unset). Map tiles, routing and reverse geocoding stay on **HERE** (`VITE_HERE_API_KEY`); weather (Open-Meteo) and stored images (Wikidata/Wikipedia) are free/open.
- **Google cost guards**: field masks in `api.ts` are pinned to SKU tiers — do not add fields casually. Photos are fetched only on the item detail view (media calls have just 1,000 free/month). Per Google ToS, only `place_id` is persisted; photo URLs are fetched fresh at display time. The API key must stay referrer-restricted with daily quota caps in the Google Cloud console.
- **Access**: app is invite-only during friends-and-family testing — public signups disabled in Supabase, accounts created manually in the dashboard.
- HERE routing maps modes to pedestrian/bicycle/car profiles (transit uses the separate Transit API); haversine ×1.3 with average speeds is the fallback

## Project structure
```
src/
  components/    # React components (AddPlace, AuthScreen, BucketList, Dashboard, ItemDetail, Onboarding, RecommendationFlow, Settings)
  utils/         # api.ts (external APIs), inference.ts (smart defaults), openingHours.ts, recommendation.ts (filtering/scoring), storage.ts (Supabase CRUD), supabase.ts (client)
  types/         # index.ts (all types, categories, labels)
  hooks/         # Custom React hooks
  assets/        # Static images
docs/            # TECHNICAL.md, CHANGELOG.md
IDEAS.md         # Feature backlog — check before planning work
```

## Env vars
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_HERE_API_KEY` — see `.env.example`

## Database
Supabase Postgres with RLS. Two tables: `profiles` (snake_case columns) and `bucket_list_items`. Storage layer in `storage.ts` converts between camelCase (app) and snake_case (DB).

## Design decisions
- Situational context (transport, kids, dog, accessibility) belongs in the **recommend flow**, not the profile — these change per outing
- Profile/settings holds only stable info: name + home location
- "I'm feeling spontaneous" = random pick with 1-day max cap
- Search displays: Name, City/Locale, Country
- App theme: dark brown, bird emoji favicon

## Working with Edward
- **Background**: graphic/UI designer, strong visual instincts, newer to coding — explain technical steps clearly
- **After every code change**: list changed files + provide `git add/commit/push` commands
- **Before suggesting setup**: check what's already deployed — don't repeat completed infrastructure steps
- **Check IDEAS.md** before planning features — it tracks what's done and what's next
- **Detailed docs**: see `docs/TECHNICAL.md` for full stack details, `docs/CHANGELOG.md` for history
