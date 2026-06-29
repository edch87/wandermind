# Lark — Page Audit Tracker

Running log of the page-by-page audit. Order follows the user journey, from first-touch to deeper screens. Update this doc as we go so any future chat can pick up where we left off.

Legend: `[ ]` pending · `[~]` in progress · `[x]` done · `[—]` skipped

## Audit order

1. `[x]` **AuthScreen** — sign in, sign up, reset password, new password
2. `[~]` **Onboarding** — first-time setup (name + home)
3. `[ ]` **Dashboard** — main hub after login
4. `[ ]` **AddPlace** — search, pick, save a place
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

Status: pending

---

## 3. Dashboard

Status: pending

---

## 4. AddPlace

Status: pending

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

---

## 9. Settings

Status: pending
