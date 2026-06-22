# UI Redesign — "Sage" Visual Identity (Phase B) — Plan Brief

> Full plan: `context/changes/ui-redesign/plan.md`
> Design foundation: `context/changes/ui-redesign/design/DESIGN-FOUNDATION.md`
> Source-of-truth mockup: `context/changes/ui-redesign/design/app-mockup.html`

## What & Why

Re-create the approved **Sage** visual identity — warm paper ground, a single
moss-green accent, cozy radii, soft shadows, serif for studied content, a sage-leaf
logo, app named **"Sage Flashcards"** — in the real Astro/React/shadcn codebase, with a
**light/dark theme toggle** (dark = same layout, darker warm palette). Phase A locked the
design as rendered mockups; this is the **implementation half**: build that look in code,
screen by screen, with a render-verify gate against the mockup.

## Starting Point

The app is functional but wears the starter's look: neutral-grayscale shadcn tokens +
a dark "cosmic" landing, all theming centralized in `src/styles/global.css`. It's
branded "10x Astro Starter" (not "10xCards") in the UI. Navigation is a dark-glass
`Topbar` + a `dashboard` hub + per-page headers. Dark mode exists. All feature screens
(review, generate, deck, manual, 5 auth pages) are built and behavior-complete.

## Desired End State

Every surface renders in the warm Sage language with a unified sticky header + tab nav
(Generate/Review/Deck), the leaf logo, and "Sage" branding. A light/dark toggle ships a
dark warm theme (same layout, darker palette; persists + respects OS) and an EN/PL toggle
localizes all UI chrome. All states — happy path **and** empty/zero-due/loading/error/
retry/success — are warm in both themes, both languages, and on mobile + desktop. No
behavior changes; navigating every route visually matches `app-mockup.html`.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Visual identity (palette, type, logo, per-screen) | Sage — warm paper + moss green | Approved in Phase A | Design |
| Token strategy | Remap shadcn semantic tokens onto Sage + add extra Sage roles | Primitives restyle for free; one source of truth | Plan |
| Fonts | Keep approved system stacks (serif/sans), no self-host | Zero dependency/cost; mockups approved with these; no CDN allowed | Design + Plan |
| App name | "Sage Flashcards" (titles, hero, wordmark, favicon) | User decision | Plan |
| Dark mode | Light/dark toggle; dark = same layout, darker warm palette; persists + respects OS | User decision; keep `.dark` infra, no-flash inline init | Plan |
| Languages | EN/PL toggle, UI chrome only; dictionary + cookie (`locals.locale`, `t()`), no per-locale URLs | User decision; least disruptive for an authed SSR app; also tidies existing hardcoded PL | Plan |
| Mobile nav | Fixed **bottom tab bar** (Generate/Review/Deck/Add); top tabs hide ≤640px | User decision ("must be the best"); thumb-reachable, native-app feel for a study tool | Plan |
| App shell | Build the mockup's header + tab nav, replace `Topbar` | Delivers the approved navigation chrome | Plan |
| Unshown screens (landing, dashboard) | Restyle both, derive from the system | No screen ships looking old; cohesive end-to-end | Plan |
| Net-new states | Style every state inline, per screen | Each screen truly complete before moving on | Plan |
| Rename scope | In-app brand only (titles/hero/logo/favicon) | Matches approved scope; deploy/repo rename separate | Design + Plan |
| Verification | Render-verify each screen vs mockup + lint/build | Catches drift immediately; matches design-first workflow | Plan |

## Scope

**In scope:** `global.css` token remap + Sage roles + fonts + warm background; a **dark
Sage palette** in `.dark` + **light/dark toggle** (no-flash); **EN/PL i18n** (catalogs +
`t()` + `locals.locale` cookie + language toggle, UI chrome only); remove `bg-cosmic`;
leaf logo + **leaf favicon**; app-shell header + tab nav + theme/language toggles + avatar
menu; authed layout wrapper; a **mobile bottom tab bar + fully responsive layouts** (touch
targets, no horizontal scroll); **"Sage Flashcards" rename** in UI; restyle Review, Generate,
Deck, Manual, all auth, landing, dashboard, and all their states in both themes, both
languages, and on mobile + desktop.

**Out of scope:** any behavior/routing/data/API change; gamification; deck search/filter/
tags; `package.json`/README/`wrangler.jsonc` worker (`10x-cards`)/repo rename; deploy-URL
rename; self-hosted fonts; pixel-regression tooling.

## Architecture / Approach

Bottom-up: **tokens first** (`global.css` — the single foundation; shadcn primitives
inherit the warm look once tokens change) → **shell + primitives** (header, logo, layout
wrapper, button/card/textarea/kbd tweaks) → **screens in dependency order** (Review →
Generate → Deck+Manual → Auth+landing+dashboard). Each screen restyles all its states
inline and is render-verified against `app-mockup.html` before the next. **i18n** runs
orthogonally: Phase 2 stands up the `t()` catalogs + `locals.locale` cookie + language
toggle, and each screen phase extracts its own strings into `en.ts`/`pl.ts` (the approved
copy is already in the mockup's `I18N` object — port verbatim). **Responsive** is also
cross-cutting: Phase 2 adds the mobile bottom tab bar + the `@media (max-width: 640px)`
rules, and every screen phase verifies its layout at phone widths.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Tokens & global foundation | Light + dark Sage palettes mapped onto tokens + roles, fonts, warm bg, cosmic removed | An orphan unmapped token renders off-palette; shadcn `--accent` collision; deriving dark values w/o a dark mockup |
| 2. App shell & primitives | Leaf logo, sticky header (desktop tabs) + **mobile bottom tab bar** + theme & language toggles + avatar menu, responsive `AppLayout`, i18n infra (`t()` + `locals.locale`), "Sage Flashcards" rename, leaf favicon, primitive tweaks | Two nav presentations (top tabs / bottom bar); toggles must not flash; islands need `locale` threaded in; content must clear the bottom bar; sign-out must keep working |
| 3. Review screen | Warm study-object card, unfold reveal, rating chips, all states | Preserving keyboard logic + the one motion moment |
| 4. Generate screen | Paste box, candidate cards, sticky save bar, states | Keeping the 10,000-char cap + accept/reject logic intact |
| 5. Deck & Manual | Warm rows, AI/Manual badges, beige icons, empty state, manual form | CRUD / delete-confirm / load-more regressions |
| 6. Auth, landing & dashboard | All auth flows warm; new landing page (per mockup); dashboard restyled | Only dashboard is extrapolated (not in mockup) — needs render review |

**Prerequisites:** Dev server runnable (`npm run dev`); the approved mockup +
design foundation on hand (present). No new dependencies.
**Estimated effort:** ~4–6 sessions across 6 phases (Phase 1–2 foundational, 3–6 one
screen-group each).

## Open Risks & Assumptions

- Token remap must be **total** — any unmapped shadcn token (chart/sidebar/`--ring`)
  renders off-palette; the plan drops the unused ones explicitly.
- shadcn's `--accent` (muted hover bg) ≠ Sage's bold accent — the plan maps `--primary`→
  green and repurposes `--accent`→soft tint; must stay documented so it isn't "fixed."
- The **landing page and dark theme are now in the mockup** (approved references); only
  the **dashboard** is derived by extrapolation — the user reviews that render.
- The dark mockup gives **anchor** values, not pixel-final ones — fine-tune the dark
  palette per screen during render-verify.
- i18n is **chrome-only**: a PL user's English card content stays English (it's user data).
  React islands can't read `locals` — `locale` must be threaded in as a prop at each mount.
- Polish needs correct plural forms (1 / 2–4 / 5+) for count strings — the mockup's
  `plPL`/`cardNoun` helpers are ported, not re-derived.
- No automated visual regression — relies on manual per-screen comparison.

## Success Criteria (Summary)

- Every route visually matches `app-mockup.html`; the app reads as "Sage Flashcards" with the leaf logo + favicon.
- The light/dark toggle works, persists, and respects the OS preference with no flash; every screen reads well in both themes.
- The EN/PL toggle localizes all UI chrome (with correct Polish plurals) and persists; no hardcoded UI strings remain.
- Every screen works at phone widths: bottom tab bar, tappable targets, no horizontal scroll — as polished as desktop.
- All behavior (review/keyboard, generation, CRUD, auth) works unchanged; `lint` + `build` pass.
- No grayscale or cosmic remnants anywhere; all edge states are warm in both themes, both languages, and on mobile.
