# Deck Management — Browse, Schedule-Preserving Edit, Delete — Implementation Plan

## Overview

Give a logged-in user a deck view: browse all of their cards (paginated), edit any card's
question/answer, and permanently delete a card behind a confirmation prompt. This is roadmap slice
**S-03** (Stream B, deck authoring & management), implementing PRD **FR-012**, **FR-013**, and
**FR-014**. F-01 (card persistence) and S-02 (spaced-repetition review, which added the FSRS schedule
columns) have both shipped.

The slice is pure CRUD over the existing `flashcards` entity, so the architectural risk is low. The
**one constraint that dominates the design** is FR-013: editing content must NOT reset the
spaced-repetition schedule. The edit endpoint therefore touches **only** `question`/`answer` — a zod
schema with exactly those two fields, an update payload built from exactly those two keys, so the
FSRS columns S-02 added (`due, stability, difficulty, scheduled_days, learning_steps, reps, lapses,
state, last_review`) are structurally unreachable from the edit path. This is both a Critical
Implementation Detail and a success criterion below.

## Current State Analysis

- **`flashcards` table** (`supabase/migrations/20260619123010_create_flashcards.sql` +
  `20260621130539_*` + `20260621131214_*`): `id, user_id, question, answer, source('ai'|'manual'),
  created_at, updated_at` plus the S-02 FSRS columns `due, stability, difficulty, scheduled_days,
  learning_steps, reps, lapses, state, last_review`. RLS `enable` (not `force`) with four per-user
  policies (`select/insert/update/delete ... using/with check (auth.uid() = user_id)`) +
  `grant select, insert, update, delete ... to authenticated` + a `moddatetime` trigger on
  `updated_at`. Index `flashcards_user_id_created_at_idx on (user_id, created_at desc)` — this is
  exactly the index a "newest-first paginated browse" needs; **no new migration or index is
  required for this slice.**
- **API surface** (`src/pages/api/`): `POST /api/generate`, `POST /api/cards` (bulk-save, forces
  `source:'ai'` + server-derived `user_id`), `GET /api/review/due`, `POST /api/review/rate`.
  `cards.ts` **has only POST** — there is no list/GET, and **no dynamic `[id]` route exists anywhere**
  in `src/pages/api/`. All routes `prerender = false`, zod-validated, auth via `context.locals.user`,
  a local `json()` helper, a `content-length` body cap, and generic error bodies (no row contents
  echoed).
- **Types** (`src/types.ts`): `Flashcard` / `FlashcardInsert` / `FlashcardUpdate` derive from
  `src/db/database.types.ts`. `UpdateFlashcardCommand = Pick<FlashcardUpdate, "question" | "answer">`
  **already exists** (added at F-01 for this slice) — the exact shape the PATCH route validates to.
  `FsrsSchedule`, `ReviewCard`, generation/review DTOs also live here.
- **UI**: `src/pages/generate.astro` and `src/pages/review.astro` are the precedent — a protected
  `.astro` page inside `Layout` hosting one `client:load` React island. `GeneratorView.tsx` is the
  pattern for an island that lists cards, edits Q/A inline with `Textarea`, and calls a `fetch`
  endpoint with loading/error/confirmation states; `ReviewSession.tsx` is the pattern for fetch-on-
  mount + optimistic UI + a non-blocking error/retry affordance. `dashboard.astro` shows the
  server-side RLS-scoped count pattern (`select(... { count: 'exact', head: true })`).
- **Routing**: `PROTECTED_ROUTES = ["/dashboard", "/generate", "/review"]` in `src/middleware.ts`;
  unauthenticated users on a protected route redirect to `/auth/signin`.
- **shadcn/ui installed**: `Button`, `Card`, `Textarea` only (`src/components/ui/`). No `Dialog`/
  `AlertDialog` is installed — the delete confirmation must use an inline two-step pattern (no new
  shadcn primitive) to stay consistent with the existing inline-state idiom and avoid adding deps.
- **Test harness** (mature; test-plan Phases 1–3 complete): Vitest `unit` + `integration` projects,
  Playwright e2e. Cookbook (`test-plan.md` §6): co-located `*.test.ts` units; handler-property tests
  via `makeApiContext()` (`test/support/api-context.ts`) with a mocked, call-recording Supabase
  client; two-user RLS isolation via `flashcardsRequest()` and each user's **own** token, never
  service-role (`test/integration/rls-flashcards.test.ts`, `test/support/supabase.ts`).

### Key Discoveries:

- **The FSRS-preservation guarantee is mostly free if the route is shaped right.** The S-02
  `rate.ts` endpoint already proves the "client can't write schedule fields" pattern: zod parse +
  build the write payload from validated fields only. The edit route applies the same shape with an
  even tighter schema (`{ question, answer }` only), so schedule columns can never appear in the
  `update()` payload. The `moddatetime` trigger bumps `updated_at`; no FSRS column is in the SET list,
  so PostgreSQL leaves them untouched.
- **`makeApiContext()` provides neither `context.params` nor `context.url`.** Today's handlers read
  only `locals.user`, `request.headers`, `request.json()`, `cookies` — the factory has no `params` or
  `url` slice, and its own header comment says to EXTEND it when a handler starts reading a new context
  member. The `[id].ts` PATCH/DELETE handlers read `context.params.id`, **and the Phase 2 `GET` handler
  reads `context.url.searchParams.get("page")`** (no existing handler reads query params — `due.ts`
  takes none), so **the factory must gain both a `params` and a `url` option** (Phase 1). This is the
  test-infra work the slice requires.
- **No DB work is needed.** Browse rides the existing `(user_id, created_at desc)` index; edit/delete
  ride the existing RLS policies and grants. The F-01 grant/RLS lesson ("new RLS tables need explicit
  grants + a two-user isolation test") does **not** trigger a new grant here (same table), but its
  isolation-test obligation still applies to the new GET/PATCH/DELETE surface.
- **RLS makes "not found" and "not yours" indistinguishable**, exactly as `rate.ts` relies on: a
  PATCH/DELETE filtered by `id` against a row the user doesn't own affects 0 rows (the `using` filter),
  which the route maps to a 404 — never leaking whether another user's card exists.

## Desired End State

A logged-in user opens `/cards` and sees their cards, newest first, in a paginated list (page size 50,
a "Load more" control fetching the next page). Each card shows its question and answer; an **Edit**
control turns them into editable `Textarea`s with Save/Cancel — saving persists question/answer via
`PATCH /api/cards/[id]` and the card's review schedule is provably unchanged. A **Delete** control
requires an explicit second confirmation click before it calls `DELETE /api/cards/[id]`; the card
disappears from the list permanently. The dashboard gains a link into `/cards`.

**Verification**: `npm run lint` + `npm run build` pass; `npm test` (handler-property for GET/PATCH/
DELETE) passes; `npm run test:integration` (two-user RLS over browse/edit/delete + the FSRS-untouched
assertion) passes against local Supabase; a manual walkthrough confirms browse pagination, inline edit
with schedule preserved, and confirm-gated delete.

## What We're NOT Doing

- **No full-text search, tag, or filter** in the deck view (PRD §Non-Goals; roadmap §Parked). Browse
  is a plain newest-first paginated list.
- **No soft-delete / archive / restore / undo** (PRD §Non-Goals). Delete is a permanent hard delete;
  the only safety is the explicit confirmation step (FR-014).
- **No full client-side virtualization** (e.g. react-virtual). The PRD target scale is "small" data
  volume / "hundreds" of cards; offset/range pagination with a "Load more" pager meets FR-012 and the
  <300ms NFR without a windowing library. (Documented assumption.)
- **No schedule reset on edit, and no schedule editing UI** — FR-013 is the whole point; the FSRS
  columns are never written by this slice.
- **No manual card creation** — that is S-04. `/cards` is browse/edit/delete only; "Generate more"
  links to `/generate`.
- **No new DB migration or index** — the existing schema and the `(user_id, created_at desc)` index
  cover it.
- **No `Dialog`/`AlertDialog` shadcn primitive** — the confirmation is an inline two-step control, to
  avoid adding an un-installed primitive and to match the existing inline-state UI idiom.
- **No E2E (Playwright) test in this slice** — unit (handler-property) + RLS integration only, matching
  the S-02 decision. A browse/edit/delete e2e can be added later via `/10x-e2e`.

## Implementation Approach

Bottom-up so each layer is verifiable before the next depends on it: test-infra (extend the API-context
factory for `params`) → list endpoint (`GET /api/cards`, paginated) → mutation endpoints
(`PATCH`/`DELETE /api/cards/[id]`, the FR-013 trust boundary) → the `/cards` page + island UI →
dashboard entry. Every endpoint is `prerender = false`, auth-gated via `context.locals.user`, runs
through the **user's** RLS-scoped Supabase client (never service-role), uses the local `json()`
helper, and returns generic error bodies — mirroring the established `cards.ts` / review-endpoint
idioms. Scheduling math is irrelevant here; the only algorithmic concern is the negative one — never
emit an FSRS column from the edit path.

## Critical Implementation Details

- **Schedule-preserving edit (FR-013) — the single most important constraint.** `PATCH /api/cards/[id]`
  validates the body with a zod schema of **only** `{ question, answer }` (both `.trim().min(1)`), and
  builds the `update()` payload from **only** those two parsed fields. The FSRS columns (`due,
  stability, difficulty, scheduled_days, learning_steps, reps, lapses, state, last_review`) are never
  named in the schema or the payload, so they are structurally unreachable — a client that smuggles
  `due`/`state`/etc. in the body has them stripped by zod (mirrors the `rate.ts` spoofing guard). The
  SQL `UPDATE` sets only `question`/`answer`; `moddatetime` bumps `updated_at`; every schedule column
  is left exactly as it was. The **primary** proof is the handler key-assertion (the captured `update()`
  payload's keys are exactly `["answer","question"]` even with hostile extra fields); the integration
  test (read schedule → PATCH content → re-read → schedule byte-for-byte identical) is the DB backstop.
- **RLS miss → 404, never a leak.** PATCH/DELETE filter by `id` only; RLS scopes the row to the owner.
  A non-owned/absent id affects 0 rows; the route returns 404 (using `Prefer: return=representation` /
  the returned row count to detect the 0-row case), identical to how `rate.ts` treats an RLS miss.
  Never branch on "exists but not yours" — it would leak another user's card existence.
- **Pagination contract.** `GET /api/cards` uses PostgREST `.range(offset, offset + PAGE_SIZE)` ordered
  by `created_at desc` (served by the existing index), page size 50, keyed by a **0-based row `offset`**
  (not a page index — see F2). The response carries the page of cards, `hasMore` (derived by fetching
  `PAGE_SIZE + 1` and trimming — avoids a `count` round-trip), and `nextOffset = offset + cards.length`.
  The client holds the accumulated list and a row-offset cursor; a "Load more" control fetches
  `?offset=<cursor>` and the cursor decrements by one on each delete so deletions never make "Load more"
  skip a card.
- **Confirmation before delete (FR-014).** The island keeps a per-card `confirmingDeleteId`; the first
  Delete click arms confirmation (button becomes "Confirm delete" + a Cancel), the second click fires
  `DELETE`. No deletion ever happens on a single click.
- **`makeApiContext` must learn `params` AND `url`.** Extend the factory with an optional `params` slice
  so the `[id].ts` handler tests can supply `context.params.id`, and a `url` slice (a real `URL`) so the
  Phase 2 `GET` handler tests can supply the `page` query param via `context.url.searchParams`. Without
  `params` the `[id]` handler reads `undefined`; without `url` the `GET` handler throws on
  `undefined.searchParams` — in both cases a test could pass (or be unwritable) against behavior that
  breaks in the real Astro runtime.

---

## Phase 1: Test-infra — `params` + `url` in the API-context factory

### Overview

The `[id].ts` PATCH/DELETE handlers read `context.params.id` and the Phase 2 `GET` handler reads
`context.url.searchParams` — neither of which `makeApiContext()` provides today (it returns only
`locals`, `request`, `cookies`). Extend the factory minimally to supply **both** `context.params` and
`context.url`, and confirm the existing suite stays green before any new handler depends on it.

### Changes Required:

#### 1. Extend the synthetic API context with `params`

**File**: `test/support/api-context.ts`

**Intent**: Let handler tests supply route params (`context.params.id`) so `[id].ts` routes can be
invoked directly, keeping the factory the single minimal stand-in it is documented to be.

**Contract**: Add two optional slices to `ApiContextOptions`:
(a) `params?: Record<string, string | undefined>` (default `{}`), surfaced on the returned context as
`params` — for the `[id].ts` PATCH/DELETE handlers;
(b) `url?: string` (default a benign placeholder like `"http://localhost/api/cards"`), surfaced as
`context.url` built as a **real `URL`** (`new URL(url)`) so the Phase 2 `GET` handler's
`context.url.searchParams.get("page")` resolves — without it the GET handler reads `undefined.searchParams`
and throws. (A `searchParams?: Record<string,string>` convenience that builds the query onto the default
URL is acceptable as long as one real `URL` lands on `context.url`.)
Update the factory's header comment (which enumerates the context members the handlers read) to list
**both** `context.params` and `context.url`. No change to existing call sites (they omit both and get the
defaults). Keep building `request` as a plain object, not a real `Request` (the 413 cap relies on a
settable `content-length`).

### Success Criteria:

#### Automated Verification:

- Existing unit suite still green: `npm test`
- Lint passes: `npm run lint`
- Type checking passes: `npx astro sync && npm run lint`

#### Manual Verification:

- A throwaway call `makeApiContext({ params: { id: "x" } }).params.id === "x"` (sanity; remove after)

**Implementation Note**: After this phase and all automated verification passes, pause for manual
confirmation before Phase 2.

---

## Phase 2: List endpoint — `GET /api/cards` (paginated)

### Overview

Add a `GET` export to the existing `cards.ts` (keep the existing `POST` untouched) that returns the
user's cards newest-first in pages of 50, RLS-scoped, with a `hasMore` flag for the "Load more" pager.
Handler-property tested with a mocked, call-recording Supabase client.

### Changes Required:

#### 1. Paginated list handler

**File**: `src/pages/api/cards.ts` (edit — add `GET`, keep `POST`)

**Intent**: Return one page of the signed-in user's deck, newest first, bounded so a large deck never
ships in one payload — the data source for the `/cards` browse view (FR-012, <300ms NFR).

**Contract**: `GET`, `prerender = false` (already set). Auth-gated via `context.locals.user` (401 if
absent). Read an optional `offset` (0-based **row** offset, not a page index) from
`context.url.searchParams`, clamp/validate with zod (non-negative integer, default 0; reject
negatives/garbage → 400 for an explicit contract). `PAGE_SIZE = 50`. Query under the user's client:
`from("flashcards").select("id, question, answer, created_at").order("created_at", { ascending:
false }).range(offset, offset + PAGE_SIZE)` — i.e. fetch `PAGE_SIZE + 1` rows; if more than `PAGE_SIZE`
come back, set `hasMore = true` and trim to `PAGE_SIZE` (avoids a second `count` round-trip). Response:
`{ cards: DeckCard[], nextOffset, hasMore }` where `nextOffset = offset + cards.length` (the row offset
the client passes to fetch the next page) and `DeckCard = Pick<Flashcard, "id" | "question" | "answer"
| "created_at">`. Generic 500 on DB error (no row contents echoed). Define `DeckCard` and the
list-response DTO in `src/types.ts`.

**Why offset, not a page index** (FR-012 correctness — see F2): a `page` index pins the next fetch to
`page * 50`, which silently skips a row after any delete from an earlier page (the server ordering
shifts up by one but `page*50` doesn't). A raw row `offset` lets the client decrement its cursor by one
on each delete, so "Load more" stays aligned with the live ordering. The DB query is the same indexed
range scan either way.

#### 2. Deck DTOs

**File**: `src/types.ts` (edit)

**Intent**: Share the browse shapes between the route, the island, and the tests.

**Contract**: Add `DeckCard = Pick<Flashcard, "id" | "question" | "answer" | "created_at">` and
`DeckPage { cards: DeckCard[]; nextOffset: number; hasMore: boolean }` (row-offset cursor, not a page
index — see F2). `UpdateFlashcardCommand` already exists and is reused by Phase 3 — do not redefine it.

#### 3. Handler-property tests for `GET /api/cards`

**File**: `test/handlers/cards.test.ts` (edit — add a `GET` describe block alongside the `POST` ones)

**Intent**: Pin the list contract without a database (per cookbook §6.2): auth gate, query shape, and
the `hasMore` derivation.

**Contract**: Mock `@/lib/supabase` (already mocked in this file) with a chainable call-recording fake
(mirror `review-due.test.ts`'s `fakeSupabase`, adding `range` to the recorded methods). Supply the
`offset` query param via the Phase 1 factory option (e.g. `makeApiContext({ searchParams: { offset: "100" } })`,
which lands on `context.url.searchParams`). Assert: 401
when `user:null` and `createClient` not called; the query uses `order("created_at", {ascending:
false})` and `range(...)` with the correct bounds for `offset=0` (→ `range(0, 50)`) and `offset=100`
(→ `range(100, 150)`); `hasMore` is `true` when `PAGE_SIZE + 1` rows return (and the page is trimmed to
`PAGE_SIZE`), `false` otherwise; `nextOffset === offset + cards.length`; 400 on a negative/non-integer
`offset`; generic 500 on a DB error (no row contents in the body). Use a sentinel question string to
assert no leak on the 500 path.

### Success Criteria:

#### Automated Verification:

- Handler-property tests pass: `npm test`
- Lint + build pass: `npm run lint && npm run build`
- Type checking passes: `npx astro sync && npm run lint`

#### Manual Verification:

- `curl`/REST as a logged-in user: `GET /api/cards` returns the newest 50 cards; `GET /api/cards?offset=50`
  returns the next page; `hasMore` flips to `false` on the last page and `nextOffset` advances by the
  page size
- Existing `POST /api/cards` behavior unchanged (generate→save still works)

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Mutation endpoints — `PATCH` / `DELETE /api/cards/[id]`

### Overview

The slice's trust boundary. A new dynamic route exposes a schedule-preserving content edit and a
permanent delete, both RLS-scoped, both 404-on-miss. Handler-property tested (mocked DB) plus a
two-user RLS integration test that **also** asserts the FSRS columns are untouched by an edit.

### Changes Required:

#### 1. Dynamic card route (PATCH + DELETE)

**File**: `src/pages/api/cards/[id].ts` (new)

**Intent**: Edit a card's question/answer without touching its schedule (FR-013), and permanently
delete a card (FR-014) — both only for the owning user.

**Contract**: `prerender = false`. Local `json()` helper. Read `context.params.id`; validate it is a
uuid with zod (400 if not). Build the user's client via `createClient(...)` (500 if null).

- **PATCH**: body-size cap (`MAX_BODY_BYTES = 16 * 1024`; small Q/A edit). zod body schema is
  **exactly** `{ question: z.string().trim().min(1), answer: z.string().trim().min(1) }` — no other
  field is accepted (extra keys are stripped). 400 on parse failure. Persist with
  `from("flashcards").update({ question, answer }).eq("id", id).select(...)` using
  `Prefer: return=representation` semantics (PostgREST returns the affected rows). If 0 rows affected
  → 404 (RLS miss or absent). Build the `update` payload from **only** the two parsed fields — never
  spread the body, never include any schedule key. Response: the updated `DeckCard` (200). The
  `moddatetime` trigger updates `updated_at`; FSRS columns are absent from the SET list and stay as-is.
- **DELETE**: no body. `from("flashcards").delete().eq("id", id).select("id")`; 0 rows → 404; else
  200 `{ deleted: id }`. RLS ensures only the owner's row can be deleted.
- Both: generic error bodies on 5xx (no row contents). Mirror `rate.ts` for the RLS-miss-is-404 and
  the "never trust the body for protected fields" patterns.

#### 2. Update DTOs reused

**File**: `src/types.ts` (no new edit expected)

**Intent**: PATCH validates to the existing `UpdateFlashcardCommand` shape (`Pick<FlashcardUpdate,
"question" | "answer">`); the response reuses `DeckCard` from Phase 2.

**Contract**: Reuse only — if a `DeleteResponse { deleted: string }` reads cleaner, add it here, else
inline the literal.

#### 3. Handler-property tests for PATCH/DELETE

**File**: `test/handlers/cards-id.test.ts` (new, per cookbook §6.2)

**Intent**: Prove the route properties without a DB — auth gates, uuid/body validation, RLS-miss→404,
and the FR-013 structural guarantee that only `question`/`answer` are ever written.

**Contract**: Mock `@/lib/supabase`. Use a chainable call-recording fake (extend the
`review-rate.test.ts` `fakeSupabase` with `delete`). Invoke `PATCH`/`DELETE` from the new route with
`makeApiContext({ params: { id }, body })` (relies on Phase 1). Assert:
- 401 when `user:null` (both verbs); `createClient` not called.
- 400 on a non-uuid `params.id`; 400 on PATCH bodies missing/blank `question` or `answer`; 413 on an
  oversized PATCH content-length.
- **FR-013 guard (the load-bearing test):** when PATCH is given a body that *also* carries hostile
  schedule/owner fields (`due`, `state`, `stability`, `user_id`, `created_at`), the captured
  `update()` payload's keys are **exactly** `["answer", "question"]` — nothing else survives (mirror
  the `cards.test.ts` owner-forcing key assertion and the `rate.test.ts` spoofing guard).
- PATCH/DELETE return 404 when the affected-row set is empty (RLS miss).
- Generic 500 (no sentinel question leak) when the DB op errors.

#### 4. Two-user RLS integration test (browse + edit + delete + FSRS-untouched)

**File**: `test/integration/rls-cards-management.test.ts` (new, per cookbook §6.4)

**Intent**: Prove, end-to-end through PostgREST with two real users, that B cannot read/edit/delete A's
cards, that A can, and — the FR-013 invariant — that editing content leaves the schedule columns
byte-for-byte unchanged.

**Contract**: Model on `test/integration/rls-flashcards.test.ts` and `rls-review.test.ts`. Two real
users (admin-API seeded), each asserting through their **own** token via `flashcardsRequest()`, unique
`runId` for re-run safety, ordered tests, cleanup in `afterAll` through each owner's token (service-role
has no GRANT). Assert:
- B's `GET` (question-prefix filter) returns 0 of A's rows; A's returns A's row.
- B's `PATCH ?id=eq.<A's card>` with `{question, answer}` → 0 rows; A's row unchanged.
- B's `DELETE ?id=eq.<A's card>` → 0 rows; A's row still present.
- **FR-013 (DB backstop):** read A's card's schedule columns (`due, stability, difficulty,
  scheduled_days, learning_steps, reps, lapses, state, last_review`) as A; `PATCH` A's
  `question`+`answer` as A; re-read; assert every schedule column is **identical** to before (and
  `question`/`answer` changed, `updated_at` advanced). Note this PATCHes PostgREST directly with a
  content-only body, so it proves the *DB* preserves columns absent from the SET list — it is the
  backstop, not the primary guard. **The primary FR-013 guard is the §3 handler key-assertion** (the
  route's zod schema is what strips a hostile `due`/`state` before it ever reaches SQL). Optionally,
  also `PATCH` A's card through PostgREST *with* a schedule field in the body and assert it DOES change —
  making explicit that the DB itself would accept the spoof and the route is the only thing blocking it.
- A can `DELETE` their own row (placed last, after the unchanged-assertions, per the ordered-test
  convention).

Note: these assertions exercise `flashcards` through PostgREST directly (the same surface the routes
use), so they validate the RLS policies the routes depend on. The route-level FR-013 structural guard
is covered by the handler test in §3; this integration test proves the DB itself preserves the
schedule on a content-only UPDATE.

### Success Criteria:

#### Automated Verification:

- Handler-property tests pass: `npm test`
- RLS integration test passes against local Supabase: `npm run test:integration`
- Lint + build pass: `npm run lint && npm run build`
- Type checking passes: `npx astro sync && npm run lint`

#### Manual Verification:

- `PATCH /api/cards/<own card>` with `{question, answer}` returns 200 and the card's `due`/`state`/etc.
  are unchanged (compare before/after)
- `PATCH`/`DELETE` of another user's `cardId` returns 404 (no write/delete), not a success
- `DELETE /api/cards/<own card>` returns 200 and the card is gone from a subsequent `GET /api/cards`

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Deck UI — `/cards` page + `DeckView` island

### Overview

A protected `/cards` page hosting a `DeckView` React island that lists cards (paginated "Load more"),
edits Q/A inline, and deletes behind a confirmation step — mirroring `GeneratorView`/`ReviewSession`
patterns and the `/generate` page+island precedent. Add `/cards` to `PROTECTED_ROUTES` and a dashboard
entry point.

### Changes Required:

#### 1. Protected deck page

**File**: `src/pages/cards/index.astro` (new); `src/middleware.ts` (edit)

**Intent**: Add a protected page that hosts the deck island, mirroring `/generate.astro` and
`/review.astro`.

**Contract**: New `cards/index.astro` rendering `<DeckView client:load />` inside `Layout` with the same
`bg-cosmic` shell and header style as `generate.astro` ("Your deck" title, "Signed in as {email}").
Add `"/cards"` to `PROTECTED_ROUTES` in `src/middleware.ts` so unauthenticated users redirect to
`/auth/signin`. **S-04 (manual-card-creation) adds the same `"/cards"` prefix — it is one shared
entry, not two; whichever slice lands first adds it (see Migration Notes — S-04 coordination).**

#### 2. Deck island

**File**: `src/components/deck/DeckView.tsx` (new)

**Intent**: Own the full browse/edit/delete client loop against the Phase 2/3 endpoints, reusing the
project's UI primitives and inline-state idioms.

**Contract**:
- On mount, `GET /api/cards` (no offset → offset 0); hold `{ cards, nextOffset, hasMore, status }` in
  state, where `nextOffset` is the row-offset cursor returned by the endpoint. Loading/error states
  consistent with `ReviewSession` (spinner; inline "Try again"). Empty deck → a muted "No cards yet"
  state with a link to `/generate`.
- **Browse**: render each card in a `Card`/`CardContent` (reuse `src/components/ui/`), newest first.
  A "Load more" `Button` (shown only when `hasMore`) fetches `GET /api/cards?offset=<nextOffset>`,
  appends the returned cards, and updates `nextOffset`/`hasMore` from the response; disable while loading.
- **Edit**: a per-card edit mode (`editingId`) swaps the read-only Q/A for two `Textarea`s
  (`GeneratorView`'s inline-edit pattern) with Save/Cancel. Save `PATCH /api/cards/<id>` with
  `{question, answer}`; on success replace the card in local state with the returned `DeckCard`; on
  failure show a non-blocking inline error and keep edit mode open (no silent drop, per `ReviewSession`).
  Disable Save when either field is blank.
- **Delete (confirm-gated, FR-014)**: a per-card `confirmingDeleteId`. First Delete click arms
  confirmation (button → "Confirm delete" + a Cancel). Second click `DELETE /api/cards/<id>`; on
  success remove the card from local state **and decrement `nextOffset` by one** (the deleted row no
  longer occupies a slot below the cursor, so the next "Load more" stays aligned and skips nothing —
  see F2); on failure show an inline error. A single click never deletes.
- Reuse `Button`, `Card`, `Textarea`; `lucide-react` icons consistent with the other islands. Extract
  any non-trivial logic into a hook under `src/components/hooks/` only if it earns its keep (the loop
  is simple enough to keep inline, matching `GeneratorView`).

#### 3. Dashboard entry point

**File**: `src/pages/dashboard.astro` (edit)

**Intent**: Give the user a way into their deck.

**Contract**: Add a `/cards` link alongside the existing "Generate flashcards" link (e.g. "Browse your
deck"), consistent with the existing dashboard markup. No count needed (browse, not a queue).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Type checking passes: `npx astro sync && npm run lint`
- Existing unit + integration suites still green: `npm test && npm run test:integration`

#### Manual Verification:

- `/cards` lists the user's cards newest-first; "Load more" appears only when more pages exist and
  appends the next page; the list feels instant (<300ms) for a few-hundred-card deck
- Editing a card's question/answer and saving persists the change AND leaves its review schedule
  unchanged (the card's next-due time in `/review` is unaffected)
- Delete requires two clicks (arm → confirm); a single click never deletes; deleted cards are gone and
  do not reappear on reload. With a deck spanning >1 page, deleting a card from an already-loaded page
  and then clicking "Load more" still surfaces every remaining card (no row skipped — the offset cursor
  compensated; F2)
- Unauthenticated visit to `/cards` redirects to `/auth/signin`; dashboard links into `/cards`

**Implementation Note**: After automated verification, pause for the full manual walkthrough before
considering the slice complete.

---

## Testing Strategy

### Unit / handler-property Tests (`npm test`):

- `cards.test.ts` (extended) — `GET /api/cards`: auth gate, `order(created_at desc)` + `range(offset,
  offset+PAGE_SIZE)` query shape, `hasMore` derivation (fetch `PAGE_SIZE+1` / trim), `nextOffset =
  offset + cards.length`, 400 on bad `offset`, generic 500.
- `cards-id.test.ts` (new) — PATCH/DELETE: auth gate, uuid `params.id` validation, PATCH body schema
  (blank/missing → 400; oversized → 413), **the FR-013 guard** (captured `update()` payload keys are
  exactly `["answer","question"]` even with hostile extra body fields), RLS-miss→404, generic 500.

### Integration Tests (`npm run test:integration`, local Supabase):

- `rls-cards-management.test.ts` (new) — two real users via own tokens: B reads/edits/deletes 0 of A's
  rows; A retains full access; and **the FR-013 invariant** — a content-only PATCH leaves every FSRS
  schedule column byte-for-byte unchanged while `question`/`answer`/`updated_at` change.

### Manual Testing Steps:

1. Seed/generate several cards; open `/cards`; confirm newest-first order and "Load more" paging.
2. Edit a card's Q/A; save; confirm the change persisted and (via `/review` or a direct read) the
   schedule (`due`/`state`/etc.) is unchanged.
3. Click Delete once → confirm it only arms; click again → card is permanently gone (reload to verify).
4. Attempt PATCH/DELETE of another user's card id via REST → 404, no effect.
5. Visit `/cards` while signed out → redirected to `/auth/signin`.

## Performance Considerations

- The <300ms p95 browse/edit NFR is met by **bounded pages (50) served by the existing
  `(user_id, created_at desc)` index** — a fast indexed range scan for the PRD's <1 000-card decks —
  and by editing/deleting via local state updates (no full-list refetch after a mutation).
- Fetching `PAGE_SIZE + 1` rows to derive `hasMore` avoids a separate `count` query per page.
- No client virtualization library is loaded; "small" data volume per the PRD makes a "Load more"
  pager sufficient and keeps the island bundle minimal.

## Migration Notes

- **No DB migration in this slice.** The schema (including the S-02 FSRS columns) and the
  `(user_id, created_at desc)` index already support browse/edit/delete.
- **S-02 coordination (FR-013):** the edit path must never write the FSRS columns S-02 added. This
  plan enforces that structurally (zod schema + payload of only `question`/`answer`) and proves it
  (handler-property key assertion + integration "schedule unchanged after edit"). If the S-02 columns
  ever change, the integration test's schedule-column list must be updated to match.
- **S-04 (manual-card-creation) parallel coordination:** S-03 and S-04 both edit `src/middleware.ts`
  (both add the `/cards` prefix to `PROTECTED_ROUTES` — the **same** entry, so the second slice is a
  no-op there), `src/pages/dashboard.astro` (both add an action-group link), and both create files under
  `src/pages/api/cards/` (S-03: `[id].ts`; S-04: `manual.ts`). The static `manual.ts` and dynamic
  `[id].ts` coexist safely — Astro resolves the static route first, and `[id].ts` rejects a non-uuid
  `id`, so `/api/cards/manual` never reaches the `[id]` handler. Land one slice, then rebase the other;
  expect only a trivial merge on the `PROTECTED_ROUTES` line and the dashboard action group.

## References

- Change identity: `context/changes/deck-management/change.md`
- Roadmap slice S-03: `context/foundation/roadmap.md` (lines 107–117)
- PRD FR-012 / FR-013 / FR-014 / NFRs: `context/foundation/prd.md` (lines 113–118, 133)
- S-02 exemplar plan (format + S-03 coordination note): `context/archive/2026-06-21-spaced-repetition-review/plan.md`
- F-01 migration (schema + RLS + grants): `supabase/migrations/20260619123010_create_flashcards.sql`
- S-02 FSRS columns: `supabase/migrations/20260621130539_*` + `20260621131214_reconcile_flashcards_to_fsrs_v5_card.sql`
- Existing card route (POST to extend): `src/pages/api/cards.ts`
- Spoofing-guard / RLS-miss-404 pattern: `src/pages/api/review/rate.ts`; tests `test/handlers/review-rate.test.ts`
- List/query-capture test pattern: `test/handlers/review-due.test.ts`
- Owner-forcing key-assertion pattern: `test/handlers/cards.test.ts`
- RLS isolation test pattern: `test/integration/rls-flashcards.test.ts`; helpers `test/support/supabase.ts`
- Synthetic API context (to extend for `params`): `test/support/api-context.ts`
- UI precedents: `src/pages/generate.astro`, `src/components/generation/GeneratorView.tsx`, `src/components/review/ReviewSession.tsx`
- Test cookbook: `context/foundation/test-plan.md` §6
- RLS grant/isolation lesson: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Test-infra — `params` + `url` in the API-context factory

#### Automated

- [x] 1.1 Existing unit suite still green (`npm test`) — 338d2ac
- [x] 1.2 Lint passes (`npm run lint`) — 338d2ac
- [x] 1.3 Type checking passes (`npx astro sync && npm run lint`) — 338d2ac

#### Manual

- [x] 1.4 `makeApiContext({ params: { id } }).params.id` returns the supplied id (sanity) — 338d2ac

### Phase 2: List endpoint — `GET /api/cards` (paginated)

#### Automated

- [x] 2.1 Handler-property tests pass (`npm test`)
- [x] 2.2 Lint + build pass (`npm run lint && npm run build`)
- [x] 2.3 Type checking passes (`npx astro sync && npm run lint`)

#### Manual

- [x] 2.4 `GET /api/cards` returns newest 50; `?offset=50` returns the next page; `hasMore` flips on last page; `nextOffset` advances
- [x] 2.5 Existing `POST /api/cards` (generate→save) behavior unchanged

### Phase 3: Mutation endpoints — `PATCH` / `DELETE /api/cards/[id]`

#### Automated

- [ ] 3.1 Handler-property tests pass, incl. the FR-013 payload-keys guard (`npm test`)
- [ ] 3.2 RLS integration test passes, incl. schedule-unchanged-after-edit (`npm run test:integration`)
- [ ] 3.3 Lint + build pass (`npm run lint && npm run build`)
- [ ] 3.4 Type checking passes (`npx astro sync && npm run lint`)

#### Manual

- [ ] 3.5 PATCH own card persists Q/A and leaves `due`/`state`/etc. unchanged
- [ ] 3.6 PATCH/DELETE another user's cardId returns 404 (no effect)
- [ ] 3.7 DELETE own card returns 200 and the card is gone from a subsequent `GET /api/cards`

### Phase 4: Deck UI — `/cards` page + `DeckView` island

#### Automated

- [ ] 4.1 Lint passes (`npm run lint`)
- [ ] 4.2 Build passes (`npm run build`)
- [ ] 4.3 Type checking passes (`npx astro sync && npm run lint`)
- [ ] 4.4 Existing unit + integration suites still green (`npm test && npm run test:integration`)

#### Manual

- [ ] 4.5 `/cards` lists cards newest-first; "Load more" appends the next page only when more exist
- [ ] 4.6 Editing Q/A persists and leaves the review schedule unchanged (verified via `/review` next-due)
- [ ] 4.7 Delete requires arm→confirm; a single click never deletes; deleted cards stay gone on reload; deleting from a loaded page then "Load more" skips no remaining card (offset cursor; F2)
- [ ] 4.8 Unauthenticated `/cards` redirects to `/auth/signin`; dashboard links into `/cards`
