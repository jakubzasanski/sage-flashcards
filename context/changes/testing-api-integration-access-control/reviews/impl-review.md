<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: API Integration + Access Control Tests

- **Plan**: context/changes/testing-api-integration-access-control/plan.md
- **Scope**: Phases 1–4 (all) + e2e fix
- **Date**: 2026-06-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS (1 EXTRA — playwright.config.ts, user-directed + documented) |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS (1 observation) |

## Findings

### F1 — RLS integration test is order-dependent on a shared seeded row

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: test/integration/rls-flashcards.test.ts:30-109
- **Detail**: All 6 `it` blocks share one `aCardId` seeded in `beforeAll`; "B cannot update" asserts A's answer unchanged while "A can update own" mutates it. Passes under Vitest default in-order run; breaks under `--sequence.shuffle`/`test.concurrent`. Deliberate (mutator placed last) but undocumented.
- **Fix**: Add a comment pinning required ordering, or seed per mutating test.
- **Decision**: FIXED (ordering-contract comment added at rls-flashcards.test.ts:55)

### F2 — `npm run lint` doesn't fully pass; criteria 1.3/2.5 marked [x] on "my files clean"

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: .claude/hooks/{lint,typecheck}.mjs (pre-existing, committed harness files)
- **Detail**: `npm run lint` exits non-zero on 2 pre-existing parsing errors in harness files outside the project tsconfig. The change's own files lint clean (verified). Surfaced transparently during implementation.
- **Fix**: Add `.claude/` to eslint's ignore (eslint.config.js) — separate optional fix, out of this change's scope.
- **Decision**: SKIPPED (left as separate optional fix)

### F3 — Token cache keyed by email only, no expiry/invalidation

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: test/support/supabase.ts:31-50
- **Detail**: `tokenCache` keys on email, ignores password, never invalidates. Safe today; latent footgun if a second password were used for the same email.
- **Fix**: Document the one-password-per-email assumption, or key on email+password.
- **Decision**: FIXED (assumption documented at supabase.ts:31-33)

### F4 — Synthetic APIContext is a minimal plain object (durability caveat)

- **Severity**: 🟦 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (correctness)
- **Location**: test/support/api-context.ts:35-39
- **Detail**: `request` implements only `headers`/`json` (faithful today, documented undici rationale). A handler later reading `request.text()/body/url/method` would get undefined and could false-pass; e2e is the real-runtime cross-check.
- **Fix**: Note that new `request.*` members must extend the factory.
- **Decision**: FIXED (extend-factory note added at api-context.ts:12-17)
