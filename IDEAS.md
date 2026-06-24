# Lark — Future Ideas & Feature Backlog

> This is a living list. Ask Claude at any point to review, prioritise, or discuss any of these.

---

## Launch Roadmap — Munich v1

Decisions made 2026-06-21. Work through in order; ship without social. Social arrives as v1.1.

**Strategy**

- **Launch shape:** solo-utility v1 first. Social (friends-by-username, sharing with attribution, recommendation inbox) deferred to v1.1.
- **Monetization sequence:** affiliate links in v1. Verified business profiles in v2 once Munich audience density justifies B2B sales. Sponsored collections (München Tourismus, district boards) pursued opportunistically in parallel. No pay-for-placement, ever.
- **Positioning:** "days out from home", not a bucket list. Verbs and copy should reflect saving and doing, not ticking off someday-items.

**Pre-launch must-ships, in priority order**

1. **Address-precise home location**
   - Change Onboarding placeholder from "Search for your city..." to a prompt that encourages street, neighbourhood, or postcode
   - Add a map drag-to-adjust step in the home location flow so users can pin without typing a full address
   - Round stored coordinates to roughly 100 to 200m precision for privacy. Exact pin kept only in-session for map display
   - One-time prompt on next login for existing users whose home is set as a city

2. **Map with pin on AddPlace review**
   - Show map with pin on the review step so users confirm the place is correct before saving
   - Allow drag to adjust if autocomplete put it slightly wrong

3. ~~**Public transport travel time**~~ ✅ Done (2026-06-21) — bigger refactor than the original spec. At save time we now compute all 4 modes (walk/bike/car/transit) in parallel and store them on the item, dropping the single `travelTimeMinutes` + `transportMode` pair. Transit uses next-upcoming Tuesday 10:30am local as the off-peak departure; HERE returning no routes stores `null` and renders as "Not practical by transit". Settings auto-refreshes all items when home location changes (>500m) and has a manual "Refresh travel times" button for legacy items. Recommend flow's "Calculating travel times..." step is gone — it now reads stored times instantly and includes Transit as a 4th transport toggle. Migration: `supabase-migration-v5.sql`; legacy `travel_time_minutes`/`transport_mode` columns kept one release for safety via lazy read-side migration.

4. **Maps elsewhere in the app**
   - Treat "show a map" as a default design direction, not a single ticket
   - Strong candidates: dashboard rails, recommend results screen, empty states
   - Avoid map overload. Pick moments where seeing the place geographically improves the decision

5. ~~**Recommendation flow full audit**~~ ✅ Done (2026-06-24) — single coherent pass landed. Category taxonomy rationalised (17 categories, full spec in `docs/categories.xlsx`); added `religious_site`, `amusement_park`, `theatre_concert`, `shopping`, `other`; renamed `active_adventure` → `active`; dropped `hiking_trails` (places-not-activities; merged into nature with a `hiking` tag) and `event_festival` (deferred to v2 events feature). Vibe enum grew to 8 with `active` (PersonSimpleRun chip placed before outdoorsy). New 13-tag controlled vocabulary added — user-driven editorial layer, no inference, text-only chips, 5-tag soft cap. Recommend flow changes: weekend buttons dropped (only Today/Tomorrow); "Today" relabels to "This evening" past 16:00 with the slider capped to half-day; transport defaults to Car + Transit plus an "Any way" shortcut; single max-time slider (1h/2h/half day/full day — 3h dropped); group chips renamed "Just me / Partner / Friends / With kids" and switched to AND semantics; `surprise_me` removed from EnergyLevel enum and replaced by a dedicated "Or just surprise me" button above the main CTA (uses a `surpriseMe` constraint flag); `keep_it_easy` became a hard filter (30-min travel cap, active excluded, hiking-tagged soft-penalised); budget "Free only" → "Free". Engine matrix overhaul: new 8-vibe / 4-tier maps; 6 combo classes (filler/cultural/outdoor/evening/solo/destination) with the evening class only pairing with evening-compatible fillers; tag-boost scoring (+8 per vibe→tag match, capped +24). Storage does in-place migration on read: `active_adventure` → `active`, `hiking_trails` → `nature_landscape` + `hiking` tag, `family` stripped from groupSuitability.

6. **GDPR and pre-launch hygiene**
   - Privacy policy and terms updated to cover home location storage and stated purpose
   - Data export flow (user downloads their list as JSON or CSV)
   - Delete-my-account flow with RLS-safe cascade
   - Analytics added (Vercel Analytics free tier or Umami Cloud free tier, both GDPR-friendly)
   - End-to-end test of the signup and email confirmation flow

7. **Affiliate links (first revenue surface)**
   - Choose one or two partners. Candidates: GetYourGuide (Berlin-based, tours and tickets), Tiqets (museums and attractions), OpenTable or Bookatable (restaurants)
   - Add "Book it" buttons on item detail where relevant, clearly marked as affiliate
   - Track click-through to inform v2 decisions

**v1.1 — Social (post-launch, spec to be detailed closer to launch)**

Captured here so context is not lost when we pick this up:

- Add `username` column to `profiles` with uniqueness and validation
- Force username choice for new signups; prompt existing users on next login
- "Find friends" search: exact match only, no autocomplete, no suggestions, to keep it privacy-respectful
- Friend requests with accept and decline; friends list with remove
- "Share this place with..." action on item detail
- Recommendation inbox with "Recommended by [name]" attribution and accept-to-add UX, so lists do not get spammed

---

## UX & Flow Redesign

- ~~**Duplicate detection on add**~~ ✅ Done (2026-06-22) — search results and pasted Google Maps links now check existing items by `googlePlaceId` then `osmId`. Matched results render with an "Already saved" badge and route taps to ItemDetail instead of the confirm step. Lat/lng proximity intentionally not used as a fallback to avoid false positives on side-by-side places. Helper `findExistingMatch` lives in `AddPlace.tsx`; `App.tsx` passes `items` + `onViewExisting` through.
- **Three-state dog / child / accessibility** — replace the single Yes/unknown toggle on AddPlace with a Yes / Not sure / No pill group per item, defaulting to "Not sure". Stop the inference layer from writing `false` from OSM/Google tags (only `true`), so the detail view only shows "Not dog-friendly" / "Not accessible" / "Not stroller-friendly" when the user explicitly said so. Recommend-flow filter behaviour stays the same: explicit `false` excludes, `undefined` is allowed through.


- ~~**Clarify "time" means total door-to-door time**~~ ✅ Done — relabelled to "Total time, door to door?" with subtitle
- ~~**Move transport mode out of profile/settings into the recommend flow**~~ ✅ Done — "How are you getting there?" in recommend flow, dynamic HERE routing calculation
- ~~**Move kids, dog, accessibility into the recommend flow**~~ ✅ Done — "Anything else?" section with dog/stroller/wheelchair toggles
- ~~**Slim down profile/settings**~~ ✅ Done — only name + home location remain
- ~~**Slim down Dashboard**~~ ✅ Done — transport switcher removed
- ~~**Rename "Surprise me" to "I'm feeling spontaneous"**~~ ✅ Done — "Spontaneous" button with Shuffle icon, full-day cap
- ~~**Feather icon for nav and recommend**~~ ✅ Done — Feather icon in nav bar and Dashboard buttons

## New Features

- **Weekend-planning via list filtering** — recommend flow is deliberately scoped to Today/Tomorrow (see Recommendation Engine notes). Users wanting to plan a weekend ahead should be able to filter their list (by weather-suitability, duration, distance, vibe, etc.) directly on the BucketList screen. Design a clean filter UX for this so the list itself becomes the "plan ahead" surface.
- **Events (time-bound items)** — Lark v1 deliberately strips `event_festival` and treats everything as a place. v2 should reintroduce events as a first-class concept: Oktoberfest, Tollwood, Christkindlmarkt, festivals, concerts with specific dates, spectator sport matches. Needs a time-window field on items + recommend-flow logic to surface events only when their dates are live. Migration of any existing event_festival items happens here.
- **"Use my current location" option** — let users switch from home-based to GPS-based recommendations. Great for when you're on holiday and want to find bucket list items nearby. Could be a toggle in the recommend flow: "Starting from: Home / Current location"
- **Sharing items between users** with "recommended by..." attribution (already planned)
- **Future/someday list** — a way to save ideas that aren't location-specific yet or that are far away, separate from the main actionable bucket list
- ~~**Curated lists on Dashboard**~~ ✅ Done — auto-generated rails: "Perfect for today" (weather-matched), "Quick wins", "Free to do", plus the user's three biggest categories with "See all" linking to the pre-filtered list. Hand-curated collections remain a future option.
- **More curated rails** (discussed 2026-06-04 — Edward picked "Top of your list" to ship now; the rest stay here as options to avoid rail overload):
  - "Top of your list" — high-priority items surfaced. **Chosen, in build.**
  - "Looking good this weekend" — Sat/Sun forecast matched to outdoor items (forecast already fetched)
  - "Gathering dust" — oldest unvisited saves resurfaced; the anti-rot nudge
  - "In season now" / "Great this evening" — bestSeasons and bestTimesOfDay context rails
  - "Close to home" / "Make a day of it" — travel-distance and full-day planning rails
  - "With the dog" / "Family days" — group-suitability rails, shown only when relevant

## Integrations

- **Google Maps import**
  - ~~(1) Parse long-form Google Maps URLs to extract coordinates and place name~~ ✅ Done — "Or paste a Google Maps link" on the Add a place screen; parses `!3d!4d`, `@lat,lng`, and `q=lat,lng`, reverse-geocodes via HERE, and reuses the normal review flow.
  - ~~(1b) Support shortened `maps.app.goo.gl` share links~~ ✅ Done (2026-06-05) — `resolve-maps-link` Supabase Edge Function follows the redirect server-side (needs a bot-style UA; browser UAs get a JS interstitial), then the existing long-URL parser takes over.
  - **(2) Bulk import from Google Takeout** — let users upload their exported saved-list CSV and bulk-add places. Raw Takeout CSV has only Title/Note/URL (no coordinates), so each row needs geocoding via HERE plus a review/confirm step before saving.
  - **(3) Share directly from Google Maps into Lark (PWA share target)** — register Lark in the OS share sheet so users tap Share → Lark from inside Google Maps and land in the review step. Android Chrome: ~30 mins of work (add `share_target` to the manifest in `vite.config.ts`, add a `/share` route that prefills AddPlace's URL flow, handle the unauthenticated case). iOS Safari: not natively possible (no Web Share Target support as of 2026); workaround is a publishable iOS Shortcut, or iOS users keep pasting. Only kicks in for users who've installed Lark to their home screen.
  - Direct integration via the Google Maps Platform API stays out of scope (paid + needs server-side).

## Recommendation Engine

- ~~**Vibes as a hard category filter**~~ ✅ Done (2026-06-10) — selecting "Foodie" now only returns food_drink items; "Foodie + Curious" returns food + museums + historical + neighbourhood walks. Previously vibes were a +10 score bonus, so deselecting them didn't exclude anything. "I'm flexible" relabelled to "Open to anything" as the explicit "show me everything" option.
- ~~**Empty-state discover rail in recommend flow**~~ ✅ Done (2026-06-10) — when no matches, the "No matches" panel is followed by a "Need more ideas?" rail (nearby places to add to your list) with a "See all" link to Discover. Mirrors the Dashboard rail.
- ~~**Recent-shown suppression**~~ ✅ Done (2026-06-10) — `src/utils/recentShown.ts` stores the last 10 recommended item IDs in localStorage with a 3-day TTL. Suppressed items get a soft -10 score penalty so they can still win if they're clearly the best fit. Stops the same 3 items appearing every session.
- ~~**"Surprise me" energy level now actually surprises**~~ ✅ Done (2026-06-10) — previously identical to "Up for anything"; now does a weighted-random pick of 5 from the top 20 candidates (higher score = more likely). Other energy levels stay deterministic.
- ~~**"Show me different ideas" button**~~ ✅ Done (2026-06-10) — on the results screen, swaps the current top 3 out for the next-best 3 by adding them to a session-only suppression set. Resets when the user goes back to filters.
- ~~**Combo compatibility rules**~~ ✅ Done (2026-06-10) — `findCombos` now rejects same-category pairs (no restaurant + restaurant), allows fillers (food, park, walks) to pair with anything, allows cultural cluster (museum + historical), allows outdoor cluster (nature + hike + beach), and rejects everything else (e.g. museum + hike, spa + active adventure).
- **Priority dominance** — `priority: high` gives +30 which can swamp the rest of the scoring. If you mark lots of items high priority, they'll always win regardless of fit. Worth rebalancing once we have data on how the new suppression + surprise mechanics feel.
- **Time-of-day combo flow** — pair items whose `bestTimesOfDay` chain naturally (morning museum → afternoon café works; lunch + dinner doesn't). Skipped for now because it relies on `bestTimesOfDay` being well-set across the library; reconsider after more places have it filled in.
- **Diversity cap in top 3** — optionally cap each category to 1 in the displayed results. Skipped because vibe filtering already gives the user category control, but could be a future "Mix it up" toggle.

## Technical

- ~~**Dynamic travel time by transport mode**~~ ✅ Done — batch HERE routing calculation during recommend flow based on selected transport
- **Supabase auth URL configuration** — add Vercel domain to allowed redirect URLs (already noted)
