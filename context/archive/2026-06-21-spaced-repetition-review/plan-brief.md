# Keyboard-Driven Spaced-Repetition Review Session — Plan Brief

> Full plan: `context/changes/spaced-repetition-review/plan.md`

## What & Why

Add the **review** half of the product's core loop: a logged-in user starts a session, sees due cards
one at a time, reveals the answer, and rates recall on a four-level scale — with an off-the-shelf
scheduler picking timing and the schedule updating after every rating. This is roadmap slice **S-02**
(the north-star chain), implementing PRD US-02 / FR-015 / FR-016. Without it, generate→save (S-01) is a
dead end; this completes sign-up → generate → **review**, the product's primary success criterion.

## Starting Point

F-01 and S-01 have shipped: a `flashcards` table (RLS + per-user policies + grants), `POST /api/generate`
and `POST /api/cards`, and a `GeneratorView` island. The flashcards migration **deliberately deferred
schedule columns to S-02**. There is no review endpoint, no scheduling code, and no keyboard-driven UI
pattern anywhere in the codebase. A mature 3-layer test harness (Vitest unit + integration, Playwright
e2e) with an established cookbook is already in place.

## Desired End State

A user opens `/review`, and entirely by keyboard — **Space** to reveal, **1/2/3/4** for
Again/Hard/Good/Easy — works through their due cards, each transition feeling instant. Every rating
persists server-side before the card is done, so refresh / navigation / network loss resumes at the
next un-rated due card with nothing lost. An "all caught up" screen shows when the next card is due; the
dashboard links in with a due-count.

## Key Decisions Made

| Decision                          | Choice                                              | Why (1 sentence)                                                                                  | Source |
| --------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| SRS library                       | `ts-fsrs`                                           | Modern FSRS, pure-TS (workerd-safe), four-level rating maps to its `Rating` enum natively.        | Plan   |
| Schedule storage                  | Explicit typed columns on `flashcards`              | Indexable `due` query, type-safe, matches F-01's explicit-column migration style.                 | Plan   |
| Session model                     | Stateless (no session entity)                       | Schedule on each row is the source of truth → no-data-loss/resume satisfied for free.             | Plan   |
| Scheduling compute location       | Server-side, in the rating endpoint                 | Single source of truth, can't be spoofed by the client, keeps the algorithm off the wire.         | Plan   |
| Due queue                         | `due <= now()`, oldest-first, capped at 100         | FSRS owns timing; cap keeps the fetch/UI bounded for the <300ms NFR.                               | Plan   |
| Rating latency strategy           | Optimistic advance + background persist             | Transition feels instant regardless of network; persistence still guaranteed before "done".       | Plan   |
| New cards                         | Due immediately on creation (via column defaults)   | Completes the generate→review loop in one sitting; needs no S-01 insert-path change.               | Plan   |
| Keyboard scheme                   | Space reveals, 1–4 rate                             | Anki convention users know; 1–4 maps directly to the FSRS `Rating` enum.                          | Plan   |
| Entry point                       | New protected `/review` page + island              | Mirrors the `/generate` page+island precedent; clean URL for refresh-resume.                      | Plan   |
| Empty state                       | "All caught up" + next-due time                     | Closes the loop gracefully; next-due nudge supports the 7-day-return secondary goal.              | Plan   |
| Test coverage                     | Scheduling unit + handler-property + RLS integration | Covers the no-data-loss guardrail and the F-01 grant/RLS lesson; no E2E this slice.               | Plan   |

## Scope

**In scope:** FSRS schedule columns + migration/backfill; pure scheduling service (`ts-fsrs`); due-queue
+ rating API endpoints (server-side scheduling, RLS-guarded); keyboard-driven `/review` island with
optimistic advance and resume; dashboard due-count entry; unit + handler + RLS tests.

**Out of scope:** review-history/log table; persisted session entity; custom scheduling logic; daily
new-card limits; deck browse/edit/manual-create (S-03/S-04); mobile/touch loop; E2E test.

## Architecture / Approach

Bottom-up, four layers: **schema** (columns + due index, defaults that mirror `createEmptyCard()`) →
**pure scheduling service** (`ts-fsrs` wrapper, unit-tested, no I/O) → **API** (`GET /api/review/due`
fetches the capped queue once; `POST /api/review/rate` re-reads the card under RLS, computes the next
schedule, persists it — the only place the algorithm runs and the client trust boundary) → **UI**
(`/review` island fetches the queue once, drives reveal→rate→advance by keyboard, advances optimistically
while persisting in the background, re-appends `Again` cards to the queue end). No `localStorage`; resume
is a re-query of `due <= now()`.

## Phases at a Glance

| Phase                              | What it delivers                                          | Key risk                                                            |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Data model & new-card defaults  | FSRS columns + due index + backfill; regenerated types    | Column defaults must exactly mirror `createEmptyCard()`'s zeros.   |
| 2. Scheduling service              | Pure `ts-fsrs` wrapper + unit tests                       | Correct rating→`Rating` mapping; deterministic via injected `now`. |
| 3. Review API endpoints            | Due-queue + rating endpoints; handler + RLS tests         | Rating endpoint must derive schedule from the row, not the body.   |
| 4. Keyboard-driven review UI       | `/review` island, dashboard entry, empty state            | Optimistic advance must never silently drop a failed persist.      |

**Prerequisites:** F-01 + S-01 shipped (done); local Supabase running for integration tests.
**Estimated effort:** ~3–4 sessions across 4 phases (schema + service are small; API and UI are the bulk).

## Open Risks & Assumptions

- "Again" cards re-appear via in-memory re-append (not a server re-query); acceptable and bounded, but a
  deliberate divergence from a strict `due <= now()` re-query mid-session.
- `ts-fsrs` default parameters (with fuzz) are assumed fine for MVP — no per-user tuning.
- S-03 (schedule-preserving edit) must not reset these columns if it lands out of order — flagged in the plan.

## Success Criteria (Summary)

- A user completes a full review session — reveal, rate, advance — using only the keyboard.
- Every rating persists before the next card; refresh/navigation/network-loss loses no progress and
  resumes at the next un-rated due card.
- New and existing cards are immediately reviewable; the empty state shows when to return.
