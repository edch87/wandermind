# Lark — Technical Documentation

## Overview
Lark is a client-side React app with a Supabase backend. There is no custom server — all logic runs in the browser. Place data, geocoding, and routing come from the HERE APIs (freemium, requires a key); weather and images come from free, open APIs.

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

HERE requires an API key (`VITE_HERE_API_KEY`); the rest are free with no key. All keys are client-side (HERE key restrictions should be set in the HERE console).

| API | Base URL | Used for | Notes |
|-----|----------|----------|-------|
| HERE Discover | `discover.search.hereapi.com/v1/discover` | POI search near a location | Used when lat/lng known |
| HERE Geocode | `geocode.search.hereapi.com/v1/geocode` | Search without location context | Cities/addresses |
| HERE Reverse Geocode | `revgeocode.search.hereapi.com/v1/revgeocode` | Coordinates → place | Used by Google Maps URL paste |
| HERE Lookup | `lookup.search.hereapi.com/v1/lookup` | Place details + categories | Feeds inference.ts |
| HERE Routing | `router.hereapi.com/v8/routes` | Travel time/distance (car, pedestrian, bicycle) | Per transport mode |
| HERE Transit | `transit.router.hereapi.com/v8/routes` | Public-transport routing | Separate endpoint |
| HERE Map Tiles | `maps.hereapi.com/v3/base` | Map tiles (Leaflet) | `explore.day` style |
| HERE Static Map | `image.maps.hereapi.com` | Final fallback place image | Location-correct thumbnail |
| Open-Meteo | `api.open-meteo.com/v1/forecast` | 7-day weather forecast | No key |
| Wikidata | `wikidata.org/w/api.php` | Place images via P18 claim | Fair use |
| Wikipedia | `{lang}.wikipedia.org/w/api.php` | Fallback place images (geo-verified) | Fair use |

### HERE routing notes
The app maps transport modes to HERE profiles (walk → pedestrian, bike → bicycle, car → car, transit → the separate Transit API). If routing fails, it falls back to haversine straight-line distance ×1.3 with average speeds (walk 5, bike 15, car 60, transit 30 km/h). Travel times for the recommend flow are calculated in batches (concurrency 5).

### Place images
Four-step waterfall: Wikidata P18 → Wikipedia page image → **geo-verified** Wikipedia search → HERE static-map thumbnail. The Wikipedia search step only accepts a result whose article is geotagged within 30 km of the place's coordinates — this prevents venues named after people from returning that person's photo, and rejects same-name places elsewhere.

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
| `VITE_HERE_API_KEY` | HERE Platform API key (search, geocoding, routing, tiles) |

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
| AddPlace | Search + add new places via HERE (or paste a Google Maps link) |
| ItemDetail | View/edit a single item's details |
| RecommendationFlow | Multi-step flow: date → time → group → energy → vibe → transport → accessibility → results |
| Settings | User profile (name + home location only) |

### Smart defaults (inference.ts)
When a place is added, the app infers metadata from OSM tags: category, indoor/outdoor, weather suitability, duration, cost, seasons, time of day, group types, and accessibility.

### Recommendation engine (recommendation.ts)
Filters and scores bucket list items based on user constraints (weather, time budget including travel, group, energy, vibe, accessibility, dog/stroller). Returns ranked results with human-readable reasons.

### Categories
13 categories defined in `types/index.ts` with labels, Lucide icon names, and colours. Legacy categories are auto-migrated via `LEGACY_CATEGORY_MAP` in `storage.ts`.
