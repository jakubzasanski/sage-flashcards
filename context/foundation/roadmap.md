---
project: 10xCards
version: 1
status: draft
created: 2026-06-19
updated: 2026-06-22
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline (2026-06-19).
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

10xCards bets that AI-generated flashcards have crossed the "good enough" quality threshold, so professionals studying for a deadline can paste source text and accept AI-distilled cards instead of hand-crafting them — turning spaced repetition from "too expensive to start" into "usable when it matters most." The product **wedge** — the one trait that, if removed, makes 10xCards indistinguishable from a generic note-taking tool — is that pasted prose becomes a reviewable set of *atomic* Q/A cards in a single user-perceived operation, and the user keeps most of them without editing. Everything in this roadmap exists to make and prove that one capability.

## North star

**S-01: User can paste source text, accept/edit/reject AI-generated candidate cards, and save the accepted ones to their deck** — this is the validation milestone because the product's entire hypothesis (75% of AI cards accepted) can only be measured once a real user runs generation and decides per card.

> The **north star** here is the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as its prerequisites allow, because every other slice only matters if this one works. It sits behind exactly one foundation (`F-01`, the cards table) and the already-present auth; nothing else gates it.

## At a glance

| ID    | Change ID                    | Outcome (user can …)                                              | Prerequisites | PRD refs                  | Status   |
| ----- | ---------------------------- | ---------------------------------------------------------------- | ------------- | ------------------------- | -------- |
| F-01  | card-persistence-foundation  | (foundation) user-owned cards persist with RLS + origin tracking | —             | Access Control; No-data-loss | done     |
| S-01  | first-ai-cards-to-deck       | paste text → accept AI cards → save to deck                       | F-01          | US-01, FR-008, FR-009, FR-010 | done     |
| S-02  | spaced-repetition-review     | run a keyboard-driven spaced-repetition review session           | F-01, S-01    | US-02, FR-015, FR-016     | done     |
| S-03  | deck-management              | browse, edit (schedule-preserving), and delete cards             | F-01          | FR-012, FR-013, FR-014    | done     |
| S-04  | manual-card-creation         | create a flashcard manually (question + answer)                  | F-01          | FR-011                    | done     |
| S-05  | account-access-recovery      | reset a forgotten password; auth flows meet PRD criteria         | —             | FR-003, FR-004, FR-005, FR-006, FR-007 | planned  |
| S-06  | anonymous-trial-and-claim    | generate cards with no account; claim them on sign-up            | F-01, S-01    | FR-001, FR-002            | blocked  |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                         | Chain                          | Note                                                                 |
| ------ | ----------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| A      | Generation & review (wedge)   | `F-01` → `S-01` → `S-02`       | The north-star chain; ship this first under the `speed` goal.        |
| B      | Deck authoring & management   | `S-03` / `S-04`                | Both branch off `F-01` (join Stream A at `F-01`); parallel pair.     |
| C      | Account lifecycle             | `S-05`                         | Standalone — no foundation prerequisite; auth baseline already live. |
| D      | Anonymous onboarding (contested) | `S-06`                      | Branches off `S-01`; blocked pending Open Roadmap Question #1.       |

## Baseline

What's already in place in the codebase as of `2026-06-19` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands + Tailwind 4 + shadcn/ui (starter).
- **Backend / API:** partial — only auth routes exist (`src/pages/api/auth/{signin,signup,signout}.ts`); no card, generation, or review endpoints.
- **Data:** absent — Supabase client wired (`src/lib/supabase.ts`), but no `supabase/migrations/`, no domain schema, no flashcard/deck/review tables.
- **Auth:** partial — Supabase SSR + middleware (`src/middleware.ts`, `PROTECTED_ROUTES=/dashboard`); sign-up, sign-in, sign-out, and email-confirm present; **password reset absent**.
- **Deploy / infra:** present — live on Cloudflare Workers (`10x-cards.*.workers.dev`, deployed 2026-06-17); CI = sync + lint + build (no auto-deploy).
- **Observability:** partial — `wrangler.jsonc` `observability.enabled=true`; no app-level logging or error tracking. Left as-is (no NFR forces more under the `speed` goal).

## Foundations

### F-01: Card persistence foundation

- **Outcome:** (foundation) user-owned flashcards persist — a cards table with per-user row-level security and an AI-vs-manual origin flag; the first migration and the project's RLS pattern are established.
- **Change ID:** card-persistence-foundation
- **PRD refs:** Access Control (per-user decks, flat single role); Guardrail: No data loss.
- **Unlocks:** S-01 (save accepted cards), S-03 (browse/edit/delete), S-04 (manual create); the origin flag enables the success metric "75% of cards created via AI."
- **Prerequisites:** —
- **Parallel with:** S-05 (auth completion has no data dependency)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced first because the data layer is absent and every card-facing slice depends on it. Scope is capped to the card entity + ownership + origin; spaced-repetition schedule columns are deferred to S-02 (progressive disclosure) so this stays a minimal enabler, not a "build the whole data layer" project.
- **Status:** done

## Slices

### S-01: First AI cards to deck (north star)

- **Outcome:** user can paste source text, trigger AI generation (input/card caps shown before submit), review each candidate to accept/edit/reject independently, and bulk-save the accepted cards to their deck — with the in-progress session surviving a refresh until saved or discarded.
- **Change ID:** first-ai-cards-to-deck
- **PRD refs:** US-01, FR-008, FR-009, FR-010; NFR (first candidate within 15s p95; progress shown >2s); Guardrail (source-text privacy).
- **Prerequisites:** F-01
- **Parallel with:** S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - Which off-the-shelf LLM provider/model backs generation? — Owner: project lead. Block: no (a single default can be chosen in `/10x-plan`; tracked roadmap-wide as Open Question #2).
  - How is source-text privacy enforced end-to-end (no operator-readable logs, no training use, no retention past the request)? — Owner: team. Block: no.
- **Risk:** This is the wedge and the riskiest assumption — if AI card quality doesn't clear the 75%-accept bar, nothing downstream matters, so it ships first. Edge-runtime caveat (LLM SDK must be fetch-based / workerd-compatible per infrastructure.md) is a planning concern, not a sequencing blocker.
- **Status:** done

### S-02: Spaced-repetition review session

- **Outcome:** user can start a review session where an off-the-shelf scheduler picks due-card order, reveal each answer, rate recall on a four-level scale (Again/Hard/Good/Easy) with the schedule updating after each rating, and resume mid-session after navigation/refresh/network loss without losing progress — fully keyboard-driven.
- **Change ID:** spaced-repetition-review
- **PRD refs:** US-02, FR-015, FR-016; NFR (keyboard-first review loop; card transitions <300ms p95); Guardrail (no data loss / resumable session).
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Which off-the-shelf spaced-repetition library/algorithm (FR-015 leaves the choice to the tech-stack step)? — Owner: project lead. Block: no (selectable in `/10x-plan`).
- **Risk:** Completes the primary success criterion's full loop (sign-up → generate → review). Extends F-01's schema with schedule columns at the point they're first exercised. Sequenced right after the north star because under `speed` the must-have launch path is generate-then-review, not deck-browsing.
- **Status:** done

### S-03: Deck management

- **Outcome:** user can browse all cards in their deck via pagination/virtualized scroll, edit any card's question/answer without resetting its review schedule, and delete a card behind an explicit confirmation prompt (permanent, no restore).
- **Change ID:** deck-management
- **PRD refs:** FR-012, FR-013, FR-014; NFR (list browse / card edit <300ms p95).
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Pure CRUD over the F-01 entity; low risk. Schedule-preserving edit (FR-013) must not touch the columns S-02 adds — coordinate if S-02 and S-03 land out of order. No search/filter (PRD non-goal) keeps scope tight under `speed`.
- **Status:** done

### S-04: Manual card creation

- **Outcome:** user can create a flashcard manually by entering a question and an answer, saved to their deck with manual origin.
- **Change ID:** manual-card-creation
- **PRD refs:** FR-011.
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02, S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Smallest card-creation path; independent of the AI generation slice. The manual-origin write feeds the "75% via AI" metric's denominator, so it shares F-01's origin flag.
- **Status:** done

### S-05: Account access — complete & recoverable

- **Outcome:** user can request an emailed password-reset link and complete the reset (the one absent auth flow), and the existing sign-up, email-verify, sign-in, and sign-out flows are confirmed to meet the PRD's acceptance criteria — including the 7-day default session.
- **Change ID:** account-access-recovery
- **PRD refs:** FR-003, FR-004, FR-005, FR-006, FR-007.
- **Prerequisites:** —
- **Parallel with:** F-01, S-01, S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Net-new work is password reset (FR-006, absent today); the rest is verifying baseline auth against PRD criteria. Reset rides Supabase's existing email path (confirmation emails already work in production), so no new email infrastructure is needed — keeping it a small, independent slice. Without FR-006 the "no data loss" guardrail is hollow (a forgotten password = a lost deck), so it stays must-have even under `speed`.
- **Status:** planned

### S-06: Anonymous-trial generation + claim-on-signup

- **Outcome:** first-time visitor can paste source text and generate AI cards without an account, and when they sign up in the same browser session any trial cards are imported into the new account.
- **Change ID:** anonymous-trial-and-claim
- **PRD refs:** FR-001, FR-002.
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Does the anonymous-trial path survive the timeline, or is it deferred to v2? (PRD Open Question #1) — Owner: project lead. Block: yes.
- **Risk:** Reuses S-01's generation capability, so it's cheap once the north star lands — but its scope is explicitly contested by the PRD's only Open Question against a blown deadline under the `time` blocker. Held `blocked` rather than parked because the team hasn't decided to drop it; resolving Open Question #1 flips it to `ready` (keep) or moves it to `## Parked` (defer).
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                  | Ready for `/10x-plan` | Notes |
| ---------- | --------------------------- | ----------------------------------------------------- | --------------------- | ----- |
| F-01       | card-persistence-foundation | Cards table with per-user RLS and origin tracking      | yes                   | Foundation; unlocks the north star. Run `/10x-plan card-persistence-foundation` |
| S-01       | first-ai-cards-to-deck      | Generate AI cards from pasted text and save to deck    | no                    | North star; ready once F-01 is done. Pick LLM provider in plan. |
| S-02       | spaced-repetition-review    | Keyboard-driven spaced-repetition review session       | no                    | Needs F-01 + S-01. Pick SRS library in plan. |
| S-03       | deck-management             | Browse, edit, and delete deck cards                    | planned               | Needs F-01 (done). Plan written → run `/10x-implement deck-management`. |
| S-04       | manual-card-creation        | Create a flashcard manually                            | planned               | Needs F-01 (done). Plan written → run `/10x-implement manual-card-creation`. |
| S-05       | account-access-recovery     | Password reset + auth acceptance-criteria verification | planned               | No prerequisites; auth baseline already live. Plan written → run `/10x-implement account-access-recovery`. |
| S-06       | anonymous-trial-and-claim   | Anonymous trial generation + claim on sign-up          | no                    | Blocked by Open Question #1 (scope-vs-timeline). |

## Open Roadmap Questions

1. **Does the anonymous-trial path (FR-001 + FR-002) survive the 3-week timeline, or is it deferred to v2?** Carried verbatim from PRD Open Question #1; the deadline (2026-06-15) has now passed with no product code built, sharpening the question. — Owner: project lead. Block: S-06.
2. **Which off-the-shelf LLM provider/model backs AI generation?** Left open by `tech-stack.md` ("provider choice is a tech-stack decision"). Spans S-01 and S-06. A single default (e.g. via OpenRouter) can be chosen during `/10x-plan` without blocking. — Owner: project lead. Block: no (affects S-01, S-06).

## Parked

- **Custom spaced-repetition algorithm** — Why parked: PRD §Non-Goals; integrate an off-the-shelf scheduler, do not write scheduling logic.
- **Import of formatted documents (PDF/DOCX/HTML/EPUB)** — Why parked: PRD §Non-Goals; input is plain text pasted into a textarea only.
- **Sharing, collaboration, team workspaces, public/discoverable decks** — Why parked: PRD §Non-Goals; every deck is private to its owner.
- **Mobile-native apps and external learning-platform integrations** — Why parked: PRD §Non-Goals; web only, no platform plumbing.
- **Search, filter, or tagging in deck browse** — Why parked: PRD §Non-Goals; simple paginated list for MVP, search is v2.
- **Soft-delete / archive / restore / undo for deleted cards** — Why parked: PRD §Non-Goals; hard delete with confirmation only.
- **Analytics dashboard, retention metrics, streak/progress UI** — Why parked: PRD §Non-Goals; success criteria are operator-measured, not user-facing in MVP.
- **In-product model-picker UI** — Why parked: PRD §Non-Goals; a single default generation model is used invisibly.

## Done

- **S-02: user can start a review session where an off-the-shelf scheduler picks due-card order, reveal each answer, rate recall on a four-level scale (Again/Hard/Good/Easy) with the schedule updating after each rating, and resume mid-session after navigation/refresh/network loss without losing progress — fully keyboard-driven.** — Archived 2026-06-21 → `context/archive/2026-06-21-spaced-repetition-review/`. Lesson: —.
- **F-01: (foundation) user-owned flashcards persist — a cards table with per-user row-level security and an AI-vs-manual origin flag; the first migration and the project's RLS pattern are established.** — Archived 2026-06-21 → `context/archive/2026-06-19-card-persistence-foundation/`. Lesson: —.
- **S-01: paste text → accept AI cards → save to deck** — Archived 2026-06-21 → `context/archive/2026-06-19-first-ai-cards-to-deck/`. Lesson: —.
- **S-03: user can browse all cards in their deck via pagination/virtualized scroll, edit any card's question/answer without resetting its review schedule, and delete a card behind an explicit confirmation prompt (permanent, no restore).** — Archived 2026-06-22 → `context/archive/2026-06-21-deck-management/`. Lesson: —.
- **S-04: user can create a flashcard manually by entering a question and an answer, saved to their deck with manual origin.** — Archived 2026-06-22 → `context/archive/2026-06-21-manual-card-creation/`. Lesson: —.
