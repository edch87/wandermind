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
- **All external APIs are free/open**: Nominatim, OSM, OSRM, Open-Meteo, Wikidata/Wikipedia, OpenStreetMap tiles
- OSRM public server only supports `driving` profile; walk/bike times are calculated from driving distance + average speed

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
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — see `.env.example`

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
