# Lark — Future Ideas & Feature Backlog

> This is a living list. Ask Claude at any point to review, prioritise, or discuss any of these.

---

## UX & Flow Redesign

- ~~**Clarify "time" means total door-to-door time**~~ ✅ Done — relabelled to "Total time, door to door?" with subtitle
- ~~**Move transport mode out of profile/settings into the recommend flow**~~ ✅ Done — "How are you getting there?" in recommend flow, dynamic HERE routing calculation
- ~~**Move kids, dog, accessibility into the recommend flow**~~ ✅ Done — "Anything else?" section with dog/stroller/wheelchair toggles
- ~~**Slim down profile/settings**~~ ✅ Done — only name + home location remain
- ~~**Slim down Dashboard**~~ ✅ Done — transport switcher removed
- ~~**Rename "Surprise me" to "I'm feeling spontaneous"**~~ ✅ Done — "Spontaneous" button with Shuffle icon, full-day cap
- ~~**Feather icon for nav and recommend**~~ ✅ Done — Feather icon in nav bar and Dashboard buttons

## New Features

- **"Use my current location" option** — let users switch from home-based to GPS-based recommendations. Great for when you're on holiday and want to find bucket list items nearby. Could be a toggle in the recommend flow: "Starting from: Home / Current location"
- **Sharing items between users** with "recommended by..." attribution (already planned)
- **Future/someday list** — a way to save ideas that aren't location-specific yet or that are far away, separate from the main actionable bucket list
- ~~**Curated lists on Dashboard**~~ ✅ Done — auto-generated rails: "Perfect for today" (weather-matched), "Quick wins", "Free to do", plus the user's three biggest categories with "See all" linking to the pre-filtered list. Hand-curated collections remain a future option.

## Integrations

- **Google Maps import**
  - ~~(1) Parse long-form Google Maps URLs to extract coordinates and place name~~ ✅ Done — "Or paste a Google Maps link" on the Add a place screen; parses `!3d!4d`, `@lat,lng`, and `q=lat,lng`, reverse-geocodes via HERE, and reuses the normal review flow. Shortened `maps.app.goo.gl` links aren't supported (CORS).
  - **(2) Bulk import from Google Takeout** — let users upload their exported saved-list CSV and bulk-add places. Raw Takeout CSV has only Title/Note/URL (no coordinates), so each row needs geocoding via HERE plus a review/confirm step before saving.
  - Direct integration via the Google Maps Platform API stays out of scope (paid + needs server-side).

## Technical

- ~~**Dynamic travel time by transport mode**~~ ✅ Done — batch HERE routing calculation during recommend flow based on selected transport
- **Supabase auth URL configuration** — add Vercel domain to allowed redirect URLs (already noted)
