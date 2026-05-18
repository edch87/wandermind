# Lark — Design System

This document defines the locked-in visual design decisions for the Lark app. All new components and features must follow these guidelines.

## Brand

- **App name:** Lark
- **Tagline:** "Do it on a lark"
- **Personality:** Warm, adventurous, cozy, personal — like a well-loved travel journal
- **Favicon:** Feather icon (SVG)

## Colour Palette

### Sand (primary)

The warm neutral backbone of the entire UI.

| Token | Hex | Usage |
|-------|-----|-------|
| sand-50 | #FFFAF5 | App background |
| sand-100 | #FFF3E6 | Weather card, light fills |
| sand-200 | #F5E6D3 | Tertiary button bg, image placeholders |
| sand-300 | #E8D5BF | Borders (toggle inactive) |
| sand-400 | #D4B896 | Decorative only (not text) |
| sand-500 | #B8945C | Nav inactive icons |
| sand-600 | #96724A | Icon colour (non-text) |
| sand-700 | #7A5C3A | Secondary/body text (WCAG AA compliant) |
| sand-800 | #5C4229 | — |
| sand-900 | #2D1B0E | Primary text, dark UI, primary CTA |

### Terra (accent)

Used sparingly for energy — the "spontaneous" action and alerts.

| Token | Hex | Usage |
|-------|-----|-------|
| terra-500 | #C65D3A | Accent CTA, spontaneous button, badges |
| terra-600 | #A84D2E | Hover state for terra-500 |

### Forest (success/positive)

Rewards and completion states.

| Token | Hex | Usage |
|-------|-----|-------|
| forest-50 | #F0F5F0 | — (deprecated for weather card) |
| forest-100 | #DCE8DC | — |
| forest-500 | #4A7C59 | "Visited" count, success states |
| forest-600 | #3A6347 | — |

### Special colours

| Colour | Hex | Usage |
|--------|-----|-------|
| Accent italic | #A67B4B | The "lark" word in headings |
| Page outer bg | #F5EDE3 | Behind the app container |
| Nav inactive | #C4A882 | Bottom nav inactive icons |
| Weather card bg | #FFF3E6 | Always — regardless of weather type |

## Typography

### Font stack

- **Body:** DM Sans (400 regular, 500 medium, 600 semibold) — via Google Fonts
- **Accent:** Georgia italic (for the "lark" heading moment)
- **Fallback:** -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif

### Scale

| Element | Size | Weight | Colour |
|---------|------|--------|--------|
| Page heading | 24px (text-2xl) | 600 (semibold) | sand-900 |
| Section heading | 14px (text-sm) | 600 (semibold) | sand-900 |
| Card title | 13px | 500 (medium) | sand-900 |
| Body text | 13-14px | 400 (regular) | sand-700 |
| Small text | 11px | 400-500 | sand-700 |
| Labels | 10-11px | 500, uppercase, tracked | sand-700 |
| Badge text | 11px | 500 | contextual |

### Rules

- Labels use uppercase + letter-spacing (tracking-wider)
- The accent heading uses Georgia italic at the same size as its surrounding text
- Never use sand-500 or lighter for body text — minimum is sand-700 for WCAG AA

## Iconography

### Library

**Phosphor Icons** (`@phosphor-icons/react` v2.x)

### Weights

- **Regular** — default for all inactive/standard states
- **Fill** — active nav tab state only

### Sizes

- Nav bar: 20px
- Quick action buttons: 20px
- Inline/cards: 16-18px
- Empty state hero: 40px

### Key icon assignments

| Function | Icon |
|----------|------|
| Home | House |
| Bucket list | ClipboardText |
| Add | Plus |
| Suggest/recommend | Feather |
| Settings | Gear |
| Spontaneous | Shuffle |
| Location | MapPin |
| Search | MagnifyingGlass |
| Back | ArrowLeft / CaretLeft |
| Close | X |

## Shape Language

### The nested radius rule

Inspired by Apple's HIG. The principle: inner radius = outer radius minus the padding between them.

| Element | Radius | Notes |
|---------|--------|-------|
| Cards, modals, containers | 20px | Outer radius |
| Inner elements (thumbnails, inputs) | 12px | 20px - 8px padding |
| Buttons (standalone CTAs) | 9999px (pill) | Full pill shape |
| Badges/tags | 9999px (pill) | Full pill |
| Toggle buttons | 9999px (pill) | Via CSS class |
| Map containers | 20px | Matches cards |

### Spacing

- **Base unit:** 8px
- **Page horizontal padding:** 20-24px (px-5 or px-6)
- **Card padding:** 14-16px
- **Gap between cards:** 10-12px
- **Section margins:** 20-24px (mb-5, mb-6)

## Navigation

### Bottom nav bar

- Fixed bottom, max-width 480px
- Background: white/95 with backdrop-blur
- Border: 1px top, sand-200
- Active state: sand-900 colour + filled icon (double cue)
- Inactive state: sand-500 colour + regular/outline icon

## Accessibility

### Contrast requirements (WCAG AA)

- All body text must be sand-700 (#7A5C3A) or darker on light backgrounds — passes 4.5:1
- Icon-only buttons must have aria-label
- Active nav state uses both colour AND shape change (filled vs outline)
- Viewport allows user zoom (no user-scalable=no)

### Targets

- All interactive elements: minimum 44x44px touch target
- Bottom nav buttons: 48px minimum height

## Weather card

The weather card always uses `bg-sand-100` (#FFF3E6) regardless of weather type. The weather icon and text communicate the conditions — the card background stays neutral and warm.

## Animations

- Page transitions: fadeUp 0.25s ease-out
- Card hover: translateY(-1px) + subtle shadow
- Confetti: 3s fall with rotation (spontaneous pick)
- All transitions: 0.15-0.2s ease
