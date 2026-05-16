# Lark — Future Ideas & Feature Backlog

> This is a living list. Ask Claude at any point to review, prioritise, or discuss any of these.

---

## UX & Flow Redesign

- ~~**Clarify "time" means total door-to-door time**~~ ✅ Done — relabelled to "Total time, door to door?" with subtitle
- ~~**Move transport mode out of profile/settings into the recommend flow**~~ ✅ Done — "How are you getting there?" in recommend flow, dynamic OSRM calculation
- ~~**Move kids, dog, accessibility into the recommend flow**~~ ✅ Done — "Anything else?" section with dog/stroller/wheelchair toggles
- ~~**Slim down profile/settings**~~ ✅ Done — only name + home location remain
- ~~**Slim down Dashboard**~~ ✅ Done — transport switcher removed
- ~~**Rename "Surprise me" to "I'm feeling spontaneous"**~~ ✅ Done — "Spontaneous" button with Shuffle icon, full-day cap
- ~~**Feather icon for nav and recommend**~~ ✅ Done — Feather icon in nav bar and Dashboard buttons

## New Features

- **"Use my current location" option** — let users switch from home-based to GPS-based recommendations. Great for when you're on holiday and want to find bucket list items nearby. Could be a toggle in the recommend flow: "Starting from: Home / Current location"
- **Sharing items between users** with "recommended by..." attribution (already planned)
- **Future/someday list** — a way to save ideas that aren't location-specific yet or that are far away, separate from the main actionable bucket list
- **Curated lists on Dashboard** — alongside "Recently added", show curated/themed lists like peaks, city visits, bars, restaurants etc. Could auto-generate from the user's categories or be hand-curated collections

## Technical

- ~~**Dynamic travel time by transport mode**~~ ✅ Done — batch OSRM calculation during recommend flow based on selected transport
- **Supabase auth URL configuration** — add Vercel domain to allowed redirect URLs (already noted)
