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

**Layer 2 — Wikidata notable places (€0, decided 2026-06-04).** For areas with little community data. One SPARQL query per category group (museums, historical, nature, parks/gardens, zoos, entertainment) against the Wikidata Query Service, centred on the user's home, ranked by **sitelink count** (number of Wikipedia language editions — a strong "people care about this place" proxy that stands in for ratings). Results include coordinates, category and a Commons image. Because Wikidata is **CC0 (public domain)**, results are legally cacheable in Supabase forever and one fetch can serve every user — the original "cost scales with new areas, not user count" design works here, at €0 at any scale. The map is divided into ~50 km cells; the first user in a cell triggers the queries, results land in `discover_cache`, everyone else reads the cache (refreshed after ~60 days only to pick up data improvements). Honest caveat: Wikidata covers *notable* places — excellent for sights/nature/museums/castles (the heart of a bucket list), thin for restaurants and small leisure spots, which the community layer covers instead.

> **Why not HERE or Google in the feed (verified 2026-06-04):**
> - HERE Platform Terms (Sept 2023) §8(j) cap caching at 30 days, and §8(l) explicitly prohibits "scaling one Request to serve multiple End Users" — a shared tile cache of HERE results is non-compliant. The originally designed HERE tile cache is therefore dead; HERE stays where it is today (search, routing, tiles, geocoding) and never enters the feed.
> - Google Maps Platform terms allow storing only `place_id` (lat/lng max 30 days, ratings never) and prohibit building a database from Google content. A seeded "top-rated places" table copied from Google would violate ToS and risk the API key that add-place search and detail photos depend on. Rejected 2026-06-04.
> - Documented fallback if Wikidata coverage proves insufficient: live HERE browse calls per visit (no caching) — ToS-clean, ~3 calls/visit, free to roughly 80k Discover sessions/month within the 250k freemium, but cost then scales with usage. OSM/Overpass (ODbL) remains the deep-coverage option at the price of a new tag-mapping layer.

**Layer 3 — Sponsored (€0 cost, the revenue).** A `sponsored_listings` table: business, location, category, active dates, context rules (e.g. "show when raining", "family-friendly"). Injected into the feed and curated lists, always marked "Sponsored". No external API involved, pure margin.

### Cost guardrails

- **No Google in the feed.** Google free tiers are small (5k searches, 1k photo media/month) and ToS forbids caching anything except `place_id`. A per-user feed would exhaust them in days. Google stays where it is now: add-place search and detail-view photos.
- **No HERE in the feed either** (ToS, see above). HERE is only involved when a feed item is *saved* — the normal AddPlace flow then calculates routing as usual.
- **Feed images come from Wikidata/Commons** (included in the SPARQL result) or the community item's stored image; branded placeholder otherwise. Google photos only after save, on the detail view.
- **All feed reads hit Supabase first.** Wikidata is only called on cache miss, and the result is cached for everyone — which CC0 licensing permits.

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

- ~~HERE ToS: maximum cache/retention period for discover results.~~ Resolved 2026-06-04: 30 days max and no serving one request to multiple users — HERE removed from the feed design entirely (see Layer 2 note).
- Sponsored pricing: flat monthly fee per listing per area; tiers by radius/category exclusivity. Model in `Lark_Business_Model.xlsx`.

### Rollout

1. **Phase 0 (done):** curated list rails on Dashboard — the UI pattern everything else reuses.
2. **Phase 1 (decided 2026-06-04, building):** community layer + Wikidata layer together, home-based radius, shipped with the privacy bundle (Settings opt-out toggle, min save-count threshold). Placement: "Discover nearby" rail on the Dashboard as a teaser, "See all" opens a dedicated Discover screen. ("Use my current location" deferred — see privacy notes; pairs well here when it comes.)
3. **Phase 2:** sponsored listings table + manual sales; later "claim your business" self-serve.
