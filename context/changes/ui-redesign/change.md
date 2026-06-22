---
change_id: ui-redesign
title: UI redesign — warm "Sage" visual identity across all screens
status: implementing
created: 2026-06-22
updated: 2026-06-22
archived_at: null
---

## Notes

Full UI redesign of the app, replacing the current dark glassmorphism / "cosmic"
look with a **warm, cozy, professional** visual identity. **Phase A (design) is
done and approved by the user**; this change exists to carry **Phase B
(implementation in real code)**, to be continued in a later session.

**Workflow context:** this is a design-first change. The visual design was
produced and approved as rendered HTML mockups (the 10x `artifact-design`
process), NOT designed in code. Phase B re-creates the approved design in the
real Astro + React + shadcn/ui codebase, screen by screen, with render-verify.

### Approved design decisions (locked in Phase A)

See `design/DESIGN-FOUNDATION.md` for the full token system, palette hexes,
typography, logo, and per-screen notes. Headlines:

- **New app name: "Sage Flashcards"** (was "10xCards"). Warm/green identity; the
  "Sage" half drives the leaf logo. Renaming touches `<head>` titles, in-app copy,
  the header wordmark, and the favicon — but **NOT** `package.json` / README / the
  Cloudflare worker (`10x-cards`) / repo: the **deploy URL + repo rename are a
  separate user decision**, out of scope for the in-app work.
- **Direction:** warm paper ground + a single **moss-green** accent; cozy/soft
  (large radii, soft warm shadows). Serif for *studied content* (card Q/A),
  sans for *app chrome*.
- **Light/dark toggle:** ships a **dark theme** — the same layout with a darker warm
  palette (same token names, darker values; green accent lifted to pop on dark).
  Default follows OS preference; choice persists; applied before first paint (no
  flash). See the `html.dark` block + toggle in `app-mockup.html`.
- **EN/PL language toggle:** UI chrome is localized English/Polish via a `t()` dictionary
  + locale cookie (no per-locale URLs); user card content is never translated. Approved
  EN+PL copy lives in the mockup's `I18N` object. Also tidies the existing hardcoded PL
  config banner.
- **Mobile (first-class):** below ~640px a **fixed bottom tab bar** (Generate / Review /
  Deck / Add) replaces the top tabs; every screen reflows to a thumb-friendly single column
  (touch targets ≥44px, no horizontal scroll, keyboard hints hidden on touch). See the
  mockup's `@media (max-width: 640px)` block + `.bottombar`.
- **Landing page (pre-login):** a new warm marketing page (hero + how-it-works +
  CTA, primary "Get started" → sign-up) replacing the old "cosmic" Welcome.
- **Logo:** green sage leaf (filled gradient + veins), defined once as an SVG
  symbol. **Favicon:** the leaf (ship `public/favicon.svg`).
- **Icons:** flat line icons (SVG, `currentColor`) in **dark beige** for neutral
  actions; semantic actions (Keep=green, Reject=red, ratings) keep their colors.

### Approved mockups (source of truth for Phase B)

- `design/app-mockup.html` — the full app: **Landing**, Generate, Review, Deck,
  Manual create, Sign-in/Sign-up, **light + dark themes**, **EN + PL languages**, and a
  **responsive mobile layout with a bottom tab bar** (theme + language toggles in the
  header / landing nav). This is the canonical reference, and its `I18N` object is the
  approved EN/PL copy.
- `design/review-mockup.html` — earlier single-screen Review iteration (kept for
  history; superseded by app-mockup.html).

### Resolved decisions

- **Font strategy:** keep the **system stacks** (Iowan/Palatino/Georgia serif;
  system-ui sans) — zero dependency, zero cost, no CDN. No self-hosted typeface.

### Resuming Phase B

The plan is written — run `/10x-implement ui-redesign phase 1`. The plan sequences:
design tokens incl. dark palette (global.css) → shell + primitives + theme toggle →
screens in order (Review → Generate → Deck+Manual → Auth + Landing + Dashboard) →
render-verify each in both themes. Current screens live under `src/pages/` and
`src/components/` (e.g. `src/components/review/ReviewSession.tsx`, `src/styles/global.css`).
