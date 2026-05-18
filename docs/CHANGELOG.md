# Lark — Changelog

> Date + summary of changes per session. Most recent first.

---

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
