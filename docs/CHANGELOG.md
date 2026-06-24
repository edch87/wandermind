# Lark — Changelog

> Date + summary of changes per session. Most recent first.

---

## 2026-06-24 (recommend flow audit — single commit pass)
- **Category taxonomy → 17 categories.** Added `religious_site`, `theatre_concert`, `amusement_park`, `shopping`, `other`. Renamed `active_adventure` → `active` (scope tightened to places that exist for active activities — gyms, courses, climbing halls). Dropped `hiking_trails` (places-not-activities — peaks/trails are now `nature_landscape` + a `hiking` tag) and `event_festival` (time-bound; deferred to v2 events feature). Inference layers (HERE IDs, HERE names, Google types, name keywords, OSM tags) rebuilt for the new taxonomy.
- **Tag system — 13 controlled-vocabulary tags as editorial layer.** `viewpoint`, `hiking`, `cycling`, `water_sports`, `winter_sports`, `picnicking`, `market`, `outdoor_seating`, `live_music`, `late_night`, `sauna`, `class`, `tour`. Each tag declares its eligible categories. User-driven only — no HERE/Google inference. Text-only chip picker on AddPlace review and ItemDetail edit screen, soft cap at 5 tags. Tags surface as chips on item detail view.
- **Vibe enum grew to 8 — added `active`.** PersonSimpleRun icon, placed directly before outdoorsy. Active vibe maps to active, nature_landscape, beach_water, amusement_park (categories), boosted by hiking / cycling / water_sports / winter_sports tags. Outdoorsy is now "outside but chill"; active is "exerting yourself".
- **Recommend flow Q1-Q8 reshaped.** Q1: weekend buttons dropped (Today / Tomorrow only); past 16:00 today, "Today" relabels to "This evening" and the slider auto-caps to half-day. Q2: default transport is Car + Transit (was Car only); new "Any way" shortcut button selects all four modes. Q3: single max-time slider (drop the lower handle); snaps now 1h / 2h / Half day / Full day (3h removed). Q4: group chips renamed "Just me / Partner / Friends / With kids" — `family` dropped from GroupType. Group semantics flipped from OR to AND ("Partner + With kids" means an item must suit both, not either). Q5: `surprise_me` removed from EnergyLevel enum — replaced by the dedicated "Or just surprise me" secondary button above the main CTA (sets a `surpriseMe` constraint flag, skips Q5/Q6 filtering, applies the weighted-random shuffle). Q5 default is now `up_for_anything`. Q7: "Free only" → "Free".
- **`keep_it_easy` became a hard filter.** Travel-time cap dropped from soft-scoring to hard: 30-min one-way max, `active` category excluded, `hiking`-tagged items soft-penalised (-12 score) rather than excluded.
- **Engine matrix overhaul — sourced from `docs/categories.xlsx` Sheet 2.** New 8-vibe `VIBE_CATEGORIES` map. New 4-tier `TIER_FAVOURED` / `TIER_PENALISED` covering all 17 categories. **6 combo classes** (was 3): filler / cultural / outdoor / evening / solo / destination. Evening class (nightlife, theatre_concert) only pairs with evening-compatible fillers (filler must have evening in `bestTimesOfDay`). Solo class (active, entertainment, zoo_aquarium, wellness, other) pairs with filler only. Destination class (amusement_park) never pairs. Religious_site joins the cultural cluster; shopping joins fillers.
- **Tag-boost scoring.** Vibe → tag map (foodie ← market/outdoor_seating/class; curious ← tour; outdoorsy ← viewpoint/picnicking; active ← hiking/cycling/water_sports/winter_sports; playful ← live_music/late_night; unwind ← sauna/outdoor_seating; explore ← market/viewpoint/tour). +8 per match, capped at +24 to prevent tag-stacked items dominating.
- **Lazy storage migration on read.** `active_adventure` → `active`; `hiking_trails` → `nature_landscape` with a `hiking` tag injected; `family` stripped from `groupSuitability` arrays. DB schema unchanged — values stored as strings. `event_festival` migration is in the map but no items affected per the audit.
- **Other surfaces swept.** PlaceholderImage map rebuilt for the 17 categories; Discover / Onboarding CATEGORY_ORDER lists refreshed; Dashboard's spontaneous button switched from `energy: 'surprise_me'` to `surpriseMe: true`; BucketList's "Good for" filter dropped `family`; curated Munich seed had its one `active_adventure` entry rewritten and `family` group values filtered out of seeded items.

## 2026-06-21 (fixes)
- **Transit always showed 0 minutes**: HERE Transit doesn't return `travelSummary` fields by default — you have to opt in with `return=travelSummary`. Without it, the parser summed empty sections and stored "0 min by transit" for every item. Fixed in `fetchHereRoute`; added two safety nets (derive duration from arrival-departure timestamps if summaries are missing; treat transit=0 between distinct points as `null` → "Not practical by transit").
- **Storage normalization for stale 0 transit values**: `itemFromDb` now coerces any `transit_minutes = 0` to `null` on read, so items written by the original broken refresh display "Not practical by transit" until a fresh refresh overwrites them with real numbers. Real transit between distinct points is never 0 minutes, so this is unambiguous.
- **24h cooldown on manual "Refresh travel times"**: stored in localStorage. Doesn't gate the auto-refresh on home-location change (which is user-initiated by an actual home edit). Stops accidental double-taps from burning HERE quota.

## 2026-06-21 (per-mode travel times)
- **Public transport added + travel-time architecture overhaul**: at save time the app now computes all 4 transport modes (walk/bike/car/transit) in parallel via HERE and stores them per-item. The single `travelTimeMinutes` + `transportMode` pair (and the user's `preferredTransport`) is gone — per-outing context belongs in the recommend flow, not on the item.
- **Transit specifics**: queries HERE Transit with `departureTime` set to the next-upcoming Tuesday 10:30am local (off-peak representative weekday). HERE returning empty `routes` stores `null` → renders as "Not practical by transit". Network/HTTP failures fall back to haversine × 2.5.
- **Recommend flow simplified**: deleted the per-session "Calculating travel times..." HERE batch — `getRecommendations` now reads `walkMinutes`/`bikeMinutes`/`carMinutes`/`transitMinutes` directly off each item. Recommendations are near-instant after weather lands. Added Transit as a 4th transport toggle in "How are you getting there?"
- **Home-change refresh**: Settings now detects meaningful home moves (>500m) and runs a background batch refresh of all items' 4 modes (CONCURRENCY=3). Progress shown inline on the Save button: "Updating travel times (5/30)...". Manual "Refresh travel times" button added for users with legacy items (only their original mode populated).
- **List + detail updates**: BucketList "Nearest" sort uses `travelDistanceKm` instead of stored time. ItemDetail gained a "Getting there" panel showing distance + per-mode times (nulls dropped; transit-not-practical surfaced explicitly).
- **Migration `supabase-migration-v5.sql`**: adds `walk_minutes`/`bike_minutes`/`car_minutes`/`transit_minutes` columns, one-shot backfill from the legacy pair, drops `profiles.preferred_transport`. Legacy columns retained one release; `storage.ts` does lazy read-side migration so existing items don't lose their original mode.

## 2026-06-04 (discover feed session)
- **Organic discover feed shipped (Phase 1)**: "Discover nearby" rail on the Dashboard + dedicated Discover screen ("See all"), built from two free sources — anonymous community saves ("Saved by N people") and Wikidata notable places ranked by sitelink count (the legal stand-in for ratings). Tapping a card jumps straight to the AddPlace review step with the category prefilled.
- **Design pivot, verified against live ToS**: HERE Platform Terms cap caching at 30 days and forbid serving one request to multiple users, killing the planned shared HERE tile cache; Google terms allow storing only `place_id`, killing a Google-rated seed list. Wikidata (CC0) replaces both for cold start — legally cacheable forever in the shared `discover_cache` table. Full reasoning in `docs/MONETIZATION.md`.
- **Privacy bundle shipped in the same deploy** (as required by the 2026-06-04 decision): `share_saves` opt-out toggle in Settings ("Share my saves anonymously"), aggregate-only exposure via a security-definer function, and a 2-saver minimum threshold before a place becomes public.
- New files: `src/utils/discover.ts` (data layer), `src/components/Discover.tsx` (screen + card), `supabase-migration-v4.sql` (run in the Supabase SQL editor: share_saves column, get_community_places function, discover_cache table)
- New curated rail "Top of your list" (high-priority items) — chosen from a longer list of rail ideas now logged in IDEAS.md

## 2026-06-04 (later session)
- Curated lists on the Dashboard: new `CuratedLists` component with smart context rails ("Perfect for today" weather-matched, "Quick wins" under 2h, "Free to do") plus the user's three biggest categories; rails appear only with 3+ items, capped at 10, sorted by priority then recency
- Extracted shared `ItemRail` card-rail component; "Recently added" now uses it (removes duplicated card markup in Dashboard)
- Category rails link "See all" to My List pre-filtered: new `initialCategory` prop threaded through App → BucketList
- New `docs/MONETIZATION.md`: revenue streams and the three-layer discover feed design (community layer from Supabase data, tile-cached HERE browse for cold start, sponsored listings table) with cost guardrails — no Google calls in the feed, free image waterfall only

## 2026-06-04
- Added "Refresh place photos" tool in Settings: one-time backfill that matches existing items (saved pre-Google) to their Google `place_id` via one Text Search each, geo-verified within 1 km; already-matched items are skipped
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
