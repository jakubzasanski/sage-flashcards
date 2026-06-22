# Manual Card Creation — Implementation Plan

## Overview

Add the smallest card-authoring path: a logged-in user types one question and one answer and saves a
single flashcard to their deck with `source:'manual'`. This is roadmap slice **S-04** (Stream B, deck
authoring), implementing PRD FR-011. F-01 (card persistence) has shipped, so the table, RLS, grants, and
the origin flag already exist — this slice adds one dedicated API endpoint and one small UI page/island.

The endpoint mirrors the **owner/origin-forcing** trust boundary already established by
`POST /api/cards`: the client supplies only `{question, answer}`; the server forces `source:'manual'` and
`user_id = session user`, never trusting a client-supplied `source` or `user_id`. Because the
`flashcards` table now carries FSRS schedule columns (added by S-02) whose defaults are `due = now()`,
`state = 0/New`, and zeros, a manually-created card is **immediately reviewable** with no insert-path
change — a free link to S-02's review loop.

## Current State Analysis

- **`flashcards` table** (`supabase/migrations/20260619123010_create_flashcards.sql` +
  `20260621130539_*` + `20260621131214_*`): `id, user_id, question, answer, source('ai'|'manual'),
  created_at, updated_at`, plus the FSRS schedule columns added by S-02 (`due` default `now()`, `state`
  default `0`, `stability/difficulty/.../reps/lapses` default `0`, `last_review` nullable). RLS enabled
  with 4 per-user policies + `grant select, insert, update, delete ... to authenticated`. **No schema
  change is needed for this slice** — `source` already allows `'manual'` via its CHECK, and the schedule
  defaults make a new manual card due now.
- **API surface** (`src/pages/api/`): `POST /api/generate`, `POST /api/cards` (bulk-save accepted AI
  cards — **hardcodes `source:'ai'`**, forces `user_id` server-side, zod-validated, 413 body cap, generic
  error bodies), and `src/pages/api/review/{due,rate}.ts`. All routes `prerender = false`, auth via
  `context.locals.user`, persistence via `createClient(headers, cookies)` (the user's authenticated
  client, so RLS enforces ownership).
- **Types** (`src/types.ts`): `Flashcard`/`FlashcardInsert`/`FlashcardUpdate` derived from
  `src/db/database.types.ts`; `CardSource = "ai" | "manual"`; **`CreateFlashcardCommand =
  Pick<FlashcardInsert, "question" | "answer" | "source">`** already exists and is annotated "consumed by
  ... S-04 (manual create)".
- **UI** (`src/components/generation/GeneratorView.tsx`): the input/error/loading idiom to mirror —
  `useState` for form + `isSaving`/`error`/success state, `fetch` POST, generic error fallbacks, a
  success confirmation screen with a reset action. shadcn/ui installed: `Button`, `Card`, `Textarea`.
- **Routing** (`src/middleware.ts`): `PROTECTED_ROUTES = ["/dashboard", "/generate", "/review"]`;
  unauthenticated users on a protected route redirect to `/auth/signin`. `/generate.astro` and
  `/review.astro` are the precedent for a protected page hosting a `client:load` React island inside
  `Layout.astro`.
- **Dashboard** (`src/pages/dashboard.astro`): already links to `/generate` and `/review`; the natural
  place to add a "New card" entry point.
- **Test harness** (cookbook §6, mature): handler-property tests via `makeApiContext()`
  (`test/support/api-context.ts`) with a mocked, insert-capturing Supabase client
  (`test/handlers/cards.test.ts` is the exact owner/origin-forcing template); two-user RLS isolation via
  `flashcardsRequest()` with each user's own token (`test/integration/rls-flashcards.test.ts`).
- **Lesson** (`context/foundation/lessons.md`): new RLS tables need explicit grants + a two-user
  isolation test. We are **reusing the already-granted table** — no new grant, and RLS isolation for
  `flashcards` is already covered by the existing integration test.

### Key Discoveries:

- `CreateFlashcardCommand` and `CardSource` already exist in `src/types.ts` — no new shared type is
  required. The route's body type is the zod-inferred type of its body schema (mirroring `cards.ts`,
  which adds no request DTO); the insert payload is `FlashcardInsert`.
- `test/handlers/cards.test.ts:78-104` ("owner/origin forcing") is the precise template for proving the
  manual route forces `source:'manual'` + `user_id = session user` and that a client-supplied
  `source`/`user_id` never survives (zod strips unknown keys at parse; the map overwrites).
- The existing `/api/cards` body-cap (`MAX_BODY_BYTES = 128 * 1024`) is sized for ~30 cards; a single
  manual card needs a far smaller cap. A small dedicated cap (e.g. 16 KB) bounds a single Q/A pair while
  staying generous.
- New manual cards inherit S-02's column defaults (due now, state New), so they appear in the dashboard
  due-count and the review queue immediately — no extra wiring.

## Desired End State

A logged-in user opens `/cards/new` (linked from the dashboard), types a question and an answer into a
small form, and clicks "Add card". The card is saved to their deck with `source:'manual'` and
`user_id` = their own id; on success the form confirms ("Card added to your deck") and clears so they can
add another. Empty/whitespace-only question or answer is blocked client-side and rejected server-side
(400). An unauthenticated visitor hitting `/cards/new` is redirected to `/auth/signin`; an unauthenticated
`POST /api/cards/manual` returns 401. The new card is immediately due, so it shows up in the dashboard
due-count and the next review session.

**Verification**: `npm run lint` + `npm run build` pass; `npm test` (handler-property: auth gate,
validation, source/owner forcing & spoofing guard) passes; the existing `npm run test:integration` RLS
suite still passes (a cheap `source:'manual'` assertion is added if it does not regress); manual
walkthrough confirms add→confirm→clear and the unauth redirect/401.

## What We're NOT Doing

- **No schema change / no new migration** — `source` already permits `'manual'` and the FSRS schedule
  defaults make new cards due now (F-01 + S-02 already shipped).
- **No bulk manual create / no multi-card form** — exactly one card per submit (FR-011 is "a flashcard",
  singular). Bulk save is the AI path (`/api/cards`), left untouched.
- **No edit/delete/browse of existing cards** — that is S-03 (deck management).
- **No change to the existing `/api/cards` (AI bulk-save) route** — it stays hardcoded to `source:'ai'`;
  the manual path is a separate, dedicated endpoint so neither path can be confused for the other.
- **No AI, no source text, no candidate review** — manual entry is fully decoupled from generation.
- **No rich text, tags, decks, or card metadata** — plain question + answer text only (PRD non-goals).
- **No E2E (Playwright) test in this slice** — handler-property tests cover the route's behavior
  (auth/validation/forcing); the RLS isolation is already proven for `flashcards`. A manual-create e2e
  can be added later via `/10x-e2e` if the deck-authoring stream warrants it.

## Implementation Approach

Two thin layers, built API-first so the trust boundary is verifiable before any UI consumes it: a
dedicated `POST /api/cards/manual` endpoint (zod-validated, owner/origin-forcing, RLS-guarded,
handler-property tested) → a protected `/cards/new` page hosting a small `ManualCardForm` React island
that mirrors `GeneratorView`'s input/error/loading idioms. The route is the single trust boundary — it
forces `source:'manual'` and `user_id` server-side and never trusts client-supplied values, exactly as
`/api/cards` forces `source:'ai'`. Keep the existing AI bulk-save path untouched.

## Critical Implementation Details

- **Owner/origin forcing is the security contract**: the route accepts only `{question, answer}`; zod
  strips any extra keys (`user_id`, `source`) at parse, and the insert map sets `source:'manual'` +
  `user_id: user.id` unconditionally. This is the `cards.ts` pattern, and `cards.test.ts` is the test
  template.
- **Per-user client, never service-role**: persistence goes through `createClient(headers, cookies)` so
  RLS enforces ownership; the route never uses the service-role key.
- **Generic error bodies**: a DB/RLS failure returns a generic 500 with no row contents echoed (privacy,
  risk #2) — mirror `cards.ts`.
- **Trim + non-empty validation**: zod `.trim().min(1)` on both fields (matches `cards.ts`'s `cardSchema`);
  the persisted values are the trimmed strings.
- **Single-card body cap**: a small `MAX_BODY_BYTES` (16 KB) rejects oversized bodies before parsing
  (413), bounding what an authed client can make the route buffer for one card.

---

## Phase 1: Manual-Create API Endpoint

### Overview

A dedicated authenticated, `prerender = false` endpoint that takes `{question, answer}`, validates and
trims them, and inserts one row with `source:'manual'` + `user_id` forced server-side. RLS-guarded via
the user's authenticated client. Proven with handler-property tests (mocked, insert-capturing client).

### Changes Required:

#### 1. Manual-create endpoint

**File**: `src/pages/api/cards/manual.ts` (new)

**Intent**: Persist exactly one manually-entered flashcard to the signed-in user's deck with manual
origin, forcing `source` and `user_id` server-side so neither can be spoofed by the client — the trust
boundary for the manual path, mirroring `POST /api/cards`.

**Contract**: `POST`, `prerender = false`. Auth-gated via `context.locals.user` (401 if absent). Reject a
present, numeric, oversized `content-length` with 413 before parsing (`MAX_BODY_BYTES = 16 * 1024`).
Parse JSON (400 on unparseable). zod body schema `{ question: z.string().trim().min(1), answer:
z.string().trim().min(1) }` (400 on invalid; unknown keys like `source`/`user_id` are stripped at parse).
Persist via `createClient(context.request.headers, context.cookies)` (500 if the client cannot be
created). Insert one `FlashcardInsert` row: `{ question, answer, source: "manual", user_id: user.id }`
(the schedule columns default to due-now/New). On insert error return a generic 500 with **no** row
contents echoed. On success return `{ saved: 1 }` with 201 (exact mirror of `/api/cards`' insert →
`{ saved }` shape; no `.select()` round-trip needed). The request body type is the zod-inferred type of
the body schema (`z.infer<typeof bodySchema>`); the insert row is typed `FlashcardInsert`. No new shared
type is added to `src/types.ts` — `cards.ts` defines no request DTO either, and `CardSource` already
exists.

#### 2. Handler-property tests

**File**: `test/handlers/cards-manual.test.ts` (new, per cookbook §6.2)

**Intent**: Prove the route's properties with a mocked Supabase client (no DB): auth gate, body cap,
validation, and — the core of this slice — that the route forces `source:'manual'` + `user_id = session
user` and ignores any client-supplied `source`/`user_id` (the spoofing guard).

**Contract**: Model on `test/handlers/cards.test.ts`. Use `makeApiContext()` and a fake client whose
`from("flashcards").insert(row)` records its argument. Assert:
- 401 when `user: null`; `createClient` not called.
- 413 when `content-length` exceeds the cap (numeric, present); 400 on unparseable JSON.
- 400 on invalid input via `it.each` — empty/whitespace question, empty/whitespace answer, missing field,
  non-object body.
- **Owner/origin forcing**: given a body with `{question, answer, user_id:"ATTACKER-ID", source:"ai"}`,
  the inserted row has `source === "manual"`, `user_id === USER_ID`, never `"ATTACKER-ID"`, and exactly
  the keys `["answer","question","source","user_id"]` (no extra keys leak through).
- 201 on success returning `{ saved: 1 }`; `from("flashcards")` called. (The fakeClient template's
  `insert()` resolves directly to `{ error }`, so this shape works against it unchanged — no `.select()`.)
- 500 when the client cannot be created; 500 without echoing a `SENTINEL` fed through `question`/`answer`
  on an insert error (privacy, risk #2).
- Break-verify each protected behavior (invert → red → revert).

#### 3. (Optional, if cheap) manual-source RLS assertion

**File**: `test/integration/rls-flashcards.test.ts` (edit — only if it does not complicate the suite)

**Intent**: Reinforce that a `source:'manual'` row is owner-isolated exactly like an AI row (the F-01
lesson, applied to the manual origin).

**Contract**: If the existing two-user suite can seed one row with `source:'manual'` without restructuring
its setup, add an assertion that user B sees 0 of user A's manual rows and cannot forge a manual row owned
by A. If this is not cheap, **skip it** — `flashcards` RLS is already proven origin-agnostically by the
existing test (RLS policies key on `user_id`, not `source`), and document the skip in Open Risks &
Assumptions.

### Success Criteria:

#### Automated Verification:

- Handler-property tests pass: `npm test`
- Existing suites still green: `npm test && npm run test:integration`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Type checking passes: `npx astro sync && npm run lint`

#### Manual Verification:

- `curl`/REST: `POST /api/cards/manual` as a logged-in user with `{question, answer}` returns 201 and the
  card appears in the user's deck with `source = 'manual'` and `user_id` = that user.
- The same request with an extra `user_id`/`source` in the body still saves a `manual` row owned by the
  caller (forging ignored).
- Unauthenticated `POST /api/cards/manual` returns 401.
- The new card's `due ≈ now()` and `state = 0` (immediately reviewable — shows in the dashboard due-count).

**Implementation Note**: After this phase and all automated verification passes, pause for manual
confirmation before Phase 2.

---

## Phase 2: Manual-Create UI

### Overview

A protected `/cards/new` page hosting a `ManualCardForm` React island that mirrors `GeneratorView`'s
input/error/loading idioms: two text inputs, an "Add card" button, inline error text, a loading state, and
a success confirmation that clears the form for the next card. A dashboard entry point links to it.

### Changes Required:

#### 1. Protected manual-create page

**File**: `src/pages/cards/new.astro` (new); `src/middleware.ts` (edit)

**Intent**: Add a protected page that hosts the manual-card form island, mirroring `/generate.astro` and
`/review.astro`.

**Contract**: New `cards/new.astro` rendering `<ManualCardForm client:load />` inside `Layout.astro`
(same cosmic-background header shell as `generate.astro`, title "New card", "Signed in as {user?.email}").
Add `"/cards"` to `PROTECTED_ROUTES` in `src/middleware.ts` (the prefix covers `/cards/new` and S-03's
`/cards` browse/edit routes via the existing `startsWith` check) so unauthenticated users redirect to
`/auth/signin`. **S-03 (deck-management) adds the same `"/cards"` entry — it is shared, not duplicated;
see the coordination note in Open Risks.**

#### 2. Manual-card form island

**File**: `src/components/manual/ManualCardForm.tsx` (new)

**Intent**: Own the small client form — capture question + answer, POST to `/api/cards/manual`, surface
loading/error states, and confirm + clear on success so the user can add another card.

**Contract**:
- `useState` for `question`, `answer`, `isSaving`, `error`, and a `saved` flag (mirror `GeneratorView`).
- Reuse `Textarea` and `Button` from `src/components/ui/` and the `cn()` helper for conditional classes.
- "Add card" disabled unless both fields are non-empty after trim and not currently saving.
- On submit: `fetch("/api/cards/manual", { method: "POST", headers: {"Content-Type":"application/json"},
  body: JSON.stringify({ question: question.trim(), answer: answer.trim() }) })`. On `!res.ok`, show the
  server `error` or a generic fallback ("Could not add the card. Please try again."); on network failure,
  "Could not reach the server. Please try again." (same fallbacks as `GeneratorView`).
- On success: show a confirmation ("Card added to your deck") with an "Add another" action that clears the
  fields and the saved flag — matching `GeneratorView`'s post-save confirmation pattern.
- Labels via `getByLabel`-friendly markup (label/aria) so the form is keyboard- and a11y-reachable.

#### 3. Dashboard entry point

**File**: `src/pages/dashboard.astro` (edit)

**Intent**: Give the user a way into manual creation alongside the existing "Generate flashcards" link.

**Contract**: Add a link/button to `/cards/new` ("New card" / "Add a card manually") in the existing
action group next to the `/generate` link, consistent with the current dashboard markup. No logic change
to the due-count.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Type checking passes: `npx astro sync && npm run lint`
- Existing unit + integration suites still green: `npm test && npm run test:integration`

#### Manual Verification:

- `/cards/new` is reachable when signed in and renders the form; an unauthenticated visit redirects to
  `/auth/signin`.
- Entering a question and an answer and clicking "Add card" saves the card and shows the confirmation; the
  form clears for the next card.
- Empty/whitespace-only question or answer keeps "Add card" disabled (and is rejected server-side if
  forced).
- The newly added card appears in the dashboard due-count and in the next review session.
- A failed save shows an inline error and does not clear the form.

**Implementation Note**: After automated verification, pause for the manual walkthrough before considering
the slice complete.

---

## Testing Strategy

### Unit Tests (`npm test`):

- `cards-manual.test.ts` — handler-property: 401 auth gate (#5); 413 body cap + 400 validation incl.
  empty/whitespace question/answer boundaries (#6); **source/owner forcing** — inserted row carries
  `source:'manual'` + `user_id` = session user, client-supplied `source`/`user_id` stripped, no extra keys
  (#1 owner, #4 nothing-extra); generic 500 with no `SENTINEL` from `question`/`answer` on insert error
  (#2). Oracle = the PRD/route contract, not a payload copied from the route. Break-verify each.

### Integration Tests (`npm run test:integration`, local Supabase):

- Existing `rls-flashcards.test.ts` already proves two-user owner isolation on `flashcards`
  origin-agnostically (policies key on `user_id`). Optionally add a `source:'manual'` row to the existing
  assertions **only if cheap**; otherwise no new integration test (documented in Open Risks).

### Manual Testing Steps:

1. Sign in; open `/cards/new`; add a card with a question and an answer — confirm the success message and
   that the form clears.
2. Verify the card is in the deck with `source = 'manual'` and owned by the caller; confirm it raises the
   dashboard due-count and appears in the next review session.
3. POST `/api/cards/manual` with a forged `user_id`/`source` in the body — confirm a `manual` row owned by
   the caller is saved (forging ignored).
4. Sign out; visit `/cards/new` — confirm redirect to `/auth/signin`; `POST /api/cards/manual` with no
   session returns 401.
5. Submit empty/whitespace fields — confirm the button stays disabled and a forced request returns 400.

## Performance Considerations

- A single-row insert through the user's RLS-scoped client; negligible cost, well within the <300ms p95
  NFR for card operations. No new index needed (the existing `(user_id, created_at desc)` and
  `(user_id, due asc)` indexes already serve list/review queries that this card joins).

## Migration Notes

- **No migration in this slice.** `source` already permits `'manual'` (F-01 CHECK), and the FSRS schedule
  defaults (S-02) make the new card immediately due. Both prerequisites have shipped.
- The manual-origin write contributes to the denominator of the "75% of cards via AI" success metric — by
  design (roadmap F-01 origin flag).

## References

- Change identity: `context/changes/manual-card-creation/change.md`
- Roadmap slice S-04: `context/foundation/roadmap.md` (lines 119–129)
- PRD FR-011 / §Business Logic / §Access Control: `context/foundation/prd.md` (lines 106–109, 136–141, 143–151)
- Owner/origin-forcing route to mirror: `src/pages/api/cards.ts`
- Owner/origin-forcing test template: `test/handlers/cards.test.ts`
- UI idiom to mirror: `src/components/generation/GeneratorView.tsx`; page shell: `src/pages/generate.astro`
- Protected-route list: `src/middleware.ts`; dashboard entry: `src/pages/dashboard.astro`
- Shared types (already include `CardSource`, `CreateFlashcardCommand`): `src/types.ts`
- RLS isolation test (already covers `flashcards`): `test/integration/rls-flashcards.test.ts`
- Test cookbook: `context/foundation/test-plan.md` §6; RLS grant/isolation lesson: `context/foundation/lessons.md`

## Open Risks & Assumptions

> This plan was drafted without a human in the loop; each decision below is the recommended default,
> grounded in an existing codebase pattern, and should be sanity-checked before/while implementing.

- **Dedicated endpoint vs. extending `/api/cards`** (assumption, low risk): chose a **dedicated**
  `POST /api/cards/manual` rather than adding a `source` parameter to the existing bulk AI route. Rationale:
  `/api/cards` hardcodes `source:'ai'` as its own trust boundary and is covered by tests asserting exactly
  that; threading a client-controlled `source` through it would weaken that guarantee. A separate endpoint
  keeps each path's forcing rule unambiguous. **Most worth human review** — if the team prefers a single
  unified create route, the endpoint shape changes (the forcing logic and tests stay the same).
- **Page route `/cards/new`** (assumption): chose a dedicated protected page over a form embedded on the
  dashboard, mirroring the `/generate` and `/review` page+island precedent and giving a clean URL. Added
  `"/cards"` (prefix) to `PROTECTED_ROUTES` so S-03's deck browse/edit routes — which share the agreed
  Stream-B `/cards` namespace — are covered by the same entry. If the team wants the form inline on the
  dashboard, only Phase 2 wiring changes.
- **S-03 (deck-management) parallel coordination** (assumption, low risk): S-04 and S-03 both edit
  `src/middleware.ts` (both add the `/cards` prefix — the **same** `PROTECTED_ROUTES` entry, so the
  second slice changes nothing there), `src/pages/dashboard.astro` (both add an action link), and both
  create files under `src/pages/api/cards/` (S-04: `manual.ts`; S-03: `[id].ts`). Static `manual.ts` and
  dynamic `[id].ts` coexist — Astro matches the static route first and `[id].ts` rejects a non-uuid id,
  so `/api/cards/manual` never reaches it. Land one slice, then rebase the other; expect only a trivial
  merge on the `PROTECTED_ROUTES` line and the dashboard markup.
- **Response shape `{ saved: 1 }`** (decision): mirrors `/api/cards` exactly and needs no `.select()`
  round-trip, so the handler-property fakeClient template works unchanged. The UI only needs
  success/failure. If a future "view card" affordance needs the inserted id, switch to
  `.insert(row).select("id").single()` returning `{ id }` — and extend the test's fake client with a
  `.select().single()` chain at that point.
- **Body cap 16 KB** (assumption): a single Q/A pair is tiny; 16 KB is generous headroom while far tighter
  than `/api/cards`' 128 KB (sized for 30 cards). Adjust if cards are expected to be large.
- **Manual-source RLS assertion deferred unless cheap** (assumption): `flashcards` RLS policies key on
  `user_id`, not `source`, so the existing two-user isolation test already covers manual rows; a
  source-specific assertion is reinforcement, not new coverage. Skipped if it would restructure the
  existing suite.
- **No E2E this slice** (decision): handler-property tests cover auth/validation/forcing and the RLS is
  already proven; a browser test adds little signal for a one-field-pair form. Revisit via `/10x-e2e` if
  deck-authoring grows.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Manual-Create API Endpoint

#### Automated

- [x] 1.1 Handler-property tests pass (`npm test`) — d7df881
- [x] 1.2 Existing suites still green (`npm test && npm run test:integration`) — d7df881
- [x] 1.3 Lint passes (`npm run lint`) — d7df881
- [x] 1.4 Build passes (`npm run build`) — d7df881
- [x] 1.5 Type checking passes (`npx astro sync && npm run lint`) — d7df881

#### Manual

- [x] 1.6 `POST /api/cards/manual` saves a `source:'manual'` row owned by the caller (201) — d7df881
- [x] 1.7 A forged `user_id`/`source` in the body is ignored (still a manual row owned by the caller) — d7df881
- [x] 1.8 Unauthenticated `POST /api/cards/manual` returns 401 — d7df881
- [x] 1.9 The new card is immediately due (`due ≈ now()`, `state = 0`) — shows in the dashboard due-count — d7df881

### Phase 2: Manual-Create UI

#### Automated

- [x] 2.1 Lint passes (`npm run lint`) — d121c2f
- [x] 2.2 Build passes (`npm run build`) — d121c2f
- [x] 2.3 Type checking passes (`npx astro sync && npm run lint`) — d121c2f
- [x] 2.4 Existing unit + integration suites still green (`npm test && npm run test:integration`) — d121c2f

#### Manual

- [x] 2.5 `/cards/new` renders the form when signed in; unauth visit redirects to `/auth/signin` — d121c2f
- [x] 2.6 Adding a question + answer saves the card, shows the confirmation, and clears the form — d121c2f
- [x] 2.7 Empty/whitespace-only question or answer keeps "Add card" disabled — d121c2f
- [x] 2.8 The new card appears in the dashboard due-count and the next review session — d121c2f
- [x] 2.9 A failed save shows an inline error and does not clear the form — d121c2f
