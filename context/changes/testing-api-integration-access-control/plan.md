# API Integration + Access Control Tests — Implementation Plan

## Overview

Phase 2 of `context/foundation/test-plan.md`. Add automated integration + access-control tests for
`/api/generate` and `/api/cards`, covering four risks: **#5** unauthenticated API access (401),
**#6** resource abuse (413 / 400 caps), **#1** cross-user data access (RLS isolation), and **#4**
save owner/origin correctness. Tests are organized into two layers — fast handler-property tests
(no database) and a real-local-Supabase two-user RLS test — behind a suite split so the existing
Docker-free `npm test` floor stays green.

## Current State Analysis

- **Routes are small and fully mapped** (see research). `/api/generate` and `/api/cards` each gate on
  `context.locals.user` (401), check `content-length` against a body cap (413), parse JSON (400),
  zod-validate (400), then act. `/api/cards` forces `source:"ai"` + `user_id: user.id` server-side
  and inserts through the user's RLS-scoped client (`src/pages/api/cards.ts:59-66`).
- **The API gate is the handler's own**, not the middleware's: `PROTECTED_ROUTES = ["/dashboard",
  "/generate"]` (`src/middleware.ts:4`) does not include `/api/*`, so the 401 is asserted at the
  handler, and the page redirect (already covered by e2e `unauthenticated-access.spec.ts`) is a
  separate concern.
- **RLS is `enable`, not `force`** (`supabase/migrations/20260619123010_create_flashcards.sql:31`),
  so service-role bypasses it — isolation must be asserted through each user's own token.
- **Test harness exists from Phase 1**: Vitest 4.x with plain `defineConfig`, `environment:"node"`,
  `astro:env/server` aliased to a stub that exports only `LLM_*` (not `SUPABASE_*`), include glob
  `["src/**/*.test.ts", "test/**/*.test.ts"]` (`vitest.config.ts`). `test/helpers/provider.ts` holds
  the fetch-mock idiom.
- **Two-user machinery already exists for e2e** in `tests/e2e/support/supabase.ts`
  (`ensureTestUser`, `getUserToken`, `deleteCardsByQuestionPrefix`) and `tests/e2e/support/config.ts`
  (local Supabase URL + anon + service-role demo keys, `E2E_USER`).
- **No `test:integration` script and no synthetic `APIContext` factory** exist yet.

## Desired End State

`npm test` runs the Docker-free unit + handler-property suites (Phase 1 generation tests + the new
route handler tests) and passes with no local Supabase. `npm run test:integration` runs the RLS
two-user isolation suite against a running local Supabase and passes. The e2e suite still passes,
now importing the two-user helpers from a shared module. `test-plan.md` §6.2/§6.4 document the real
idioms and §3 Phase 2 is marked `complete`.

Verify: `npm test` green with Supabase stopped; `npx supabase start && npm run test:integration`
green; `npm run test:e2e` green; `npm run lint` and `npm run build` green.

### Key Discoveries:

- Two-layer split is the correct altitude: handler properties (DB-free) vs RLS isolation (real DB) —
  `context/changes/testing-api-integration-access-control/research.md`.
- Build the synthetic request as a plain object `{ headers: new Headers({...}), json: async () => body }`
  rather than a real `Request` — undici recomputes `content-length` on a real `Request` body, which
  would break the 413 test. (research → Architecture Insights)
- 413 fires only on a present, numeric, oversized `content-length`: `Number(null)=0`, `Number("abc")=NaN`,
  both fail `> limit`. The 413 test must set a numeric oversized header.
- Owner-forcing is provable without a DB: mock `@/lib/supabase`'s `createClient` to return a fake
  whose `from("flashcards").insert(rows)` records `rows`; assert `source:"ai"` and `user_id===user.id`
  even when the client sends a foreign `user_id`/`source`.
- Service-role key is for seeding/cleanup only, never the isolation assertion (`lessons.md`;
  `tests/e2e/support/supabase.ts`).
- `MAX_SOURCE_CHARS = 10_000`, `MAX_CANDIDATES = 30` (`src/lib/services/generation.ts:14-15`);
  `GenerationError.kind ∈ {"config","upstream","parse"}` (`generation.ts:30-39`).

## What We're NOT Doing

- **No CI wiring.** That is test-plan §3 Phase 4 (quality-gates), a separate rollout phase.
- **No new real-HTTP `/api/cards` save test.** Risk #4 is covered by the owner-forcing handler test
  + the RLS isolation test + the existing e2e `seed.spec.ts` save path (user decision).
- **No in-progress review-session restore test.** Already shipped in Phase 3 e2e
  (`review-session-persistence.spec.ts`).
- **No `@cloudflare/vitest-pool-workers`.** Phase 1 deferred it; synthetic-context handler tests +
  direct-PostgREST RLS test do not need the workers pool.
- **No re-testing of the generation service internals** (retry classification, extractJson, caps) —
  locked at the unit layer in Phase 1.
- **No new production code.** Tests, helpers, config, and docs only.

## Implementation Approach

Bottom-up: stand up the harness (shared helpers, synthetic-context factory, suite split) first so
both test layers have a stable base, then write the DB-free handler tests, then the real-DB RLS
test, then document the idioms in the test-plan cookbook. Each phase is independently verifiable.

## Critical Implementation Details

- **413 test gotcha** — assert via a hand-built request object with an explicit numeric
  `content-length` header, not a real `Request` (undici recomputes the header). The handlers only
  call `context.request.headers.get("content-length")` and `context.request.json()`, so a partial
  stub typed as the needed slice of `APIContext` is faithful.
- **Suite split (Vitest 4 `projects`)** — the unit project includes the existing
  `src/**/*.test.ts` + the new handler tests; the integration project includes only the RLS test
  dir and is the one that needs Supabase. `npm test` runs the unit project; `npm run test:integration`
  runs the integration project. Keep plain `defineConfig` from `vitest/config` (the `@astrojs/cloudflare`
  adapter Vite plugin rejects Vitest env options — documented at `vitest.config.ts:5-8`).

## Phase 1: Harness — shared support + suite split

### Overview

Extract the two-user Supabase helpers into a shared module both e2e and integration import, add a
synthetic `APIContext` factory, and split Vitest into a Docker-free unit project and a
Supabase-dependent integration project with a `test:integration` script.

### Changes Required:

#### 1. Shared Supabase integration support

**File**: `test/support/supabase.ts` (new), `test/support/config.ts` (new)

**Intent**: Move `ensureTestUser`, `getUserToken`, `deleteCardsByQuestionPrefix`, and the
URL/anon/service-role/`E2E_USER` config out of `tests/e2e/support/` into a shared location so both
suites share one source of truth. Generalize `getUserToken` to take an explicit email/password (the
RLS test needs two distinct users, not one cached token).

**Contract**: Exports preserve the e2e call sites' behavior. `getUserToken(email, password)` returns
a fresh `access_token` for that user (drop or key the single-token cache by email so two users don't
collide). PostgREST helpers continue to use **anon key + the user's bearer token**, never
service-role, for any RLS-scoped operation. Config keeps the well-known local-dev demo keys as
env-overridable defaults.

#### 2. Migrate e2e to the shared module

**File**: `tests/e2e/support/supabase.ts`, `tests/e2e/support/config.ts` (and any importers under `tests/e2e/`)

**Intent**: Re-point the e2e suite at `test/support/*` so there is no duplicate copy. Either re-export
from the old paths or update import sites directly.

**Contract**: `npm run test:e2e` passes unchanged after the move (same user-mint, login, cleanup
behavior). No e2e behavior change — import paths only.

#### 3. Synthetic APIContext factory

**File**: `test/support/api-context.ts` (new)

**Intent**: Provide a helper to build the slice of `APIContext` the route handlers read, so handler
tests can invoke `POST` directly.

**Contract**: A factory returning `{ locals: { user }, request: { headers: Headers, json: () => Promise<unknown> }, cookies }`
typed to satisfy the handler's usage. Accepts overrides for `user` (incl. `null`), request headers
(esp. an explicit `content-length`), and the JSON body (incl. a thunk that throws to exercise the
bad-JSON 400 path). `cookies` can be a minimal stub since `createClient` is mocked in handler tests.

#### 4. Vitest suite split

**File**: `vitest.config.ts`, `package.json`

**Intent**: Separate the Docker-free unit/handler tests from the Supabase-dependent RLS test so
`npm test` needs no Docker, and add a script to run the integration project.

**Contract**: Two Vitest projects (e.g. via `test.projects`): **unit** includes
`src/**/*.test.ts` + `test/handlers/**/*.test.ts` (Phase 2 location); **integration** includes
`test/integration/**/*.test.ts` (Phase 3 location). Both keep the `astro:env/server` + `@` aliases.
`package.json`: `test` runs the unit project only; add `test:integration` running the integration
project. Shared support files under `test/support/**` must not be collected as suites.

### Success Criteria:

#### Automated Verification:

- [ ] `npm test` passes with local Supabase **stopped** (Docker-free floor intact)
- [ ] `npm run test:e2e` passes using the relocated shared helpers
- [ ] `npm run lint` passes
- [ ] `npx astro sync` has been run if env types are touched; `npm run build` passes

#### Manual Verification:

- [ ] `npm test` output shows it ran the unit project only (no attempt to reach Supabase)
- [ ] `test/support/**` files are imported, never reported as empty test suites

**Implementation Note**: After this phase and automated verification, pause for manual confirmation before Phase 2.

---

## Phase 2: Handler-property tests (no DB)

### Overview

Direct-invocation tests of `/api/generate` and `/api/cards` `POST` handlers using the synthetic
context + a mocked `@/lib/supabase`. Covers #5 (401), #6 (413/400 caps), the owner/origin half of #1,
and the "persist nothing extra" half of #4 — all without a database.

### Changes Required:

#### 1. `/api/generate` handler tests

**File**: `test/handlers/generate.test.ts` (new)

**Intent**: Assert the route's gate, caps, validation, and generic error bodies.

**Contract**: Cases — `user:null` → 401; numeric `content-length > 64*1024` → 413 (before parse);
unparseable JSON → 400; zod failures (empty/whitespace `sourceText`, `> MAX_SOURCE_CHARS`) → 400;
happy path (mock `generateCandidates` to return candidates) → 200 `{candidates}`; config error
(mock the service to throw `GenerationError{kind:"config"}`) → 500; other failure
(`GenerationError{kind:"upstream"}` or generic throw) → 502 with **no `sourceText`/prompt in the
body**. Mock `@/lib/services/generation` for the service-throw paths so the test is about the route.

#### 2. `/api/cards` handler tests

**File**: `test/handlers/cards.test.ts` (new)

**Intent**: Assert the gate, caps, array validation, owner/origin forcing, and generic DB-error body.

**Contract**: Cases — `user:null` → 401; numeric `content-length > 128*1024` → 413; unparseable JSON
→ 400; zod failures (empty array, `> MAX_CANDIDATES`, item with empty/whitespace question or answer,
non-array body) → 400; `createClient` returns `null` → 500 "Persistence is not configured"; insert
error → 500 generic with **no row contents echoed**; success → 201 `{saved:n}`. **Owner/origin**:
mock `createClient` to return a fake whose `from("flashcards").insert(rows)` records its argument;
send a body where items carry an extra `user_id`/`source`, and assert every persisted row has
`source:"ai"` and `user_id === user.id` and that no foreign field survived.

#### 3. Insert-capturing Supabase mock

**File**: `test/handlers/cards.test.ts` (or a small local helper)

**Intent**: A minimal fake Supabase client for the owner-forcing assertion and the insert-error path.

**Contract**: `from(table)` returns an object with `insert(rows)` that records `rows` and resolves
`{ error: null }` (success) or `{ error: {...} }` (failure path). Installed via
`vi.mock("@/lib/supabase", …)`; reset between tests.

### Success Criteria:

#### Automated Verification:

- [ ] `npm test` passes (Docker-free) including both new handler suites
- [ ] Tests assert the exact status codes per route (401/413/400/200/201/500/502)
- [ ] Owner-forcing test proves `source:"ai"` + `user_id===user.id` and that a client-supplied `user_id`/`source` is overridden
- [ ] A privacy assertion confirms no `sourceText` / row contents appear in any error body
- [ ] `npm run lint` passes

#### Manual Verification:

- [ ] Each new test fails when its protected behavior is deliberately inverted, then passes when reverted (break-verify, per the Phase 3 e2e discipline)
- [ ] Zod-cap cases use boundary values (exactly `MAX_*` passes, `MAX_*+1` fails)

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: RLS two-user isolation (real local Supabase)

### Overview

The irreplaceable test for risk #1: prove `flashcards` RLS truly isolates two real users, asserted
through each user's own token via PostgREST. Service-role is used only to mint/seed/clean.

### Changes Required:

#### 1. Two-user isolation suite

**File**: `test/integration/rls-flashcards.test.ts` (new)

**Intent**: Assert that an authenticated user cannot read or mutate another user's rows, and can
fully access their own.

**Contract**: Setup — mint user A and user B via `ensureTestUser` (service-role, seeding only),
obtain `getUserToken` for each. Seed one card owned by A (insert as A, with A's token; tag the
question with a unique run-id prefix). Assertions through PostgREST `/rest/v1/flashcards` using
**each user's bearer token + anon apikey**:
- As B: `SELECT` returns **0** of A's rows.
- As B: `UPDATE`/`DELETE` targeting A's row affects **0 rows** (RLS `using` filter).
- As B: `INSERT` with `user_id = A.id` is rejected (RLS `with check` → 401/403/`42501`).
- As A: `SELECT` returns A's own row; A can update/delete it.
Cleanup in a `finally`/`afterAll` via `deleteCardsByQuestionPrefix(runId)` through each owner's
token. Suite must be re-run-safe (unique run-id per execution; varied per test/index, not `Math.random`).

### Success Criteria:

#### Automated Verification:

- [ ] `npx supabase start` then `npm run test:integration` passes
- [ ] The suite asserts isolation strictly through each user's token (no service-role in any assertion)
- [ ] `npm test` (unit project) still passes with Supabase **stopped** (this suite is not in the unit project)
- [ ] Re-running `npm run test:integration` back-to-back passes (no leftover-row collisions)

#### Manual Verification:

- [ ] Temporarily dropping a policy (or the GRANT) locally makes the relevant assertion go red — confirms the test actually exercises RLS, then revert
- [ ] Confirm the asserting requests carry the user bearer token, not the service-role key

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Cookbook + test-plan update

### Overview

Document the now-real idioms and close the phase in the rollout tracker.

### Changes Required:

#### 1. Fill cookbook §6.2 and §6.4

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see Phase 2" stubs with the concrete patterns this change established.

**Contract**: §6.2 (integration test for an API route) documents the synthetic-context + mocked
`@/lib/supabase` handler pattern, the 413/undici `content-length` gotcha, the suite split, and the
reference tests (`test/handlers/*.test.ts`). §6.4 (access control / RLS) documents the two-user
PostgREST pattern, the through-the-user-token rule (never service-role), the shared
`test/support/*` helpers, and the reference test (`test/integration/rls-flashcards.test.ts`).

#### 2. Update rollout status + stack/gates rows

**File**: `context/foundation/test-plan.md`

**Intent**: Mark §3 Phase 2 `complete` with its change folder, add a §6.5 per-phase note, and note
the `test:integration` script under §4 (integration data) and §5 (integration gate now has tests).

**Contract**: §3 Phase 2 Status → `complete`. §6.5 gains a "Phase 2" entry summarizing what shipped
and what was deferred (CI wiring → Phase 4). No strategy (§1–§5 frozen rules) rewrites beyond status/notes.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run lint` / prettier pass on the edited markdown (lint-staged formats `*.md`)

#### Manual Verification:

- [ ] §6.2 and §6.4 no longer read "TBD" and point to the real reference tests
- [ ] §3 Phase 2 Status shows `complete` with the change folder path
- [ ] §6.5 has an accurate Phase 2 note (what shipped, what was deferred)

---

## Testing Strategy

### Unit / handler tests (Docker-free, `npm test`):

- `/api/generate`: 401, 413, 400 (bad JSON + zod caps incl. boundary), 200, 500 config, 502 generic-body-no-leak.
- `/api/cards`: 401, 413, 400 (bad JSON + array/item caps incl. boundary), 500 (no client / insert error, no leak), 201, owner/origin forcing via captured insert.

### Integration tests (`npm run test:integration`, needs local Supabase):

- Two-user RLS isolation on `flashcards`: cross-user select/update/delete/insert all denied; own-row access works; re-run-safe cleanup.

### Manual Testing Steps:

1. Stop Supabase; `npm test` → green, runs unit project only.
2. `npx supabase start`; `npm run test:integration` → green; run twice back-to-back.
3. `npm run test:e2e` → green (relocated helpers).
4. Break-verify a handler test and the RLS test (invert protected behavior → red → revert).

## Migration Notes

Relocating `tests/e2e/support/{supabase,config}.ts` to `test/support/` changes e2e import paths only;
re-run `npm run test:e2e` to confirm parity. No data migrations.

## References

- Research: `context/changes/testing-api-integration-access-control/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (#1/#4/#5/#6), §3 Phase 2, §6.2, §6.4
- Lessons: `context/foundation/lessons.md` (two-user RLS through PostgREST, never service-role)
- Routes: `src/pages/api/generate.ts`, `src/pages/api/cards.ts`; gate `src/middleware.ts:4`
- Migration: `supabase/migrations/20260619123010_create_flashcards.sql:29-43`
- Reuse: `tests/e2e/support/supabase.ts`, `tests/e2e/support/config.ts`; harness `vitest.config.ts`, `test/helpers/provider.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harness — shared support + suite split

#### Automated

- [x] 1.1 `npm test` passes with local Supabase stopped (Docker-free floor intact) — a91ea76
- [x] 1.2 `npm run test:e2e` passes using the relocated shared helpers — a91ea76
- [x] 1.3 `npm run lint` passes — a91ea76
- [x] 1.4 `npm run build` passes (run `npx astro sync` first if env types touched) — a91ea76

#### Manual

- [x] 1.5 `npm test` ran the unit project only (no Supabase reach) — a91ea76
- [x] 1.6 `test/support/**` files imported, never reported as empty suites — a91ea76

### Phase 2: Handler-property tests (no DB)

#### Automated

- [x] 2.1 `npm test` passes (Docker-free) including both new handler suites
- [x] 2.2 Tests assert exact status codes per route (401/413/400/200/201/500/502)
- [x] 2.3 Owner-forcing test proves `source:"ai"` + `user_id===user.id` and overrides client-supplied fields
- [x] 2.4 Privacy assertion: no `sourceText` / row contents in any error body
- [x] 2.5 `npm run lint` passes

#### Manual

- [x] 2.6 Each new test break-verified (invert protected behavior → red → revert)
- [x] 2.7 Zod-cap cases use boundary values (`MAX_*` passes, `MAX_*+1` fails)

### Phase 3: RLS two-user isolation (real local Supabase)

#### Automated

- [ ] 3.1 `npx supabase start` then `npm run test:integration` passes
- [ ] 3.2 Isolation asserted strictly through each user's token (no service-role in assertions)
- [ ] 3.3 `npm test` (unit project) still passes with Supabase stopped
- [ ] 3.4 Back-to-back `npm run test:integration` passes (no row collisions)

#### Manual

- [ ] 3.5 Dropping a policy/GRANT locally turns the relevant assertion red, then revert
- [ ] 3.6 Asserting requests carry the user bearer token, not service-role

### Phase 4: Cookbook + test-plan update

#### Automated

- [ ] 4.1 `npm run lint` / prettier pass on edited markdown

#### Manual

- [ ] 4.2 §6.2 and §6.4 no longer read "TBD" and point to real reference tests
- [ ] 4.3 §3 Phase 2 Status shows `complete` with the change folder path
- [ ] 4.4 §6.5 has an accurate Phase 2 note (shipped + deferred)
