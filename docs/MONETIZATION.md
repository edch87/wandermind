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

### Privacy & legal (Edward's decisions, 2026-06-04)

- **No location tracking, ever.** The app's baseline stays "days out from home". Edward chose **option C** for travel use: a one-shot browser geolocation request on tap, used for that session only, never stored, never in the background (a web app can't background-track anyway). Typed-city geocoding (no permissions) is the fallback for users who decline the prompt. Feature itself stays deferred (P3 in backlog).
- **Community layer is opt-out.** Users' saves feed the anonymous discover aggregate by default, with a clearly visible toggle in Settings and explicit disclosure in the privacy policy (lawful basis: legitimate interest). Only place + save count is ever exposed ("Saved by 12 people"), never who saved it, and a minimum save-count threshold prevents inferring a single user's saves near their home.
- **Before public launch:** a plain-language privacy policy covering what's stored (name, home location, saved places), the opt-out community sharing, that location is never tracked, and the processors (Supabase, Vercel, HERE, Google, Open-Meteo — coordinates pass through search/routing calls transiently). Home address in `profiles` is the main GDPR-relevant personal data.

### Supabase capacity (checked 2026-06-04)

Free plan: 500 MB database, 5 GB egress/month, 50k auth MAU, project pauses after 1 week idle. At ~1–2 KB per item row, hundreds of thousands of saves fit; sponsored listings are negligible; discover cache ~25–50 KB per tile ≈ ~10k tiles (TTL eviction keeps it pruned). First real ceiling is monthly egress — keep feed queries paginated and select only needed columns. Next step is Pro ($25/mo, 8 GB DB, 250 GB egress); one sponsored listing covers it.

### Open questions

- HERE ToS: maximum cache/retention period for discover results.
- Sponsored pricing: flat monthly fee per listing per area; tiers by radius/category exclusivity. Model in `Lark_Business_Model.xlsx`.

### Rollout

1. **Phase 0 (done):** curated list rails on Dashboard — the UI pattern everything else reuses.
2. **Phase 1:** community layer, home-based radius. ("Use my current location" deferred — see privacy notes; pairs well here when it comes.)
3. **Phase 2:** tile-cached HERE browse for cold start.
4. **Phase 3:** sponsored listings table + manual sales; later "claim your business" self-serve.
