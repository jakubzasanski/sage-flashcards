# Keyboard-Driven Spaced-Repetition Review Session — Implementation Plan

## Overview

Complete the product's core success loop (sign-up → generate → **review**) by adding FSRS-backed
scheduling to the existing `flashcards` table, two review API endpoints, and a fully keyboard-driven
review-session UI. This is roadmap slice **S-02** (Stream A, the north-star chain), implementing
PRD US-02, FR-015, and FR-016. F-01 (card persistence) and S-01 (generate→save) have shipped.

The session is **stateless**: a "session" is just the live set of cards where `due <= now()`. Each
rating is computed server-side via `ts-fsrs`, persisted immediately, and the next card is shown
optimistically. There is no session entity to reconcile — the schedule on each row is the single
source of truth, which is what satisfies the "no data loss / resumable session" guardrail for free.

## Current State Analysis

- **`flashcards` table** (`supabase/migrations/20260619123010_create_flashcards.sql`): `id, user_id,
  question, answer, source('ai'|'manual'), created_at, updated_at`. RLS enabled with 4 per-user
  policies + `grant select, insert, update, delete ... to authenticated` (line 29) + a
  `moddatetime` trigger on `updated_at`. Index on `(user_id, created_at desc)`. **The migration
  explicitly defers schedule columns to S-02** (line 4 comment).
- **API surface** (`src/pages/api/`): `POST /api/generate` (source text → candidates) and
  `POST /api/cards` (bulk-save accepted cards, hardcodes `source:'ai'`, forces `user_id` server-side).
  No review/due endpoints. All routes `prerender = false`, zod-validated, auth via `context.locals.user`.
- **Types** (`src/types.ts`): `Flashcard` / `FlashcardInsert` / `FlashcardUpdate` derived from
  `src/db/database.types.ts`; `CardSource`, generation DTOs.
- **UI** (`src/components/generation/GeneratorView.tsx`): paste→review→save island with `localStorage`
  session persistence (`generate-session-v1`). **No keyboard-shortcut pattern exists anywhere** in the
  codebase; no toast library; no optimistic-update pattern; no `src/components/hooks/` directory yet.
- **Routing**: `PROTECTED_ROUTES = ["/dashboard", "/generate"]` in `src/middleware.ts`; protected pages
  redirect unauthenticated users to `/auth/signin`. `/generate.astro` is the precedent for a
  protected page hosting a `client:load` React island.
- **shadcn/ui installed**: `Button`, `Card`, `Textarea` only (`src/components/ui/`).
- **Test harness** (mature — Phases 1–3 of `test-plan.md` complete): Vitest projects `unit` +
  `integration`, Playwright e2e. Cookbook conventions (`test-plan.md` §6): co-located `*.test.ts`
  units; handler-property tests via `makeApiContext()` (`test/support/api-context.ts`); two-user RLS
  isolation via `flashcardsRequest()` with each user's **own token, never service-role**
  (`test/integration/rls-flashcards.test.ts`, `test/support/supabase.ts`).
- **Lesson** (`context/foundation/lessons.md`): new RLS tables need explicit grants + a two-user
  isolation test. We are **adding columns to an already-granted table**, so no new grant is needed —
  but the new columns must still be covered by a two-user isolation assertion.

### Key Discoveries:

- New cards need no insert-path change: DB-level column defaults that mirror `createEmptyCard()`
  (due=now, state=New, zeros, `last_review` null) make S-01's existing `/api/cards` insert produce
  immediately-due cards automatically. `src/pages/api/cards.ts:59` inserts only
  `question/answer/source/user_id` — the rest defaults.
- `ts-fsrs` `Card` shape maps 1:1 to explicit columns; `f.next(card, now, rating)` returns
  `{ card, log }`. The `log` (review history) is **discarded** — no history table (PRD non-goal: no
  analytics).
- The `cards.test.ts` "owner/source forcing" test is the exact template for proving the rating
  endpoint cannot be spoofed: client supplies only `{cardId, rating}`; server derives `user_id` and
  re-reads the card under RLS.

## Desired End State

A logged-in user with due cards can open `/review`, see one card at a time, press **Space** to reveal
the answer, press **1/2/3/4** (Again/Hard/Good/Easy) to rate it, and immediately advance to the next
card — entirely by keyboard. Each rating's new schedule is persisted server-side before the card is
considered done. Refreshing, navigating away, or losing the network mid-session loses no progress:
on return, the user resumes at the next un-rated due card (re-query of `due <= now()`). When the queue
is empty, an "all caught up" screen shows when the next card is due. The dashboard shows a due-count
entry point.

**Verification**: `npm run lint` + `npm run build` pass; `npm test` (scheduling unit + handler-property)
passes; `npm run test:integration` (two-user RLS over the new columns) passes against local Supabase;
manual keyboard walkthrough confirms reveal→rate→advance and resume-after-refresh.

## What We're NOT Doing

- **No review-history / log table** — the `ts-fsrs` `log` is discarded (PRD non-goal: no analytics,
  no streak/progress UI).
- **No persisted session entity and no client-side session queue in storage** — stateless re-query is
  the resume mechanism (decided in planning). `localStorage` is not used for the review queue.
- **No custom scheduling logic** — `ts-fsrs` owns all timing/intervals (PRD non-goal).
- **No daily new-card limits / Anki-style new-vs-review mix** — every due card is eligible; new cards
  are due immediately.
- **No deck-browse, edit, manual-create** — those are S-03/S-04.
- **No mobile/touch optimization of the review loop** — keyboard-first desktop per NFR; mouse remains
  usable but is not the design target.
- **No E2E (Playwright) test in this slice** — unit + handler-property + RLS integration only (user
  decision). A keyboard-loop e2e can be added later via `/10x-e2e`.

## Implementation Approach

Build bottom-up so each layer is verifiable before the next depends on it: schema → pure scheduling
service (unit-tested in isolation) → API endpoints (the only place scheduling runs, RLS-guarded,
integration-tested) → UI island that consumes the endpoints. The scheduling math never ships to the
browser and is never trusted from the client — the rating endpoint re-reads the card under RLS,
computes the next state, and writes it. The UI advances optimistically to meet the <300ms transition
NFR, with a small in-flight queue and an error/retry path so a failed persist never silently drops a
rating.

## Critical Implementation Details

- **Stateless "Again" handling**: the due queue is fetched **once** at session start (no mid-session
  re-query). Rated cards are removed from the in-memory queue; a card rated **Again** is re-appended
  to the **end** of the in-memory queue so the user re-sees it this sitting (matches SRS expectation),
  while its server schedule (due in minutes) is what governs the *next* session. This keeps the model
  stateless and bounded without a server round-trip per advance.
- **Optimistic advance ordering**: on a rating keypress, advance the visible card immediately and fire
  the persist in the background. Track in-flight ratings; if a persist fails, surface a non-blocking
  error with retry and do not consider that card cleared. The session is "done" only when the queue is
  empty **and** no rating is still in flight/failed.
- **Rating keys are inert until reveal**: 1–4 must do nothing while the answer is hidden, to prevent
  rating a card the user hasn't seen the answer for.
- **Column defaults mirror `createEmptyCard()`** so the existing S-01 insert path produces valid,
  immediately-due new cards with no code change.

---

## Phase 1: Data Model & New-Card Defaults

### Overview

Extend `flashcards` with the FSRS schedule columns, backfill existing rows to "new / due now", add a
due-query index, and regenerate the TypeScript types. No change to the S-01 insert path — DB defaults
cover new cards.

### Changes Required:

#### 1. Schedule-columns migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_fsrs_schedule_to_flashcards.sql` (new)

**Intent**: Add the FSRS card-state columns to `flashcards` so each card carries its own schedule, make
new and existing cards immediately due, and add an index that makes the per-user due query fast.

**Contract**: `alter table public.flashcards add column` for the full `ts-fsrs` `Card` shape, each with
a default mirroring `createEmptyCard()`:

- `due timestamptz not null default now()`
- `stability double precision not null default 0`
- `difficulty double precision not null default 0`
- `elapsed_days integer not null default 0`
- `scheduled_days integer not null default 0`
- `reps integer not null default 0`
- `lapses integer not null default 0`
- `state smallint not null default 0` — FSRS `State` enum (0=New,1=Learning,2=Review,3=Relearning); add a `check (state in (0,1,2,3))`
- `last_review timestamptz` (nullable)

Plus a partial-friendly index for the due query: `create index flashcards_user_id_due_idx on
public.flashcards (user_id, due asc);`. Because the columns are added with `not null default`, existing
rows backfill to the new-card/due-now state automatically — no separate `update` needed. **No new
GRANT** (table already granted to `authenticated`; new columns inherit table privileges). **No RLS
policy change** (policies are row-scoped on `user_id`, unaffected by new columns).

#### 2. Regenerate generated DB types

**File**: `src/db/database.types.ts`

**Intent**: Refresh the generated Supabase types so `Flashcard`/`FlashcardInsert`/`FlashcardUpdate`
include the new columns and the rest of the code type-checks against them.

**Contract**: Regenerate via the project's type-gen path (local Supabase + `supabase gen types`), then
`npx astro sync`. `src/types.ts` needs no edit — its `Flashcard*` aliases derive from this file.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against local Supabase: `npx supabase db reset` (or `supabase migration up`)
- Type checking passes: `npx astro sync && npm run lint`
- Build passes: `npm run build`
- Generated types include the new columns (grep `due`, `stability`, `state` in `src/db/database.types.ts`)

#### Manual Verification:

- After reset, an existing/seeded card row shows `due ≈ now()`, `state = 0`, zeros elsewhere, `last_review = null`
- A card inserted through the existing `/api/cards` path (unchanged) comes back immediately due

**Implementation Note**: After this phase and all automated verification passes, pause for manual
confirmation before Phase 2.

---

## Phase 2: Scheduling Service

### Overview

A pure, dependency-injected wrapper around `ts-fsrs` that converts (current card schedule, rating, now)
into the next schedule. No I/O, no DB — unit-testable in isolation. This is the only module that knows
the algorithm.

### Changes Required:

#### 1. Add the `ts-fsrs` dependency

**File**: `package.json`

**Intent**: Add `ts-fsrs` as a runtime dependency (pure TS, workerd-compatible — no native deps).

**Contract**: `npm install ts-fsrs`; pin the resolved version. No build/config changes expected.

#### 2. Scheduling service

**File**: `src/lib/services/scheduling.ts` (new)

**Intent**: Expose a small, pure API the rating endpoint calls: given a card's stored FSRS fields, a
four-level rating, and the current time, return the next FSRS fields. Also expose the rating mapping and
a helper to recognize the empty/new state.

**Contract**:
- A `ReviewRating` type for the four levels and a mapping to `ts-fsrs` `Rating`
  (Again→1, Hard→2, Good→3, Easy→4). Reject `Manual`(0)/out-of-range.
- `schedule(current: FsrsSchedule, rating: ReviewRating, now: Date): FsrsSchedule` — builds a `ts-fsrs`
  `Card` from `current`, calls `f.next(card, now, mappedRating)`, returns the `.card` fields as a
  plain `FsrsSchedule` (the nine columns). Discards `.log`.
- `FsrsSchedule` is the column-shaped subset (`due, stability, difficulty, elapsed_days,
  scheduled_days, reps, lapses, state, last_review`). Add it to `src/types.ts` (or co-locate and
  re-export) so the endpoint and tests share one shape.
- Instantiate `fsrs(generatorParameters({ enable_fuzz: true }))` once at module scope (default
  parameters; fuzz spreads due times to avoid pile-ups). `Date` is passed in, never read via
  `new Date()` inside the pure function, to keep it deterministic and testable.

#### 3. Scheduling unit tests

**File**: `src/lib/services/scheduling.test.ts` (new, co-located per cookbook §6.1)

**Intent**: Assert the rating→schedule **contract** (not `ts-fsrs` internals, which are a non-goal to
test): mapping correctness, monotonic behavior the product relies on, and the new-card first-review path.

**Contract**: Tests cover — Again/Hard/Good/Easy map to the right `ts-fsrs` `Rating`; a new card (zeros,
state New) advances to a future `due` and a non-New state after one rating; `Easy` schedules `due`
no earlier than `Good` from the same starting card; `reps` increments; an `Again` on a Review-state
card increments `lapses`. Use a fixed injected `now` for determinism. Invalid ratings throw.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- `ts-fsrs` resolves under Vitest's node environment (no `astro:env` or workerd dependency in this module)

#### Manual Verification:

- Spot-check that `Easy` on a fresh card yields a visibly longer first interval than `Good` (sanity on the wiring)

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Review API Endpoints

### Overview

Two authenticated, `prerender = false` endpoints: fetch the due queue, and submit a rating (the only
place scheduling runs). Both RLS-guarded. Tested with handler-property tests (mocked DB) and a two-user
RLS integration test over the new columns.

### Changes Required:

#### 1. Due-queue endpoint

**File**: `src/pages/api/review/due.ts` (new)

**Intent**: Return the current user's due cards for a session — those with `due <= now()`, oldest-due
first, capped — so the client fetches the whole queue once at session start. Also return the
next-due timestamp when the queue is empty, to power the "all caught up" screen.

**Contract**: `GET` (or `POST` with no body — prefer `GET`). Auth-gated via `context.locals.user`
(401 if absent). Query under RLS: `from("flashcards").select(...).lte("due", nowIso).order("due",
{ascending:true}).limit(SESSION_CAP)` where `SESSION_CAP = 100`. Response shape:
`{ cards: ReviewCard[], nextDueAt: string | null }` where `ReviewCard` is `{ id, question, answer }`
plus whatever schedule fields the client needs (the client does **not** need the full schedule — it
only sends `{cardId, rating}` back). When `cards` is empty, compute `nextDueAt` via a second cheap query
(`order("due") limit 1`, the soonest future due) so the empty state can show it; `null` if the deck has
no cards at all. Define `ReviewCard` / due-response DTOs in `src/types.ts`.

#### 2. Rating endpoint (server-side scheduling)

**File**: `src/pages/api/review/rate.ts` (new)

**Intent**: Apply a rating to one card: re-read the card under the user's RLS context, compute the next
schedule via the Phase 2 service, persist it, and return the new schedule. This is the no-data-loss
persistence point and the trust boundary — the client supplies only `{cardId, rating}` and can never
write schedule values directly.

**Contract**: `POST`, zod body `{ cardId: string (uuid), rating: 1|2|3|4 }`, body-size cap consistent
with the other routes. Auth-gated (401). Flow: `select` the card by `id` (RLS restricts to owner — a
miss returns 404, which also covers "not your card"); call `schedule(currentFromRow, rating, new Date())`;
`update` the row's nine schedule columns by `id`; rely on RLS `using/with check` to prevent cross-user
writes. **Do not** trust any `user_id`/schedule fields from the request body (mirror the `cards.ts`
owner/source-forcing pattern). Response: `{ schedule: FsrsSchedule }` (200) or error. The `moddatetime`
trigger updates `updated_at` automatically.

#### 3. Handler-property tests

**File**: `test/handlers/review-due.test.ts`, `test/handlers/review-rate.test.ts` (new, per cookbook §6.2)

**Intent**: Test route behavior with a mocked Supabase client (no DB): auth gates, validation, caps,
ordering/limit arguments, and that the rating route ignores client-supplied owner/schedule fields and
calls the scheduling service with the row's stored state.

**Contract**: Use `makeApiContext()` (`test/support/api-context.ts`). `due`: 401 when `user:null`;
asserts the query uses `lte("due", ...)`, `order("due", asc)`, and `limit(100)` on the fake client;
returns `nextDueAt` when the due set is empty. `rate`: 401 when `user:null`; 400 on bad/missing
`cardId`/`rating` and out-of-range rating; 404 when the card select returns empty; verifies the persisted
`update` payload comes from the scheduling service applied to the **fetched** row, not from the request
body (the spoofing guard). Mock `scheduling.schedule` to assert it is called with the row's stored
fields.

#### 4. Two-user RLS integration test (new columns)

**File**: `test/integration/rls-review.test.ts` (new, per cookbook §6.4)

**Intent**: Prove the new schedule columns are still owner-isolated end-to-end through PostgREST — the
F-01 lesson applied to the S-02 columns.

**Contract**: Model on `test/integration/rls-flashcards.test.ts`: two real users (admin-API seeded),
each acting with their **own** token via `flashcardsRequest()`, unique `runId` for re-run safety, ordered
tests, cleanup in `afterAll`. Assert: user B cannot `PATCH` user A's card's `due`/`state`/`stability`
(filter → 0 rows; A's schedule untouched); user A **can** update their own card's schedule columns;
B's `due`-filtered `GET` never returns A's rows. Service-role used only for seeding, never for assertions.

### Success Criteria:

#### Automated Verification:

- Handler-property tests pass: `npm test`
- RLS integration test passes against local Supabase: `npm run test:integration`
- Lint + build pass: `npm run lint && npm run build`
- Type checking passes: `npx astro sync && npm run lint`

#### Manual Verification:

- `curl`/REST: `GET /api/review/due` as a logged-in user returns due cards oldest-first, capped at 100
- `POST /api/review/rate` with `{cardId, rating:3}` returns a later `due` than before and persists it
- Submitting a rating for another user's `cardId` returns 404 (RLS miss), not a successful write

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Keyboard-Driven Review UI

### Overview

A protected `/review` page hosting a `ReviewSession` React island that drives the reveal→rate→advance
loop by keyboard, advances optimistically, persists each rating in the background, and shows an
"all caught up" empty state. A dashboard entry links to it with a due-count.

### Changes Required:

#### 1. Protected review page

**File**: `src/pages/review.astro` (new); `src/middleware.ts` (edit)

**Intent**: Add a protected page that hosts the review island, mirroring `/generate.astro`.

**Contract**: New `review.astro` rendering `<ReviewSession client:load />` inside the app layout. Add
`"/review"` to `PROTECTED_ROUTES` in `src/middleware.ts` so unauthenticated users redirect to
`/auth/signin`.

#### 2. Review session island

**File**: `src/components/review/ReviewSession.tsx` (new)

**Intent**: Own the full client loop — fetch the due queue once on mount, present one card at a time,
reveal on Space, rate on 1–4, advance optimistically while persisting in the background, re-append
"Again" cards to the queue end, and render the empty/"all caught up" state with the next-due time.

**Contract**:
- On mount, `GET /api/review/due`; hold `{queue, index, revealed}` in React state (no `localStorage`).
- Keyboard: `Space`/`Enter` toggles reveal; `1`/`2`/`3`/`4` rate **only when revealed** (inert
  otherwise). Attach the handler scoped to the session view; clean up on unmount. Show on-screen key
  hints (Again/Hard/Good/Easy with their numbers) for discoverability.
- On rate: advance the visible card immediately (optimistic); `POST /api/review/rate` in the
  background; track in-flight ratings; on failure show a non-blocking retry affordance and keep the
  rating pending (never silently dropped). A card rated `Again` is re-appended to the end of the
  in-memory queue.
- Transitions must feel instant (<300ms p95) — advancing is local state, not gated on the POST.
- Empty/done state: when the queue is exhausted and nothing is in-flight/failed, show "all caught up"
  with `nextDueAt` (humanized) and a link to `/generate`. Same screen serves "no due cards on arrival".
- Loading and error states for the initial fetch, consistent with `GeneratorView`'s inline-text style
  (no toast library — none is installed).
- Reuse `Button` and `Card` from `src/components/ui/`. Extract any non-trivial keyboard logic into a
  hook under `src/components/hooks/` (e.g. `useReviewKeys`) per the project's hook convention.

#### 3. Dashboard entry point with due-count

**File**: `src/pages/dashboard.astro` (edit)

**Intent**: Give the user a way into the review session and a reason to start it (how many cards are due).

**Contract**: Server-side in the page, count due cards for `context.locals.user` (`flashcards`,
`due <= now()`, `count: 'exact'`) and render a link/button to `/review` showing the count (e.g.
"Review N cards due"). When zero, show a muted "nothing due" state. Keep it consistent with the existing
dashboard markup.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Type checking passes: `npx astro sync && npm run lint`
- Existing unit + integration suites still green: `npm test && npm run test:integration`

#### Manual Verification:

- Entire loop is operable with keyboard only: Space reveals, 1–4 rate, view advances — no mouse needed
- Card transitions feel instant (well under 300ms) even on a throttled connection
- Refreshing mid-session resumes at the next un-rated due card with no lost ratings; ratings made just
  before refresh are persisted (verify the card's `due` moved)
- A card rated `Again` reappears later in the same sitting
- Empty state shows "all caught up" + a sensible next-due time; dashboard due-count matches reality
- Rating keys do nothing before the answer is revealed

**Implementation Note**: After automated verification, pause for the full manual keyboard walkthrough
before considering the slice complete.

---

## Testing Strategy

### Unit Tests (`npm test`):

- `scheduling.test.ts` — rating→`ts-fsrs.Rating` mapping; new-card first-review advances `due`/state;
  `Easy ≥ Good` interval; `reps`++/`lapses`++ behavior; invalid ratings throw; deterministic via
  injected `now`.
- `review-due.test.ts` / `review-rate.test.ts` — handler-property: auth gates, validation, caps,
  query args (`lte`/`order`/`limit`), 404 on RLS miss, and the spoofing guard (schedule derived from the
  fetched row, not the request body).

### Integration Tests (`npm run test:integration`, local Supabase):

- `rls-review.test.ts` — two real users via their own tokens: cross-user schedule update blocked (0
  rows, untouched), own-card schedule update allowed, due-filtered reads owner-scoped.

### Manual Testing Steps:

1. Seed/generate several cards; confirm dashboard shows the correct due-count.
2. Open `/review`; with keyboard only: Space to reveal, rate with 1–4, advance through the queue.
3. Mid-session, refresh — confirm resume at the next un-rated card and that prior ratings persisted.
4. Rate a card `Again`; confirm it reappears later in the same sitting.
5. Clear the queue; confirm the "all caught up" + next-due screen.
6. Confirm rating keys are inert before reveal.

## Performance Considerations

- The <300ms p95 transition NFR is met by **optimistic advance** — advancing is local state, never
  gated on the rating POST.
- The due query is bounded by `SESSION_CAP = 100` and served by the new `(user_id, due asc)` index;
  for the PRD's <1,000-card decks this is a fast, indexed range scan.
- `ts-fsrs` runs server-side only; no algorithm code or library weight ships to the browser bundle.

## Migration Notes

- Existing cards backfill to "new / due now" automatically via the `not null default` columns — every
  card already in a deck becomes immediately reviewable, which is the intended first-session behavior.
- Coordinate with **S-03** (schedule-preserving edit): S-03's card edit must touch only `question`/
  `answer` and must NOT reset the schedule columns this slice adds. If S-03 lands first, its update path
  needs revisiting once these columns exist.

## References

- Change identity: `context/changes/spaced-repetition-review/change.md`
- Roadmap slice S-02: `context/foundation/roadmap.md` (lines 94–105)
- PRD US-02 / FR-015 / FR-016 / NFRs: `context/foundation/prd.md` (lines 64–74, 122–125, 132–133)
- F-01 migration (pattern to follow): `supabase/migrations/20260619123010_create_flashcards.sql`
- Owner-forcing test pattern: `test/handlers/cards.test.ts`
- RLS isolation test pattern: `test/integration/rls-flashcards.test.ts`; helpers in `test/support/supabase.ts`
- Test cookbook: `context/foundation/test-plan.md` §6
- RLS grant/isolation lesson: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Model & New-Card Defaults

#### Automated

- [x] 1.1 Migration applies cleanly against local Supabase (`npx supabase db reset`) — aa1836a
- [x] 1.2 Type checking passes (`npx astro sync && npm run lint`) — aa1836a
- [x] 1.3 Build passes (`npm run build`) — aa1836a
- [x] 1.4 Generated types include the new columns — aa1836a

#### Manual

- [x] 1.5 Seeded card row shows due≈now, state=0, zeros, last_review null after reset — aa1836a
- [x] 1.6 Card inserted via existing `/api/cards` comes back immediately due — aa1836a

### Phase 2: Scheduling Service

#### Automated

- [x] 2.1 Unit tests pass (`npm test`) — 3636ae1
- [x] 2.2 Lint passes (`npm run lint`) — 3636ae1
- [x] 2.3 `ts-fsrs` resolves under Vitest node environment — 3636ae1

#### Manual

- [x] 2.4 `Easy` first interval visibly longer than `Good` (wiring sanity) — 3636ae1

### Phase 3: Review API Endpoints

#### Automated

- [x] 3.1 Handler-property tests pass (`npm test`) — af6a1da
- [x] 3.2 RLS integration test passes (`npm run test:integration`) — af6a1da
- [x] 3.3 Lint + build pass (`npm run lint && npm run build`) — af6a1da
- [x] 3.4 Type checking passes (`npx astro sync && npm run lint`) — af6a1da

#### Manual

- [x] 3.5 `GET /api/review/due` returns due cards oldest-first, capped at 100 — af6a1da
- [x] 3.6 `POST /api/review/rate` returns and persists a later `due` — af6a1da
- [x] 3.7 Rating another user's cardId returns 404 (no write) — af6a1da

### Phase 4: Keyboard-Driven Review UI

#### Automated

- [x] 4.1 Lint passes (`npm run lint`) — b0f1700
- [x] 4.2 Build passes (`npm run build`) — b0f1700
- [x] 4.3 Type checking passes (`npx astro sync && npm run lint`) — b0f1700
- [x] 4.4 Existing unit + integration suites still green (`npm test && npm run test:integration`) — b0f1700

#### Manual

- [x] 4.5 Entire loop operable keyboard-only (Space reveal, 1–4 rate, advance) — b0f1700
- [x] 4.6 Transitions feel instant (<300ms) on a throttled connection — b0f1700
- [x] 4.7 Refresh mid-session resumes at next un-rated card; prior ratings persisted — b0f1700
- [x] 4.8 `Again`-rated card reappears later in the same sitting — b0f1700
- [x] 4.9 Empty state shows "all caught up" + next-due; dashboard due-count matches — b0f1700
- [x] 4.10 Rating keys inert before reveal — b0f1700
