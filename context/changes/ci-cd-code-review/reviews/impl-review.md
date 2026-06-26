<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: CI/CD Code-Review Workflow

- **Plan**: context/changes/ci-cd-code-review/plan.md
- **Scope**: Phases 1–3 (all)
- **Date**: 2026-06-27
- **Verdict**: NEEDS ATTENTION (revised from APPROVED after secret-exposure finding F6)
- **Findings**: 1 critical · 2 warnings · 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Grounding
29/29 planned items MATCH (drift agent). Automated success criteria re-verified: typecheck OK; action.yml + review.yml valid YAML. Manual 3.3–3.6 proven on live runner (PR #5: run 28268734346 pass→green→ai-cr:passed; run 28268797618 fail→red→ai-cr:failed). Security class (GHA expression-injection via PR title/body) handled correctly via env, not shell.

## Findings

### F6 — Secret exfiltration: `OPENAI_API_KEY` exposed to PR-author-controlled code

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; the trigger model must change before merge
- **Dimension**: Safety & Quality (security)
- **Location**: .github/workflows/review.yml (trigger `pull_request`, steps `npm ci` / `npm run review` / `uses: ./.github/actions/ai-review`)
- **Detail**: On `pull_request`, a PR from a branch **within the repo** (any push-capable collaborator) receives the secret AND runs PR-head code: `npm ci` executes the PR's lifecycle scripts, `npm run review` runs the PR's agent code, and the action/workflow file are themselves the PR's versions. Any of these can exfiltrate `OPENAI_API_KEY`. Forked PRs are safe (GitHub withholds secrets on `pull_request`), so the live exploit path is same-repo branch PRs. Hardening *inside* `review.yml` does not help — on `pull_request` the workflow file is the PR's version, so the trusted boundary must move out of the PR-controlled context entirely. The plan listed forked-PR isolation as out of scope, but the same-repo-branch exposure was not considered.
- **Fix A ⭐ Recommended**: Two-phase `pull_request` (no secret) → `workflow_run` (trusted, has secret).
  - Phase 1 on `pull_request`: minimal perms, NO secret — only `git diff` to an uploaded artifact + the PR number.
  - Phase 2 on `workflow_run`: runs the workflow + agent code from the **default branch** (trusted, not PR-controlled), downloads the diff artifact, runs the agent with the secret, posts comment/label back to the PR.
  - Strength: Canonical GitHub pattern for "secret + untrusted PR content"; trusted code is immutable by the PR author.
  - Tradeoff: Two workflow files + artifact passing + posting results back via the PR number from the event; more moving parts.
  - Confidence: HIGH — GitHub-documented secure pattern.
  - Blind spot: workflow_run posting permissions/PR-number plumbing need care.
- **Fix B**: `pull_request_target` + checkout the **trusted base** version of the action/agent, consume the PR only as diff *data*.
  - Strength: Single file; secret stays with base-branch code if PR code is never executed.
  - Tradeoff: `pull_request_target` is a known footgun — one accidental checkout/`npm ci` of PR head reopens the hole; must never run PR-controlled code with the secret in scope.
  - Confidence: MED — correct but easy to regress.
  - Blind spot: Need to ensure `npm ci` runs against the base lockfile/code, not PR head.
- **Decision**: RESOLVED in Phase 4 (commit 9ad3501) — verified closed in reviews/impl-review-phase-4.md (two-phase pull_request → workflow_run isolates the secret).

### F1 — Malformed model output crashes the job instead of degrading

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability)
- **Location**: packages/code-reviewer/src/reviewer.ts:88-95 → .github/actions/ai-review/action.yml:64-67
- **Detail**: If the model returns non-JSON or schema-invalid output, `parseReview` throws; `index.ts` has no try/catch, so the process exits non-zero. Under `set -euo pipefail` in the action that aborts the step before `verdict=` is written to `$GITHUB_OUTPUT` — the whole job errors out red rather than producing a clean advisory result. Wrong failure mode for a non-gate tool. Low probability (Codex `outputSchema` enforces shape), but a crash is indistinguishable from "agent couldn't run".
- **Fix A ⭐ Recommended**: Catch parse failure in the action, emit verdict=fail (or neutral) + explanatory summary instead of crashing.
  - Strength: Degrades gracefully; advisory stays advisory; one bash guard.
  - Tradeoff: A crash now hides as a "fail" — needs a clear summary so it's not mistaken for a real verdict.
  - Confidence: HIGH — isolated to the action's run block.
  - Blind spot: None significant.
- **Fix B**: Leave as-is (accept), rely on outputSchema making it rare.
  - Strength: Zero work; a hard error is arguably louder than a fake fail.
  - Tradeoff: Red job on a flaky response looks like infra failure.
  - Confidence: MED — depends on real-world schema-violation rate.
  - Blind spot: No data yet on schema-violation frequency.
- **Decision**: PENDING

### F2 — `diff-path` interpolated into `run:` via ${{ }} instead of env

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/actions/ai-review/action.yml:64
- **Detail**: `npm run --silent review < "${{ inputs.diff-path }}"` expands the input directly into the shell. `diff-path` is workflow-controlled ($RUNNER_TEMP), so NOT exploitable — but it's the same expression-injection anti-pattern the rest of the code avoids (title/body correctly go via env). The genuinely PR-controlled values are handled safely.
- **Fix**: Pass `env: DIFF_PATH: ${{ inputs.diff-path }}` and use `< "$DIFF_PATH"`.
- **Decision**: PENDING

### F3 — No `concurrency` group → label-cycling race

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: .github/workflows/review.yml (job level)
- **Detail**: Rapid `synchronize` pushes run overlapping jobs; the remove-then-add label step (L121-127) can interleave and leave the wrong final label.
- **Fix**: Add `concurrency: { group: ai-review-${{ github.event.pull_request.number }}, cancel-in-progress: true }`.
- **Decision**: PENDING

### F4 — Missing `cache: npm` in setup-node (diverges from ci.yml)

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: .github/workflows/review.yml:47-51 vs .github/workflows/ci.yml:14-17
- **Detail**: ci.yml uses `cache: npm`; review.yml doesn't, so `npm ci` (action.yml:44) refetches deps every run — slower/costlier per PR.
- **Fix**: Add `cache: npm` with `cache-dependency-path` → reviewer package lockfile.
- **Decision**: PENDING

### F5 — Action-pinning divergence (review.yml SHA-pinned, ci.yml floating @v4)

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: .github/workflows/review.yml:43,48 vs .github/workflows/ci.yml:13-14
- **Detail**: This change SHA-pins (better supply-chain hygiene); ci.yml floats @v4. Divergence is in the safer direction — flagging only for consistency.
- **Fix**: Optionally align ci.yml up to SHA pins (out of this change's scope).
- **Decision**: PENDING

## Notes
- Pending manual plan rows unrelated to findings: 1.5 (`REVIEW_MODEL`, deferred) and 2.3 (workflow_dispatch dry-run — needs review.yml on master, i.e. post-merge).
- Observed agent non-determinism: same diff → pass on run 1, fail on run 2 at `reasoning_effort=low`. Acceptable for advisory; relevant to F1 and to any future gating (S-02) which should lean on promptfoo evals (M5L3), not a single verdict.
