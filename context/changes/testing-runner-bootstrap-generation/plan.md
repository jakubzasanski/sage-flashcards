# Runner Bootstrap + Generation-Service Coverage (Test Rollout Phase 1) Implementation Plan

## Overview

Stand up the project's first test runner (Vitest) and use it to prove two risks at the generation service with a mocked provider:

- **Risk #2 — source-text privacy leak**: pasted `sourceText` must never reach an operator-readable log or an error message.
- **Risk #3 — generation degrades the wedge**: malformed / empty / 5xx / over-cap provider output must yield a clean, handled result; the ≤30 cap must hold; the one-shot retry must fire only on transient faults.

The center of gravity is `src/lib/services/generation.ts`. The runner is bootstrapped from absolute zero — there is no test config, no test deps, and zero test files today.

## Current State Analysis

- **No test base exists.** `package.json` has only `dev`/`build`/`preview`/`astro`/`lint`/`lint:fix`/`format` scripts. No Vitest/Jest config, no test deps. `CLAUDE.md`: "lint + build are the only validation gates."
- **The code under test is well-factored for unit testing** (`src/lib/services/generation.ts`, 170 lines):
  - Config is imported from `astro:env/server` at line 1 but *read inside functions* (`callProvider`, `generateCandidates`) — no top-level evaluation hazard.
  - `GenerationError` (lines 30–39) carries `kind: "config" | "upstream" | "parse"` and a `retryable: boolean` flag. The retry loop and the route's status mapping both consume `retryable` — it is the single seam.
  - Retry classification (line 114): `retryable = status === 429 || status >= 500`. Network throw (108) is transient. All parse failures (122/127/132/137) are `retryable: true`.
  - One-shot retry (lines 159–168): first attempt; on error, re-throw immediately if `!retryable`, else exactly one more attempt. Transient → `fetch` twice; deterministic → `fetch` once.
  - Every thrown message is a **static string** — no `sourceText` interpolation anywhere, and there is **zero `console.*`** in the file.
  - `modelOutputSchema` (lines 44–51) omits `.min(1)` on `cards` — an empty array is valid output and flows through as `200 {candidates:[]}` (regression-protected; see Key Discoveries).
  - `extractJson` (lines 60–84): tolerant 3-strategy parse (direct → ```json fence strip → first balanced `{…}` slice → `undefined`).
  - Caps (lines 14–15): `MAX_SOURCE_CHARS = 10_000`, `MAX_CANDIDATES = 30`, both **exported** (directly assertable). Input capped at 157, output at 140.
- **The bootstrap linchpin is `astro:env/server`.** Vite fails *transformation* of `generation.ts` if it cannot resolve that virtual id, so `vi.mock` alone is too late. The deterministic fix is a `resolve.alias` to a hand-written stub file (research §C, grounded against astro#11221/#4910/#11414).
- **Lint/typecheck will see the test files.** ESLint runs `tseslint.strictTypeChecked` + `stylisticTypeChecked` with `projectService: true`; tsconfig `include: ["**/*"]`. So `*.test.ts`, the stub, and `vitest.config.ts` are all type-checked and linted. Vitest globals (`describe`/`it`/`expect`/`vi`) need a types reference; the stub and config must be strict-clean.

## Desired End State

`npm test` runs a green Vitest suite that:

1. Boots without any `astro:env/server` resolution error (alias + stub working).
2. Covers risk #3 across every failure/success branch of the service via parameterized tables, asserting against the PRD contract (atomic Q/A, caps, empty-is-valid), not card JSON copied from the implementation.
3. Covers risk #2 by proving a sentinel `sourceText` never appears in any thrown message or `console` spy capture, across success and every failure branch.
4. Passes existing `npm run lint` and `npm run build` gates unchanged (after `npx astro sync`).

A one-time Stryker mutation pass narrowed to `generation.ts` has been triaged, and `test-plan.md` §6.1/§6.5 document how to add the next service test. Rollout Phase 1 status is flipped.

### Key Discoveries:

- `src/lib/services/generation.ts:1` — `astro:env/server` import is the bootstrap linchpin; values read inside functions, not at module load.
- `src/lib/services/generation.ts:114` — retry classification (`429 || >=500` transient); the core risk-#3 assertion target.
- `src/lib/services/generation.ts:44-51` — empty `cards` deliberately valid; **must be locked in** (regression from `first-ai-cards-to-deck` review `reviews/impl-review-phase-1.md:35-43` — `.min(1)` had turned empty into a parse→retry→502).
- `src/lib/services/generation.ts:30-39` — `retryable` flag introduced to stop retrying deterministic 4xx (`reviews/impl-review-phase-1.md:25-33`, commit `e97e322`).
- Privacy guardrail origin: `first-ai-cards-to-deck/plan.md:47` — "must never be logged... not in error messages... a launch guardrail, not a nicety."
- Oracle = PRD: privacy NFR `prd.md:46`; caps FR-008 `prd.md:99-100`; atomicity `prd.md:135-141`. Test-plan §7 excludes card *quality*.
- ESLint `strictTypeChecked` + `projectService` + tsconfig `include:["**/*"]` mean test files are fully type-checked/linted.

## What We're NOT Doing

- **No route handler tests** (`src/pages/api/generate.ts`). Auth gate (401), Content-Length 413, JSON/zod 400, and the route's error-body privacy all move to rollout **Phase 2** (integration). Decision: the service is where `sourceText` could actually leak (it owns the prompt and the throws); the route only emits static strings, so its marginal risk-#2 signal is low and naturally belongs with the request harness Phase 2 builds.
- **No `@cloudflare/vitest-pool-workers`.** The service is pure logic over global `fetch` + Zod; `node` environment is faithful. Workers pool deferred to a later route/binding phase.
- **No MSW.** One OpenAI-compatible fetch boundary — `vi.stubGlobal("fetch", …)` suffices.
- **No CI wiring.** `npm test` is a local gate only this phase. CI integration is rollout **Phase 4** ("quality-gates wiring"), per test-plan §3/§5 and the lesson boundary (don't author CI from scratch here).
- **No husky/pre-commit test hook.** Avoid slowing every commit.
- **No card-quality assertions.** Per test-plan §7, quality is measured by the product metric, not tests.
- **No mutation-score chasing.** The Stryker pass is a one-time selective gate; equivalent/cosmetic mutants are ignored consciously.

## Implementation Approach

Bootstrap first (Phase 1), then layer the two risk suites on the working runner (Phases 2–3), then harden with a selective mutation pass (Phase 4), then close the rollout contract (Phase 5). The two risk suites are independent and could be written in either order; risk #3 goes first because it exercises the most branches and so shakes out any remaining fetch-mock ergonomics before the privacy suite reuses them.

Provider mocking: `vi.stubGlobal("fetch", vi.fn())` returning real `new Response(JSON.stringify(...), { status })` to drive each branch. `unstubGlobals: true` (or `vi.unstubAllGlobals()` in `afterEach`) prevents cross-test bleed.

The missing-`LLM_API_KEY` config path needs the stubbed env value varied to falsy. Layer `vi.mock("astro:env/server", …)` (with `vi.resetModules()` + dynamic `import()`) on top of the alias for just that test; the alias makes the id resolvable, `vi.mock` overrides the value.

## Critical Implementation Details

**Timing & lifecycle** — `resolve.alias` for `astro:env/server` must be configured at Vite-config level (research's recommended `getViteConfig({ resolve: { alias: { "astro:env/server": <abs path to stub> } } })`). `vi.mock` cannot rescue an unresolvable virtual id because transformation fails before mocks apply. The alias key must be the exact id `"astro:env/server"`, not a prefix.

**Debug & observability** — the risk-#2 test must wire a `console` spy (`vi.spyOn(console, "error"/"warn"/"log")`) even though `generation.ts` has no `console.*` today: the test guards against a future maintainer adding one that interpolates `sourceText`. Assert the spy was never called with an argument containing the sentinel.

**State sequencing** — for the transient-retry assertions, the mocked `fetch` must return a *failing* response on the first call and a *valid* one on the second (`mockResolvedValueOnce` chaining) to prove the retry both fires and succeeds; and a deterministic-failure test must assert `fetch` was called exactly once.

---

## Phase 1: Bootstrap the Vitest Runner

### Overview

Install Vitest and make `astro:env/server` resolve under it, with a single green smoke test proving the toolchain end-to-end. No risk coverage yet — this phase exists so Phases 2–3 have a working runner.

### Changes Required:

#### 1. Test dependency

**File**: `package.json`

**Intent**: Add Vitest as the runner and the `test` / `test:watch` scripts so the suite is runnable locally.

**Contract**: `devDependencies` gains `vitest@^4.1.0` (4.x supports Vite 7 — already pinned `^7.3.2` via overrides — and needs Node ≥20; repo is Node 24). Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`. Install with `npm i -D vitest@^4.1.0`.

#### 2. Vitest config

**File**: `vitest.config.ts` (new, repo root)

**Intent**: Configure Vitest to inherit Astro's Vite settings + the `@/*` path alias, run in `node`, expose globals, reset stubbed globals between tests, and — the load-bearing part — alias `astro:env/server` to a stub so the service transforms.

**Contract**: Default-export `getViteConfig({ test: { environment: "node", globals: true, unstubGlobals: true, include: ["src/**/*.test.ts", "test/**/*.test.ts"] }, resolve: { alias: { "astro:env/server": <abs path to stub> } } })`. Use `fileURLToPath(new URL("./test/stubs/astro-env-server.ts", import.meta.url))` for the alias target (exact id, not a prefix). Fallback if `getViteConfig()` misbehaves: `defineConfig` from `vitest/config` with the same `resolve.alias` plus a manual `@` → `./src` alias.

```ts
/// <reference types="vitest" />
import { getViteConfig } from "astro/config";
import { fileURLToPath } from "node:url";

export default getViteConfig({
  test: {
    environment: "node",
    globals: true,
    unstubGlobals: true,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "astro:env/server": fileURLToPath(new URL("./test/stubs/astro-env-server.ts", import.meta.url)),
    },
  },
});
```

#### 3. Env stub

**File**: `test/stubs/astro-env-server.ts` (new)

**Intent**: Provide runtime values for the three names `generation.ts` imports, so the aliased module resolves with a configured key by default (config-error path is opt-in per-test via `vi.mock`).

**Contract**: Export `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` as `const` strings (e.g. `"test-key"`, `"https://api.openai.com/v1"`, `"gpt-test"`). Must export all three names — a missing export becomes an `undefined` import and a confusing failure. Keep strict-clean (no `any`, explicit types inferred from literals).

#### 4. Globals types for typecheck/lint

**File**: `tsconfig.json` (edit) — add `"vitest/globals"` to `compilerOptions.types` (or a `/// <reference types="vitest/globals" />` in a test-only `.d.ts`).

**Intent**: Make `describe`/`it`/`expect`/`vi` type-resolve under `strictTypeChecked` + `projectService` so `npm run lint` and `npx astro check` don't error on the test files.

**Contract**: With `globals: true` in vitest config, the matching ambient types must be declared. Confirm `npm run lint` is clean on the smoke test before moving on. (Note: tsconfig already `include`s `**/*`, so no include change is needed.)

#### 5. Smoke test

**File**: `src/lib/services/generation.test.ts` (new)

**Intent**: Prove the toolchain boots — import a real export from `generation.ts` and assert a trivial fact, so a green run means the alias, stub, globals, and transform pipeline all work.

**Contract**: Import `MAX_CANDIDATES` (or `MAX_SOURCE_CHARS`) from `@/lib/services/generation` and assert it equals `30` (resp. `10_000`). This is a temporary bootstrap probe; Phase 2 replaces/extends this file with the real risk-#3 suite. (The assertion uses the exported constant as its own oracle only here, where the point is "the module loaded," not behavior.)

### Success Criteria:

#### Automated Verification:

- [ ] Vitest installed: `npm ls vitest` resolves to `4.x`
- [ ] Suite runs green: `npm test`
- [ ] Astro types synced: `npx astro sync`
- [ ] Lint clean (incl. test files): `npm run lint`
- [ ] Build unaffected: `npm run build`

#### Manual Verification:

- [ ] `npm test` shows the smoke test passing with no `astro:env/server` resolution warning/error in output
- [ ] `npm run test:watch` starts and re-runs on file change

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that the runner boots cleanly before proceeding to Phase 2.

---

## Phase 2: Risk #3 — Generation Degradation Suite (Service)

### Overview

Prove that malformed / empty / 5xx / over-cap provider output yields a clean handled result, the caps hold, and the one-shot retry fires only on transient faults. Parameterized per property — one `it.each` table per invariant, no near-duplicate tests (per test-plan anti-pattern guidance). Oracle is the PRD contract.

### Changes Required:

#### 1. Risk #3 service suite

**File**: `src/lib/services/generation.test.ts` (extend — replaces the Phase 1 smoke probe)

**Intent**: Drive `generateCandidates` (and through it `callProvider`/`extractJson`) across every failure and success branch using a stubbed `fetch`, asserting handled outcomes and call-count, not implementation-copied JSON.

**Contract**: Use `vi.stubGlobal("fetch", vi.fn())`; per test return real `new Response(JSON.stringify(body), { status })`. Reset via `unstubGlobals` / `afterEach(() => vi.unstubAllGlobals())`. Tables to cover:

- **Retry classification** (`it.each`): status/condition → expected (`throws` vs `resolves`) **and** `fetch` call count. Rows: `429`, `500`, `503` (transient → second attempt, fetch called twice); `400`, `401`, `402`, `403` (deterministic → fetch called once, throws `GenerationError` with `retryable:false`); a network throw (`fetch` rejects → transient, second attempt). For a transient-then-success row, first call returns the failing response, second returns valid cards → resolves with the cards.
- **`extractJson` strategies** (`it.each`): valid content shapes → parsed → cards. Rows: direct JSON object; ```json-fenced object; object embedded in surrounding prose; and the all-fail case (content like `"not json"`) → `parse` error thrown.
- **Output cap**: provider returns 35 cards → result length is exactly `MAX_CANDIDATES` (30); also assert `question`/`answer` are trimmed.
- **Input cap**: `sourceText` of `MAX_SOURCE_CHARS + 100` chars → the body sent to `fetch` carries a user message of exactly `MAX_SOURCE_CHARS` chars (read the captured `fetch` call args).
- **Malformed/empty/no-content/bad-shape branches**: response body not JSON → `parse` throw; `choices[0].message.content` missing → `parse` throw; content parses but fails `modelOutputSchema` (e.g. `cards` missing / wrong types) → `parse` throw.
- **Empty-is-valid (regression lock)**: content `{"cards":[]}` → **resolves** to `[]` (never throws, never retries). This is the explicitly regression-prone path.
- **Guard paths**: empty/whitespace `sourceText` → throws `parse`, non-retryable, `fetch` **never called**. Missing `LLM_API_KEY` → throws `config`, non-retryable, `fetch` never called (layer `vi.mock("astro:env/server", () => ({ LLM_API_KEY: "", LLM_BASE_URL: "...", LLM_MODEL: "..." }))` + `vi.resetModules()` + dynamic `import()` for this case only).

### Success Criteria:

#### Automated Verification:

- [ ] Suite passes: `npm test`
- [ ] Lint clean: `npm run lint`
- [ ] No cross-test fetch bleed (suite passes in any order / `--no-file-parallelism` run still green)

#### Manual Verification:

- [ ] Spot-check one assertion deliberately fails when the oracle is violated (e.g. temporarily change `MAX_CANDIDATES` cap expectation) — confirms the test has teeth, not a tautology
- [ ] Confirm no assertion compares against card JSON literally copied from `generation.ts` (oracle-problem check)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Risk #2 — Source-Text Privacy Suite (Service)

### Overview

Prove a sentinel `sourceText` never leaks into a thrown error message or a `console` capture, across success and every failure branch — a guard against regression, since privacy is currently enforced by construction (static strings, zero `console.*`).

### Changes Required:

#### 1. Privacy suite

**File**: `src/lib/services/generation.privacy.test.ts` (new — kept separate so the privacy invariant reads as one focused contract)

**Intent**: For every code path, assert the unique sentinel never surfaces in operator-visible output.

**Contract**: Define a unique recognizable sentinel (e.g. `const SENTINEL = "SOURCE-LEAK-CANARY-7f3a9c2e"`). Wire `console` spies in `beforeEach` (`vi.spyOn(console, "error")`, `"warn"`, `"log"`) and assert in each test that no spy was called with any argument containing `SENTINEL`. Then, parameterized over the branches from Phase 2 (success; each `upstream` status; network throw; each `parse` failure; empty-cards success), pass a `sourceText` that *contains* the sentinel and assert:

- on a thrown `GenerationError`: `err.message` does not contain `SENTINEL` (and `err` is a `GenerationError`);
- on success: the returned cards do not contain `SENTINEL` *unless* the mocked provider response itself echoed it (drive the provider with sentinel-free card content so any sentinel appearance would be a genuine leak);
- the `console` spies were never called with the sentinel (covers the no-`console.*`-today guarantee and future additions).

Reuse the stubbed-`fetch` helper pattern from Phase 2 (extract a small local factory if it reduces duplication — but keep it in the test layer, do not add test-only helpers to `src/lib`).

### Success Criteria:

#### Automated Verification:

- [ ] Privacy suite passes: `npm test`
- [ ] Lint clean: `npm run lint`

#### Manual Verification:

- [ ] Temporarily make `callProvider` interpolate `sourceText` into one throw message → the privacy suite goes red → revert. Confirms the canary actually catches a leak.
- [ ] Confirm the sentinel-in-success case would fail if the mock echoed the sentinel (the test is sensitive in both directions)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: Mutation-Testing Selective Gate (Optional)

### Overview

Run Stryker once, narrowed to the single module under test, to check the Phase 2–3 suites actually *kill* mutations (not just execute lines). Selective and ad-hoc — not a CI gate.

### Changes Required:

#### 1. Stryker selective run

**File**: `stryker.conf.json` (new, minimal) + `package.json` devDependency

**Intent**: Enable a one-off mutation run scoped to `generation.ts`, then triage survivors.

**Contract**: Add `@stryker-mutator/core` (+ the vitest runner plugin) as a devDependency; minimal config with `testRunner: "vitest"` and `mutate: ["src/lib/services/generation.ts"]`. Run `npx stryker run --mutate "src/lib/services/generation.ts"`. For each survived mutant ask "would this change hurt a user or the business?" — Yes → add a killing assertion to the relevant Phase 2/3 test; No (equivalent/cosmetic) → ignore consciously and note it. Do not chase 100%.

### Success Criteria:

#### Automated Verification:

- [ ] Stryker run completes and produces an HTML report
- [ ] Suite still green after any added assertions: `npm test`
- [ ] Lint clean: `npm run lint`

#### Manual Verification:

- [ ] Each survived mutant triaged with a yes/no business-impact call recorded
- [ ] Added assertions (if any) tie to a real regression, not a cosmetic mutant (no implementation-pinning vibe tests)

**Implementation Note**: This phase is optional. If skipped, record the decision and proceed to Phase 5. If run, pause for manual confirmation of the triage before Phase 5.

---

## Phase 5: Cookbook Update + Status Sync

### Overview

Close the rollout contract: document how to add the next service test, and flip the Phase 1 status markers.

### Changes Required:

#### 1. Cookbook §6.1 / §6.5

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.1 "TBD" with the concrete recipe this phase established, and add a §6.5 per-phase note.

**Contract**: §6.1 documents: test location/naming (`src/**/*.test.ts` co-located with source; the env stub at `test/stubs/astro-env-server.ts`), the `astro:env/server` alias bootstrap, the `vi.stubGlobal("fetch", …)` provider-mock pattern with `unstubGlobals`, the per-test `vi.mock` override for the config path, the reference test (`generation.test.ts`), and the run command (`npm test`). §6.5 adds a one-line Phase 1 note. Keep within the existing doc's terse style.

#### 2. Status markers

**File**: `context/foundation/test-plan.md` (§3 rollout row) + `context/changes/testing-runner-bootstrap-generation/change.md`

**Intent**: Reflect that Phase 1 shipped.

**Contract**: test-plan §3 Phase 1 Status → `complete` (or `implementing` until merged, per the orchestrator's vocabulary). `change.md`: `status: complete`, `updated: <today>`. Quality-gate §5 row "unit + contract" remains `required after §3 Phase 1` (CI enforcement is Phase 4 of the rollout).

### Success Criteria:

#### Automated Verification:

- [ ] Markdown lints/prettier-clean: `npx prettier --check context/foundation/test-plan.md`
- [ ] `git diff` shows §6.1 no longer reads "TBD"

#### Manual Verification:

- [ ] A reader unfamiliar with the phase could add a new service test from §6.1 alone
- [ ] Rollout §3 status and `change.md` agree

**Implementation Note**: Final phase — after this, the change is ready to archive via `/10x-archive`.

---

## Testing Strategy

### Unit / Contract Tests (this phase IS the tests):

- Retry classification table (transient vs deterministic; fetch call-count).
- `extractJson` three strategies + the undefined→parse-error path.
- Input cap (10k slice on the wire) and output cap (≤30, trimmed).
- Malformed JSON, missing content, schema-mismatch → `parse` errors.
- Empty-cards → valid `200`-equivalent `[]` (regression lock).
- Config/empty guards → non-retryable, fetch never called.
- Privacy: sentinel never in any throw message or `console` capture, across all branches.

### Manual Testing Steps:

1. `npm test` green; `npm run lint`; `npm run build` all pass after `npx astro sync`.
2. Deliberately break one oracle (cap expectation, or interpolate `sourceText` into a throw) → confirm the relevant suite goes red → revert.
3. (Optional) Open the Stryker HTML report; confirm survivors are triaged.

## Performance Considerations

Negligible — `node` environment, mocked `fetch`, no network or DB. The full suite should run in well under a second. Stryker's one-off run is slow but ad-hoc and narrowed to a single file.

## Migration Notes

None — additive. New dev dependency (`vitest`, optionally `@stryker-mutator/*`), new config/test/stub files, two new `package.json` scripts. No source behavior changes. `npx astro sync` must be run before lint/build (already a CI step).

## References

- Research: `context/changes/testing-runner-bootstrap-generation/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 risk map, §3 rollout, §6 cookbook, §7 exclusions)
- Code under test: `src/lib/services/generation.ts:1` (env import), `:114` (retry class), `:44-51` (empty-valid), `:60-84` (extractJson)
- Scope boundary (Phase 2): `src/pages/api/generate.ts:26-57`
- Regression origins: `context/changes/first-ai-cards-to-deck/reviews/impl-review-phase-1.md:25-43`
- Oracle: `context/foundation/prd.md:46` (privacy), `:99-100` (caps), `:135-141` (atomicity)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap the Vitest Runner

#### Automated

- [ ] 1.1 Vitest installed: `npm ls vitest` resolves to `4.x`
- [ ] 1.2 Suite runs green: `npm test`
- [ ] 1.3 Astro types synced: `npx astro sync`
- [ ] 1.4 Lint clean (incl. test files): `npm run lint`
- [ ] 1.5 Build unaffected: `npm run build`

#### Manual

- [ ] 1.6 `npm test` shows smoke test passing, no `astro:env/server` resolution error
- [ ] 1.7 `npm run test:watch` starts and re-runs on change

### Phase 2: Risk #3 — Generation Degradation Suite

#### Automated

- [ ] 2.1 Suite passes: `npm test`
- [ ] 2.2 Lint clean: `npm run lint`
- [ ] 2.3 No cross-test fetch bleed (order-independent / `--no-file-parallelism` green)

#### Manual

- [ ] 2.4 An assertion deliberately fails when the oracle is violated (has teeth)
- [ ] 2.5 No assertion compares against card JSON copied from `generation.ts`

### Phase 3: Risk #2 — Source-Text Privacy Suite

#### Automated

- [ ] 3.1 Privacy suite passes: `npm test`
- [ ] 3.2 Lint clean: `npm run lint`

#### Manual

- [ ] 3.3 Interpolating `sourceText` into a throw turns the suite red (canary works)
- [ ] 3.4 Sentinel-in-success case is sensitive in both directions

### Phase 4: Mutation-Testing Selective Gate (Optional)

#### Automated

- [ ] 4.1 Stryker run completes and produces an HTML report
- [ ] 4.2 Suite still green after any added assertions: `npm test`
- [ ] 4.3 Lint clean: `npm run lint`

#### Manual

- [ ] 4.4 Each survived mutant triaged with a recorded business-impact call
- [ ] 4.5 Added assertions tie to a real regression, not a cosmetic mutant

### Phase 5: Cookbook Update + Status Sync

#### Automated

- [ ] 5.1 Markdown prettier-clean: `npx prettier --check context/foundation/test-plan.md`
- [ ] 5.2 `git diff` shows §6.1 no longer reads "TBD"

#### Manual

- [ ] 5.3 A reader could add a new service test from §6.1 alone
- [ ] 5.4 Rollout §3 status and `change.md` agree
