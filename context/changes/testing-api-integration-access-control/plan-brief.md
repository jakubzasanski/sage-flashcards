# API Integration + Access Control Tests — Plan Brief

> Full plan: `context/changes/testing-api-integration-access-control/plan.md`
> Research: `context/changes/testing-api-integration-access-control/research.md`

## What & Why

Phase 2 of the project test plan. Add automated integration + access-control tests for `/api/generate`
and `/api/cards` so four high-impact risks stop relying on manual checks: unauthenticated API access
(#5), resource abuse via oversized bodies / cap bypass (#6), cross-user data access through an RLS gap
(#1), and save owner/origin correctness (#4). #1 in particular — "a user reads or writes another
user's cards" — is the single highest-impact risk with no automated coverage today.

## Starting Point

Phase 1 stood up Vitest (Docker-free, `node` env, `astro:env/server` stub, fetch-mock helper) and
covers the generation service. Phase 3 e2e covers the browser happy path + auth redirect and already
contains two-user Supabase helpers (`tests/e2e/support/supabase.ts`). The routes themselves gate on
`context.locals.user`, cap `content-length`, zod-validate, and (cards) force `user_id`/`source`
server-side. The `flashcards` table has RLS (`enable`, not `force`) + four `auth.uid()=user_id`
policies + the table GRANT. No `test:integration` script, no synthetic-context helper exist yet.

## Desired End State

`npm test` runs Docker-free (Phase 1 + new handler tests) and passes with Supabase stopped.
`npm run test:integration` runs the two-user RLS isolation suite against local Supabase and passes.
The e2e suite still passes, now importing shared helpers. `test-plan.md` documents the real idioms
(§6.2/§6.4) and marks Phase 2 complete.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Test altitude | Two layers: DB-free handler tests + real-DB RLS test | Cheapest layer per risk; handler properties don't need a DB, isolation does | Research |
| Invoke handlers via | Synthetic `APIContext` + mocked `@/lib/supabase` | Faithful to the handler contract; no server/Docker | Research |
| RLS assertion | Two real users, each user's token, via PostgREST | `enable` (not `force`) means service-role bypasses RLS — proves nothing | Research / lessons.md |
| Docker boundary | Separate Vitest project; `npm test` unit-only, `test:integration` for DB | Keeps the Docker-free floor green; CI starts Supabase only for integration | Plan |
| Two-user helpers | Extract to shared `test/support/`, migrate e2e | One source of truth, no drift between suites | Plan |
| Risk #4 save coverage | Owner-forcing + RLS + existing e2e `seed.spec.ts` | No redundant HTTP save test; each assertion has a distinct job | Plan |
| `/api/generate` config-500 | Mock the service to throw | Keeps the route test about the route, not the service | Plan |

## Scope

**In scope:** handler tests for both routes (401/413/400/200/201/500/502, owner-forcing, no-leak
error bodies); two-user RLS isolation test; shared support module + synthetic-context factory; Vitest
suite split + `test:integration` script; test-plan cookbook + status updates.

**Out of scope:** CI wiring (test-plan Phase 4); a real-HTTP `/api/cards` save test; in-progress
session-restore (done in Phase 3 e2e); `@cloudflare/vitest-pool-workers`; re-testing generation
internals; any production code change.

## Architecture / Approach

Bottom-up. Phase 1 builds the harness (shared helpers, synthetic-context factory, two-project Vitest
split). Phase 2 writes DB-free handler tests that invoke `POST` with a synthetic context and a mocked
Supabase client (the insert mock captures rows to prove owner-forcing). Phase 3 writes the real-DB
test that mints two users, then asserts through each user's PostgREST token that cross-user access is
denied. Phase 4 documents the idioms in the test plan.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness | Shared `test/support/*`, synthetic-context factory, Vitest unit/integration split + `test:integration` | Relocating e2e helpers could break the passing e2e suite (mitigate: re-run e2e) |
| 2. Handler tests | DB-free 401/413/400/2xx/5xx + owner-forcing + no-leak for both routes | 413 test: undici recomputes `content-length` on a real `Request` (use a plain request stub) |
| 3. RLS isolation | Two-user PostgREST test proving cross-user denial + own-row access | Accidentally asserting via service-role (bypasses RLS); flaky cleanup on re-run |
| 4. Cookbook + status | §6.2/§6.4 filled, Phase 2 marked complete | Low — docs only |

**Prerequisites:** local Supabase (`npx supabase start`, Docker) for Phase 3; Phase 1 harness before 2–3.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- The RLS suite assumes the well-known local-dev demo keys / `enable_confirmations=false` hold on a
  fresh `npx supabase start` (they do per `supabase/config.toml`).
- Vitest 4 `projects` config is the assumed split mechanism; the implementer confirms exact syntax.
- e2e migration is import-path-only; parity is confirmed by re-running `npm run test:e2e`.

## Success Criteria (Summary)

- An unauthenticated API call is proven to get 401; oversized/over-cap requests get 413/400.
- User B is proven unable to read, modify, or forge ownership of user A's cards; A keeps full access.
- `npm test` stays green and Docker-free; the RLS suite runs green (and re-run-safe) against local Supabase.
