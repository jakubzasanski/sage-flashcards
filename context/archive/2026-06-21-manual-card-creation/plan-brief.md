# Manual Card Creation — Plan Brief

> Full plan: `context/changes/manual-card-creation/plan.md`

## What & Why

Add the **smallest card-authoring path**: a logged-in user types one question and one answer and saves a
single flashcard to their deck with `source:'manual'`. This is roadmap slice **S-04** (Stream B, deck
authoring), implementing PRD FR-011. It is independent of the AI generation slice — the persona needs to
create the occasional ad-hoc card from memory without pasting source text. The manual-origin write also
feeds the denominator of the "75% of cards via AI" success metric.

## Starting Point

F-01 (card persistence) and S-02 (review) have shipped. The `flashcards` table already has the
`source('ai'|'manual')` CHECK, RLS + per-user policies + grants, and FSRS schedule columns whose defaults
(`due = now()`, `state = New`, zeros) make any new card immediately reviewable. `POST /api/cards` already
demonstrates the owner/origin-forcing pattern (hardcodes `source:'ai'`, forces `user_id`). `src/types.ts`
already carries `CardSource` and `CreateFlashcardCommand` (annotated "consumed by S-04"). A mature test
harness (handler-property + RLS-integration cookbook) is in place. **No schema change is needed.**

## Desired End State

A user opens `/cards/new` (linked from the dashboard), types a question and an answer, and clicks "Add
card". The card is saved with `source:'manual'` and `user_id` = their own id; the form confirms and clears
for the next card. Empty fields are blocked client-side and rejected server-side. Unauthenticated access
redirects (`/cards/new`) or returns 401 (`/api/cards/manual`). The new card is immediately due, so it
appears in the dashboard due-count and the next review session.

## Key Decisions Made

| Decision                          | Choice                                                  | Why (1 sentence)                                                                            | Source |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| Endpoint shape                    | Dedicated `POST /api/cards/manual`                      | Keeps each path's origin-forcing rule unambiguous; leaves the AI bulk route's `source:'ai'` guarantee untouched. | Plan   |
| Origin/owner forcing              | Server forces `source:'manual'` + `user_id`            | Mirrors `cards.ts` trust boundary; client `source`/`user_id` never trusted (zod strips, map overwrites). | Plan   |
| Schema                            | No migration                                            | `source` already permits `'manual'`; FSRS defaults make new cards due now (F-01 + S-02 shipped). | Plan   |
| Cardinality                       | Exactly one card per submit                             | FR-011 is "a flashcard" (singular); bulk is the AI path.                                     | Plan   |
| New-card schedule                 | Inherits FSRS column defaults (due now, state New)      | Immediately reviewable with no insert-path change — free link to S-02.                       | Plan   |
| Persistence client               | User's authenticated client (`createClient`)            | RLS enforces ownership; never service-role.                                                  | Plan   |
| Validation                        | zod `.trim().min(1)` on question + answer; 16 KB cap    | Non-empty trimmed Q/A; tight body cap for a single card vs. `/api/cards`' 128 KB.            | Plan   |
| UI entry                          | New protected `/cards/new` page + `ManualCardForm` island | Mirrors the `/generate` + `/review` page+island precedent; `"/cards"` added to PROTECTED_ROUTES. | Plan   |
| UI idiom                          | Mirror `GeneratorView` (input/error/loading/confirm-clear) | Reuse the established form pattern + shadcn `Button`/`Textarea`; no new dependency.          | Plan   |
| Test coverage                     | Handler-property only (+ optional cheap RLS assertion)  | Auth/validation/forcing at the cheapest layer; `flashcards` RLS already proven; no E2E.      | Plan   |

## Scope

**In scope:** dedicated `POST /api/cards/manual` (owner/origin-forcing, RLS-guarded, body-cap + zod
validation); a `ManualCardRequest` DTO; a protected `/cards/new` page + `ManualCardForm` island mirroring
`GeneratorView`; a dashboard entry link; `"/cards"` added to `PROTECTED_ROUTES`; handler-property tests.

**Out of scope:** schema/migration changes; bulk/multi-card manual create; edit/delete/browse (S-03);
changes to the AI bulk-save route; AI/source text; rich text/tags/decks; an E2E test.

## Architecture / Approach

Two thin layers, API-first: **endpoint** (`POST /api/cards/manual` takes `{question, answer}`,
zod-validates + trims, inserts one `FlashcardInsert` with `source:'manual'` + `user_id = user.id` forced,
generic error bodies — the single trust boundary, handler-property tested against the `cards.test.ts`
template) → **UI** (protected `/cards/new` page hosting a `ManualCardForm` island that POSTs the form,
shows loading/error, and confirms + clears on success; dashboard link in). No schema work; the new card
inherits S-02's due-now defaults.

## Phases at a Glance

| Phase                       | What it delivers                                                        | Key risk                                                                  |
| --------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Manual-create API        | `POST /api/cards/manual` (forcing + validation) + handler-property tests | Route must force `source:'manual'` + `user_id` and ignore client values.  |
| 2. Manual-create UI         | `/cards/new` page + `ManualCardForm` island + dashboard entry            | Form must mirror `GeneratorView`'s error/confirm idioms; unauth redirect. |

**Prerequisites:** F-01 + S-02 shipped (done); local Supabase running for the integration suite re-run.
**Estimated effort:** ~1 session across 2 phases (both layers are small; no schema, no new dependency).

## Open Risks & Assumptions

- **Dedicated endpoint vs. extending `/api/cards`** — chose dedicated to keep each path's origin-forcing
  unambiguous; **the decision most worth human review** (a unified create route is the alternative). If
  reversed, the endpoint shape changes but the forcing logic and tests do not.
- **`/cards/new` page** (vs. an inline dashboard form) chosen to mirror the `/generate`/`/review`
  precedent; `"/cards"` prefix added to `PROTECTED_ROUTES` (also covers future S-03 deck routes).
- **Manual-source RLS assertion deferred unless cheap** — `flashcards` RLS keys on `user_id`, not
  `source`, so the existing two-user test already covers manual rows; a source-specific assertion is
  reinforcement only.
- **No E2E this slice** — handler-property tests cover the route; a browser test adds little signal for a
  single Q/A form. Revisit via `/10x-e2e` if deck authoring grows.

## Success Criteria (Summary)

- A signed-in user adds a single card via `/cards/new`; it persists with `source:'manual'`, owned by the
  caller, and is immediately reviewable.
- The route forces `source` + `user_id` server-side and ignores client-supplied values; unauth access
  redirects (`/cards/new`) or returns 401 (`/api/cards/manual`); empty fields are rejected.
- `npm run lint`, `npm run build`, `npm test`, and the existing `npm run test:integration` all pass.
