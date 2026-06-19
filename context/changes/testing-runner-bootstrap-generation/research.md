---
date: 2026-06-19T19:42:01Z
researcher: Jakub Zasański
git_commit: d89c929383e457f46c46a9db251f25d77a78a822
branch: master
repository: 10x-astro-starter
topic: "Test-runner bootstrap (Vitest) + generation-service failure-path coverage (test rollout Phase 1)"
tags: [research, codebase, testing, vitest, generation, astro-env, workerd, privacy, retry]
status: complete
last_updated: 2026-06-19
last_updated_by: Jakub Zasański
---

# Research: Test-runner bootstrap (Vitest) + generation-service coverage — Phase 1

**Date**: 2026-06-19T19:42:01Z
**Researcher**: Jakub Zasański
**Git Commit**: d89c929383e457f46c46a9db251f25d77a78a822
**Branch**: master
**Repository**: 10x-astro-starter

## Research Question

Phase 1 of `context/foundation/test-plan.md`: stand up the test runner and prove risks **#2 (source-text privacy leak)** and **#3 (generation degrades the wedge — provider failure / malformed / empty / over-cap output)** at the generation service with a mocked provider. This research grounds two things before planning: (a) the service's *real* failure paths and the PRD contract that is the test oracle, and (b) how to bootstrap Vitest in an Astro 6 / Cloudflare-Workers project where the code under test imports the `astro:env/server` virtual module at module load.

## Summary

- **There is no test base today.** Zero test files, no Vitest/Jest config, no test deps. `lint` + `build` are the only gates. This phase adds the runner from scratch.
- **The bootstrap linchpin is the `astro:env/server` virtual module.** `generation.ts` imports `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` from it. Vitest fails transformation if it can't resolve that id, so `vi.mock` alone is insufficient. The robust answer: a **`resolve.alias` to a hand-written stub file**, configured inside Astro's `getViteConfig()`, with `vi.mock` layered on top only when a test needs to vary a value (the "not configured" path). The three env values are read *inside functions*, not at import-evaluation time — so there is no top-level evaluation hazard.
- **Environment: `node`, not the workers pool.** The service is pure logic over global `fetch` + Zod; it touches no workerd bindings. `@cloudflare/vitest-pool-workers` is unwarranted cost for Phase 1 (reserve it for a later route/binding phase).
- **Fetch mocking: `vi.stubGlobal("fetch", vi.fn())`** — one OpenAI-compatible boundary, MSW is overkill. Must set `unstubGlobals: true` (or `vi.unstubAllGlobals()` in `afterEach`) to prevent cross-test bleed.
- **The failure paths are well-factored and unit-testable**: a single `GenerationError` type with an explicit `retryable` flag drives a one-shot retry that fires only on transient faults; every error message is a static string (no `sourceText`); empty `cards` is valid output, not a parse error.
- **The oracle is the PRD contract, not the implementation** — atomic Q/A, caps (≤10k chars / ≤30 cards), "never logged or echoed", "empty is valid 200". Assert against these, not against card JSON copied from the code (the oracle-problem anti-pattern flagged in the test plan).

## Detailed Findings

### A. Code under test — generation service

[`src/lib/services/generation.ts`](https://github.com/jakubzasanski/10x-astro-starter/blob/d89c929383e457f46c46a9db251f25d77a78a822/src/lib/services/generation.ts) (170 lines) is the primary target. Structure relevant to risks #2/#3:

- **Config import (line 1):** `import { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } from "astro:env/server";` — the bootstrap challenge. Values are *used* inside `callProvider` (lines 91, 88) and `generateCandidates` (lines 149, 160), never at top level.
- **Caps (lines 14–15):** `MAX_SOURCE_CHARS = 10_000`, `MAX_CANDIDATES = 30` — exported, so directly assertable. Input is capped at line 157 (`trimmed.slice(0, MAX_SOURCE_CHARS)`); output is capped at line 140 (`.slice(0, MAX_CANDIDATES)`). The service enforces both independently of the route ("last line of defence", lines 12–13).
- **`GenerationError` (lines 30–39):** carries `kind: "config" | "upstream" | "parse"` and `retryable: boolean`. This is the seam the retry logic and the route's status mapping both read.
- **Retry classification (lines 111–116):** `const retryable = response.status === 429 || response.status >= 500;` — 429 and 5xx are transient; all other non-2xx (401/402/403/400) are deterministic. Network throw (lines 106–108) is transient. All parse failures (lines 122, 127, 132, 137) are marked `retryable: true`.
- **One-shot retry (lines 159–168):** first `callProvider`; on error, **re-throw immediately if `!err.retryable`**, otherwise make exactly one more attempt. So: transient → `fetch` called twice; deterministic → `fetch` called once. This is the core risk-#3 assertion.
- **Privacy (risk #2):** every thrown message is a static string — "Failed to reach the generation provider" (108), `Generation provider returned ${response.status}` (115, status code only), "Generation provider returned malformed JSON" (122), "...returned no content" (127), "...was not valid JSON" (132), "...did not match the expected shape" (137). **No `console.*` anywhere in the file.** `sourceText` is never interpolated into any message.
- **Empty-is-valid (lines 41–51):** `modelOutputSchema` deliberately omits `.min(1)` on `cards`; an empty array flows through as a valid result. (Regression-protected — see Historical Context.)
- **`extractJson` (lines 60–84):** tolerant 3-strategy parse — direct → ```json fence strip → first balanced `{…}` slice → `undefined`. Three branches worth contract tests; the `undefined` path becomes a `parse` error (lines 130–133).
- **Guard paths in `generateCandidates`:** missing `LLM_API_KEY` → `GenerationError("...not configured", "config", false)` (lines 149–151); empty trimmed input → `("...empty", "parse", false)` (lines 153–156). Both non-retryable.

### B. Code under test — API route (scope boundary)

[`src/pages/api/generate.ts`](https://github.com/jakubzasanski/10x-astro-starter/blob/d89c929383e457f46c46a9db251f25d77a78a822/src/pages/api/generate.ts) (58 lines) maps the service to HTTP:

- Auth gate (lines 27–29, → 401), Content-Length guard (lines 31–34, → 413 at `MAX_BODY_BYTES = 64*1024`), JSON parse guard (37–41, → 400), zod validation (43–46, → 400), config error → 500 (52–54), all other service errors → **502 with a static body** "Could not generate cards. Please try again." (55–56).
- **Privacy at the route:** error bodies are static; `sourceText` is never echoed. The comment at line 9 restates the guardrail.
- **Scope note:** the route's auth/413/validation behavior is **Phase 2 (integration)** per the rollout table. Phase 1's center of gravity is the service. The one route concern that overlaps risk #2 — *do the route's error bodies leak sourceText?* — is satisfied by static strings and is cheaply assertable, but exercising the route handler needs a `context.locals`/`Request` harness that is more naturally an integration test. **See Open Questions** for the recommended split.

### C. Bootstrap: making `astro:env/server` resolve under Vitest

Repo facts grounding the setup:
- Astro `^6.3.1` (installed 6.4.7); Vite pinned `^7.3.2` via overrides; Zod **v4** (`^4.4.3`); Node **24** (`.nvmrc`); `"type": "module"`; no `packageManager` field → npm. ([`package.json`](https://github.com/jakubzasanski/10x-astro-starter/blob/d89c929383e457f46c46a9db251f25d77a78a822/package.json))
- env schema ([`astro.config.mjs`](https://github.com/jakubzasanski/10x-astro-starter/blob/d89c929383e457f46c46a9db251f25d77a78a822/astro.config.mjs) lines 18–36): all five vars are `context:"server"`, `access:"secret"`, `optional:true`. Service-relevant defaults: `LLM_BASE_URL` → `"https://api.openai.com/v1"`, `LLM_MODEL` → `"gpt-5-mini"`. `LLM_API_KEY` has **no default** (so falsy unless set → drives the config-error path).
- Virtual-module *types* come from `.astro/types.d.ts` via `npx astro sync` (CI already runs it before lint). Tests get the *runtime values* from the alias stub; typecheck still needs `astro sync`.

**Recommended config** (the load-bearing part is the alias; `getViteConfig` is kept only to inherit the `@/*` path alias and Astro's Vite settings):

```ts
// vitest.config.ts
/// <reference types="vitest" />
import { getViteConfig } from "astro/config";
import { fileURLToPath } from "node:url";

export default getViteConfig({
  test: {
    environment: "node",
    globals: true,
    unstubGlobals: true,                 // reset vi.stubGlobal between tests
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "astro:env/server": fileURLToPath(  // exact id, not a prefix
        new URL("./test/stubs/astro-env-server.ts", import.meta.url),
      ),
    },
  },
});
```

```ts
// test/stubs/astro-env-server.ts — must export all three names the service imports
export const LLM_API_KEY = "test-key";
export const LLM_BASE_URL = "https://api.openai.com/v1";
export const LLM_MODEL = "gpt-test";
```

- **Why not `getViteConfig()` alone:** it loads the Astro config but does not reliably register the env virtual-module plugin into Vitest, with a history of resolution regressions in test contexts ([astro#11221](https://github.com/withastro/astro/issues/11221), [#4910](https://github.com/withastro/astro/issues/4910), [#11414](https://github.com/withastro/astro/issues/11414)). The alias is deterministic and upgrade-proof.
- **Why not `vi.mock` alone:** Vite fails transforming a file when it can't resolve an import; `vi.mock` runs too late to rescue an unresolvable virtual id ([Vitest module mocking](https://vitest.dev/guide/mocking/modules)). The alias makes the id resolvable; `vi.mock("astro:env/server", () => ({...}))` then works *on top* for per-test overrides — needed for the missing-`LLM_API_KEY` config-error path (`generation.ts:149`).
- **Fallback** if `getViteConfig()` itself misbehaves: plain `defineConfig` from `vitest/config` with the same `resolve.alias` plus a manual `@` → `./src` alias.

**Environment / fetch / versions:**
- Environment `node` (default) — sufficient; Node 24's global `fetch` is what we stub anyway. Workers pool deferred. ([Cloudflare Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/))
- `vi.stubGlobal("fetch", vi.fn())` returning real `new Response(JSON.stringify(...), { status })` (or `Response`-shaped objects) to drive each branch. MSW not justified for one boundary. ([Vitest mocking](https://vitest.dev/guide/mocking), [vi API](https://vitest.dev/api/vi.html))
- Pin **Vitest `^4.1.0`** (4.x supports Vite 7, needs Node ≥20). ([Vitest 4](https://vitest.dev/blog/vitest-4)) Install: `npm i -D vitest@^4.1.0`. Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

### D. The test oracle (PRD contract, not the code)

From [`context/foundation/prd.md`](https://github.com/jakubzasanski/10x-astro-starter/blob/d89c929383e457f46c46a9db251f25d77a78a822/context/foundation/prd.md):
- **Privacy NFR (prd.md:46):** source text "is never written to operator-readable logs, and is never used to train any model." → the risk-#2 invariant.
- **Caps FR-008 (prd.md:99–100):** ~10 000 chars in, ~30 candidate cards out.
- **Atomicity (Business Logic, prd.md:135–141):** one fact per card, self-contained question, unambiguous answer. The system prompt (`generation.ts:17–24`) is the *enforcement*, not the *oracle* — tests assert structure/caps/privacy, **not** card quality (test-plan §7 explicitly excludes quality).
- **Response shape** ([`src/types.ts`](https://github.com/jakubzasanski/10x-astro-starter/blob/d89c929383e457f46c46a9db251f25d77a78a822/src/types.ts):22–35): `GenerateResponse = { candidates: CandidateCard[] }`, `CandidateCard = { question: string; answer: string }`.

## Code References

- `src/lib/services/generation.ts:1` — `astro:env/server` import (bootstrap linchpin)
- `src/lib/services/generation.ts:14-15` — `MAX_SOURCE_CHARS`, `MAX_CANDIDATES` caps
- `src/lib/services/generation.ts:30-39` — `GenerationError` with `kind` + `retryable`
- `src/lib/services/generation.ts:60-84` — `extractJson` 3-strategy tolerant parse
- `src/lib/services/generation.ts:106-138` — provider failure branches (network/non-2xx/malformed/no-content/bad-shape)
- `src/lib/services/generation.ts:111-116` — retry classification (429 + 5xx transient)
- `src/lib/services/generation.ts:140-143` — output cap + trim
- `src/lib/services/generation.ts:148-168` — `generateCandidates`: config/empty guards + one-shot retry
- `src/pages/api/generate.ts:26-57` — route auth/413/validation + error→status mapping (Phase 2 scope)
- `astro.config.mjs:18-36` — env schema (names, defaults, secret/optional)
- `src/types.ts:22-35` — `CandidateCard` / `GenerateResponse`
- `src/middleware.ts:4,9-16` — `PROTECTED_ROUTES` + `context.locals.user`

## Architecture Insights

- **The `retryable` flag is the single seam** that both the retry loop and the route's status mapping consume — testing it at the service level covers risk #3's "retry fires only on transient faults" without touching HTTP.
- **Privacy is enforced by construction** (static strings, zero `console.*`), so the risk-#2 test is a *guard against regression*: assert that thrown messages and (route) bodies never contain a sentinel `sourceText` value, across both success and every failure branch — not just the happy path.
- **The service is deliberately decoupled from workerd** ("global `fetch`, no Node SDK") which is exactly why a `node`-environment unit test is faithful — the only runtime dependency is `fetch`, which we control.
- **Zod v4** — `safeParse` semantics are stable for this use; no v3→v4 migration concern in the test code.

## Historical Context (from prior changes)

All from the `first-ai-cards-to-deck` change (the feature this phase tests):
- **Retry scoping** — `context/changes/first-ai-cards-to-deck/reviews/impl-review-phase-1.md:25-33`: deterministic 4xx (401/402/403/400) were being retried needlessly ("double latency + double provider cost"); fix introduced the `retryable` flag. Commit `e97e322` "scope LLM retry to transient faults + allow empty result".
- **Empty-cards-is-valid** — same review, lines 35-43: `cards.min(1)` turned a legitimate empty result into a parse error → retry → 502; `.min(1)` was dropped so empty flows as `200 {candidates:[]}`. **A test must lock this in** (regression-prone).
- **Privacy guardrail origin** — `context/changes/first-ai-cards-to-deck/plan.md:47`: "The pasted text must never be logged... do not include source text in error messages... This is a launch guardrail, not a nicety." Verified live in `reviews/impl-review.md:21`.
- **Body-size guard** — `reviews/impl-review.md:35-43`: early Content-Length 413 (64KB `/api/generate`, 128KB `/api/cards`) added before buffering. (Route-level → Phase 2.)
- **OpenAI-compatible switch** — `plan.md:244-251` (addendum): provider-agnostic via `LLM_BASE_URL`; `response_format: { type: "json_object" }`; swap providers with zero code change.
- **No prior test work** — `card-persistence-foundation/plan.md:163-168` confirms "no test runner is configured."

## Related Research

None yet — this is the first `research.md` under `context/changes/`. No `context/archive/` exists.

## Open Questions

1. **Route privacy assertion — Phase 1 or Phase 2?** Risk #2 says "across both success and failure paths," which includes the route's error bodies. The route returns static strings (cheap to assert), but exercising the `POST` handler needs a `context.locals.user` + `Request` harness that is otherwise Phase 2 (integration). **Recommendation for the plan:** keep Phase 1 a *service* unit/contract suite (all of risk #3 + the service-side of risk #2 live here), and add one lightweight contract assertion that the route's catch-block bodies are sourceText-free *iff* it can be done without a full request harness; otherwise fold the route's privacy + 401/413/400 into Phase 2. Decide in `/10x-plan`.
2. **`vi.mock` reset ergonomics for the config-error path** — the missing-`LLM_API_KEY` test needs to override the aliased stub to an empty key. Confirm during planning whether per-test `vi.mock` + `vi.resetModules()` or a small factory in the stub is cleaner.
3. **§6 cookbook update** — the plan's final sub-phase must fill `test-plan.md` §6.1 (unit/contract location, naming `*.test.ts`, the reference test, and the `npm test` run command) per the rollout contract.
4. **Sentinel strategy for the privacy test** — use a unique recognizable `sourceText` value (e.g. a UUID-like marker) and assert it never appears in any thrown message, any `console` spy capture, or (route) any response body. Confirm a `console` spy is wired even though the code has no `console.*` today (guards against future additions).
