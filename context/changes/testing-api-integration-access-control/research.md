---
date: 2026-06-20T09:22:40+0200
researcher: Jakub Zasański
git_commit: bb3ec83d03f8d17d05997483a16bd43a15a8c47c
branch: master
repository: 10x-astro-starter
topic: "API integration + access control tests (test-plan Phase 2: risks #1, #4, #5, #6)"
tags: [research, codebase, testing, rls, api-routes, access-control, vitest]
status: complete
last_updated: 2026-06-20
last_updated_by: Jakub Zasański
---

# Research: API integration + access control tests (test-plan Phase 2)

**Date**: 2026-06-20T09:22:40+0200
**Researcher**: Jakub Zasański
**Git Commit**: bb3ec83d03f8d17d05997483a16bd43a15a8c47c
**Branch**: master
**Repository**: 10x-astro-starter

## Research Question

Phase 2 of `context/foundation/test-plan.md` — "API integration + access control" — must deliver
integration tests for risks **#1** (IDOR / RLS gap: a user reads or writes another user's cards),
**#4** (accepted cards lost — bulk save partially fails), **#5** (unauthenticated visitor reaches a
protected route or save endpoint), and **#6** (resource abuse — oversized body / cap bypass) on
`/api/generate` and `/api/cards`. Ground these in the actual code: exact validation rules, status
codes, which Supabase client each path uses, the RLS policies, and the test harness mechanics already
established in Phases 1 and 3 — so the plan can be written against reality, not assumption.

## Summary

The two route handlers are small and fully readable, and their behaviour splits cleanly into two
test layers:

1. **Handler-property layer (fast, no database).** Auth gate (401), oversized-body (413),
   JSON/zod validation (400), and owner/origin forcing (`source:"ai"`, `user_id = user.id`) are all
   properties of the handler given its inputs. They are tested by importing the route's `POST`,
   calling it with a **synthetic `APIContext`**, and `vi.mock`-ing `@/lib/supabase` so the insert
   payload can be captured. No local Supabase, no server. This is the cheapest layer that gives real
   signal — directly aligned with the test-plan's cost×signal principle.

2. **RLS-isolation layer (real local Supabase, two real users).** Risk #1 is fundamentally a
   *database* property, not a handler property. It is proven by minting two users via the GoTrue
   admin API (seed/cleanup only), then asserting through PostgREST **with each user's own token**
   that user B sees 0 of user A's rows and cannot update/delete/insert into A's space. The
   service-role key must never be the asserting client — that bypasses RLS and proves nothing
   (`lessons.md`; test-plan §2 #1 anti-pattern). The Phase 3 e2e suite already contains the exact
   helper machinery to reuse (`tests/e2e/support/supabase.ts`).

Key architectural decision the plan must make: **do not** stand up `@cloudflare/vitest-pool-workers`
(Phase 1 deliberately deferred it). Use synthetic-context handler tests + a direct-PostgREST RLS
test. Both run under the existing Vitest config, whose `include` glob already covers `test/**/*.test.ts`.

A second decision: the RLS test **requires Docker/local Supabase**, while Phase 1's unit tests do
not. Mixing them under one `vitest run` would make `npm test` fail without Docker. The plan should
split unit vs integration (separate Vitest project or script) so the Docker-free floor stays green.

## Detailed Findings

### Route under test #1 — `src/pages/api/generate.ts`

Authenticated JSON endpoint: pasted source text → AI candidate cards. Behaviour, in order:

- `prerender = false` (`generate.ts:6`).
- **401** when `!context.locals.user` (`generate.ts:27-29`). This is the handler's *own* gate — see
  the middleware note below; `/api/*` is **not** in `PROTECTED_ROUTES`.
- **413** when `Number(content-length) > MAX_BODY_BYTES` where `MAX_BODY_BYTES = 64 * 1024`
  (`generate.ts:17`, `31-34`). Checked *before* buffering/parsing.
- **400** on unparseable JSON (`generate.ts:37-41`) and on zod failure — `sourceText` must be a
  trimmed string of `1..MAX_SOURCE_CHARS` (`generate.ts:11-13`, `43-46`).
- Success → **200** `{ candidates }` satisfying `GenerateResponse` (`generate.ts:49-50`).
- `GenerationError` with `kind === "config"` → **500** `"Generation is not configured"`
  (`generate.ts:52-54`).
- Any other failure → **502** `"Could not generate cards. Please try again."` — **generic body, no
  sourceText or prompt echoed** (`generate.ts:55-57`). (Privacy is risk #2, already locked at the
  unit layer in Phase 1; assert it here only as a light reinforcement.)

### Route under test #2 — `src/pages/api/cards.ts`

Authenticated bulk-save: persist accepted candidate cards as `source:"ai"`. Behaviour, in order:

- `prerender = false` (`cards.ts:7`).
- **401** when `!user` (`cards.ts:32-35`).
- **413** when `Number(content-length) > MAX_BODY_BYTES` where `MAX_BODY_BYTES = 128 * 1024`
  (`cards.ts:22`, `37-40`).
- **400** on unparseable JSON (`cards.ts:42-47`) and on zod failure. The request body **is the array
  itself**: `z.array(cardSchema).min(1).max(MAX_CANDIDATES)` where `cardSchema` is
  `{ question: trimmed non-empty string, answer: trimmed non-empty string }` (`cards.ts:12-18`,
  `49-52`). `MAX_CANDIDATES = 30`.
- The client is built **after** validation: `createClient(context.request.headers, context.cookies)`
  (`cards.ts:54`); if it returns `null` → **500** `"Persistence is not configured"` (`cards.ts:55-57`).
- **Owner/origin forcing** (`cards.ts:59-64`): rows are mapped to
  `{ question, answer, source: "ai", user_id: user.id }`. `source` and `user_id` are set
  server-side and are **not** taken from client input — even if the client sends `user_id` or
  `source`, the schema (`cardSchema`) strips them (only `question`/`answer` survive parsing) and the
  map overwrites them. This is the testable "correct owner/origin" property.
- DB/RLS error → **500** `"Could not save cards. Please try again."` — **generic, no row contents
  echoed** (`cards.ts:66-70`).
- Success → **201** `{ saved: rows.length }` (`cards.ts:72`).

### Middleware — the API gate is the handler's, not the middleware's

`src/middleware.ts:4` defines `PROTECTED_ROUTES = ["/dashboard", "/generate"]`. The middleware
resolves the user onto `context.locals.user` on every request (`middleware.ts:6-16`) and **only
redirects page routes** that start with those prefixes (`middleware.ts:18-22`). Critically:

- `/api/generate` and `/api/cards` are **not** in `PROTECTED_ROUTES`. The middleware never gates
  them. Their **401 comes entirely from the handler's own `if (!user)` check.** This is the precise
  thing risk #5's "the page gate implies the API is gated" anti-pattern warns against — and it means
  the handler-level 401 test is the *correct* place to assert API gating (the page redirect is
  already covered by the Phase 3 e2e `unauthenticated-access.spec.ts`).
- For handler tests, `context.locals.user` is simply an input we set directly. Setting it is not
  "mocking away" the gate — it faithfully reproduces the middleware's output contract.

### Supabase client construction — `src/lib/supabase.ts`

`createClient(requestHeaders, cookies)` returns `null` if `!SUPABASE_URL || !SUPABASE_KEY`
(`supabase.ts:6-9`), otherwise a `@supabase/ssr` `createServerClient` that reads the session from the
`Cookie` header (`supabase.ts:10-24`). Under Vitest the env stub does **not** export `SUPABASE_URL`/
`SUPABASE_KEY` (see below), so `createClient` would return `null` — which is why handler tests must
`vi.mock("@/lib/supabase")` rather than rely on the real client.

### Data model + RLS — `supabase/migrations/20260619123010_create_flashcards.sql`

`public.flashcards`: `id`, `user_id uuid not null references auth.users(id) on delete cascade`,
`question`, `answer`, `source text check (source in ('ai','manual'))`, timestamps (lines 8-16).

- **GRANT** (line 29): `grant select, insert, update, delete on table public.flashcards to authenticated;`
  — the load-bearing privilege that RLS policies presuppose (see `lessons.md`).
- **RLS enabled** (line 31) — note `enable`, **not `force`**: table owner / `postgres` /
  **service_role bypass RLS**. This is exactly why an isolation test through the service-role key
  proves nothing, and why cleanup must run as the user.
- Four per-operation policies for role `authenticated`, all `auth.uid() = user_id`
  (insert `with check`, update both `using` + `with check`, lines 33-43).

These four policies + the GRANT are the surface risk #1 must verify through two real users.

### Test harness — what exists, what's missing

**Vitest** (`vitest.config.ts`): plain `defineConfig` from `vitest/config` (**not** Astro's
`getViteConfig` — the `@astrojs/cloudflare` adapter Vite plugin rejects Vitest's env options and
aborts at startup; documented at `vitest.config.ts:5-8`). `environment: "node"`, `globals: true`,
`unstubGlobals: true`, `include: ["src/**/*.test.ts", "test/**/*.test.ts"]` (line 19). Aliases:
`astro:env/server` → `./test/stubs/astro-env-server.ts` (the exact virtual id, load-bearing), and
`@` → `./src` (lines 21-24).

**Env stub** (`test/stubs/astro-env-server.ts`): exports only `LLM_API_KEY="test-key"`,
`LLM_BASE_URL`, `LLM_MODEL`. **Does not export `SUPABASE_URL`/`SUPABASE_KEY`** → `createClient`
returns `null` under Vitest unless overridden. Per-test value overrides use
`vi.resetModules()` + `vi.doMock("astro:env/server", …)` + dynamic import in `try/finally`.

**Provider helper** (`test/helpers/provider.ts`, outside the include glob so it is imported, never
collected): `chatResponse(content)`, `cardsContent(cards)`, `stubFetch(impl)`,
`stubRejectingFetch(error)`, `captureError(promise)`. The reset idiom is
`afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); })`.

**Missing for Phase 2** (must be built): a synthetic `APIContext` factory, and a Supabase
integration helper (user-mint + token + PostgREST query/cleanup). The latter already exists for e2e
and should be shared/extracted, not duplicated.

**Scripts** (`package.json`): `test: "vitest run"`, `test:watch: "vitest"`,
`test:e2e: "playwright test"`. No `test:integration` yet. Deps available: `vitest ^4.1.9`,
`@supabase/supabase-js ^2.108.2`, `@supabase/ssr ^0.12.0`, `@playwright/test ^1.61.0`,
`supabase (CLI) ^2.23.4`, `zod ^4.4.3`.

**Local Supabase** (`supabase/config.toml`): API `http://127.0.0.1:54321`, DB `:54322`, Studio
`:54323`, Inbucket `:54324`. `[db.seed] enabled=true sql_paths=["./seed.sql"]` — but `seed.sql` does
not exist. `enable_confirmations = false`, so admin-created users sign in immediately. No
`SERVICE_ROLE` key is declared in `astro.config.mjs` `env.schema` (only the 5 secret-server vars:
`SUPABASE_URL`, `SUPABASE_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`).

### Reusable two-user machinery from Phase 3 e2e (`tests/e2e/support/`)

The e2e suite already solved "two real users, their tokens, RLS-scoped cleanup". The plan should
extract these into a shared module (e.g. `test/integration/support/`) rather than re-author them:

- `ensureTestUser(email, password)` — POST `${SUPABASE_URL}/auth/v1/admin/users` with
  `{ email, password, email_confirm: true }` using **service-role** headers; idempotent (422 = exists)
  (`tests/e2e/support/supabase.ts:17-26`). **Seed/cleanup only.**
- `getUserToken()` — POST `${SUPABASE_URL}/auth/v1/token?grant_type=password` with the **anon** key;
  returns `access_token` (`supabase.ts:31-42`). This is the per-user asserting credential.
- `deleteCardsByQuestionPrefix(prefix)` — DELETE via PostgREST using **anon key + the user's own
  access token** (`Authorization: Bearer <user token>`), not service-role (`supabase.ts`). Proves
  ownership work runs as the user.
- `config.ts` — `SUPABASE_URL` (default `http://127.0.0.1:54321`), `SUPABASE_KEY` (anon, well-known
  local demo default), `SUPABASE_SERVICE_ROLE_KEY` (well-known local demo default), `E2E_USER`,
  `AUTH_FILE`. All overridable via env. The comments reiterate the `lessons.md` rule: service-role is
  "never to assert RLS isolation."

The RLS test reuses (1) admin mint for user A + user B, (2) password-grant token per user, (3)
PostgREST assertions with each user's bearer token, (4) prefix-tagged cleanup via each owner's token.

## Code References

- `src/pages/api/generate.ts:6,17,27-29,31-34,37-46,49-57` — generate route: prerender, body cap, 401, 413, 400, 200/500/502
- `src/pages/api/cards.ts:7,12-18,22,32-40,42-52,54-57,59-64,66-72` — cards route: schema, body cap, gate, validation, client, owner forcing, 500/201
- `src/middleware.ts:4,6-22` — `PROTECTED_ROUTES` (pages only; `/api/*` excluded), user resolution
- `src/lib/supabase.ts:6-24` — `createClient` returns null without env; SSR cookie-based client
- `supabase/migrations/20260619123010_create_flashcards.sql:29,31,33-43` — GRANT, RLS enable (not force), 4 policies
- `src/lib/services/generation.ts:14-15` — `MAX_SOURCE_CHARS = 10_000`, `MAX_CANDIDATES = 30`
- `src/lib/services/generation.ts:30-39` — `GenerationError` with `kind: "config" | "upstream" | "parse"`
- `src/types.ts:22-35` — `CandidateCard {question, answer}`, `GenerateRequest`, `GenerateResponse`
- `vitest.config.ts:5-8,15-24` — why defineConfig; flags; aliases; include glob covers `test/**`
- `test/stubs/astro-env-server.ts:1-3` — LLM stub only; no SUPABASE_* (→ createClient null)
- `test/helpers/provider.ts` — fetch-mock + response builders (reset via unstub/restore)
- `tests/e2e/support/supabase.ts:17-26,31-42` — `ensureTestUser` (admin), `getUserToken` (password grant), `deleteCardsByQuestionPrefix` (user token)
- `tests/e2e/support/config.ts` — local Supabase URL + anon + service-role demo keys + E2E_USER
- `supabase/config.toml` — ports 54321/54322; `enable_confirmations=false`; seed.sql referenced but absent

## Architecture Insights

- **Two test layers, not one.** Handler properties (401/413/400/owner-forcing) belong in fast,
  DB-free synthetic-context tests; RLS isolation (#1) belongs in a real-DB, two-user PostgREST test.
  Forcing #1 into a handler test (or testing 401/413 via full HTTP) is the wrong altitude.
- **The synthetic `APIContext` is minimal.** Handlers touch only `context.locals.user`,
  `context.request.headers.get("content-length")`, `context.request.json()`, and (cards)
  `context.cookies` (passed straight into the mocked `createClient`). A partial stub typed as
  `APIContext` is sufficient — **build `request` as a plain object** `{ headers: new Headers({...}),
  json: async () => body }` rather than a real `Request`, so a hand-set `content-length` header
  survives (undici recomputes content-length on real `Request` bodies — a 413-test gotcha).
- **413 only fires on a present, numeric, oversized header.** `Number(null)=0` and `Number("abc")=NaN`
  both fail `> limit`, so a missing/garbage header falls through to parsing — the 413 test must set a
  numeric oversized `content-length`.
- **Owner-forcing is provable without a DB.** Mock `@/lib/supabase`'s `createClient` to return a fake
  whose `from("flashcards").insert(rows)` records `rows`; assert every row has `source:"ai"` and
  `user_id === user.id` even when the client sends a foreign `user_id`/`source`. This is the cheapest
  signal for the route's half of risk #1 and the "nothing else" half of risk #4.
- **RLS is `enable`, not `force`** → service-role bypasses it. Assert isolation strictly through each
  user's token; use service-role only to mint/seed/clean. This is a hard rule (`lessons.md`).
- **Docker boundary splits the suite.** The RLS test needs local Supabase; unit tests don't. Keep
  `npm test` Docker-free and put DB tests behind a separate project/script so the floor stays green
  without Docker, and Phase 4 CI starts Supabase only for the integration project.

## Historical Context (from prior changes)

- `context/foundation/lessons.md` — "Grant table privileges on every new RLS table": RLS policies
  filter rows but presuppose table GRANTs; verify per-user access with a **two-user isolation test
  through PostgREST**, not `db lint`. The GRANT bug was hit live in card-persistence-foundation (F-01).
- `context/archive/2026-06-19-testing-runner-bootstrap-generation/` (Phase 1) — established the
  Vitest config (defineConfig + aliases), the `astro:env/server` stub, the `test/helpers/provider.ts`
  fetch-mock idiom, and Stryker (ad-hoc, scoped to `generation.ts`). **Explicitly deferred to "Phase 2
  integration": all route-handler tests for `/api/generate` (401/413/400/error-body), the
  request-shape Stryker survivors, and the `@cloudflare/vitest-pool-workers` vs node-harness decision.**
- `card-persistence-foundation` (F-01) — created `flashcards` with the 4-policy + GRANT pattern;
  missing GRANT was caught only by a manual two-user PostgREST check. RLS is `enable`, not `force`
  (impl-review F1).
- `first-ai-cards-to-deck` (S-01) — the save path: insert through the user's authenticated client,
  `user_id` from session, RLS `with check` as belt-and-suspenders. Verified manually under
  `wrangler dev` — Phase 2 replaces that manual check with automated coverage.
- `context/foundation/test-plan.md` §3 Phase 2, §6.2, §6.4 — the promise: "Auth gate, validation/413,
  two-user RLS isolation, and correct owner/origin on `/api/generate` and `/api/cards`"; §6.4 intent:
  "assert isolation through each user's authenticated client / token, never the service-role key."

## Related Research

- `context/archive/2026-06-19-testing-runner-bootstrap-generation/research.md` — Phase 1 harness research
- `context/foundation/test-plan.md` §2 Risk Response Guidance (rows #1, #4, #5, #6) — per-risk
  "what proves protection", "must challenge", and anti-patterns

## Open Questions

1. **Suite split for the Docker boundary.** Recommended: a separate Vitest project (or
   `test/integration/**` dir + a `test:integration` script) so `npm test` stays unit-only and
   Docker-free; the integration project runs only with local Supabase up. The plan must pick the
   exact mechanism and how Phase 4 CI starts Supabase before it.
2. **Share vs extract the e2e support helpers.** Recommended: extract `ensureTestUser` /
   `getUserToken` / PostgREST query+cleanup / config into a shared `test/integration/support/` (or a
   common module both e2e and integration import) to avoid drift. Decide the location and whether e2e
   migrates to it now or later.
3. **Does `/api/cards` get a real-HTTP save test, or is owner-forcing (mocked insert) + RLS isolation
   (direct PostgREST) + the existing e2e `seed.spec.ts` save path sufficient for risk #4?**
   Recommended: rely on the three existing/cheaper signals and do **not** add a full HTTP save
   integration test unless the plan finds a gap (e.g. partial-failure bulk-insert semantics) that
   none of them cover. Confirm during planning.
4. **`generate.ts` config-error path under synthetic context.** The 500-config branch needs
   `GenerationError{kind:"config"}` — reuse the Phase 1 `vi.doMock("astro:env/server", {LLM_API_KEY:""})`
   idiom, or mock `generateCandidates` to throw. Decide which during planning (mocking the service is
   simpler and keeps the route test about the route, not the service).
