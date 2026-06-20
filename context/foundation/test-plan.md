# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-20

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the risk wins. Do not promote to e2e because e2e "feels safer." Do not put a vision model on top of a deterministic check that already catches the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team is worried about X, and the failure would surface somewhere in <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what could fail_ and _why we believe it's likely_ — drawn from documents and codebase _signal_ (churn, structure, test base). It does NOT claim to know which line owns the failure. That knowledge is produced by `/10x-research` during each rollout phase. If the plan and research disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/` (excluding docs, build output, `node_modules`).

Note: the Phase 2 interview was skipped at the user's request, so this map leans on PRD guardrails, the roadmap, and hot-spot churn. It mirrors what the documents emphasize; revisit via `--refresh` once the team has lived-incident evidence to add.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by risk = impact × likelihood. Risks are failure scenarios in user / business terms, not test names. The Source column cites the _evidence that surfaced this risk_ — never a specific file as "where the failure lives" (that is research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                       | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A user reads or writes another user's cards — ownership/RLS gap on a card endpoint                                            | High   | Medium     | PRD §Access Control (per-user decks, no admin visibility); `lessons.md` (RLS-GRANT lesson — RLS easy to misconfigure); hot-spot dir `src/pages/api/` (4 commits/30d) |
| 2   | Pasted source text leaks into operator-readable logs, persisted storage, or an error body                                     | High   | Medium     | PRD §Guardrail "source-text privacy" + §NFR; `wrangler.jsonc observability.enabled=true`; hot-spot dir `src/lib/services/` (3 commits/30d)                           |
| 3   | AI generation degrades the wedge — provider failure / malformed / empty / over-cap output surfaces as garbage or a hard error | High   | High       | PRD US-01, FR-008, §NFR (15s p95); hot-spot dir `src/lib/services/` (3 commits/30d)                                                                                  |
| 4   | Accepted cards are lost — bulk save partially fails, or the in-progress review session is lost on refresh before save         | High   | Medium     | PRD FR-010 + §Guardrail "no data loss"; hot-spot dirs `src/pages/api/`, `src/components/generation/`                                                                 |
| 5   | An unauthenticated visitor reaches a protected route or a save endpoint                                                       | High   | Low        | PRD §Access Control (redirect unauth to sign-in); hot-spot `src/middleware.ts`                                                                                       |
| 6   | Resource abuse — oversized request body / cap bypass / mass-triggered generation cost                                         | Medium | Medium     | PRD FR-008 (≤10k chars, ≤30 cards) + §NFR; abuse lens (product has auth + free-text user input)                                                                      |

Abuse/security lens covered: #1 (authorization/IDOR), #6 (resource abuse). #2 is the source-text privacy guardrail. High-impact × Low-likelihood #5 is kept (cheap to assert) rather than deferred to alerting because the redirect/401 boundary is trivially testable.

### Risk Response Guidance

| Risk | What would prove protection                                                                                                           | Must challenge                                             | Context `/10x-research` must ground                                                                        | Likely cheapest layer                              | Anti-pattern to avoid                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| #1   | User B's authenticated client sees **0** of user A's rows; insert forces `user_id = auth.uid()`-matching value                        | "logged-in implies scoped" — authentication ≠ ownership    | RLS policies + table GRANTs; that the insert path uses the _user's_ authenticated client, not service-role | integration vs **local Supabase, two real users**  | testing via the service-role key (bypasses RLS entirely — proves nothing)                                     |
| #2   | No `sourceText` appears in logs, error bodies, or the DB across **both** success and failure paths                                    | "errors are generic" asserted by reading, not by a test    | every throw/log path in the generation service and the routes                                              | unit (mocked provider) + a log/response assertion  | asserting only the happy path; trusting the comment                                                           |
| #3   | Malformed / empty / 5xx / over-cap provider output yields a clean handled result; ≤30 cap holds; retry fires only on transient faults | "HTTP 200 implies usable cards"                            | the provider request/response contract; the retry classification (which statuses retry)                    | unit, provider mocked at the fetch boundary        | **oracle problem** — asserting expected card JSON copied from the implementation rather than the PRD contract |
| #4   | A refresh mid-review restores the session; save persists exactly the accepted set and nothing else                                    | "save returned 2xx implies the rows are durably persisted" | localStorage session shape; the bulk-insert semantics + what "accepted" means                              | integration for save + one e2e for refresh-restore | snapshot-without-meaning; asserting UI text instead of persisted rows                                         |
| #5   | Unauthenticated `/generate` redirects to sign-in; unauthenticated API call returns 401                                                | "the page gate implies the API is gated"                   | the `PROTECTED_ROUTES` list + the per-route auth check                                                     | integration (request with no cookie)               | only testing the page redirect, never the API                                                                 |
| #6   | Oversized body → 413 before parsing; >30 cards or >10k chars → 400                                                                    | "the platform/runtime limits cover it"                     | the Content-Length guards + the zod caps on each route                                                     | integration                                        | e2e where a direct request to the route suffices                                                              |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder via `/10x-new`. Status moves left-to-right through the values below; the orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                                     | Goal (one line)                                                                                                                              | Risks covered  | Test types      | Status      | Change folder                                        |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------- | ----------- | ---------------------------------------------------- |
| 1   | Runner bootstrap + generation-service coverage | Stand up the test runner; prove #2/#3 at the service (validation, caps, transient-only retry, never-logs-source-text) with a mocked provider | #2, #3         | unit + contract | complete    | context/changes/testing-runner-bootstrap-generation/ |
| 2   | API integration + access control               | Auth gate, validation/413, two-user RLS isolation, and correct owner/origin on `/api/generate` and `/api/cards`                              | #1, #4, #5, #6 | integration     | not started | —                                                    |
| 3   | Critical-path e2e                              | paste → generate (mocked) → edit/reject/accept → refresh-restore → save → confirm; unauth redirect                                           | #4, #3, #5     | e2e             | not started | —                                                    |
| 4   | Quality-gates wiring                           | Wire the test run into CI alongside lint + build; lock the floor                                                                             | cross-cutting  | gates           | not started | —                                                    |

Status vocabulary (fixed): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a `checked:` date so future readers can see which lines need re-verification. There is **no test base today** — no runner config, zero test files, no test deps (`CLAUDE.md`: "lint + build are the only validation gates"). The rows below are the recommended targets, each addressed by a named rollout phase.

| Layer                  | Tool                 | Version | Notes                                                                                                                                                                                                      |
| ---------------------- | -------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit + integration     | Vitest               | 4.x     | shipped §3 Phase 1. Vite-native; plain `defineConfig` from `vitest/config` (not Astro's `getViteConfig` — Cloudflare adapter plugin rejects Vitest env opts). `astro:env/server` aliased to `test/stubs/`. |
| API / provider mocking | `vi.fn`/`fetch` mock | shipped | §3 Phase 1: `vi.stubGlobal("fetch", …)` at the OpenAI-compatible boundary, `unstubGlobals`. MSW not needed (one fetch boundary). Never mock internal modules.                                              |
| mutation (selective)   | Stryker              | 9.x     | §3 Phase 1: `stryker.conf.json` scoped to one module; ad-hoc gate (`npx stryker run`), not CI.                                                                                                             |
| integration data       | local Supabase       | n/a     | `npx supabase start` (Docker). Two real users for the RLS isolation test — see §3 Phase 2.                                                                                                                 |
| e2e                    | Playwright           | TBD     | none yet — see §3 Phase 3. Drive `/generate` under `wrangler dev`; mock the LLM call.                                                                                                                      |
| accessibility          | —                    | —       | not scoped for MVP (PRD: keyboard-first review loop is the only a11y NFR; defer dedicated a11y tests).                                                                                                     |

**Stack grounding tools (current session):**

- Docs: Cloudflare + Supabase skills available (workerd/RLS guidance); Context7 not available in current session — checked: 2026-06-19
- Search: WebSearch available (for current Vitest/Playwright + Astro/Cloudflare test-setup guidance) — checked: 2026-06-19
- Runtime/browser: Playwright / Chrome-DevTools (web-perf skill) available — candidate e2e layer for §3 Phase 3 — checked: 2026-06-19
- Provider/platform: local Supabase (PostgREST two-user RLS check) + Cloudflare Workers (`wrangler dev`) — checked: 2026-06-19

## 5. Quality Gates

The full set of gates that must pass before a change reaches production. "Required after §3 Phase N" means the gate is enforced once that rollout phase lands; before that it is `planned`.

| Gate                                            | Where                | Required?                 | Catches                                        |
| ----------------------------------------------- | -------------------- | ------------------------- | ---------------------------------------------- |
| lint + typecheck (`npm run lint`, `astro sync`) | local + CI           | required (live today)     | syntactic / type drift, unresolved env imports |
| build (`npm run build`)                         | local + CI           | required (live today)     | SSR/adapter breakage                           |
| unit + contract                                 | local + CI           | required after §3 Phase 1 | service logic, caps, privacy invariants        |
| integration (API + RLS)                         | CI on PR             | required after §3 Phase 2 | auth/ownership regressions, save persistence   |
| e2e on the critical flow                        | CI on PR             | required after §3 Phase 3 | broken paste→generate→save path                |
| pre-prod smoke                                  | between merge + prod | optional                  | edge-runtime-specific failures (workerd)       |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once the relevant rollout phase ships; before that it reads "TBD — see §3 Phase N."

### 6.1 Adding a unit/contract test (services)

- **Location/naming**: co-locate as `src/**/*.test.ts` next to the source (e.g. `src/lib/services/generation.test.ts`). A focused invariant can get its own file (e.g. `generation.privacy.test.ts`). The env stub lives at `test/stubs/astro-env-server.ts`.
- **Runner bootstrap (load-bearing)**: `vitest.config.ts` aliases the `astro:env/server` virtual id to the stub via `resolve.alias` — without it Vite cannot resolve that import under Vitest and the service fails to _transform_ before any mock applies. The alias key must be the exact id. The config also aliases `@` → `./src` and sets `environment: "node"`, `globals: true`, `unstubGlobals: true`. (It uses plain `defineConfig` from `vitest/config`, **not** Astro's `getViteConfig` — the Cloudflare adapter plugin rejects Vitest's env options.)
- **Provider mock**: stub the one OpenAI-compatible fetch boundary — `vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status }))))`. Return a _fresh_ `Response` per call so retried (body-reading) paths don't trip "body already consumed". `unstubGlobals: true` (+ an `afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); })`) prevents cross-test bleed. No MSW.
- **Config-error path** (missing env value): layer `vi.resetModules()` + `vi.doMock("astro:env/server", () => ({ LLM_API_KEY: "", ... }))` + a dynamic `await import("@/lib/services/generation")` for that one test; `doUnmock` + `resetModules` after. The alias makes the id resolvable; the per-test mock overrides the value.
- **Oracle**: assert against the PRD contract (atomic Q/A, ≤30 cap, empty-is-valid, privacy), never card JSON copied from the implementation. Use `it.each` tables (one per invariant), not near-duplicate tests. For privacy, feed a unique sentinel through `sourceText` and assert it never reaches a thrown message or a `console` spy.
- **Reference test**: `src/lib/services/generation.test.ts` (risk #3) + `generation.privacy.test.ts` (risk #2).
- **Run**: `npm test` (watch: `npm run test:watch`). Selective mutation gate (ad hoc, not CI): `npx stryker run` — config in `stryker.conf.json`, scoped to one module; triage survivors by "would this hurt a user?", don't chase 100%.

### 6.2 Adding an integration test for an API route

- TBD — see §3 Phase 2 (auth gate, zod/413 validation, owner/origin, two-user RLS isolation against local Supabase).

### 6.3 Adding an e2e test

- TBD — see §3 Phase 3 (drive `/generate` under `wrangler dev`, mock the LLM).

### 6.4 Testing access control / RLS specifically

- TBD — see §3 Phase 2. Pattern intent: assert isolation through each **user's authenticated client / token**, never the service-role key (per `lessons.md` two-user rule).

### 6.5 Per-rollout-phase notes

- **Phase 1 (runner bootstrap + generation-service coverage)** — shipped 2026-06-20. Bootstrapped Vitest 4.x from zero (no prior runner); proved risk #3 (degradation: retry classification, `extractJson` strategies, input/output caps, malformed/empty/bad-shape, empty-is-valid regression lock, config/blank guards) and risk #2 (sentinel `sourceText` never in a throw message or `console` capture). One-off Stryker pass on `generation.ts` (score 64% → 67%) killed the parse-retryable mutants; remaining survivors (static messages, prompt text, request-shape wiring) consciously ignored — wiring deferred to Phase 2 integration. Change: `context/changes/testing-runner-bootstrap-generation/`.

## 7. What We Deliberately Don't Test

Exclusions derived from PRD non-goals and stack facts (the Phase 2 interview was skipped — revisit on `--refresh` with team input). Respect these unless the underlying assumption changes.

- **Generated `src/db/database.types.ts`** — the Supabase type generator is the test; re-run it instead. Re-evaluate if types are ever hand-edited. (Source: stack fact.)
- **shadcn/ui primitives (`src/components/ui/*`)** — vendored, upstream-tested; test our composition, not the primitive. (Source: stack fact.)
- **The LLM's actual card _quality_** — not unit-testable; measured by the product metric "75% of AI cards accepted," not by tests. We test structure/caps/privacy, not whether a card is "good." (Source: PRD §Success Criteria.)
- **The off-the-shelf spaced-repetition algorithm internals** (when S-02 lands) — integrate a library, don't test its scheduling math. (Source: PRD §Non-Goals "no custom algorithm.")
- **Marketing/landing + static auth page rendering** — low blast radius, high churn-noise. (Source: PRD §Non-Goals scope.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-19
- Stack versions last verified: 2026-06-19
- AI-native tool references last verified: 2026-06-19

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
