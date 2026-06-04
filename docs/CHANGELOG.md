# Lark — Changelog

> Date + summary of changes per session. Most recent first.

---

## 2026-06-04
- Google Places hybrid integration: place search now uses Google Text Search (New) when `VITE_GOOGLE_MAPS_API_KEY` is set (HERE fallback kept); HERE remains for map tiles + routing
- New inference Layer 2b maps Google place `types` → Lark categories
- Opening hours for Google places via one Place Details call at add time, converted to the existing OSM-style format
- Venue-bound Google photos on the item detail view, fetched fresh per Google ToS (only `place_id` is stored — new `google_place_id` column, `supabase-migration-v3.sql`); in-memory session cache keeps repeat views free
- Locked the app to invite-only for friends-and-family testing: AuthScreen is sign-in only; public signups to be disabled in the Supabase dashboard
- Cost guards documented: Pro-tier field masks pinned in `api.ts`, photos limited to detail view (1,000 free media calls/month is the tight cap)

## 2026-05-31
- Fixed the "celebrity image" bug: `fetchPlaceImage` now geo-verifies Wikipedia fallback candidates and only accepts an article geotagged within 30 km of the place
- Corrected stack docs (CLAUDE.md, TECHNICAL.md) to reflect that the app runs on the HERE APIs (search, geocoding, routing, tiles), not the original Nominatim/OSM/OSRM stack — the HERE migration had not been logged
- Documented `VITE_HERE_API_KEY` env var
- Cleaned up legacy stack references in code (removed dead `NominatimResult` alias, fixed stale OSRM/Nominatim comments); DB columns `osm_id`/`osm_tags` retained to avoid a migration
- Added BACKLOG.md (prioritised, with status/effort/cost) and Lark_Business_Model.xlsx (3-year model + API cost comparison)

## 2026-05-16
- Added project documentation: CLAUDE.md, docs/TECHNICAL.md, docs/CHANGELOG.md
- Established docs/ folder structure for project documentation

## 2026-05-15
- Renamed app from WanderMind to Lark ("Do it on a lark")
- Updated branding: dark brown theme, bird emoji favicon
- UX redesign: moved transport mode, kids, dog, accessibility from profile/settings into the recommend flow as per-outing context
- Slimmed down Dashboard (removed transport switcher) and Settings (name + home location only)
- Relabelled time question to "Total time, door to door?" with subtitle
- Renamed "Surprise me" to "I'm feeling spontaneous" with Shuffle icon, full-day cap
- Added Feather icon to nav bar and Dashboard buttons
- Implemented dynamic travel time via OSRM batch calculation during recommend flow
- Created IDEAS.md feature backlog

## Earlier sessions (pre-changelog)
- Initial app build: React + TypeScript + Tailwind + Vite
- Place search via Nominatim with rate limiting
- OSM tag fetching for smart metadata inference
- Weather forecast integration (Open-Meteo, 7-day)
- Place images via Wikidata/Wikipedia waterfall with map tile fallback
- Recommendation engine with scoring and filtering
- Migrated storage from localStorage to Supabase (Postgres + RLS)
- Added Supabase Auth (email/password)
- Deployed to Vercel with GitHub auto-deploy
- Search display format: Name, City/Locale, Country
- Legacy category migration system
- Onboarding flow for first-time users
