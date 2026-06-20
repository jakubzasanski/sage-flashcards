<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Runner Bootstrap + Generation-Service Coverage

- **Plan**: context/changes/testing-runner-bootstrap-generation/plan.md
- **Scope**: All 5 phases (full plan)
- **Date**: 2026-06-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Drift agent: zero drift — every Phase 2 branch (incl. status 402), the Phase 3 positive control, and the plan-sanctioned `defineConfig` adaptation verified. No "What We're NOT Doing" boundary crossed. Success criteria re-run this session: 33 tests pass, lint clean, build complete, all Progress rows `[x]`.

## Findings

### F1 — Provider-mock helpers duplicated across the two test files

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/generation.test.ts:24-51, src/lib/services/generation.privacy.test.ts:24-54
- **Detail**: `chatResponse`, `cardsContent`, `captureError` byte-for-byte duplicated in both files; the fetch-stub helper is forked (`stubFetch` returns the mock vs `installFetch`/`installRejectingFetch` return void). First test bootstrap — the moment the shared idiom is set.
- **Fix A ⭐ Recommended**: Extract to `test/helpers/provider.ts`, import from both.
  - Strength: One canonical shape; include glob skips a plain `.ts` helper; sets the precedent before integration suites copy it again.
  - Tradeoff: Small indirection; files no longer self-contained.
  - Confidence: HIGH — glob already excludes `test/stubs/` the same way.
  - Blind spot: None significant.
- **Fix B**: Accept the duplication for now.
  - Strength: Each file stays self-contained/readable.
  - Tradeoff: The fork will likely diverge further as suites are added.
  - Confidence: MED — fine for two files; degrades as the suite grows.
  - Blind spot: Future integration phase may re-fork a third time.
- **Decision**: FIXED via Fix A — extracted to test/helpers/provider.ts (chatResponse, cardsContent, stubFetch, stubRejectingFetch, captureError); both suites import it. 33 tests pass, lint clean.

### F2 — Config-error test cleanup lives in the test body, not afterEach/finally

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (test reliability)
- **Location**: src/lib/services/generation.test.ts:262-285
- **Detail**: The missing-`LLM_API_KEY` test does `resetModules()` + `doMock(...)` then `doUnmock()` + `resetModules()` as its last statements. If an assertion throws first, the module mock persists into sibling files in the same worker. Safe today only because it's the last describe block.
- **Fix**: Move `doUnmock` + `resetModules` into an `afterEach` (or wrap the body in `try/finally`).
- **Decision**: FIXED — wrapped the dynamic-import + assertions in `try/finally`; `doUnmock`+`resetModules` now run unconditionally.

### F3 — No positive control proving the console-leak guard itself works

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (assertion strength)
- **Location**: src/lib/services/generation.privacy.test.ts:75-83
- **Detail**: The module emits zero `console.*` today, so `expectConsoleNeverLeaked`'s loops never execute a body — a deliberate future-guard. Unlike the result-leak check (positive control at :169-179), nothing proves `expectConsoleNeverLeaked` would actually throw if a sentinel reached a spy.
- **Fix**: Add one positive-control test that feeds the sentinel to a console spy and asserts `expectConsoleNeverLeaked` throws.
- **Decision**: FIXED — added a positive-control test that calls `console.error(sentinel)` and asserts `expectConsoleNeverLeaked` throws.

### F4 — fetch call-arg indexed without a prior call-count assertion

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (test reliability)
- **Location**: src/lib/services/generation.test.ts:184
- **Detail**: The input-cap test reads `fetchMock.mock.calls[0][1]`. If fetch were never called, this throws a raw `TypeError` instead of a clean assertion failure. (`noUncheckedIndexedAccess` is off in this repo's strict base, so it lints fine — robustness, not a type bug.)
- **Fix**: Assert `expect(fetchMock).toHaveBeenCalledOnce()` before indexing.
- **Decision**: FIXED — added `expect(fetchMock).toHaveBeenCalledOnce()` before reading `mock.calls[0][1]`.
