# Lark — Monetization & Discover Feed

How Lark makes money without breaking its two core constraints: free-tier APIs only, no server-side code.
Status tracking lives in `BACKLOG.md`; revenue/cost figures live in `Lark_Business_Model.xlsx`.

## Revenue streams

| Stream | Priority | How it works |
|---|---|---|
| Sponsored local listings | P1 | Businesses pay a flat monthly fee for context-matched placement in the discover feed and Dashboard curated lists. Matching uses the data Lark already has: area, weather, group, time of day. Listings live in our own DB, so zero API cost and no per-impression fees. Main driver in the business model. |
| Affiliate booking links | P2 | GetYourGuide / Viator links on bookable items. ~8% commission, 30-day cookie. Passive, complements listings. |
| Lark Premium | P3 | Subscription: multi-city trip planning, unlimited saves, offline, advanced filters. Recurring, high margin. |
| "Claim your business" | P3 | Self-serve listing management so sponsored listings scale beyond manual sales. Depends on Stripe integration (P2). |

## The discover feed

A feed of things to do near the user (home or current location) that they can save to their own list. It is the surface where sponsored listings appear, so it has to exist before the P1 revenue stream can. The design goal: cost scales with *new areas explored*, not with user count.

### Three layers

**Layer 1 — Community (organic, €0).** Places other Lark users have saved, aggregated within a radius. Shows only public fields: name, location, category, image, save count ("Saved by 12 people"). Personal notes and identities stay private. Needs a way around per-user RLS: either a `security definer` Postgres function or a small aggregate table (`public_places`) updated on save. Cold-start weakness: thin until there are users in an area. Gets better with every user, forever free.

**Layer 2 — Tile-cached HERE browse (near €0).** For areas with little community data. The map is divided into ~5 km cells (geohash). The first user to open Discover in a cell triggers a handful of HERE discover/browse calls (one per category group); results are written to a `discover_cache` table in Supabase with a TTL of a few weeks. All later users in that cell read the cache. HERE freemium allows ~250k transactions/month, so cached tiles keep usage trivial even at thousands of MAU. **Verify HERE ToS on result-caching duration before building.**

**Layer 3 — Sponsored (€0 cost, the revenue).** A `sponsored_listings` table: business, location, category, active dates, context rules (e.g. "show when raining", "family-friendly"). Injected into the feed and curated lists, always marked "Sponsored". No external API involved, pure margin.

### Cost guardrails

- **No Google in the feed.** Google free tiers are small (5k searches, 1k photo media/month) and ToS forbids caching anything except `place_id`. A per-user feed would exhaust them in days. Google stays where it is now: add-place search and detail-view photos.
- **Feed images use the free waterfall** (geo-verified Wikipedia → HERE static map → branded placeholder). Google photos only after save, on the detail view.
- **All feed reads hit Supabase first.** External APIs are only called on cache miss, and the result is cached for everyone.

### Reuse, not rebuild

- Saving from the feed goes through the existing AddPlace inference + review flow.
- Feed ranking reuses `recommendation.ts` scoring with live weather/time, so the feed is context-aware for free.
- Dashboard curated lists (shipped) are the placement surface: discover and sponsored rails slot in alongside the user's own collections later.

### Open questions

- HERE ToS: maximum cache/retention period for discover results.
- Community layer privacy: opt-out toggle? Minimum save-count threshold before a place appears (e.g. don't show "Saved by 1 person" near a home address)?
- Sponsored pricing: flat monthly fee per listing per area; tiers by radius/category exclusivity. Model in `Lark_Business_Model.xlsx`.

### Rollout

1. **Phase 0 (done):** curated list rails on Dashboard — the UI pattern everything else reuses.
2. **Phase 1:** community layer + "Use my current location" (P2 in backlog, natural pairing).
3. **Phase 2:** tile-cached HERE browse for cold start.
4. **Phase 3:** sponsored listings table + manual sales; later "claim your business" self-serve.
