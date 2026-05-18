# Lark — Technical Documentation

## Overview
Lark is a client-side React app with a Supabase backend. There is no custom server — all logic runs in the browser. External data comes from free, open APIs.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| UI framework | React | 19.2 |
| Language | TypeScript | 6.0 |
| Styling | Tailwind CSS | 4.3 |
| Bundler | Vite | 8.0 |
| Routing | React Router DOM | 7.15 |
| Maps | Leaflet | 1.9 |
| Icons | Lucide React | 0.475 |
| Backend | Supabase (Auth + Postgres) | JS SDK 2.49 |
| Hosting | Vercel | — |
| Source control | GitHub (`edch87/wandermind`) | — |

---

## External APIs

All free, no API keys required (except Supabase).

| API | Base URL | Used for | Rate limits |
|-----|----------|----------|-------------|
| Nominatim | `nominatim.openstreetmap.org` | Place search + reverse geocoding | 1 req/sec (enforced in code) |
| OSM API | `api.openstreetmap.org/api/0.6` | Fetching OSM tags (opening hours, attributes) | Fair use |
| OSRM | `router.project-osrm.org` | Driving route distance/duration | Public demo server, driving profile only |
| Open-Meteo | `api.open-meteo.com/v1/forecast` | 7-day weather forecast | No key needed |
| Wikidata | `wikidata.org/w/api.php` | Place images via P18 claim | Fair use |
| Wikipedia | `{lang}.wikipedia.org/w/api.php` | Fallback place images | Fair use |
| OSM Tiles | `tile.openstreetmap.org` | Map tiles (Leaflet) + fallback place image | Fair use |

### OSRM notes
The public OSRM server only reliably supports the `driving` profile. For walk and bike modes, the app fetches the driving route (for accurate road distance), then calculates duration using average speeds: walk 5 km/h (+20% distance adjustment), bike 15 km/h, car uses OSRM's duration directly. Haversine ×1.3 is the fallback if OSRM fails.

### Place images
Three-step waterfall: Wikidata P18 → Wikipedia page image → Wikipedia search → OpenStreetMap tile fallback.

---

## Supabase Setup

- **Project ID**: `ihizwxytvlfsvakzrqck` (EU region)
- **Auth**: Email/password via Supabase Auth
- **Database**: Postgres with Row Level Security (RLS)

### Tables

**`profiles`** — one row per user
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | matches auth.uid() |
| display_name | text | |
| home_latitude | float | |
| home_longitude | float | |
| home_address | text | |
| preferred_transport | text | legacy, now set per-outing |
| has_dog | boolean | legacy, now set per-outing |
| has_kids | boolean | legacy, now set per-outing |
| needs_accessibility | boolean | legacy, now set per-outing |
| onboarding_complete | boolean | |
| updated_at | timestamptz | |

**`bucket_list_items`** — user's saved places
Uses snake_case in DB, camelCase in app. See `src/types/index.ts` for the full `BucketListItem` interface. Key fields: name, coordinates, category, travel time/distance, duration estimate, cost level, weather suitability, group suitability, accessibility flags, and completion data.

### Data layer
`storage.ts` handles all Supabase CRUD. It converts between camelCase (app) and snake_case (DB) via `profileFromDb`/`profileToDb` helper functions. Includes a legacy category migration map for old data.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |

Set in `.env` locally. On Vercel, set in project environment variables. See `.env.example` for format.

---

## Build & Deploy

### Local development
```bash
npm install
npm run dev        # Vite dev server
```

### Production build
```bash
npm run build      # tsc + vite build → dist/
npm run preview    # preview production build locally
```

### Deployment
Push to `main` on GitHub → Vercel auto-deploys. Config in `vercel.json`:
- Build command: `npm run build`
- Output: `dist/`
- SPA rewrites: all routes → `/` (React Router handles routing)

---

## App Architecture

### Screens (components/)
| Component | Purpose |
|-----------|---------|
| AuthScreen | Email/password login & signup |
| Onboarding | First-time setup (name, home location) |
| Dashboard | Home screen, quick actions, recent items |
| BucketList | Full list view with search/filter |
| AddPlace | Search + add new places via Nominatim |
| ItemDetail | View/edit a single item's details |
| RecommendationFlow | Multi-step flow: date → time → group → energy → vibe → transport → accessibility → results |
| Settings | User profile (name + home location only) |

### Smart defaults (inference.ts)
When a place is added, the app infers metadata from OSM tags: category, indoor/outdoor, weather suitability, duration, cost, seasons, time of day, group types, and accessibility.

### Recommendation engine (recommendation.ts)
Filters and scores bucket list items based on user constraints (weather, time budget including travel, group, energy, vibe, accessibility, dog/stroller). Returns ranked results with human-readable reasons.

### Categories
13 categories defined in `types/index.ts` with labels, Lucide icon names, and colours. Legacy categories are auto-migrated via `LEGACY_CATEGORY_MAP` in `storage.ts`.
