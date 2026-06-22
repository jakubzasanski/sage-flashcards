# UI Redesign — "Sage" Visual Identity (Phase B) Implementation Plan

## Overview

Re-create the approved **Sage** visual identity — a warm, cozy, professional
flashcard app — in the real Astro 6 + React 19 + Tailwind 4 + shadcn/ui codebase.
This is the **Phase B (implementation)** half of a design-first change: Phase A
produced and locked the design as rendered HTML mockups. This plan does **not**
re-decide the look; it sequences how to build that look in code, screen by screen,
with a render-verify gate against the mockup at each step.

The work is visual-only with three deliberate structural additions: a unified app
shell (sticky header + tab nav on desktop, a **bottom tab bar on mobile**), a
**light/dark theme toggle** (the dark theme keeps the same Sage layout with a darker warm
palette), and an **EN/PL language toggle** (UI chrome only, via a `t()` dictionary +
cookie — no per-locale URLs). Every screen is **fully responsive and mobile-first quality**
(touch targets, thumb-reachable nav, stacked layouts). The app is named
**"Sage Flashcards"**. No data-layer, business-logic, or route-structure changes.

## Current State Analysis

- **Theming is CSS-first and fully centralized in one file:** `src/styles/global.css`.
  - `:root` (lines 6–39) holds neutral-grayscale shadcn tokens in **OKLch**
    (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`,
    `--accent`, `--destructive`, `--border`, `--input`, `--ring`, chart + sidebar
    tokens), `--radius: 0.625rem`.
  - `.dark` (lines 41–73) is a full inverted dark palette.
  - `@theme inline` (lines 75–111) maps each `--token` to a Tailwind `--color-*`
    theme key + the `--radius-*` scale.
  - `@utility bg-cosmic` (lines 113–115) — dark navy gradient used by the marketing
    landing page.
  - `@layer base` (lines 117–124) applies `border-border` to `*` and
    `bg-background text-foreground` to `body`.
  - No `tailwind.config.*` exists — all tokens live in this CSS. `@custom-variant dark`
    (line 4) defines the dark variant.
  - **No fonts loaded** anywhere (system defaults). No `@font-face`, no CDN links.
- **shadcn primitives** in `src/components/ui/` consume semantic tokens via CVA:
  - `button.tsx` — variants read `bg-primary`, `text-primary-foreground`,
    `bg-secondary`, `bg-accent`, `border`, `ring-ring/50`, with `dark:` adjustments.
  - `card.tsx` — `bg-card text-card-foreground rounded-xl border shadow-sm`.
  - `textarea.tsx` — `border-input`, `focus-visible:ring-ring/50`, `dark:bg-input/30`.
- **App shell / navigation today:**
  - `src/layouts/Layout.astro` — default `title = "10x Astro Starter"` (line 10),
    `<link rel="icon" href="/favicon.png">` (line 18), renders config `Banner`s + `<slot/>`.
    Its config banner has **hardcoded Polish** ("Uwaga:", "Dokumentacja") — the app
    already mixes PL/EN copy, so a real locale system also tidies this up.
  - **No i18n exists today** — all UI strings are hardcoded inline (mostly English, some
    Polish). There is no `t()` helper, message catalog, or locale on `context.locals`.
  - `src/components/Topbar.astro` — a sign-in/out bar with hardcoded dark glass
    classes (`border-white/10 bg-white/5 text-white/80`, purple links). Renders user
    email + Dashboard link + Sign out, or sign-in/up links.
  - `src/pages/dashboard.astro` — a hub page (cards-due summary + nav links + sign out).
  - Each app page (`review.astro`, `generate.astro`, `cards/index.astro`, `cards/new.astro`)
    has its own page header (title + description + signed-in email) and mounts a React island.
  - **The current UI is branded "10x Astro Starter"**, not "10xCards" — the name
    appears only in `Layout.astro:10` (default title) and `Welcome.astro:35` (hero).
- **Screens & islands (all exist, all map cleanly to the mockup):**
  - Review: `src/pages/review.astro` + `src/components/review/ReviewSession.tsx`
    (card display, show-answer, 4 rating buttons w/ keyboard 1–4, "cards left" progress,
    done state, loading/error states, failed-save retry banner).
  - Generate: `src/pages/generate.astro` + `src/components/generation/GeneratorView.tsx`
    (paste textarea + char counter capped at 10,000, candidate cards with accept/reject/edit,
    sticky save bar, success/error states).
  - Deck: `src/pages/cards/index.astro` + `src/components/deck/DeckView.tsx`
    (rows with Q/A + edit/delete + delete-confirm, empty state, loading/error, load-more).
  - Manual: `src/pages/cards/new.astro` + `src/components/manual/ManualCardForm.tsx`
    (Question + Answer textareas, success state).
  - Auth: `src/pages/auth/{signin,signup,forgot-password,reset-password,confirm-email}.astro`
    + `src/components/auth/*` (`SignInForm`, `SignUpForm`, `ForgotPasswordForm`,
    `ResetPasswordForm`, shared `FormField`, `PasswordToggle`, `SubmitButton`, `ServerError`).
  - Landing: `src/components/Welcome.astro` (cosmic gradient hero + feature cards),
    rendered by `src/pages/index.astro`.
- **The landing page and the dark theme are now in the mockup** (`#landingView` +
  the `html.dark` palette in `app-mockup.html`) — both are approved references, not
  extrapolation. **Only the dashboard** is still derived from the established system.

## Desired End State

Every user-visible surface of the app renders in the Sage language — warm paper
ground, a single moss-green accent, cozy radii, soft warm shadows, serif for studied
content and sans for chrome, a green sage-leaf logo, and the app named
**"Sage Flashcards."** A unified sticky header with tab navigation (Generate / Review /
Deck) is present on all authed app pages on desktop; on mobile it collapses to a **fixed
bottom tab bar** (Generate / Review / Deck / Add) and every screen reflows to a
comfortable, thumb-friendly single-column layout. A **light/dark theme toggle** lets the
user switch between the warm light theme and a **dark warm theme** (same layout, darker
palette); the choice persists and respects the OS preference on first visit. An **EN/PL
language toggle** switches all UI chrome between English and Polish (user card content is
untouched); the choice persists in a cookie. All happy-path **and** edge states (empty,
zero-due, loading, error, retry, success) are styled in both themes and localized in both
languages, and verified on mobile and desktop.

**Verification of end state:** Navigating every route in the running dev server
visually matches `design/app-mockup.html` in light theme, and the dark theme renders the
same layout with the dark warm palette; the toggle persists across reloads with no
flash-of-wrong-theme; the EN/PL toggle re-labels all chrome and persists across reloads;
**every screen works at mobile widths** (bottom tab bar, no horizontal scroll, tappable
targets) as well as desktop; `npm run lint` and `npm run build` pass; no grayscale/cosmic
remnants and no untranslated hardcoded UI strings remain; no behavior regressions in review
flow, generation, CRUD, or auth.

### Key Discoveries:

- All theming is one file (`src/styles/global.css`) — the token remap is concentrated
  there, and because shadcn primitives read semantic tokens, they restyle for free
  once the tokens change (`button.tsx`, `card.tsx`, `textarea.tsx` consume `bg-primary`/
  `bg-card`/`border-input`/`ring-ring`).
- The mockup's full token system, palette hexes, shadows, logo SVG, and per-component
  CSS are the source of truth in `design/app-mockup.html` (the `:root` token block; the
  `#sageLeaf` `<symbol>` + `sageGrad` gradient; component CSS throughout). Locate blocks by
  selector/symbol name, not line number — the mockup is still being extended, so line
  positions drift.
- The app is branded "10x Astro Starter" today, so the rename touches only
  `Layout.astro:10`, `Welcome.astro:35`, page `<title>` props, and the new header wordmark.
- `Topbar.astro` and `Welcome.astro` carry hardcoded dark/cosmic classes that must be
  replaced wholesale, not token-swapped.
- shadcn tokens are OKLch; the Sage palette is specified in hex — both are valid CSS
  color values, so hex can be assigned directly to the `--token` custom properties.

## What We're NOT Doing

- **No behavior, routing, data-layer, or API changes.** Keyboard handling, FSRS
  scheduling, generation limits, CRUD, and auth flows stay exactly as-is.
- **No translation of user data** — flashcard content (questions/answers, generated
  candidates) stays exactly as the user wrote it. Only app-authored UI chrome is localized.
- **No per-locale URL routing** — i18n is cookie-based (`locals.locale` + `t()`), not
  Astro's `/en/`,`/pl/` URL-prefix routing. No route restructuring.
- **No locale on the AI generation prompt** — drafted cards are not forced into the UI
  language; that's a separate concern.
- **No gamification** (streaks, points, progress UI) — PRD non-goal.
- **No search / filter / tags** in the deck — PRD non-goal.
- **No internal-name rename** — `package.json`, `package-lock.json`, README,
  `wrangler.jsonc` worker name (`10x-cards`), `src/types.ts` comment, and the git repo
  stay as they are. In-app brand only.
- **No Cloudflare deploy-URL or repo rename** — separate user decision.
- **No self-hosted fonts** — keep the approved system stacks.
- **No pixel-regression tooling** — render-verify is manual visual comparison +
  lint/build (no test runner is configured in this project).

## Implementation Approach

Build bottom-up so each layer rests on a finished one:

1. **Tokens first** (`global.css`) — the single foundation. Once the Sage palette is
   mapped onto the shadcn semantic tokens and the extra Sage roles are added, every
   downstream component inherits the warm look automatically; per-component work is
   then only about *structure* and *the roles shadcn doesn't have* (serif content,
   rating chips, the green card spine).
2. **Shell + primitives next** — the chrome that wraps every screen (header, logo,
   layout wrapper) and the shared building blocks (button/card/textarea variants, kbd).
3. **Screens in dependency order** — Review (the richest, most-designed screen and the
   keyboard-driven core), then Generate, then Deck + Manual (shared card-CRUD idiom),
   then Auth + the two unshown screens (landing + dashboard) derived from the system.

Each screen phase restyles **all** of that screen's states inline (loading, empty,
error, retry, success) so no screen ever ships half-warm. After each phase, render-verify
against the mockup before moving on.

## Critical Implementation Details

- **Token remap must be total — no orphan grayscale.** Every `--token` in `:root`
  (including `--muted-foreground`, `--secondary`, `--ring`, chart + sidebar tokens) must
  receive a Sage value or be removed; a shadcn consumer reading an unmapped token will
  render off-palette. The `@theme inline` block stays structurally intact (it just maps
  names) but must gain `--color-*` entries for any *new* Sage roles that components
  reference via Tailwind utilities.
- **Two `accent` meanings collide.** shadcn's `--accent` is a *muted hover background*
  (paired with `--accent-foreground`); Sage's accent is the *bold green*. Map shadcn
  `--primary` → Sage green (`#6BA06A`) so primary buttons are green, and repurpose
  shadcn `--accent`/`--accent-foreground` to the soft green tint (`--accent-soft`
  `#EEF3E2`) used for hover/avatar/AI-badge backgrounds. Document the mapping in a
  comment so it isn't "fixed" later.
- **Fonts are tokens, not just `font-family`.** Add `--font-serif` / `--font-sans` /
  `--font-mono` as `@theme` keys so Tailwind exposes `font-serif`/`font-sans` utilities;
  studied-content elements opt into `font-serif`, chrome stays default sans.
- **The answer-unfold is the one motion moment.** Review's reveal animates height +
  fade (mockup `.answer` / `.answer.show`). Everything else is quiet.
  All transitions must be disabled under `prefers-reduced-motion` (a global rule, as in
  the mockup's global `prefers-reduced-motion` rule).
- **`prefers-reduced-motion` belongs in `global.css`**, applied globally, so every
  screen inherits it without per-component effort.
- **Theme toggle must not flash.** The `.dark` class lives on `<html>` and is set
  **before first paint** by a tiny inline script in `<head>` (reads `localStorage`
  theme, else falls back to `prefers-color-scheme`). Putting it in a deferred React
  island would cause a flash-of-wrong-theme on every load. The existing
  `@custom-variant dark (&:is(.dark *))` in `global.css` is **kept** (not deleted) and
  is the mechanism the dark palette hangs off.
- **Dark theme is the same layout, darker palette — not a redesign.** Only token
  *values* change in `.dark`; structure, radii, spacing, fonts, and the green accent
  identity stay. The mockup now carries a dark reference (`html.dark` block); its values
  are anchor starting points — fine-tune during render-verify.
- **Mobile is first-class, not an afterthought.** Below ~640px the desktop top tabs and
  the "New card" button are hidden and a **fixed bottom tab bar** (Generate / Review /
  Deck / Add) takes over — it's the same routes, a second nav presentation. Reserve bottom
  space on `main` (~96px) so content isn't hidden behind the bar; respect
  `env(safe-area-inset-bottom)` for notched phones; float the Generate save-bar above the
  bar. Hide keyboard hints (`kbd`, the hint rows) on touch/small widths — they're
  meaningless without a keyboard. Keep all tap targets ≥44px and never allow horizontal
  scroll. The mockup's `@media (max-width: 640px)` block + `.bottombar` are the reference.
- **i18n: locale resolved server-side, `t()` everywhere, no flash.** Middleware reads a
  `locale` cookie (falling back to `Accept-Language`, default `en`) and sets
  `context.locals.locale`; `<html lang>` is rendered from it (SSR, so no flash). Astro
  pages read `locals.locale`; React islands receive `locale` (or a built `t`) as a prop —
  islands have no access to `locals`, so the locale must be threaded in at the island
  boundary. **The toggle sets the cookie and does a full page reload so SSR re-renders with
  the new locale** — not a client-side soft-swap. Astro doesn't re-render `client:load`
  islands on the client, and the SSR `<html lang>` + `.astro` chrome (header, banner) only
  update on a server round-trip anyway, so a reload is the architecturally correct path.
  **Consequence to accept: a reload discards in-progress island state** — an unsaved
  in-progress generation (accepted/rejected candidates not yet saved) is the painful case;
  a mid-review session and an open edit-in-place row also reset. Language switching mid-task
  is rare, so this is acceptable — but the toggle must reload (no soft-swap that would
  silently leave islands stale).
  Message catalogs live in `src/i18n/{en,pl}.ts`; `t(key)` is a tiny lookup with an `en`
  fallback. The approved EN/PL strings already exist in the mockup's `I18N` object — port
  them verbatim. Polish plural rules matter (1 / 2–4 / 5+ forms) for count strings — port
  the mockup's `plPL`/`cardNoun` helpers.

---

## Phase 1: Design Tokens & Global Foundation

### Overview

Replace the grayscale shadcn token system in `src/styles/global.css` with the Sage
palette (light), add the Sage-specific roles, rewrite `.dark` into a **dark warm Sage
palette**, wire fonts and the warm body background, and remove the cosmic utility. This
is the foundation for every later phase.

### Changes Required:

#### 1. Sage palette → token remap

**File**: `src/styles/global.css`

**Intent**: Assign the approved Sage hex values to the shadcn semantic tokens so
primitives inherit the new look, replacing all OKLch grayscale values in `:root`.

**Contract**: In `:root`, map at minimum: `--background`→`#F7EEE0` (ground),
`--card`/`--popover`→`#FFFDF8` (surface), `--foreground`/`--card-foreground`→`#2D2922`
(text), `--muted-foreground`→`#6B6155` (text-soft), `--primary`→`#6BA06A` (accent),
`--primary-foreground`→`#fff`, `--secondary`→`#FFFDF8`, `--accent`→`#EEF3E2`
(accent-soft), `--accent-foreground`→`#538152`, `--destructive`→`#C75B45`,
`--border`/`--input`→`#EBDFCD` (line), `--ring`→`#538152` (accent-deep), `--radius`→`22px`.
Reassign or remove the chart + sidebar tokens (unused by app screens — drop them).
Keep a one-line comment recording the shadcn-accent→Sage-tint repurpose.

#### 2. Sage-specific roles + scales

**File**: `src/styles/global.css`

**Intent**: Add the roles the Sage design needs that shadcn has no slot for, so
components can reference them.

**Contract**: Add custom properties for `--ground-deep` `#EFE2CF`, `--surface`
`#FFFDF8`, `--text-soft` `#6B6155`, `--text-faint` `#9C8F7E`, `--accent-deep` `#538152`,
`--accent-warm` `#A9C56A`, `--accent-soft` `#EEF3E2`, `--icon` `#8A7550`, `--icon-soft`
`#B7A582`, rating colors `--r-again`/`--r-hard`/`--r-good`/`--r-easy`
(`#C75B45`/`#C5872F`/`#4F9A5E`/`#3E938C`), and the three shadows `--shadow-card`/
`--shadow-lift`/`--shadow-soft` (copy from the mockup `:root` `--shadow-*` declarations). Expose the
ones used as Tailwind color utilities via new `--color-*` entries in `@theme inline`.

#### 3. Fonts

**File**: `src/styles/global.css`

**Intent**: Register the approved system serif/sans/mono stacks as theme tokens so
`font-serif`/`font-sans` utilities exist.

**Contract**: Add `--font-serif`, `--font-sans`, `--font-mono` in `@theme` using the
exact stacks from `DESIGN-FOUNDATION.md` (Iowan/Palatino/Georgia serif; system-ui sans;
ui-monospace mono). Default body font = sans.

#### 4. Body background + base layer

**File**: `src/styles/global.css`

**Intent**: Apply the warm paper background gradient and global motion guard;
remove the dark navy cosmic utility.

**Contract**: Replace the `body` base rule to set the radial + linear warm gradient
(the mockup `body` background rule) with `background-attachment: fixed`, and keep
`text-foreground`. **Delete** `@utility bg-cosmic`. **Keep** the `@custom-variant dark`
line (line 4) — the dark theme depends on it. Add a global
`@media (prefers-reduced-motion: reduce)` rule disabling transitions/animations.

#### 5. Dark Sage palette

**File**: `src/styles/global.css`

**Intent**: Rewrite the `.dark { … }` block (currently the grayscale-inverted palette)
into a **dark warm Sage** palette — the same token roles as light, with darker warm
values — so the dark theme is the identical layout in darker colors.

**Contract**: In `.dark`, override the same token set defined in changes #1–#2 with
dark-warm values. Derive from the light palette (anchor starting points, tuned during
render-verify): `--background`→`#211C15` (warm dark ground), `--ground-deep`→`#191510`,
`--card`/`--surface`/`--popover`→`#2A241C` (elevated warm surface), `--foreground`/
`--card-foreground`→`#F0E8DA` (warm off-white text), `--muted-foreground`/`--text-soft`→
`#B5A892`, `--text-faint`→`#8C7F6C`, `--line`/`--border`/`--input`→
`#3A332A` (dark hairline), `--primary`/`--accent-green`→`#7FB47E` (slightly lifted green
so it pops on dark), `--accent-deep`/`--ring`→`#6BA06A`, `--accent`(soft tint)→a dark
green-tinted surface `#26301F`, `--icon`→`#B7A582`, `--icon-soft`→`#6E6450`. Brighten the
rating colors a step for contrast on dark (e.g. `--r-again`→`#D86E57`, `--r-good`→`#62B071`).
Define a dark variant of the body gradient (deep warm browns) under a `.dark body` rule.
Shadows: deepen/soften (higher opacity, near-black warm rgba). The block keeps the
**same token names** — only values differ.

### Success Criteria:

#### Automated Verification:

- Astro types regenerate cleanly: `npx astro sync`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Dev server boots and the body shows the warm paper gradient (no white/cosmic background).
- An existing shadcn button renders green; an existing card renders on warm surface
  with the cozy radius — confirming token inheritance works before any component edits.
- Manually adding `class="dark"` to `<html>` flips the same layout to the dark warm
  palette (dark ground, warm-light text, green accent still reads) — no grayscale,
  no off-palette tokens.
- No console errors about missing CSS custom properties.

**Implementation Note**: After this phase and automated verification pass, pause for
manual confirmation before Phase 2.

---

## Phase 2: App Shell & Shared Primitives

### Overview

Build the chrome that wraps every authed screen — the Sage leaf logo, the sticky
header with tab navigation, a **light/dark theme toggle**, and an avatar/sign-out menu,
an authed-page layout wrapper, the **"Sage Flashcards" rename**, and the leaf favicon —
plus the shared primitive tweaks (button/card/textarea variants, kbd) the screens reuse.

### Changes Required:

#### 1. Sage leaf logo

**File**: `src/components/brand/SageLeaf.tsx` (new) and `src/components/brand/SageLeaf.astro` (new, optional)

**Intent**: A single reusable leaf mark, so the gradient + veins are defined once.

**Contract**: Port the mockup's `<g id="sageLeaf">` + `sageGrad` linear gradient
into a self-contained SVG component accepting a `size`/`class` prop.
Provide whichever form (React and/or Astro) the consumers need (header is Astro; auth
cards may be Astro). Include the soft drop-shadow treatment from the mockup `.brand .logo`.

#### 2. App shell header

**File**: `src/components/AppHeader.astro` (new), replacing `src/components/Topbar.astro`

**Intent**: The unified sticky header — brand + leaf + tab nav (Generate/Review/Deck) +
"New card" + avatar — on all authed app pages, replacing the dark-glass Topbar.

**Contract**: Sticky translucent header (mockup `header`) with: brand
(`SageLeaf` + serif "Sage Flashcards" wordmark linking to Generate — compact "Sage" is
acceptable if width-constrained, confirm in render-verify), `<nav>` of three tab links to
`/generate`, `/review`, `/cards` with an `active` state driven by the current path, a
ghost "New card" button → `/cards/new`, a **theme-toggle button** (sun/moon, see change #6),
an **EN/PL language toggle** (segmented pill, see change #7), and an avatar (user initials)
that opens a small menu containing Sign out (`POST /api/auth/signout`) — the sign-out
behavior currently in `Topbar.astro`. All chrome labels go through `t()`. Tabs and toggles
use `getByRole`-friendly markup (real links/buttons with accessible labels). Delete
`Topbar.astro` and update its importers.

#### 3. Authed layout wrapper

**File**: `src/layouts/AppLayout.astro` (new), wrapping `src/layouts/Layout.astro`

**Intent**: One wrapper that renders the header + the centered `main` container so each
authed page stops hand-rolling its own header.

**Contract**: Compose `Layout` (for `<head>`/title) + `AppHeader` + a `<main>` matching
the mockup (`max-width: 720px; margin: 0 auto`, mockup `main`). Accept a `title` prop
passed through to `Layout`. Authed pages (`review`, `generate`, `cards/index`,
`cards/new`, `dashboard`) switch to this wrapper in their respective phases.

#### 4. Rename to "Sage" + favicon

**Files**: `src/layouts/Layout.astro`, `public/` (favicon asset)

**Intent**: Make the app read as "Sage Flashcards" everywhere user-visible and ship a
sage-leaf favicon.

**Contract**: Change `Layout.astro:10` default title to `"Sage Flashcards"`; replace the
favicon with the leaf — add `public/favicon.svg` generated from the mockup `#sageLeaf`
art and update the `<link rel="icon">` in `Layout.astro:18` to
`type="image/svg+xml" href="/favicon.svg"` (keep `favicon.png` as a PNG fallback `<link>`
or replace it with a leaf PNG). Per-page `<title>` props are updated to read
"… — Sage Flashcards" (or remain page-specific) as each screen is touched. No
`package.json`/README/worker changes.

#### 5. shadcn primitive tweaks

**Files**: `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/textarea.tsx`

**Intent**: Add the small structural affordances the Sage screens reuse (gradient
primary button, serif option for card content, focus ring) and ensure the existing
`dark:*` utility classes still make sense under the dark Sage palette.

**Contract**: Confirm `button` primary maps to the green gradient look (via tokens or a
variant) and the focus-visible ring uses `--ring`/`--accent-deep`. Card stays
token-driven. Add a `kbd` styling primitive (or shared class) matching the mockup `kbd`.
Because dark mode is **kept**, review the components' existing `dark:*`
classes (e.g. `textarea.tsx` `dark:bg-input/30`, `button.tsx` destructive/outline
`dark:` tweaks): keep those that still read correctly against the dark Sage tokens,
adjust any that don't, and remove only those that are redundant once tokens carry the
dark values. Do not change component APIs — only classes.

#### 6. Theme toggle + no-flash init

**Files**: `src/layouts/Layout.astro` (inline init script in `<head>`),
`src/components/ThemeToggle.tsx` (new, React island in the header)

**Intent**: Let the user switch light/dark, persist the choice, respect the OS
preference on first visit, and apply the theme before paint so there's no flash.

**Contract**: Add a tiny **inline** script in `Layout.astro` `<head>` (runs before
first paint, before the stylesheet renders content) that sets `document.documentElement.classList`
`dark` when `localStorage.theme === "dark"`, or when `theme` is unset and
`matchMedia("(prefers-color-scheme: dark)")` matches. Add `<ThemeToggle/>` — a sun/moon
icon button (lucide `Sun`/`Moon`) rendered in `AppHeader`, with an accessible label
(e.g. "Switch to dark theme"); on click it toggles the `.dark` class on `<html>` and
writes `localStorage.theme`. Default (no stored choice) follows the OS preference.

#### 7. i18n infrastructure + language toggle

**Files**: `src/i18n/en.ts`, `src/i18n/pl.ts`, `src/i18n/index.ts` (new — `t()` + plural
helpers), `src/middleware.ts` (locale resolution), `src/components/LanguageToggle.tsx`
(new), and the layout (`<html lang>` + thread `locale` to islands)

**Intent**: Stand up the cookie-based i18n system and the EN/PL toggle so all UI chrome
can be localized; this phase wires the shell + shared strings, and each screen phase adds
its own keys.

**Contract**: Message catalogs `en.ts`/`pl.ts` keyed by the same keys as the mockup's
`I18N` object (port verbatim); `index.ts` exports `t(locale, key)` with an `en` fallback
plus the `plPL`/`cardNoun` plural helpers from the mockup. `middleware.ts` reads a
`locale` cookie (fallback `Accept-Language`, default `en`), sets `context.locals.locale`,
and the layout renders `<html lang={locale}>` (SSR → no flash). Astro pages read
`locals.locale`; React islands receive `locale` as a prop at their mount boundary.
`LanguageToggle` is the EN/PL segmented pill in `AppHeader` (and the landing nav) that
writes the cookie and triggers a **full page reload** (not a client-side swap) so SSR
re-renders in the new locale — accept that this resets in-progress island state (see the
i18n note in Critical Implementation Details). Convert the shared
chrome strings (nav, buttons, the existing hardcoded-Polish config `Banner`) to `t()`.

#### 8. Mobile bottom tab bar + responsive shell

**Files**: `src/components/BottomNav.astro` (new), `src/layouts/AppLayout.astro`,
`src/styles/global.css` (responsive rules)

**Intent**: Give the shell a proper mobile form — a fixed bottom tab bar and a responsive
`AppLayout` — so the app is thumb-friendly on phones, per the bottom-bar decision.

**Contract**: `BottomNav` renders the four items (Generate / Review / Deck / Add → `/generate`,
`/review`, `/cards`, `/cards/new`) as real links with icon + label and a current-path
`active` state, fixed to the viewport bottom, shown only ≤640px (the desktop header tabs +
"New card" hide at that breakpoint). `AppLayout` includes it and reserves bottom padding on
`main`; honor `env(safe-area-inset-bottom)`. Port the mockup's `@media (max-width: 640px)`
rules into `global.css` (header/main padding, hide `kbd`/hints, full-width hero/closing
CTAs, save-bar offset). Tap targets ≥44px; no horizontal scroll at 320px.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- The Sage header (leaf + "Sage Flashcards" wordmark + 3 tabs + New card + theme toggle
  + avatar) renders on an authed page and matches `app-mockup.html`; the active tab is
  highlighted per current route.
- Avatar menu opens and Sign out works (signs the user out).
- **Theme toggle** flips light↔dark and the choice **persists across a reload with no
  flash** of the wrong theme; with no stored choice, the OS preference is honored.
- **Language toggle** flips EN↔PL: the shell chrome (nav, New card, avatar menu, the
  config banner) re-labels, `<html lang>` updates, and the choice persists across reloads.
- **Mobile shell:** at ≤640px the top tabs/New-card hide and the **bottom tab bar**
  appears (Generate / Review / Deck / Add) with a working active state; content clears the
  bar (no overlap), and there's no horizontal scroll down to 320px.
- Browser tab shows "Sage Flashcards" + the leaf favicon.
- No grayscale/cosmic remnants in the shared chrome in either theme.

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Review Screen

### Overview

Restyle the review experience — the richest, most-designed screen — into the warm
study-object language, including all of its states. Behavior (keyboard, scheduling) is
untouched.

### Changes Required:

#### 1. Review page shell

**File**: `src/pages/review.astro`

**Intent**: Adopt the app shell wrapper and Sage page header; drop the bespoke header.

**Contract**: Render via `AppLayout` (title "Review"). Move the existing keyboard-hint
copy into the warm layout; mount `ReviewSession` in the centered main.

#### 2. Review session + states

**File**: `src/components/review/ReviewSession.tsx`

**Intent**: Restyle the card as a physical study object and all session states to match
the mockup, preserving every behavior and the keyboard handlers.

**Contract**: Apply the mockup's structure/classes (in `design/app-mockup.html`: the review
CSS block + the `renderR`/`renderDone` markup):
- Progress bar (`.progress`/`.bar`/`.bar > i`) replacing "X cards left" text bar.
- Card with green spine (`.card::before`), serif question, **answer-unfold** on reveal
  (`.answer` → `.answer.show`, height+fade), "Show answer" button with `Space` kbd.
- 4 rating chips (`.rate` w/ `data-r` rating colors, dot + name + number kbd), keyboard
  hint row.
- Done state (`.done` seal + "All caught up" + next-review copy + actions).
- **Zero-due Review variant** (no cards due on entry) — a warm empty/done-style state.
- Loading/spinner state in warm language.
- **Failed-save retry banner** keeps its warm-styled equivalent (the existing amber alert
  → warm error treatment with retry button).
Rating buttons keep `getByRole`-friendly markup. Do not alter the keyboard logic,
scheduling calls, or state machine.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Review screen (card, progress, reveal-unfold, rating chips, done) matches the mockup.
- Keyboard flow still works: `Space` reveals, `1–4` rate and advance.
- Reduced-motion: with the OS setting on, the answer appears without animating.
- Zero-due, loading, and failed-save-retry states all render in the warm language.
- The screen renders correctly in **both light/dark themes, both languages (EN/PL), and at
  mobile widths** (full-width card, tappable rating chips, keyboard hints hidden on touch);
  all review chrome (labels, rating names, done-state copy, counts incl. Polish plurals)
  comes from `t()` — no hardcoded UI strings remain.
- No regressions in review/scheduling behavior.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Generate Screen

### Overview

Restyle the AI generation flow — paste box, candidate review, save bar — and its states.

### Changes Required:

#### 1. Generate page shell

**File**: `src/pages/generate.astro`

**Intent**: Adopt the app shell wrapper + Sage page header ("Turn your notes into cards").

**Contract**: Render via `AppLayout` (title "Generate flashcards"); mount `GeneratorView`.

#### 2. Generator view + states

**File**: `src/components/generation/GeneratorView.tsx`

**Intent**: Restyle the input box, character counter, candidate cards, and sticky save
bar to the mockup, preserving the generation behavior and the 10,000-char cap.

**Contract**: Apply mockup classes (`.gen-box`, `.area`, `.gen-actions`, `.cand-head`,
`.cand` w/ `is-accepted`/`is-rejected`, `.chip` accept/reject/edit, `.savebar`; the generate
CSS block, markup, and the candidate JS shape):
- Paste textarea on warm ground with char counter ("N / 10,000 characters") that warns
  past the cap (existing behavior).
- Candidate cards with serif Q/A, Keep (green) / Edit / Reject (red) chips, accepted/
  rejected visual states.
- Sticky "Save N cards to deck" bar with the live accepted count; disabled at zero.
- Success state ("saved", generate-more) and error messages in warm language.
Keep all generation/accept/reject/edit logic and the cap unchanged.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Generate screen (paste box, counter, candidate cards, save bar) matches the mockup.
- Counter warns past 10,000 chars; accept/reject toggles update the save count; save
  works end-to-end.
- Success + error states render warm.
- The screen renders correctly in **both light/dark themes, both languages (EN/PL), and at
  mobile widths** (full-width textarea + candidates, save bar floats above the bottom bar);
  all generate chrome (counter, candidate labels, chips, save bar) comes from `t()`.
- No regression in generation behavior.

**Implementation Note**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Deck & Manual Create

### Overview

Restyle the deck list and the manual-card form — both card-CRUD surfaces sharing the
same warm idiom — including empty and edit states.

### Changes Required:

#### 1. Deck page shell

**File**: `src/pages/cards/index.astro`

**Intent**: Adopt the app shell wrapper + Sage page header ("Your deck").

**Contract**: Render via `AppLayout` (title "Your deck"); mount `DeckView`.

#### 2. Deck view + states

**File**: `src/components/deck/DeckView.tsx`

**Intent**: Restyle the rows, origin badges, action icons, and all states to the mockup,
preserving CRUD + load-more behavior.

**Contract**: Apply mockup classes (`.deck-tools`, `.row`, `.rq`/`.ra`, `.origin` ai/manual,
`.iconbtn`/`.iconbtn.danger`, `.empty`; the deck CSS block, markup, and `mountDeck`):
- Rows with serif Q + muted serif A (1-line clamp), counts header ("N cards · M from AI").
- AI badge (green tint, sparkle) vs Manual badge (soft violet `#F0EAF7`/`#7B5EA8`, pen) —
  driven by existing card origin data.
- Hover edit/delete as **beige** icon buttons (`--icon`), delete-hover → red tint;
  on touch/mobile (no hover) the actions stay **always visible**. `lucide-react` icons
  (project already uses it).
- Edit-in-place and the two-step delete-confirm keep their behavior, restyled warm.
- **Empty state** (`.empty`) with leaf-toned icon + "Generate flashcards" CTA.
- Loading/error/load-more states warm.

#### 3. Manual create page + form

**Files**: `src/pages/cards/new.astro`, `src/components/manual/ManualCardForm.tsx`

**Intent**: Restyle the manual card form and its success state.

**Contract**: Page via `AppLayout` (title "New card", header "Add a card"). Form uses
the mockup `.gen-box` + `.field` + char-hint footer + primary/ghost buttons (markup lines
327–347). Question + Answer textareas keep their labels, placeholders, char limits, and
save behavior; success state ("Card added", add-another) restyled warm.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Deck rows, AI/Manual badges, beige hover icons, and counts match the mockup.
- Empty deck shows the warm empty state; edit-in-place and delete-confirm work and look warm.
- Manual create form matches the mockup; saving a card works and shows the warm success state.
- Deck and manual create render correctly in **both light/dark themes, both languages
  (EN/PL), and at mobile widths** (rows reflow, edit/delete actions remain tappable without
  hover); chrome (counts, badges, action titles, field labels, buttons) comes from `t()`.
- No CRUD or load-more regressions.

**Implementation Note**: Pause for manual confirmation before Phase 6.

---

## Phase 6: Auth, Landing & Dashboard

### Overview

Bring the remaining surfaces into Sage: all five auth pages/forms, the marketing landing
page (dropping the cosmic gradient), and the dashboard hub. Landing + dashboard are
derived from the established system since they weren't in the mockups.

### Changes Required:

#### 1. Auth pages + forms

**Files**: `src/pages/auth/{signin,signup,forgot-password,reset-password,confirm-email}.astro`,
`src/components/auth/{SignInForm,SignUpForm,ForgotPasswordForm,ResetPasswordForm,FormField,PasswordToggle,SubmitButton,ServerError}.tsx`

**Intent**: Restyle every auth screen into the warm centered-card layout with the leaf
logo, applying the same language across the whole flow.

**Contract**: Apply the mockup auth CSS (`#authView`, `.auth-card`, `.auth-row`,
`.auth-foot`, `.linkback`; the auth CSS block + markup): centered card on warm
ground, `SageLeaf` + serif "Sage Flashcards" wordmark, serif heading, sans sub, warm inputs (token-driven
via Phase 1/2 primitives), accent-deep links ("Forgot password?", "Create an account").
Shared `FormField`/`PasswordToggle`/`SubmitButton`/`ServerError` restyled once so all forms
inherit. Keep all form behavior, validation, icons (`lucide-react` Mail/Lock/Eye), and
server-error handling. Apply consistently to sign-up, confirm-email, forgot-password, and
reset-password (S-05 flow).

#### 2. Landing page (Welcome)

**File**: `src/components/Welcome.astro` (+ `src/pages/index.astro`)

**Intent**: Replace the dark cosmic landing with the **approved warm Sage landing page**
(now designed in the mockup — `#landingView` in `app-mockup.html`).

**Contract**: Remove the cosmic gradient/orbs/star-field and the `bg-cosmic` usage; rebuild
to match the mockup landing: a minimal nav (`SageLeaf` + "Sage Flashcards" wordmark, theme
toggle, "Sign in"), a warm hero (large leaf, serif value-prop headline with green accent
word, lede, primary **"Get started" → `/auth/signup`**, secondary **"Sign in" →
`/auth/signin`**, reassurance line), a 3-step **how-it-works** strip (paste → Sage drafts →
review on schedule, each a `.step` card with `--accent-soft` icon tile), and a closing CTA
card. Use the Sage primitives/tokens so it themes in light + dark.

#### 3. Dashboard

**File**: `src/pages/dashboard.astro`

**Intent**: Restyle the authed hub into Sage using the app shell + warm cards.

**Contract**: Render via `AppLayout` (title "Dashboard"). Restyle the cards-due summary +
nav links + sign-out into warm surface cards / Sage buttons. Behavior unchanged.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`
- No remaining cosmic utility usage: `grep -rn "bg-cosmic\|0a0e1a\|border-white/10" src` returns nothing.

#### Manual Verification:

- Sign-in matches the mockup; sign-up, confirm-email, forgot-password, and reset-password
  all share the warm language and still work end-to-end.
- Landing page renders warm (no cosmic), reads "Sage Flashcards," and links work.
- Dashboard renders warm via the app shell.
- Auth, landing, and dashboard all localize EN/PL (incl. the landing hero/how-it-works/CTA)
  and reflow cleanly on mobile (stacked hero, full-width CTAs, single-column how-it-works).
- Full walkthrough of every route shows a cohesive Sage Flashcards app in **both light/dark
  themes, both languages, and on mobile + desktop**, with no grayscale/cosmic remnants and
  no untranslated UI strings.

**Implementation Note**: Final phase — after confirmation, the redesign is complete.

---

## Testing Strategy

No automated test runner is configured in this project; `lint` + `build` are the
validation gates, supplemented by per-screen manual render-verify.

### Automated (every phase):

- `npx astro sync` (Phase 1, after token/theme edits), `npm run lint`, `npm run build`.
- Targeted `grep` guards for removed artifacts (`bg-cosmic`, cosmic hexes, glass classes).

### Manual render-verify (per screen):

1. Run `npm run dev`.
2. Open the screen and compare side-by-side against `design/app-mockup.html`.
3. Exercise the screen's behavior (keyboard in Review, accept/reject in Generate,
   CRUD in Deck/Manual, submit in Auth) to confirm no regression.
4. Toggle OS reduced-motion and confirm the answer-unfold (and only it) is the motion moment.
5. Flip the theme toggle and confirm the screen reads correctly in both light and dark.
6. Flip the EN/PL toggle and confirm all chrome localizes (and Polish plurals read right).
7. Shrink to a phone viewport (~375px) and confirm the layout reflows: bottom tab bar,
   no horizontal scroll, tappable targets, content clears the bottom bar.

### Cross-cutting manual checks (end):

- Every route walked once for visual cohesion in both themes, both languages, and on
  mobile (~375px) + desktop.
- The theme and language toggles persist across reloads with no flash of the wrong theme.
- The mobile bottom tab bar navigates correctly and shows the active screen.
- Keyboard/focus-visible rings appear in accent green.
- No grayscale/cosmic remnant, no hardcoded/untranslated UI string, and no horizontal
  scroll, anywhere.

## Performance Considerations

- Zero-dependency system fonts → no font network cost or FOUT.
- `background-attachment: fixed` on the warm gradient is fine for these page sizes;
  watch for jank only if a very long scroll surface appears (none currently). **iOS Safari
  has known quirks with `background-attachment: fixed`** (jump/repaint on scroll, viewport
  sizing) — verify it on a real iOS device during the mobile render-verify; if it
  misbehaves, fall back to a non-fixed gradient (`background-attachment: scroll`) on small
  widths.
- Removing `bg-cosmic` slightly shrinks the CSS; the dark Sage palette reuses the same
  token names, so it adds only one extra value block plus a small inline init script.
- The no-flash theme script is inline and tiny (sets one class) — negligible cost, and
  it prevents a flash-of-wrong-theme that a deferred island would cause.

## Migration Notes

- No data migration. This is presentation-only plus the navigation shell, the i18n
  layer, and the theme toggle.
- Structural changes to verify: the `Topbar.astro` → `AppHeader.astro` swap + the
  `AppLayout` wrapper (update every importer of `Topbar`); the `middleware.ts` addition of
  `locals.locale` (alongside the existing user resolution); and threading `locale` to every
  React island at its mount point (islands can't read `locals`).

## References

- Design foundation: `context/changes/ui-redesign/design/DESIGN-FOUNDATION.md`
- Source-of-truth mockup: `context/changes/ui-redesign/design/app-mockup.html`
- Earlier Review iteration: `context/changes/ui-redesign/design/review-mockup.html`
- Change identity: `context/changes/ui-redesign/change.md`
- Current tokens: `src/styles/global.css:6-124`
- Current shell: `src/layouts/Layout.astro`, `src/components/Topbar.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Design Tokens & Global Foundation

#### Automated

- [x] 1.1 Astro types regenerate cleanly: `npx astro sync` — 09ba152
- [x] 1.2 Linting passes: `npm run lint` — 09ba152
- [x] 1.3 Production build succeeds: `npm run build` — 09ba152

#### Manual

- [x] 1.4 Body shows the warm paper gradient (no white/cosmic background) — 09ba152
- [x] 1.5 An existing shadcn button renders green; a card renders on warm surface with cozy radius — 09ba152
- [x] 1.6 Adding `class="dark"` to `<html>` flips the same layout to the dark warm palette (no grayscale/off-palette) — 09ba152
- [x] 1.7 No console errors about missing CSS custom properties — 09ba152

### Phase 2: App Shell & Shared Primitives

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 2c1cb75
- [x] 2.2 Build succeeds: `npm run build` — 2c1cb75

#### Manual

- [x] 2.3 Sage header (leaf + "Sage Flashcards" wordmark + 3 tabs + New card + theme toggle + avatar) matches the mockup; active tab highlights per route — 2c1cb75
- [x] 2.4 Avatar menu opens and Sign out works — 2c1cb75
- [x] 2.5 Theme toggle flips light↔dark and persists across reload with no flash; OS preference honored when unset — 2c1cb75
- [x] 2.6 Language toggle flips EN↔PL: shell chrome + config banner re-label, `<html lang>` updates, choice persists — 2c1cb75
- [x] 2.7 Mobile (≤640px): top tabs/New-card hide, bottom tab bar appears with active state, content clears the bar, no horizontal scroll to 320px — 2c1cb75
- [x] 2.8 Browser tab shows "Sage Flashcards" + the leaf favicon — 2c1cb75
- [x] 2.9 No grayscale/cosmic remnants in the shared chrome in either theme — 2c1cb75

### Phase 3: Review Screen

#### Automated

- [x] 3.1 Linting passes: `npm run lint` — 61ab57c
- [x] 3.2 Build succeeds: `npm run build` — 61ab57c

#### Manual

- [x] 3.3 Review screen (card, progress, reveal-unfold, rating chips, done) matches the mockup — 61ab57c
- [x] 3.4 Keyboard flow works: `Space` reveals, `1–4` rate and advance — 61ab57c
- [x] 3.5 Reduced-motion: answer appears without animating when OS setting is on — 61ab57c
- [x] 3.6 Zero-due, loading, and failed-save-retry states render warm — 61ab57c
- [x] 3.7 Screen renders correctly in both light/dark themes, both languages (EN/PL), and at mobile widths; all chrome via `t()` incl. Polish plurals — 61ab57c
- [x] 3.8 No regressions in review/scheduling behavior — 61ab57c

### Phase 4: Generate Screen

#### Automated

- [x] 4.1 Linting passes: `npm run lint` — a76ae18
- [x] 4.2 Build succeeds: `npm run build` — a76ae18

#### Manual

- [x] 4.3 Generate screen (paste box, counter, candidate cards, save bar) matches the mockup — a76ae18
- [x] 4.4 Counter warns past 10,000 chars; accept/reject updates save count; save works — a76ae18
- [x] 4.5 Success + error states render warm — a76ae18
- [x] 4.6 Screen renders correctly in both light/dark themes, both languages (EN/PL), and at mobile widths; all chrome via `t()` — a76ae18
- [x] 4.7 No regression in generation behavior — a76ae18

### Phase 5: Deck & Manual Create

#### Automated

- [x] 5.1 Linting passes: `npm run lint`
- [x] 5.2 Build succeeds: `npm run build`

#### Manual

- [x] 5.3 Deck rows, AI/Manual badges, beige hover icons, and counts match the mockup
- [x] 5.4 Empty deck shows the warm empty state; edit-in-place and delete-confirm work and look warm
- [x] 5.5 Manual create form matches the mockup; saving works and shows the warm success state
- [x] 5.6 Deck and manual create render correctly in both light/dark themes, both languages (EN/PL), and at mobile widths (actions tappable without hover); all chrome via `t()`
- [x] 5.7 No CRUD or load-more regressions

### Phase 6: Auth, Landing & Dashboard

#### Automated

- [ ] 6.1 Linting passes: `npm run lint`
- [ ] 6.2 Build succeeds: `npm run build`
- [ ] 6.3 No remaining cosmic utility usage in `src`

#### Manual

- [ ] 6.4 Sign-in matches the mockup; all auth flows share the warm language and still work
- [ ] 6.5 Landing renders warm (no cosmic), reads "Sage Flashcards," links work
- [ ] 6.6 Dashboard renders warm via the app shell
- [ ] 6.7 Landing/auth/dashboard render correctly in both light/dark themes, both languages (EN/PL), and on mobile (stacked hero, full-width CTAs, single-column how-it-works)
- [ ] 6.8 Full route walkthrough shows a cohesive Sage Flashcards app in both themes, both languages, and on mobile + desktop, with no grayscale/cosmic remnants, no untranslated UI strings, and no horizontal scroll
