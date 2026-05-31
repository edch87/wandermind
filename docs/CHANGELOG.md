# Lark — Changelog

> Date + summary of changes per session. Most recent first.

---

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
