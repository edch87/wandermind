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
| Add Google Places Search (hybrid) | ✅ 2026-06-04 | P1 | M–L | €0 at F&F scale (Text Search Pro: 5k free/mo) | Shipped: `searchPlaces` uses Google Text Search (New) when `VITE_GOOGLE_MAPS_API_KEY` is set, falls back to HERE otherwise. Pro-tier field mask pinned in `api.ts` — adding fields can bump the SKU. New inference Layer 2b maps Google `types` → categories. One Place Details call per added place for opening hours (Enterprise field, 1k free/mo). |
| Add Google Places Photos | ✅ 2026-06-04 | P1 | M | €0 at F&F scale (photo media: 1k free/mo — the tight cap) | Shipped on the **item detail view only** (not list cards) to stay inside the 1,000 free photo-media calls/month: `fetchGooglePlacePhoto` does Place Details `photos` + one media call, with an in-memory session cache. Only the `place_id` is persisted (`google_place_id` column, migration v3); photo URLs are fetched fresh per ToS. Extending to list cards multiplies photo calls ~10× — revisit only with a paid budget. `authorAttributions` still TODO. |
| Improve HERE→category mapping | ✅ 2026-05-31 | P2 | M | €0 | Shipped. Found Layer 1 in `inference.ts` was built on HERE's **old, deprecated Places taxonomy** (never migrated to Geocoding & Search), so it actively mislabelled common places (bars→museum, museums→wellness, churches→beach, castles→park, all nature→active). Rewrote Layer 1 against the live G&S taxonomy (IDs verified via the discover API), split inference into 4 explicit layers, added a `matched`/`categoryUncertain` signal, removed the fabricated OSM-shim defaults in `api.ts`, and the AddPlace review screen now nudges the user to confirm when uncertain. |
| Cache `place_id` + non-photo fields | 🔧 partial 2026-06-04 | P2 | M | Saves API cost | `google_place_id` now stored per item (migration v3). Further field caching (to cut repeat search/geocode calls) still open. **Photos and photo references must NOT be cached** — refresh on view. |
| Evaluate full Google migration | ⬜ | P3 | L | Highest (~€1.8k/mo @ 10k MAU) | Only if hybrid quality still falls short. Replaces tiles + routing too. |

## Monetisation & business model

| Item | Status | Priority | Effort | Cost | Notes |
|---|---|---|---|---|---|
| Discover feed with sponsored local listings | ⬜ | P1 | L | €0 build | Core revenue idea — businesses pay a flat monthly fee for context-matched placement (area, weather, group, time). Main driver in the model. **Design done 2026-06-04** — see `docs/MONETIZATION.md` (3 layers: community data, tile-cached HERE browse, sponsored table). |
| Affiliate booking links (GetYourGuide / Viator) | ⬜ | P2 | M | €0 (revenue +) | ~8% commission, 30-day cookie. Passive, low-friction, complements listings. Add to bookable items. |
| Stripe / payment integration | ⬜ | P2 | M | ~2–3% fees | Dependency for subscription and paid listings. |
| Lark Premium subscription | ⬜ | P3 | M–L | €0 build | Multi-city trip planning, unlimited saves, offline, advanced filters. Recurring, high-margin. |
| "Claim your business" self-serve listings | ⬜ | P3 | L | €0 build | Lets the sponsored-listing side scale beyond manual sales. |

## Carried over from IDEAS.md (still open)

| Item | Status | Priority | Effort | Cost | Notes |
|---|---|---|---|---|---|
| Supabase auth redirect URL config | ⬜ | P1 | S | €0 | Add the Vercel domain to allowed redirect URLs. Quick infra fix (dashboard step). |
| Invite-only lock for F&F testing | 🔧 2026-06-04 | P1 | S | €0 | Code shipped: AuthScreen is sign-in only with an invite note. **Dashboard step still needed**: Supabase → Authentication → Sign In / Up → disable "Allow new users to sign up". New testers are created manually (Authentication → Users → Add user, with auto-confirm). |
| "Use my current location" toggle | ⬜ | P2 | S–M | €0 | Home vs GPS start — great for holidays / nearby discovery. |
| Sharing items with "recommended by…" | ⬜ | P2 | M | €0 | Social loop; helps user growth, which the model depends on. |
| Future / someday list | ⬜ | P3 | S–M | €0 | Non-location-specific saves, separate from the actionable list. |
| Curated lists on Dashboard | ✅ 2026-06-04 | P3 | M | €0 | Shipped: smart context rails (Perfect for today, Quick wins, Free to do) + top-3 category collections, auto-generated, min 3 items per rail. Future placement surface for discover/sponsored content. |
| Bulk import from Google Takeout | ⬜ | P3 | M | €0 | Upload saved-list CSV, geocode + confirm each row. |

## Housekeeping

| Item | Status | Priority | Effort | Cost | Notes |
|---|---|---|---|---|---|
| Fix stack docs (CLAUDE.md / TECHNICAL.md) | ✅ 2026-05-31 | P2 | S | €0 | Done: docs now reflect the HERE stack, the `VITE_HERE_API_KEY` env var, and the geo-verified image waterfall. |
