<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First AI Cards to Deck

- **Plan**: context/changes/first-ai-cards-to-deck/plan.md
- **Scope**: Phase 1 of 3
- **Date**: 2026-06-19
- **Verdict**: NEEDS ATTENTION (all findings triaged & resolved)
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Privacy guardrail verified live: no `console.*` in either file, all error bodies are static strings, `sourceText` never echoed. Auth boundary, ≤30 cap, ≤10000 input cap, single-retry-count, workerd `fetch` all hold.

## Findings

### F1 — Retry scope too broad: deterministic 4xx errors get retried

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/lib/services/generation.ts:150-158
- **Detail**: The retry excluded only `kind:"config"`. Deterministic upstream failures — bad key (401), 403, insufficient credits (402), content-policy/rejected-params (400) — are `kind:"upstream"` and so were retried needlessly: double latency + double provider cost before failing. Observed live: the 402 case fired two OpenRouter calls before the 502.
- **Fix**: Added a `retryable` flag to `GenerationError`; `callOpenRouter` tags 4xx (except 429) as non-retryable, network/429/5xx/parse as retryable; `generateCandidates` gates the second attempt on `err.retryable`.
- **Decision**: FIXED (Fix now)

### F2 — Empty model output ({"cards":[]}) becomes a 502, not a clean "no cards"

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Correctness)
- **Location**: src/lib/services/generation.ts:42-45
- **Detail**: The zod schema required `cards.min(1)`. A legitimate empty result became a parse error → retried → 502 instead of a clean empty list.
- **Fix**: Dropped `.min(1)` on the cards array; an empty list now flows through as `200 {candidates:[]}`. UX framing deferred to Phase 3.
- **Decision**: FIXED (Fix now)

### F3 — Unplanned extractJson helper (EXTRA)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/generation.ts:52-79
- **Detail**: Tolerant JSON extraction (direct parse → ```fence strip → first-`{...}` slice) added mid-phase so cheaper/free models work. Strengthens the plan's own "parse / retry on parse failure" intent, adds no dependency, never leaks `sourceText`, documented inline. Worst case still falls through to a clean 502.
- **Fix**: None — accept as documented scope addition.
- **Decision**: ACCEPTED (as documented addition)
