# Lark — Prioritised Backlog

Working backlog with status, priority, effort, and cost. Companion to `IDEAS.md` (which keeps
the fuller brainstorm). We tackle items across separate conversations, so the **Status** column
is the single source of truth for what's done — update it here as each item ships.

**Status** — ✅ Done (with date) · 🔧 In progress · ⬜ To do.
**Priority** — P1 = next, P2 = soon, P3 = later.
**Effort** — S = a sitting, M = a few sessions, L = a multi-week project.
**Cost** — cash / external API cost. "Dev time" items cost €0 cash. API costs are variable;
see `Lark_Business_Model.xlsx` → *API Comparison* for figures at different user counts.

---

## Map quality — the current friends-and-family pain points

The app runs on **HERE APIs** (`src/utils/api.ts`). The image and category complaints trace to specific code.

| Item | Status | Priority | Effort | Cost | Notes |
|---|---|---|---|---|---|
| Fix "celebrity image" bug | ✅ 2026-05-31 | P1 | S | €0 | Shipped: `fetchPlaceImage` Wikipedia fallback now geo-verifies candidates and only accepts an article geotagged within 30 km of the place. People/wrong-location matches rejected. |
| Better placeholder when no image found | ✅ 2026-05-31 | P2 | S | €0 | Already covered: a branded `PlaceholderImage` (per-category) component is wired into Dashboard, BucketList and ItemDetail, shown when an image fails to load. Image waterfall also falls back to a location-correct HERE static-map thumbnail. |
| Add Google Places Search (hybrid) | ⬜ | P1 | M–L | Variable (~€1.1k/mo @ 10k MAU — see model) | Fixes "can't find places" (coverage). Returns the `place_id` we then reuse for photos/details. Keep HERE/OSRM for tiles + routing to contain cost. **Needs `VITE_GOOGLE_MAPS_API_KEY` set up first.** |
| Add Google Places Photos | ⬜ | P1 | M | Place Details ~€17/1k + Place Photo ~€7/1k | Photos bound to the venue by `place_id`, not name — kills the mismatch class entirely and widens coverage. **Caching rule: store only the `place_id`; do NOT store photo references or images (Google ToS, references expire). Fetch fresh at display time.** Show `authorAttributions` when present. |
| Improve HERE→category mapping | ✅ 2026-05-31 | P2 | M | €0 | Shipped. Found Layer 1 in `inference.ts` was built on HERE's **old, deprecated Places taxonomy** (never migrated to Geocoding & Search), so it actively mislabelled common places (bars→museum, museums→wellness, churches→beach, castles→park, all nature→active). Rewrote Layer 1 against the live G&S taxonomy (IDs verified via the discover API), split inference into 4 explicit layers, added a `matched`/`categoryUncertain` signal, removed the fabricated OSM-shim defaults in `api.ts`, and the AddPlace review screen now nudges the user to confirm when uncertain. |
| Cache `place_id` + non-photo fields | ⬜ | P2 | M | Saves API cost | Store `place_id` and basic place fields in Supabase to cut repeat search/geocode calls. **Photos and photo references must NOT be cached** — refresh on view. |
| Evaluate full Google migration | ⬜ | P3 | L | Highest (~€1.8k/mo @ 10k MAU) | Only if hybrid quality still falls short. Replaces tiles + routing too. |

## Monetisation & business model

| Item | Status | Priority | Effort | Cost | Notes |
|---|---|---|---|---|---|
| Discover feed with sponsored local listings | ⬜ | P1 | L | €0 build | Core revenue idea — businesses pay a flat monthly fee for context-matched placement (area, weather, group, time). Main driver in the model. |
| Affiliate booking links (GetYourGuide / Viator) | ⬜ | P2 | M | €0 (revenue +) | ~8% commission, 30-day cookie. Passive, low-friction, complements listings. Add to bookable items. |
| Stripe / payment integration | ⬜ | P2 | M | ~2–3% fees | Dependency for subscription and paid listings. |
| Lark Premium subscription | ⬜ | P3 | M–L | €0 build | Multi-city trip planning, unlimited saves, offline, advanced filters. Recurring, high-margin. |
| "Claim your business" self-serve listings | ⬜ | P3 | L | €0 build | Lets the sponsored-listing side scale beyond manual sales. |

## Carried over from IDEAS.md (still open)

| Item | Status | Priority | Effort | Cost | Notes |
|---|---|---|---|---|---|
| Supabase auth redirect URL config | ⬜ | P1 | S | €0 | Add the Vercel domain to allowed redirect URLs. Quick infra fix (dashboard step). |
| "Use my current location" toggle | ⬜ | P2 | S–M | €0 | Home vs GPS start — great for holidays / nearby discovery. |
| Sharing items with "recommended by…" | ⬜ | P2 | M | €0 | Social loop; helps user growth, which the model depends on. |
| Future / someday list | ⬜ | P3 | S–M | €0 | Non-location-specific saves, separate from the actionable list. |
| Curated lists on Dashboard | ⬜ | P3 | M | €0 | Themed collections (peaks, bars, museums). |
| Bulk import from Google Takeout | ⬜ | P3 | M | €0 | Upload saved-list CSV, geocode + confirm each row. |

## Housekeeping

| Item | Status | Priority | Effort | Cost | Notes |
|---|---|---|---|---|---|
| Fix stack docs (CLAUDE.md / TECHNICAL.md) | ✅ 2026-05-31 | P2 | S | €0 | Done: docs now reflect the HERE stack, the `VITE_HERE_API_KEY` env var, and the geo-verified image waterfall. |
