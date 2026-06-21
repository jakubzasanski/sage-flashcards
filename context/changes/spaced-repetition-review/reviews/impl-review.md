<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Keyboard-Driven Spaced-Repetition Review

- **Plan**: context/changes/spaced-repetition-review/plan.md
- **Scope**: All 4 phases
- **Date**: 2026-06-21
- **Verdict**: APPROVED
- **Findings**: 0 critical · 1 warning · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated success criteria re-verified at review time: `npm test` → 97 passed; `npm run test:integration` → 9 passed; `npm run build` clean; `npx astro check` → 0 errors.

## Findings

### F1 — "never silently dropped" comment overstates the failed-rating guarantee

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/components/review/ReviewSession.tsx:11-13, 73-84
- **Detail**: A failed rating POST is recorded in `failed` state for in-session retry. The header comment said ratings are "never silently dropped," but that holds only within the live session — a tab close before retry loses the in-flight failed rating. Data integrity is not compromised (the server schedule is the source of truth, so an un-persisted card re-surfaces as due next session); the comment simply overstated the guarantee.
- **Fix**: Soften the comment to scope the guarantee to the live session and clarify that an un-retried failure leaves the card un-advanced (not corrupted). No behavior change.
- **Decision**: FIXED (Fix now) — comments at the header and `persist` reworded.

### F2 — "Card X of N" denominator grows when a card is re-queued

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/review/ReviewSession.tsx:176
- **Detail**: Rating a card "Again" re-appends it to the in-memory queue, so the "of {queue.length}" total ticked up mid-session. Cosmetic only; the re-append behavior itself is intended and correct.
- **Fix**: Replaced the growing "Card X of N" with a "{n} cards left" count, which reads naturally even when an Again rating adds one back.
- **Decision**: FIXED (Fix now).

## Notes

The substance verified correct: the RLS trust boundary on `/api/review/rate` (next schedule computed only from the stored row + server clock; client body fields stripped by zod), the due-query cap + `(user_id, due)` index, the ts-fsrs v5 schema reconcile (+learning_steps / −deprecated elapsed_days), and the optimistic-advance + Again-re-append loop (no skipped/looped card). No drift, no scope creep, migrations data-loss-safe.
