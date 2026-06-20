# Runner Bootstrap + Generation-Service Coverage — Plan Brief

> Full plan: `context/changes/testing-runner-bootstrap-generation/plan.md`
> Research: `context/changes/testing-runner-bootstrap-generation/research.md`

## What & Why

Stand up the project's first test runner (Vitest) and use it to prove two high-impact risks at the generation service: **#2 — pasted source text must never leak into logs or error bodies**, and **#3 — provider failure / malformed / empty / over-cap output must degrade cleanly** (caps hold, retry fires only on transient faults). This is rollout Phase 1 of `test-plan.md` — every later phase depends on the runner existing.

## Starting Point

There is **no test base at all** today — no runner, no config, no test deps, zero test files; `lint` + `build` are the only gates. The code under test, `src/lib/services/generation.ts`, is already well-factored for testing (a `retryable` flag drives a one-shot retry, all error messages are static strings, empty-cards is a valid result), so the work is mostly bootstrapping the runner and writing behavioural tests against it.

## Desired End State

`npm test` runs a fast, green Vitest suite covering every failure/success branch of the generation service against the PRD contract, plus a privacy suite proving a sentinel `sourceText` never surfaces in any error or `console` output. `lint` and `build` still pass. The §6.1 cookbook documents how to add the next service test, and a one-time Stryker pass has hardened the suite.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| `astro:env/server` resolution | `resolve.alias` → hand-written stub in `getViteConfig()` | `vi.mock` runs too late to rescue an unresolvable virtual id; the alias is deterministic and upgrade-proof | Research |
| Test environment | `node` (not workers pool) | Service is pure logic over global `fetch` + Zod; workers pool is unwarranted cost | Research |
| Provider mocking | `vi.stubGlobal("fetch", …)` + `unstubGlobals` | One OpenAI-compatible boundary; MSW is overkill | Research |
| Route privacy / auth tests | Deferred to rollout Phase 2 | Service is where `sourceText` could actually leak; the route only emits static strings | Plan |
| Mutation testing | One-time selective Stryker pass on `generation.ts` (optional) | Proves tests kill mutants on the riskiest module without a per-commit gate | Plan |
| Test layout | Co-located `src/**/*.test.ts`; stub under `test/` | Discoverable, standard Vitest convention, lint already covers `src/**` | Plan |
| Gate wiring | Local `npm test` only; CI deferred to rollout Phase 4 | Respects the lesson boundary (no CI authoring here) and the rollout sequence | Plan |
| Test breadth | Parameterized `it.each` per property | Follows test-plan anti-pattern guidance; one table per invariant, no near-duplicates | Plan |

## Scope

**In scope:** Vitest bootstrap (config, env stub, deps, scripts, globals types); risk #3 degradation suite; risk #2 privacy suite; optional Stryker pass; §6 cookbook + status sync — all at the **service** layer.

**Out of scope:** Route handler tests (auth 401 / 413 / 400 / route error-body privacy) → Phase 2; workers pool; MSW; CI wiring → Phase 4; husky test hook; card-quality assertions; mutation-score chasing.

## Architecture / Approach

Bootstrap the runner first with a single smoke test (Phase 1), then layer two independent service suites on it — degradation (#3) then privacy (#2) — each driving the service through a stubbed global `fetch` and asserting against the PRD contract, never against implementation-copied JSON. Harden with a narrowed Stryker run (Phase 4), then close the rollout contract by filling the §6 cookbook (Phase 5).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Bootstrap runner | Vitest resolving `astro:env/server`; green smoke test | Virtual-module resolution under Vitest |
| 2. Risk #3 suite | Parameterized degradation/retry/cap/empty-valid coverage | Oracle problem — asserting copied JSON |
| 3. Risk #2 suite | Sentinel never in throws or `console`, all branches | False confidence if canary isn't sensitive |
| 4. Mutation gate (opt.) | Triaged Stryker survivors on `generation.ts` | Chasing cosmetic mutants → vibe tests |
| 5. Cookbook + sync | §6.1 recipe; status markers flipped | Doc drifts from what shipped |

**Prerequisites:** `npx astro sync` must have run (env virtual-module types); Node 24; npm.
**Estimated effort:** ~1–2 sessions across 5 phases (Phase 4 optional).

## Open Risks & Assumptions

- `getViteConfig()` may not register the env plugin reliably under Vitest — mitigated by the alias; documented `defineConfig` + manual `@` alias fallback.
- Vitest globals must type-resolve under `strictTypeChecked` + `projectService` (tsconfig `include: ["**/*"]`), or lint/typecheck fails on the test files — handled in Phase 1.
- The privacy suite is a regression guard, not a fix — it assumes the current static-string/zero-`console` construction is correct and locks it in.

## Success Criteria (Summary)

- `npm test` green; `npm run lint` and `npm run build` unaffected (after `npx astro sync`).
- Deliberately breaking an oracle (a cap, or interpolating `sourceText` into a throw) turns the right suite red — proving the tests have teeth.
- §6.1 cookbook lets a newcomer add the next service test unaided; rollout Phase 1 status reflects completion.
