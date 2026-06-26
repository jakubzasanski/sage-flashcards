<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: CI/CD Code-Review Workflow — Phase 4 (F6 closure)

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Scope**: Phase 4 (+ F6 re-assessment)
- **Date**: 2026-06-27
- **Verdict**: NEEDS ATTENTION (F6 from impl-review.md is RESOLVED; W1 is a minor new reliability bug)
- **Findings**: 0 critical · 3 warnings · observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## F6 (secret exfiltration) — VERIFIED CLOSED
Secret referenced only in `review-run.yml:72` (workflow_run job → default-branch code, PR-author cannot modify). Producer (`review.yml`) is `contents: read`, no secret, no agent. PR artifact consumed strictly as data (diff + jq-parsed meta). Title/body via `$GITHUB_ENV` heredoc with random delimiter, never shell-interpolated. No path runs PR-head code with the secret. Resolved by Phase 4 (commit 9ad3501). Safety & Quality moves FAIL → WARNING.

## Grounding
Drift agent: all Phase 4 items MATCH, no missing, no scope creep. Automated 4.1/4.2 re-verified: review.yml secretless (`permissions: contents: read`, no `secrets.`, no local action); review-run.yml has workflow_run + secret + download-artifact + commit status; both valid YAML.

## Findings

### W1 — Consumer fires on skipped/failed producer → spurious failed run

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: .github/workflows/review-run.yml:28-30
- **Detail**: Job `if:` gates only on `workflow_run.event`, not `workflow_run.conclusion == 'success'`. When the producer job is skipped (a `labeled` event with a label other than ai-cr:review) or fails, the producer workflow still completes; the consumer fires and `download-artifact` fails (no artifact) → a red, confusing failed run on every unrelated label add. No PR-visible harm, but noisy.
- **Fix**: Add `github.event.workflow_run.conclusion == 'success'` to the job `if`.
- **Decision**: FIXED (commit 9e0f816)

### W2 — Empty head_sha silently skips the only PR-visible status

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: .github/workflows/review-run.yml:105
- **Detail**: Commit-status block guarded by `if [ -n "$HEAD_SHA" ]`. Commit status is the only PR-visible signal; if head_sha is ever empty on a real PR (metadata drift), the PR silently gets no green/red and no error.
- **Fix**: On the pull_request path, treat empty head_sha as an error (exit 1), not a silent skip.
- **Decision**: FIXED (commit 9e0f816)

### W3 — F1 carryover: malformed model JSON still crashes the step

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability)
- **Location**: .github/actions/ai-review/action.yml:66-67
- **Detail**: Unchanged from prior F1. `node -e … JSON.parse` under `set -euo pipefail`: a non-JSON/truncated agent response throws → step exits → verdict never set → consumer dies before posting anything. No longer a security issue (trusted phase); still zero PR feedback on a flaky reply.
- **Fix A ⭐ Recommended**: On parse failure in the action, emit verdict=fail + an explanatory summary so the consumer still reports.
  - Strength: Pipeline always gives PR feedback; advisory stays advisory.
  - Tradeoff: A genuine crash reads as review "fail" — summary must say so.
  - Confidence: HIGH — isolated to the action's run block.
  - Blind spot: None significant.
- **Fix B**: Accept — rely on outputSchema making non-JSON rare.
  - Strength: Zero work.
  - Tradeoff: Silent no-feedback on garbled responses.
  - Confidence: MED — no data on schema-violation rate.
  - Blind spot: Frequency unknown.
- **Decision**: DEFERRED — follow-up (reliability hardening; low probability given Codex outputSchema; not merge-blocking)

## Observations
- O1: `pull_request` (not `pull_request_target`) is the correct safe producer trigger.
- O2: SHA-pinning consistent across all third-party actions.
- O3: Loop-prevention sound (verdict labels don't re-trigger producer); interacts with W1.
- Pending manual plan rows (post-merge): 1.5, 2.3, 4.3, 4.4 — need both workflows on master.
