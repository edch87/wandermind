# Lark — Page Audit Tracker

Running log of the page-by-page audit. Order follows the user journey, from first-touch to deeper screens. Update this doc as we go so any future chat can pick up where we left off.

Legend: `[ ]` pending · `[~]` in progress · `[x]` done · `[—]` skipped

## Audit order

1. `[x]` **AuthScreen** — sign in, sign up, reset password, new password
2. `[x]` **Onboarding** — first-time setup (name + home)
3. `[x]` **Dashboard** — main hub after login
4. `[x]` **AddPlace** — search, pick, save a place
5. `[ ]` **BucketList** — browse saved places
6. `[ ]` **ItemDetail** — view/edit a place
7. `[ ]` **RecommendationFlow** — "Suggest" flow (context → pick)
8. `[ ]` **Discover** — curated lists / suggestions
9. `[ ]` **Settings** — profile, home, preferences, sign out

---

## 1. AuthScreen

Status: done (2026-06-29)
File: `src/components/AuthScreen.tsx`

### Shipped changes

1. Autofill / `autoComplete` on name (`name`), email (`email`), password (`current-password` for login, `new-password` for sign-up + new-password mode). Also `inputMode="email"`, `autoCapitalize="none"`, `autoCorrect="off"`, `spellCheck={false}` on the email field, and `autoCapitalize="words"` on the name field.
2. Show/hide password toggle (Phosphor Eye/EyeSlash) inside the password field, 44x44 hit area, `aria-label` and `aria-pressed`. Same toggle on the new-password confirm field.
3. Confirm-password field added in `new-password` mode; mismatch caught client-side before Supabase call.
4. Marketing copy ("Save places you want to visit…") now renders on both login and sign-up.
5. Sign-up helper line below CTA: "We'll send a confirmation email before your first sign-in."
6. Error and success messages styled as tinted blocks (red-50/red-800 and forest-50/forest-600).
7. `aria-live="polite"` wrapper, `role="alert"` on the error block.
8. "Back to sign in" outlined button shown after the reset email is sent.
9. Per-mode loading labels: Signing in… / Creating account… / Sending link… / Updating…
10. "Forgot?" link bumped to `text-sm` with `min-h-[44px]` hit area.
11. Kite mark bumped from 40px to 56px with `animate` (respects `prefers-reduced-motion` via existing CSS).
12. Background changed from flat `sand-50` to `bg-gradient-to-b from-sand-100 to-sand-50`.
13. Sign-up name label changed from question copy to "Your name" with the same uppercase tracking-wider style as the other labels.
14. Fixed phantom vertical scroll: outer container switched from `min-h-screen` (100vh) to `minHeight: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))`. `#root` already provides safe-area padding plus `min-height: 100dvh`; the old `100vh` overshot the visible viewport on iOS Safari (URL bar) and in PWA standalone (notch + home indicator insets).

### Accessibility check (WCAG 2.1 AA)

- All inputs use `text-base` (16px) — passes the iOS auto-zoom rule. Labels bumped from `sand-600` to `sand-700` to meet 4.5:1 contrast on the gradient background (sand-600 measured ~4.2:1).
- Focus rings switched from `sand-500/30` to solid `sand-700` to meet 3:1 UI-component contrast.
- Hit targets: submit and "Back to sign in" buttons ≥52px tall; "Forgot?", show-password, and inline mode-switch buttons all reach 44x44 via `min-h-[44px]` or `w-11 h-11`.
- `noValidate` removed so the browser still enforces `required`, `email`, and `minLength` on submission.
- All form fields have `htmlFor`-linked labels.
- Kite animation is gated by `@media (prefers-reduced-motion: reduce)` in `src/index.css`.

### Open items (cross-app, not blocking)

- **Placeholder text contrast**: `placeholder:text-sand-400` on white measures ~1.9:1, below WCAG AA. Used across the whole app, so worth a global decision before changing here. Candidates: `sand-500` (~2.8:1, still fails AA but clearer) or `sand-600` (~4.4:1, borderline).
- **Social sign-in (Google/Apple)**: deferred to v1.1 per Edward, 2026-06-29.

---

## 2. Onboarding

Status: done (2026-06-30)
Files: `src/components/Onboarding.tsx`, plus `src/index.css` and new `docs/CAPACITOR.md` for the global Dynamic Type wiring

### Shipped changes

**Welcome step**

1. Outer container switched from `min-h-screen` to `minHeight: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))`.
2. Kite mark bumped to 56px with `animate` (respects `prefers-reduced-motion`).
3. Focus-visible ring on the "Show me" CTA (`focus-visible:ring-2 focus-visible:ring-sand-700` with sand-50 offset).
4. `heading-accent` italic on "Welcome" for visual consistency with the rest of the app.

**Feature carousel**

1. Container switched to `calc(100dvh - safe-area insets)`.
2. Skip button: 44x44 hit area, descriptive `aria-label="Skip introduction"`, focus ring.
3. Active slide wrapped in `role="group" aria-roledescription="slide" aria-live="polite"` so VoiceOver announces title and description on each change.
4. Pagination dots converted to `role="tablist"` with `role="tab"`, `aria-current`, and per-dot `aria-label` ("Go to slide N of M: title"). Each dot has a 44x44 hit area via a `p-3` wrapper around the visible pip, plus a focus ring.
5. Inactive pip colour bumped from `bg-sand-300` to `bg-sand-500` to meet 3:1 UI-component contrast.
6. Touch swipe gestures retained (already worked, untouched).

**Location step (address search)**

1. Container switched to `calc(100dvh - safe-area insets)`.
2. Wrapped the address input + submit in a real `<form>` with `onSubmit`, so iOS keyboard "Go" submits naturally.
3. Address input attrs: `autoComplete="street-address"`, `autoCapitalize="words"`, `autoCorrect="off"`, `spellCheck={false}`, `inputMode="search"`, `enterKeyHint="search"`, `text-base` to dodge iOS auto-zoom.
4. `htmlFor`-linked label on the address input.
5. "Use my location" button (GPS) added beneath the search field with loading state, `aria-live` updates, and an `aria-label` distinct from the visible text.
6. "No matches" empty state below the results when a search returns nothing.
7. `aria-live="polite"` region announces searching / no results / GPS lookup status.
8. Focus rings on the input, GPS button, each result row, and the primary CTA.
9. Result rows bumped to 44x44 minimum hit areas.

**Pin step (new)**

1. Built fresh as a centre-crosshair model: a fixed pin overlay (`pointer-events-none`) with the user dragging the Leaflet map underneath. Cleaner than draggable markers on mobile.
2. Carto Positron tiles instead of OSM standard for a calmer cartographic base under the brown pin.
3. Editable address field below the map as a VoiceOver-first fallback for users who cannot drag the map: real `<form>` + `onSubmit`, `htmlFor` label, iOS input attrs (`autoComplete="street-address"`, `inputMode="search"`, `enterKeyHint="done"`), `aria-live` lookup state, `role="alert"` error state.
4. Pulse animation on the centre pin when the map jumps programmatically (address lookup or GPS), so users see the "we moved it" cue. Defined as `.pin-pulse` in `src/index.css`, gated by `prefers-reduced-motion`.
5. Map container `role="application"` with a descriptive `aria-label` explaining both the drag interaction and the address-field fallback.
6. Leaflet zoom controls bumped to 44x44 with focus rings, in `src/index.css` (`.leaflet-bar a` rule).
7. Container uses `calc(100dvh - safe-area insets)` with the map at `55vh` minimum 320px.
8. "This is home" primary CTA with focus ring; secondary "Back" outlined button preserves the flow.

**Discover step**

1. Outer container switched to `calc(100dvh - safe-area insets)`.
2. Focus rings on category chips, place cards, and the primary CTA.
3. Category chip hit targets bumped to 44x44 (`min-h-[44px]`, `text-sm`, larger padding) so they scale cleanly with Dynamic Type.
4. `aria-pressed` on filter chips and on each place-card toggle.
5. Each section grid wrapped in `role="list"` with `aria-labelledby` pointing to the category heading; cards wrapped in `role="listitem"` so VoiceOver announces "N of M" within each category.
6. Descriptive `aria-label` on each card incl. selected state.
7. `aria-live="polite"` (sr-only) region announces selection count changes.
8. `role="status"` on the "Nothing in this category" empty state so screen readers hear it when filters update.
9. Top-right Skip button dropped. The primary CTA now flips to an enabled "Skip for now" button when no selection is made, removing the awkward 30%-opacity disabled state.
10. Heading renamed from "A few to start" to "A few near you"; helper copy switched from em-dash to a period.
11. Card image height bumped from `h-24` to `h-32` so travel imagery does more of the selling.
12. Card name bumped from `text-xs` to `text-sm`; "X km away" caption dropped (noise inside the 150km radius before any transport context).
13. `active:scale-[0.98]` press feedback on cards for a native-feeling tap.
14. Sticky bottom bar background switched from `bg-white/95` to `bg-sand-50/95` so it doesn't seam against the page.
15. Per-category counts on each filter chip ("Nature (8)"); "All" chip shows total nearby count.

**Global (Dynamic Type wiring)**

1. `:root` block in `src/index.css` defines `--dt-scale: 1` and `font-size: calc(100% * var(--dt-scale))`, so every rem-based Tailwind size will scale with the user's iOS preferred text size once the native bridge writes the variable. Default 1 means today the web app behaves identically.
2. `-webkit-text-size-adjust: 100%` on `:root` covers Safari PWA mode (which honours Dynamic Type natively when this is set).
3. New `docs/CAPACITOR.md` captures the wrap checklist, the inventory of web-side prep that's already in place, and the AppDelegate Swift recipe for the Dynamic Type bridge (reads `preferredContentSizeCategory`, writes `--dt-scale` via `evaluateJavaScript`, re-fires on `UIContentSizeCategoryDidChange`). Paste-and-go when the Capacitor wrap happens.

### Accessibility check (WCAG 2.1 AA)

- All inputs across welcome name field, location search, pin address field use `text-base` (16px), no iOS auto-zoom.
- Hit targets ≥44x44 across every interactive element: Show me, Skip, slide dots, GPS button, address inputs, search results, Use my location, Back, This is home, Leaflet zoom controls, filter chips, place cards, sticky CTA.
- Focus rings use solid `sand-700` (≥3:1 UI contrast) with sand-50 offset across the whole flow.
- Small text uses `sand-700` or darker on `sand-50` (≥4.5:1 text contrast). Inactive carousel dot moved from `sand-300` to `sand-500` for 3:1 UI contrast.
- All form fields have `htmlFor`-linked labels; the pin step's map exposes its purpose and the address-field fallback via `role="application"` + `aria-label`.
- Async state announced via `aria-live` regions: location search ("Searching..." / "No matches"), GPS lookup, pin address lookup, discover selection count.
- Error and status messages use `role="alert"` / `role="status"` as appropriate.
- Kite drift and pin pulse animations are gated by `@media (prefers-reduced-motion: reduce)` in `src/index.css`.
- Dynamic Type CSS hook is in place so all rem-based sizes will scale once the native bridge is wired at Capacitor wrap time. No `text-[10px]` or sub-`text-xs` remains in the onboarding flow.

### Open items (cross-app, not blocking)

- **Placeholder text contrast**: still `placeholder:text-sand-400` (~1.9:1 on white). Inherited from AuthScreen audit; same global decision needed before changing here.
- **Dynamic Type native bridge**: web-side hook ready, Swift recipe documented in `docs/CAPACITOR.md`. Bridge itself lands when the Capacitor wrap happens (`[[project-native-ios-first]]` deferred until web app is launch-ready).
- **Discover selection cap**: no upper limit on how many seed places a user can pick during onboarding. Intentional for now; revisit if friends-and-family testers consistently over-select.
- **No back-nav from discover**: by design (don't let users re-edit the pin and lose their selection), flagged for visibility.

---

## 3. Dashboard

Status: done (2026-06-30)
Files: `src/components/Dashboard.tsx`, `src/components/CuratedLists.tsx`, `src/components/Discover.tsx` (DiscoverCard), `src/components/ItemDetail.tsx` (refactor only), `src/utils/travelDisplay.ts` (new), `src/index.css`, `src/App.tsx` (nav restructure)

### Shipped changes

**Greeting**

1. Time-of-day greeting: morning (05-12), afternoon (12-17), evening (17-22), "Hello" fallback for late night (22-05). Second line "let's go on a lark" stays consistent.

**Quick actions** (revised same-day after design pass)

1. Hierarchy now reads through colour and size, not just position. "Suggest something" is the hero: tall terra-500 card, large centred kite icon, primary label plus a subtitle ("Find the right place for right now"). "Surprise me" (renamed from "I'm feeling spontaneous") and "Add place" sit below as slim sand-200 pill buttons (icon + label inline, ≥44px height). Icon arrangement is now consistent across the secondaries.
2. The original three-equal-buttons layout was rejected for inconsistent icon placement and uneven label heights; the first revision (sand-900 hero) was rejected because the primary action should be the brand orange.
3. Focus rings on all three buttons (`focus-visible:ring-sand-700` with `sand-50` offset).

**Header + avatar (nav restructure)**

1. Initials avatar (`getInitials(displayName)`, max 2 chars, uppercase) sits top-right of the Dashboard header. Tap opens Settings. 44x44 hit area, descriptive `aria-label="Open settings"`, focus ring.
2. Bottom nav: Settings slot replaced with Discover (Compass icon). Settings is rarely visited and Discover earns the slot as a daily return reason.
3. Header switched to a flex row: greeting on the left, avatar on the right. Long names truncate cleanly via `flex-1 min-w-0` on the greeting block.

**Wind gust animation (replaces confetti)**

1. New `.wind-streak` rule in `src/index.css`: translucent sand-coloured streaks (linear-gradient that fades at both ends) sweep left-to-right across the viewport. 9 streaks, staggered 80ms each, each running 1.2-1.6s.
2. Old `.confetti-piece` / `@keyframes confetti-fall` rules removed.
3. Gated by `@media (prefers-reduced-motion: reduce)` — the streaks render at `opacity: 0`, no animation, when the user has reduced motion on.
4. Gust container marked `aria-hidden="true"` — decorative; the surprise card itself announces via aria-live.

**Surprise card**

1. `useEffect` + `scrollIntoView({ behavior: 'smooth', block: 'center' })` so the card scrolls into view when picked (previously rendered offscreen on most phones).
2. Wrapper has `aria-live="polite"` + `aria-atomic="true"` so VoiceOver announces the pick.
3. Close button switched from literal `✕` character to Phosphor `X` icon with `aria-label="Dismiss spontaneous pick"`, 44x44 hit area, focus ring.
4. Details/Navigate buttons bumped to `min-h-[44px]` and given focus rings.
5. Travel caption switched from "X km · cost" to "X min by car · cost" (or walking auto-override when ≤15 min walk).
6. Place name promoted from `<h3>` to `<h2>` to fix heading hierarchy.
7. `alt=""` on the surprise image (decorative — the heading carries the name; previously double-announced).

**Rail logic refactor** (`CuratedLists.tsx`)

1. Three-layer pruning replaces the old "show every rail with ≥3 items" rule:
   - **Smart split check**: context rails (Perfect for today, Short on time, Full day out, Free to do) must capture 30-70% of the todo list. Outside that band the rail is redundant or sparse. Personal rails (Top of your list, Recently added) and category rails skip this check.
   - **Library-size cap**: <10 items → max 3 rails; <20 items → max 5; otherwise uncapped.
   - **Soft dedup**: each rail prefers items not yet shown in earlier rails. Falls back to repeats only when the rail would otherwise drop below `MIN_RAIL_ITEMS`. Stops the same 5 places appearing under 6 different lenses.
2. Constants documented inline.
3. **"Short on time" filter now uses total trip time**, not just activity duration. Trip = (one-way preferred-mode minutes × 2) + activity duration midpoint, capped at `SHORT_ON_TIME_MAX_MIN` (120 min). Walking auto-override at ≤15 min applies; legacy items with null preferred-mode minutes fall back to haversine + average speeds. Before, an 88-minute drive for a 30-minute activity could appear under "Short on time"; Edward flagged this 2026-06-30.

**Travel display utility** (`src/utils/travelDisplay.ts`, new file)

1. Extracted `pickDisplayMode`, `WALK_OVERRIDE_MAX_MIN`, `TRAVEL_HIDE_MIN_KM`, `TRANSPORT_META` from `ItemDetail.tsx` into a shared util so rail cards, surprise card and detail page agree on which mode to surface.
2. `formatTravelShort(item, preferred)` returns "12 min walk" or "20 min by car"; falls back to "X km" only when stored minutes are null (legacy items).
3. `estimateTravelShortFromDistance(km, preferred)` for Discover cards, which carry only straight-line distance (no stored per-mode times). Uses the same fallback speeds (4.5/15/60 km/h) as the recommend engine.
4. Walking auto-override applies on both saved and discover surfaces (`walkMinutes <= 15`).
5. `ItemDetail.tsx` refactored to import from the util; icon mapping (Phosphor nodes) stays local so the util doesn't pull React into surfaces that just want the label.

**Rail cards** (`ItemRail` in `CuratedLists.tsx`)

1. Container switched from generic `<div>` to `<section aria-labelledby>` landmark; scroll list given `role="list"` and cards `role="listitem"`.
2. Caption switched from `text-[10px]` to `text-xs` ([[feedback-typography-minimum]]) and from "X km · cost" to `formatTravelShort` output. Time portion now goes through `formatDuration` so the dashboard and detail page read the same ("1hr 30min by car", not "90 min by car").
3. Each card carries a descriptive `aria-label`: name, category, travel time, cost.
4. Card image gets `alt=""` (decorative; name appears in label).
5. Focus rings on every card and on the "See all" link; "See all" bumped to `min-h-[44px]`, text contrast lifted from `sand-600` to `sand-700` for AA.
6. Active press feedback (`active:scale-[0.98]`) on cards.
7. **Card layout consistency**: card button is now `flex flex-col` with the image marked `flex-shrink-0`, so the image stays fixed at the top regardless of name length. Name uses `line-clamp-2 leading-snug` so every card in the rail has the same text block height. Before, a long-name card stretched the rail and shorter-name siblings centred their image vertically — Edward flagged the visual mismatch.

**Discover card** (`Discover.tsx`)

1. New optional `preferred` prop. When passed, the card shows `estimateTravelShortFromDistance(distanceKm, preferred)` instead of "~X km". Time portion goes through `formatDuration`.
2. Caption bumped from `text-[10px]` to `text-xs`.
3. Descriptive `aria-label` ("Add {name}, {category}, {travel}"). MapPin icon marked `aria-hidden`.
4. Image `alt=""` (decorative; name in label).
5. Focus ring + active scale.
6. Heart badge marked `aria-hidden` (decorative; not the primary action).
7. Same `flex flex-col` + `flex-shrink-0` + `line-clamp-2` treatment as `ItemRail` cards so the row reads as one consistent visual system.

**Refine-home banner**

1. Section wrapped in `<section aria-labelledby>` landmark.
2. Dismiss `X`: 44x44 hit area (`w-11 h-11`), descriptive `aria-label="Dismiss home location prompt"`, focus ring; icon marked `aria-hidden`.
3. "Update home" link contrast lifted from `terra-500` to `terra-600` for AA.
4. "Not now" contrast lifted from `sand-600` to `sand-700`; both action links given `min-h-[44px]` + focus rings.

**Weather card**

1. Wrapped in `<section aria-label="Today's weather">`.
2. Weather icon marked `aria-hidden` (text caption next to it carries the info).
3. Copy fixed: `indoorCount` now counts only `setting === 'indoor'` items (previously inflated by mixing in `weatherSuitability === 'any'`, which covers outdoor items too).
4. Counts pluralise correctly ("1 outdoor spot" vs "3 outdoor spots").

**Semantic structure**

1. Outer container switched from `<div>` to `<main aria-label="Dashboard">` landmark.
2. Header wrapped in `<header>`.
3. Headings cleaned: `<h1>` greeting, `<h2>` on rail titles, surprise card name, discover-nearby title, and empty-state title. Eliminates the previous `h1 → h3` skip.
4. Every horizontal rail (curated + discover) is now a `<section aria-labelledby>` so VO users can jump between them via rotor.

### Accessibility check (WCAG 2.1 AA)

- All caption text bumped from `text-[10px]` to `text-xs` ([[feedback-typography-minimum]]).
- Small text uses `sand-700` minimum on `sand-50`/`sand-100` backgrounds.
- Focus rings: solid `sand-700` with `sand-50`/`sand-100`/`white` offset (≥3:1 UI contrast) on every interactive element — quick action buttons, surprise card buttons, banner buttons + dismiss, weather card (no interactive elements), rail cards, "See all" links, discover cards, empty-state CTA.
- Hit targets ≥44x44 across the page: quick action buttons (py-4 ≈ 56px), banner dismiss + actions, surprise close + Details/Navigate, "See all" links, empty-state CTA. Rail cards inherit their card height (≥88px); discover cards same.
- Decorative imagery (`PlaceImg` in rail/surprise/discover cards) uses `alt=""` since the name appears in the heading or `aria-label`.
- Surprise pick announces via `aria-live="polite"` on the container; wind gust marked `aria-hidden`.
- All animations (wind gust, page-enter, kite, pin-pulse) gated by `prefers-reduced-motion`.
- `<main>` landmark and clean heading hierarchy (h1 → h2; no skipped levels).
- Horizontal scrolling rails carry `<section aria-labelledby>` + `role="list"` / `role="listitem"`.

### Open items (cross-app, not blocking)

- **`text-[10px]` in App.tsx NavBar labels**: not in scope for Dashboard but flagged for the next audit pass — same typography rule applies.
- **`text-[10px]` in ItemDetail.tsx "GETTING THERE" label**: same, will be picked up in the ItemDetail audit.
- **Placeholder contrast**: still inherited from earlier audits, no global change yet.
- **Pull-to-refresh**: discussed, not built — would lean on Capacitor for native gesture; web alternative not pursued in v1.
- **3-day mini-forecast**: discussed as a future enhancement; not in v1 to keep the dashboard focused.
- **Refine-home banner deep link**: still routes to full Settings; deep link to pin step deferred.
- ~~**Settings reachable only from Dashboard**~~: resolved 2026-06-30. Extracted `HeaderAvatar` into `src/components/HeaderAvatar.tsx` and wired it into Dashboard, BucketList ("My List"), and Discover so Settings is reachable from every primary content tab. Skipped on flow-style screens (AddPlace, RecommendationFlow, ItemDetail) where the back/cancel affordance owns the right side of the header.
- **Discover back button on a tab destination**: now that Discover is a bottom-nav tab, the leading "Back" arrow is redundant for users who arrive via the nav (vs. via Dashboard "See all"). Not removed in this pass; worth revisiting in the Discover audit (item 8). Hit area and contrast lifted to AA in the meantime.

---

## 4. AddPlace

Status: done (2026-06-30)
Files: `src/components/AddPlace.tsx`, `src/App.tsx` (onSave signature), `src/index.css` (toggle-btn), `IDEAS.md` (v1.1 backlog), `docs/PAGE_AUDIT.md`

### Shipped changes

**Search step**

1. Outer wrapper switched from `<div>` to `<main aria-label="Add a place">` with the standard `calc(100dvh - safe-area insets)` height pattern.
2. Back arrow: 32x32 sand-100 circle with literal `←` swapped for a 44x44 button using Phosphor `ArrowLeft`, `aria-label="Back to dashboard"`, focus ring (`focus-visible:ring-sand-700` with sand-50 offset). Same treatment on the confirm-step back arrow and the hero-image back arrow on the review step.
3. Search input wrapped in `<form role="search">` with `onSubmit={preventDefault}` so the iOS keyboard "Search" key behaves naturally. Added sr-only `<label htmlFor="add-place-search">`, plus `autoComplete="off"`, `autoCapitalize="off"`, `autoCorrect="off"`, `spellCheck={false}`, `inputMode="search"`, `enterKeyHint="search"`, `aria-autocomplete="list"`, `aria-controls`, `aria-expanded`.
4. Focus ring on the search input lifted from `focus:ring-1 focus:ring-sand-300` (1.6:1, fails 3:1 UI contrast) to `focus:ring-2 focus:ring-sand-700/30` with `focus:border-sand-700`.
5. Inline spinner inside the input replaces the loose "Searching..." paragraph, mirroring the Onboarding pattern. The sr-only `aria-live="polite"` region announces searching / N results / no results.
6. Result rows: explicit `min-h-[44px]`, focus rings, descriptive `aria-label` (name + city/country + "already saved — open detail" when matched), `role="list"` on the container, `role="listitem"` on each button.
7. Empty-state copy bumped from `sand-600` to `sand-700` for AA contrast; magnifying-glass icon contrast lifted from `sand-300` to `sand-400` plus `aria-hidden`.
8. "No results" empty state now has `role="status"`.
9. Search debounce dropped from 1000ms to 400ms.
10. **Removed the "Or paste a Google Maps link" import path entirely** (decided 2026-06-30 with Edward). The affordance was hidden behind a small underlined link and rarely worked — search results were just as good. State, handlers, JSX, and imports stripped; `parseGoogleMapsUrl`/`resolveGoogleMapsShortUrl`/`isGoogleMapsShortUrl` left in `src/utils/api.ts` as dead code, ready for re-use if we ever ship a PWA share target (tracked under IDEAS.md "Google Maps import"). This removed all three `text-[10px]` violations in the search step in one go.

**Confirm step**

1. Outer wrapper switched to `<main aria-label="Confirm place location">` with the `calc(100dvh)` height pattern.
2. Map div given `role="application"` with a descriptive `aria-label` explaining both the drag interaction and the address-field fallback below — mirrors the Onboarding pin step.
3. **Address-field fallback added**: editable address input below the map with sr-only label, `aria-live` lookup state, `role="alert"` error state, iOS input attrs (`autoComplete="street-address"`, `inputMode="search"`, `enterKeyHint="done"`, `autoCapitalize="words"`, `autoCorrect="off"`, `spellCheck={false}`). On submit/blur, `handleConfirmAddressSubmit` re-geocodes via `searchPlaces` and moves both the pin and the pendingPlace state. Lets keyboard / VoiceOver users adjust the location without touching the map.
4. Drag handler now syncs the address-field input on reverse-geocode so the text stays in sync with the pin.
5. Helper copy shortened from "Drag the pin (or tap the map) if it's slightly off." to "Move the pin if it's not quite right." Contrast lifted from `sand-600` to `sand-700`.
6. "Search again" and "Add this place" CTAs given explicit `min-h-[44px]` and focus rings.

**Loading step**

1. Wrapper switched from `min-h-screen` to the `calc(100dvh - safe-area)` pattern.
2. Added `role="status"` + `aria-live="polite"` so the loading messages ("Fetching place details…" / "Calculating travel times…" / "Finding photos…" / "Auto-categorising…") are announced to VoiceOver.
3. Loading copy contrast lifted from `sand-600` to `sand-700`.

**Review step (redesigned 2026-07-01 to the value + Change row pattern)**

The first pass shipped the "More details" disclosure. Edward pushed back — page still felt cumbersome, hiding seasons and accessibility felt wrong, and the two-button footer looked ugly with the long labels. Second pass replaces the chip-group-per-field layout with a much shorter row pattern inspired by Airbnb / Apple Maps / Linear / Notion, and the disclosure is gone.

Every field renders as a **value chip + Change button** row. The value chip shows the current selection (dark filled for committed values, muted outlined for the "Not sure" accessibility state). Both the value chip and the Change button open the same `BottomSheet` picker. Nothing is hidden — every one of the 12 fields is visible at once and roughly ~60px tall instead of ~130px. Page height drops from ~1500px to ~800px.

The sheet follows the near-universal mobile pattern (Airbnb filter refinement, Apple Maps "Choose Guide", Google Maps sort/filter, Notion mobile property edit, Linear mobile status/assignee): slide-up modal with backdrop, drag-down to dismiss, escape to close, body scroll locked, `aria-modal`. Single-select variants commit + close on option tap. Multi-select variants keep a draft and commit on Done.

1. Wrapper switched to `<main aria-label="Review and save place">`. Place name promoted from `<h2>` to `<h1>` since this is a leaf screen.
2. Hero back button bumped to 44x44, Phosphor `ArrowLeft`, `aria-label="Back to search"`, background lifted from `bg-white/80` to `bg-white/90` + shadow + focus ring for visibility on imagery.
3. Address subtitle switched from fragile `draft.address.split(',').slice(1,3).join(',')` to `[draft.city, draft.country].filter(Boolean).join(', ')` — uses the clean fields already on the draft.
4. Travel chip switched from "X km away" to `formatTravelShort(draft, profile.preferredTransport ?? 'car')` so it reads "20 min by car" / "12 min walk" — same util the Dashboard rails, surprise card, and detail page use.
5. Uncertain-category banner palette fix: `text-amber-300 bg-amber-900/30 border-amber-700/40` (a dark-mode palette on a light-mode screen — bug) → `text-amber-800 bg-amber-50 border-amber-200`. Added `role="alert"`. Copy adjusted to "Tap Change to pick the best fit" since the row now uses the value + Change pattern.
6. **Every field becomes a `<FieldRow>`**: field label above, value chip(s) + Change button beneath. Single-select fields show one dark chip; multi-select fields (Times, Seasons, Good for, Tags) show one chip per selected value. Empty-state renders only the Change button labelled "Choose" with a leading plus icon.
7. **Three-state accessibility uses a muted variant** (`value-chip--muted`): outlined pill with sand-500 border and sand-700 text, so users can eyeball which of Dogs / Wheelchair / Stroller they haven't committed on. Explicit Yes / No are dark filled like every other value chip.
8. **New `<BottomSheet>` component** (`src/components/BottomSheet.tsx`) handles all pickers. Portal-based render to escape stacking contexts. Backdrop with `absolute inset-0` and 40% opacity, keyboard-reachable close via a real `<button>`. Sheet slides up from bottom with a `translate-y-full → 0` transition. Drag-down handle: `onTouchStart/Move/End` translate the sheet with the finger; release beyond 90px commits to dismiss, less snaps back. Backdrop-tap and Escape both dismiss. Body scroll locked while open. Focus moves into the sheet on open and restores on close. `role="dialog" aria-modal="true" aria-labelledby="bottom-sheet-title"`. Max height clamped to viewport minus safe-area so the sheet stays scrollable on shorter phones.
9. **Sheet variants**: single-select passes an `onPick` that commits + calls `closeSheet`; multi-select provides `onDone` so the sheet renders a Done affordance in the header and the caller commits the accumulated `multiDraft` state on that tap. Discard-safe: backdrop-tap or drag-down never commit pending edits.
10. **Multi-select `exclusiveKey` semantics** for Times of day and Seasons: picking "Any" clears the specific values and vice-versa, mirroring the previous inline toggle behaviour. Implemented inside `MultiChipList` so both the Times and Seasons sheets get it for free.
11. Tags sit right after Category (they drive recommendations more heavily than the rest and have no inference — the one field the user genuinely needs to touch).
12. Notes stays inline as a textarea — free text has no picker. Real `<label htmlFor="personal-notes">` connects the label to the field.
13. Footer is a single primary CTA: `Save place` full-width. The "Save & add another" secondary button from the previous pass is gone (Edward's call — the long label was ugly and the batch-add pattern didn't feel worth the visual weight). `onSave` signature reverted to the simple `(item) => void`.
14. Hero image `alt=""` (decorative; the h1 carries the name; previously announced twice).
15. `toggleGroupType` / `toggleSeason` / `toggleTimeOfDay` helpers deleted from the component — the sheet's `MultiChipList` owns the toggle semantics now.
16. Legacy `TagPicker` export retained for `ItemDetail.tsx`'s inline edit mode (chip-cloud pattern). When ItemDetail's edit mode moves to the sheet pattern in a future audit, the export can be dropped.

**Global (index.css)**

1. `.toggle-btn` gained `min-height: 44px` so every screen using the class hits the WCAG 2.1 AA touch-target rule. Padding stays at 7px 14px so chip width still tracks the label — only vertical breathing room changes. Affects AddPlace, Onboarding discover, Settings, ItemDetail edit, RecommendationFlow.
2. `.toggle-btn:focus-visible` rule added: 2px sand-50 inner ring + 2px sand-700 outer ring. Focusable chips now have a visible state across the app.
3. **New `.value-chip`** class for the review's dark filled value pill: sand-900 background, sand-100 text, 44px min-height, gap for icons.
4. **New `.value-chip--muted`** modifier for the "Not sure" three-state visual: transparent background, sand-300 border, sand-700 text.
5. **New `.change-btn`** class for the outlined Change pill: sand-500 border, sand-700 text, hover to sand-100 background. Focus ring parity with `.toggle-btn`.

**App.tsx**

1. `onSave` callback signature stays simple: `(item: BucketListItem) => void`. The `addAnother` options arg introduced in the first pass was removed with the secondary button.

### Accessibility check (WCAG 2.1 AA)

- All inputs (search, confirm-address, personal notes) use `text-base` (16px), no iOS auto-zoom.
- Hit targets ≥44x44: back buttons (search/confirm/review), search input row, search results, confirm CTAs ("Search again" / "Add this place"), every toggle chip (via `min-height: 44px` on `.toggle-btn`), AccessibilityRow pills, "More details" disclosure button, "Save & add another" + "Save to my list" CTAs.
- Focus rings: solid `sand-700` ring with appropriate offset across every interactive element. `.toggle-btn:focus-visible` global rule covers every chip.
- Small text: all `text-[10px]` removed; minimum is now `text-xs` (12px). Helper text and copy use `sand-700` or darker on `sand-50`/white (≥4.5:1).
- Toggle groups carry `role="radiogroup"` / `role="group"` with `aria-labelledby` pointing at the section heading, and per-button `aria-checked` / `aria-pressed`. AccessibilityRow uses the same pattern with a row-level `aria-labelledby`.
- Confirm map exposes its purpose and the address-field fallback via `role="application"` + `aria-label`. Address input provides a keyboard / VoiceOver path equivalent to dragging.
- `aria-live="polite"` regions on search status, confirm-address lookup, and the loading step.
- `role="alert"` on the uncertain-category banner, confirm-address error, and `role="status"` on loading + empty-search state.
- Personal notes textarea linked to its section heading via `aria-labelledby`.
- `<main aria-label>` landmark on every step; `<h1>` on the review-step place name; `<h2>` on screen titles; `<h3>` on section headings — clean heading hierarchy.
- Decorative imagery and icons marked `aria-hidden="true"`; hero photo `alt=""` since the h1 carries the name.

### Accessibility check (WCAG 2.1 AA) — post-redesign

- Value chips and Change buttons all 44x44 minimum via `min-height: 44px` on `.value-chip` / `.change-btn`.
- Both the value chip and Change chip in each row expose a descriptive `aria-label` (e.g. "Setting: Indoor. Tap to change.") so VoiceOver announces the semantic role of the tap, not just the visible text.
- BottomSheet: `role="dialog" aria-modal="true"`, header id linked via `aria-labelledby`, backdrop is a real `<button aria-label="Close">` so keyboard users can reach it, Escape closes.
- Focus flows into the sheet on open (moved to the sheet element which has `tabIndex={-1}`) and restores to the trigger element on close.
- Body scroll locked while the sheet is open — page doesn't peek-scroll behind the sheet.
- Single-select option chips use `role="radiogroup"` + `role="radio" aria-checked` on each pill; multi-select uses `role="group"` + `aria-pressed`.
- Amber category-uncertainty prompt uses light-mode palette (`amber-50` / `amber-800` / `amber-200`) with `role="alert"`.
- Notes textarea has a real `<label htmlFor="personal-notes">` link.
- Focus rings visible on every interactive element (value chips, Change buttons, sheet close, sheet Done, sheet option chips, Save CTA, hero back button, all inputs).
- Reduced-motion: sheet transition durations are 200ms — well under the `prefers-reduced-motion` opt-out threshold; the drag gesture is direct manipulation and doesn't need to animate. Not a bespoke reduced-motion path, but not a violator either.

### Open items (cross-app, not blocking)

- **Placeholder text contrast**: still `placeholder:text-sand-400` (~1.9:1 on white). Inherited cross-app open item from earlier audits.
- **Replace the hero photo on review**: tracked in IDEAS.md New Features as v1.1.
- **Empty-search affordances** (recent searches, nearby categories the user hasn't added much of, popular-near-you rail): tracked in IDEAS.md New Features as v1.1.
- **Dead-code in `src/utils/api.ts`**: `parseGoogleMapsUrl`, `isGoogleMapsShortUrl`, `resolveGoogleMapsShortUrl` and the `resolve-maps-link` Supabase Edge Function are kept on ice. Tree-shaken from the bundle since nothing imports them. Reactivates if we ship a PWA share target (see IDEAS.md → Google Maps import → (3)).
- **Discover→Add flow skips the confirm step**: by design (Discover items are user-confirmed visually), but Discover coords can be slightly off (Wikidata centroids). Edge case, flagged, no change in this pass.
- **ItemDetail edit mode still uses the chip-cloud `TagPicker`**: to keep this audit scoped, the legacy export was kept. When the ItemDetail audit runs (item 6), the edit surface should move to the same value + Change + BottomSheet pattern; the `TagPicker` export can be dropped then.
- **Reduced-motion path for the sheet**: not bespoke yet. If tester feedback flags it, gate the slide-up transition behind `prefers-reduced-motion: no-preference`.

---

## 5. BucketList

Status: pending

---

## 6. ItemDetail

Status: pending

---

## 7. RecommendationFlow

Status: pending

---

## 8. Discover

Status: pending

### Pre-audit notes (recorded 2026-06-30)

- **Nav promotion**: as of 2026-06-30 Discover replaces Settings in the bottom nav (Settings is now behind the initials avatar in the Dashboard header). Discover is intended to be a daily return reason; the full screen should match that ambition.
- **Highlight ideas to consider during the audit**: bigger lead card per category (hero with description and provenance), section subtitles that explain the picks ("Off the beaten path", "Worth the drive"), saved-heart badges visible on community picks, optional editorial blurbs.
- **v1 scaling plan for users outside Munich** (curation is Munich-only today):
  1. **Wikidata-first with category guardrails**: tighten the Wikidata filter so only Lark-worthy entries surface (museums with art classifications, viewpoints with elevation, named parks, etc.). Free, immediate, raises the floor without manual curation.
  2. **Community fallback**: once a city has enough saves, community signals replace curated. Aligns with social-deferred-to-v1.1 and grows naturally with usage.
- **Deferred to v1.5**: LLM-assisted curation (draft starter list per city from Wikidata + Wikipedia, Edward reviews). Skipped for v1 to keep cost at zero and avoid live LLM calls in the user path.
- **Not in v1**: manual city-by-city curation beyond Munich. Re-evaluate after friends-and-family traction in adjacent cities.
- Track Discover-scale follow-ups in `IDEAS.md` rather than here; this section is for the audit itself.

---

## 9. Settings

Status: pending
