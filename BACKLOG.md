# Lark — Prioritised Backlog

Working backlog with priority, effort, and cost. Companion to `IDEAS.md` (which keeps the
fuller brainstorm and the history of completed work). When an item here ships, tick it and
move the detail to `IDEAS.md`.

**Priority** — P1 = next, P2 = soon, P3 = later.
**Effort** — S = a sitting, M = a few sessions, L = a multi-week project.
**Cost** — cash / external API cost. "Dev time" items cost €0 cash. API costs are variable;
see `Lark_Business_Model.xlsx` → *API Comparison* for figures at different user counts.

---

## Map quality — the current friends-and-family pain points

The app runs on **HERE APIs** (`src/utils/api.ts`), not the free OSM stack the docs describe.
All three complaints trace to specific code.

| Item | Priority | Effort | Cost | Notes |
|---|---|---|---|---|
| Fix "celebrity image" bug | **P1** | S | €0 | `fetchPlaceImage` 3rd fallback blind-searches Wikipedia by place name (`generator=search`, limit 1) and grabs the first article's photo. Remove or tightly constrain this fallback so a venue named after a person stops returning that person's portrait. Cheapest, biggest visible win. |
| Better placeholder when no image found | P1 | S | €0 | Replace bad-image risk with a clean branded map/category placeholder instead of a wrong photo. |
| Add Google Places: Search + Photos (hybrid) | **P1** | M–L | Variable (~€1.1k/mo @ 10k MAU — see model) | Fixes "can't find places" (coverage) and "wrong/bad images" at once. Keep HERE/OSRM for tiles + routing to contain cost. |
| Improve HERE→category mapping | P2 | M | €0 | `fetchPlaceDetails` defaults unmapped categories to `restaurant`/`attraction`/`park`. Expand the mapping and stop silently defaulting. Lower value if moving to Google Places. |
| Cache search + place-detail results | P2 | M | Saves API cost | Store resolved places in Supabase so repeat lookups don't re-hit the paid API. Directly lowers the Google bill in the model. |
| Evaluate full Google migration | P3 | L | Highest (~€1.8k/mo @ 10k MAU) | Only if hybrid quality still falls short. Replaces tiles + routing too. |

## Monetisation & business model

| Item | Priority | Effort | Cost | Notes |
|---|---|---|---|---|
| Discover feed with sponsored local listings | **P1** | L | €0 build | Core revenue idea — businesses pay a flat monthly fee for context-matched placement (area, weather, group, time). Main driver in the model. |
| Affiliate booking links (GetYourGuide / Viator) | **P2** | M | €0 (revenue +) | ~8% commission, 30-day cookie. Passive, low-friction, complements listings. Add to bookable items. |
| Stripe / payment integration | P2 | M | ~2–3% fees | Dependency for subscription and paid listings. |
| Lark Premium subscription | P3 | M–L | €0 build | Multi-city trip planning, unlimited saves, offline, advanced filters. Recurring, high-margin. |
| "Claim your business" self-serve listings | P3 | L | €0 build | Lets the sponsored-listing side scale beyond manual sales. |

## Carried over from IDEAS.md (still open)

| Item | Priority | Effort | Cost | Notes |
|---|---|---|---|---|
| Supabase auth redirect URL config | **P1** | S | €0 | Add the Vercel domain to allowed redirect URLs. Quick infra fix. |
| "Use my current location" toggle | P2 | S–M | €0 | Home vs GPS start — great for holidays / nearby discovery. |
| Sharing items with "recommended by…" | P2 | M | €0 | Social loop; helps user growth, which the model depends on. |
| Future / someday list | P3 | S–M | €0 | Non-location-specific saves, separate from the actionable list. |
| Curated lists on Dashboard | P3 | M | €0 | Themed collections (peaks, bars, museums). |
| Bulk import from Google Takeout | P3 | M | €0 | Upload saved-list CSV, geocode + confirm each row. |

## Housekeeping

| Item | Priority | Effort | Cost | Notes |
|---|---|---|---|---|
| Fix stack docs (CLAUDE.md / TECHNICAL.md) | P2 | S | €0 | Docs say Nominatim/OSRM/OSM; code actually uses HERE. Update to match reality. |
