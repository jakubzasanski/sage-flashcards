# CI/CD Code-Review Workflow Implementation Plan

## Overview

Wire the existing `@sage/code-reviewer` (Codex SDK) agent into GitHub Actions so every PR to `master` gets an advisory AI code review: a composite action computes a 6-criteria structured verdict, and the workflow posts a PR comment + an `ai-cr:passed`/`ai-cr:failed` label, failing the check (red ✗) when the verdict is `fail`. Re-runs on demand when the `ai-cr:review` label is added.

## Current State Analysis

- **Agent** (`packages/code-reviewer/`): `reviewDiff(diff)` (reviewer.ts:14) reads a diff, returns validated JSON — 5 scores + `verdict: pass|fail` + Markdown `summary` (review-schema.ts:19-29). stdout = JSON only (index.ts:36); metrics/notices → stderr. Auth via `OPENAI_API_KEY` (reviewer.ts:17). No model pinned; `modelReasoningEffort: "low"` already set (reviewer.ts:34). Codex sandbox is read-only/no-network — CI-compatible (the Node process still makes the OpenAI call).
- **CI**: one workflow `.github/workflows/ci.yml` (lint+test+build). No composite actions, no branch protection, no `dependabot`.
- **Monorepo hygiene**: `packages/**` excluded from the app's lint/typecheck (`tsconfig.json:4`, `eslint.config.js:87`) — the root `npm ci` does NOT install Codex deps; the action must install them inside the package.
- **Gating reality**: branch protection is roadmap slice **S-02** (`proposed`), gating on **S-01** (`ready`) — neither done (`ci-automation-roadmap.md:32-33`). So this review is **advisory**: it can show red + comment + label, but cannot block merge until S-02 lands.

## Desired End State

Opening (or pushing to) a PR against `master` triggers `AI Code Review`: a job computes the diff, runs the agent through the `ai-review` composite action, posts a comment with the Markdown summary, sets exactly one of `ai-cr:passed`/`ai-cr:failed`, and the check is green on `pass` / red on `fail`. Adding the `ai-cr:review` label re-runs it. Verifiable by opening a test PR and observing the comment, label, and check status — which is also the 10xChampion proof (pipeline view + job logs + LLM comment).

### Key Discoveries:

- Pass the diff as a **file path** (`$RUNNER_TEMP/pr.diff`), never through `$GITHUB_OUTPUT`/`with:` — newlines corrupt `key=value` and large values are unreliable (research §GHA mechanics).
- `actions/checkout` defaults to shallow; need `fetch-depth: 0` + three-dot `git diff "${{ github.event.pull_request.base.sha }}...HEAD"` for PR-only changes. Diff against the base **SHA**, not `origin/$base` — the named remote-tracking ref isn't guaranteed to exist on a PR checkout.
- Labels are issue objects → workflow needs `permissions: { contents: read, pull-requests: write, issues: write }` + `GH_TOKEN`. `gh label create --force` is idempotent.
- Secrets are invisible inside a composite action — the consumer workflow passes the key through `with:` → `inputs`.
- `github.event.label.name` is only populated on the `labeled` event — the right discriminator for the on-demand retry guard.

## What We're NOT Doing

- **Not** making the review a required/blocking merge gate (no branch protection yet — that's S-02). Advisory only.
- **Not** moving comment/label posting into the agent as tools (the "drabina sprawczości" — deferred to M5L3 Deep Dive / later).
- **Not** publishing the action to a separate repo or the Marketplace — local `.github/actions/ai-review/` for now (lesson's recommended option 2).
- **Not** handling forked-PR secret isolation (`pull_request_target`/`workflow_run` split) — MVP targets internal branch PRs on plain `pull_request`.
- **Not** adding numeric score thresholds — we trust the agent's `verdict` field.
- **Not** de-duplicating PR comments (accepted MVP limitation): `gh pr comment` posts a fresh comment per run, so an active PR accumulates one comment per push. A sticky/upserted comment (find-by-marker → edit) is a later refinement.
- **Not** touching the existing `ci.yml`.
- **Parked (per requirements)**: business alignment, architectural fit.

## Implementation Approach

Three layers, MVP-first: (1) extend the agent to emit exactly what CI needs (6th criterion, PR title/body input, gateable exit), (2) wrap the scoring in a pure composite action that returns `verdict`+`summary`, (3) a consumer workflow that does diff plumbing + GitHub side-effects. Criteria (what we judge) stay in the agent; mechanics + side-effects (how CI runs it, comment/labels) stay in the workflow — the two-layer split from the lesson.

## Critical Implementation Details

- **Codex deps install location**: the consumer checks out the whole repo, so `packages/code-reviewer` is at `$GITHUB_WORKSPACE/packages/code-reviewer`. The action runs `npm ci` there (its own lockfile) before invoking `npm run review` — the app's root install won't provide the Codex SDK.
- **Two distinct non-zero exits**: `index.ts:31` already exits 1 on *missing input*. The new "fail the check on `verdict: fail`" exit must use a **different code** (e.g. 2) so the workflow can distinguish "agent failed to run" from "agent ran and the PR failed review".
- **stdout purity**: the workflow parses stdout as JSON, so the agent must keep all non-JSON output on stderr (already true — preserve it when adding PR-title/body handling).

## Phase 1: Extend the `@sage/code-reviewer` agent

### Overview

Add the 6th criterion, accept PR title/body, surface a gateable verdict + configurable model — without breaking the existing `npm run review` / `review:sample` flows.

### Changes Required:

#### 1. Schema + system prompt — add `documentation`

**File**: `packages/code-reviewer/src/review-schema.ts`

**Intent**: Add a sixth scored criterion `documentation` so the agent's output matches `requirements.md` (6 criteria). Update the system prompt to enumerate six criteria (count + the documentation anchor) so the model scores it.

**Contract**: New field `documentation: z.number().describe(...)` in `REVIEW_SCHEMA` (range 1-10 conveyed via `.describe()`, consistent with the existing five). `SYSTEM_PROMPT` text updated from five to six criteria. `REVIEW_JSON_SCHEMA` and the `Review` type regenerate automatically.

#### 2. Accept PR title + body

**File**: `packages/code-reviewer/src/reviewer.ts`, `packages/code-reviewer/src/index.ts`

**Intent**: Let the review consider the PR's declared intent (title + body), not just the diff. `index.ts` reads title/body from env (`PR_TITLE`, `PR_BODY`) so CI can pass them without polluting the stdin diff channel; `reviewDiff` takes them as optional fields and prepends them to the prompt.

**Contract**: `reviewDiff(input: { diff: string; prTitle?: string; prBody?: string })` (or an added optional second arg — implementer's choice, keep back-compat for `review:sample`). Prompt assembly (reviewer.ts:37-41) includes a titled "PR context" block before the diff when present. `index.ts` reads `process.env.PR_TITLE`/`PR_BODY`.

#### 3. Gateable verdict exit + configurable model

**File**: `packages/code-reviewer/src/index.ts`, `packages/code-reviewer/src/reviewer.ts`

**Intent**: Allow CI to fail the check on `verdict: "fail"` and to pick the model via env, while keeping local runs (and promptfoo later) non-gating by default.

**Contract**: In `index.ts`, after printing the JSON, if `process.env.REVIEW_FAIL_ON_VERDICT === "1"` (or a `--fail-on-verdict` flag) and `review.verdict === "fail"`, `process.exit(2)` (distinct from the input-guard `exit(1)` at index.ts:31). In `reviewer.ts`, if `process.env.REVIEW_MODEL` is set, pass it as `model` to `startThread(...)` (reviewer.ts:29-35); otherwise keep the CLI default. `modelReasoningEffort: "low"` stays.

### Success Criteria:

#### Automated Verification:

- [ ] Typecheck passes: `npm run --prefix packages/code-reviewer typecheck`
- [ ] `npm run --prefix packages/code-reviewer review:sample` prints valid JSON containing all six criteria including `documentation`
- [ ] With `REVIEW_FAIL_ON_VERDICT=1`, a failing sample exits non-zero (code 2); without it, exit 0

#### Manual Verification:

- [ ] A run with `PR_TITLE`/`PR_BODY` set visibly reflects PR intent in the `summary`
- [ ] Setting `REVIEW_MODEL` switches the model (observable in usage/logs)

**Implementation Note**: After automated verification passes, pause for human confirmation before Phase 2.

---

## Phase 2: Composite action `.github/actions/ai-review/`

### Overview

A pure, reusable composite action that scores a diff and returns `verdict` + a summary file path — no GitHub side-effects.

### Changes Required:

#### 1. Action definition

**File**: `.github/actions/ai-review/action.yml`

**Intent**: Wrap "install package deps + run the agent + expose results" so the consumer workflow stays small and the review is reusable.

**Contract**: `name`/`description`; `inputs`: `api-key` (required), `diff-path` (required), `pr-title`, `pr-body`, `model` (optional). `outputs`: `verdict` → `${{ steps.review.outputs.verdict }}`, `summary-path` → file path. `runs: using: composite` with `steps` (each `shell: bash`): (a) `npm ci` in `$GITHUB_WORKSPACE/packages/code-reviewer`; (b) run the agent with **`npm run --silent review`** (or `npx tsx src/index.ts`) — the `--silent` is required so npm's lifecycle banner (`> @sage/code-reviewer@… review` / `> tsx src/index.ts`) does NOT land on stdout and corrupt the JSON the action parses — with the diff piped from `diff-path`, `PR_TITLE`/`PR_BODY`/`REVIEW_MODEL` from inputs and `OPENAI_API_KEY` from `api-key`, capturing stdout JSON; (c) parse `verdict` and write the `summary` to a file, emitting both to `$GITHUB_OUTPUT`. Do NOT pass the diff via `with:`/output — read it from the file. Do NOT set `REVIEW_FAIL_ON_VERDICT` here (a non-zero exit would abort the step before the verdict output is emitted — the workflow gates on the parsed `verdict`, see Phase 3).

### Success Criteria:

#### Automated Verification:

- [ ] `action.yml` is valid YAML and declares `using: composite` with every `run` step specifying `shell: bash`
- [ ] (if available) `actionlint` reports no errors on the action

#### Manual Verification:

- [ ] Triggered via `workflow_dispatch` (Phase 3), the action step installs deps, runs the agent, and surfaces a `verdict` output in the job log

**Implementation Note**: After automated verification passes, pause for human confirmation before Phase 3.

---

## Phase 3: Consumer workflow `.github/workflows/review.yml`

### Overview

The workflow that triggers on PRs, does the diff plumbing, calls the action, and performs the GitHub side-effects (comment, labels, red/green check).

### Changes Required:

#### 1. Workflow definition

**File**: `.github/workflows/review.yml`

**Intent**: Run the advisory AI review on every PR to `master` (and on-demand via the `ai-cr:review` label), post the result, and fail red on `fail`.

**Contract**:
- `on`: `pull_request: { branches: [master], types: [opened, synchronize, labeled] }` + `workflow_dispatch` with `inputs`: `base_ref` (default `master`) and optional `pr_number`. The diff/comment steps must read **event-or-input** — diff base from `github.event.pull_request.base.sha` on a PR else `inputs.base_ref`; PR number from `github.event.pull_request.number` else `inputs.pr_number`. On a dispatch run with no `pr_number`, skip the `gh pr comment` step (log the summary instead) so the dry-run still validates diff→action→verdict without a PR context.
- `permissions: { contents: read, pull-requests: write, issues: write }`; `env: GH_TOKEN: ${{ github.token }}`.
- Job `if:` guard: run for `workflow_dispatch`, for `pull_request` non-`labeled` actions, or for `labeled` only when `github.event.label.name == 'ai-cr:review'`.
- Steps: `actions/checkout@<sha>` (`fetch-depth: 0`); `setup-node@<sha>` (`node-version-file: .nvmrc`); compute diff against the base **SHA** (not a remote-tracking branch name, which may not exist on the runner): `git diff "${BASE_SHA}...HEAD" > "$RUNNER_TEMP/pr.diff"` where `BASE_SHA` is `github.event.pull_request.base.sha` on a PR (reachable thanks to `fetch-depth: 0`) else resolved from `inputs.base_ref` via an explicit `git fetch origin "<base_ref>"`; `gh label create` (`--force`) for the three labels; call `./.github/actions/ai-review` with `api-key: ${{ secrets.OPENAI_API_KEY }}`, `diff-path`, `pr-title: ${{ github.event.pull_request.title }}`, `pr-body: ${{ github.event.pull_request.body }}`; `gh pr comment --body-file <summary>`; remove `ai-cr:passed,ai-cr:failed,ai-cr:review` then add the verdict label; final step `exit 1` when `verdict == 'fail'` (red check).
- Third-party actions pinned to full commit SHA (with a `# vX` comment).

### Success Criteria:

#### Automated Verification:

- [ ] `review.yml` is valid YAML; (if available) `actionlint` passes
- [ ] Action reference path `./.github/actions/ai-review` resolves (action.yml exists at that path)

#### Manual Verification:

- [ ] On a test PR to `master`, the `AI Code Review` workflow runs and a comment with the summary appears on the PR
- [ ] Exactly one of `ai-cr:passed`/`ai-cr:failed` is set, matching the verdict; check is green on pass / red on fail
- [ ] Adding the `ai-cr:review` label re-runs the review
- [ ] Job log shows the agent invocation + token usage (10xChampion proof: pipeline view, job logs, LLM comment)

**Implementation Note**: Requires the manual GitHub setup in "Migration Notes" before the PR run.

---

## Testing Strategy

### Unit / local:
- `npm run --prefix packages/code-reviewer review:sample` → 6-criteria JSON; exit-code behavior under `REVIEW_FAIL_ON_VERDICT`.

### Integration (CI):
- **Runner smoke-test first (de-risk the load-bearing assumption)**: before building out the comment/label side-effects, run a minimal `workflow_dispatch` (or throwaway PR) that only does `npm ci` + one agent invocation on the Linux runner. This validates the two CI-only unknowns early: (1) `npm ci` resolves the platform-specific `@openai/codex` binary on Linux, and (2) auth works purely from the `OPENAI_API_KEY` secret with no `codex login` session (reviewer.ts:17's login fallback won't exist in CI). If this fails, stop — the rest of Phase 3 is moot until it's green.
- `workflow_dispatch` dry-run of `review.yml` to validate the action wiring before a real PR.

### Manual:
1. Add `OPENAI_API_KEY` repo secret.
2. Open a test PR to `master` with a deliberately flawed diff (reuse `fixtures/sample.diff`-style change) → expect `fail`, red check, `ai-cr:failed`, comment.
3. Open a clean PR → expect `pass`, green check, `ai-cr:passed`.
4. Add `ai-cr:review` to a PR → expect a re-run.

## Performance Considerations

One model call per PR (and per re-run). `modelReasoningEffort: "low"` + diff-only prompt keep per-PR cost low; model is tunable via `REVIEW_MODEL`. Cost-per-PR observability is deferred (M5L3 Deep Dive).

## Migration Notes

Manual GitHub setup required before the Phase 3 PR run:
1. **Repo secret** `OPENAI_API_KEY` (Settings → Secrets and variables → Actions).
2. **Labels** — created automatically by the workflow (`gh label create --force`); no manual step needed, but they can be pre-created.
3. **Test PR** against `master` to exercise the trigger (also the proof artifact).
4. **Advisory only** — branch protection (S-02) not set up, so the red check does not block merge yet; it becomes a required gate once S-02 adds it to the ruleset.

## References

- Research: `context/changes/ci-cd-code-review/research.md`
- Requirements: `context/changes/ci-cd-code-review/requirements.md`
- Roadmap (gating prerequisites): `context/foundation/ci-automation-roadmap.md:32-33,95,98`
- Agent: `packages/code-reviewer/src/{review-schema,reviewer,index}.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Extend the @sage/code-reviewer agent

#### Automated

- [x] 1.1 Typecheck passes: `npm run --prefix packages/code-reviewer typecheck`
- [x] 1.2 `review:sample` prints valid JSON with all six criteria including `documentation`
- [x] 1.3 `REVIEW_FAIL_ON_VERDICT=1` exits non-zero (code 2) on fail; exit 0 otherwise

#### Manual

- [x] 1.4 Run with `PR_TITLE`/`PR_BODY` reflects PR intent in `summary`
- [ ] 1.5 `REVIEW_MODEL` switches the model (observable in usage/logs)

### Phase 2: Composite action .github/actions/ai-review/

#### Automated

- [ ] 2.1 `action.yml` valid YAML, `using: composite`, every `run` step has `shell: bash`
- [ ] 2.2 `actionlint` (if available) reports no errors on the action

#### Manual

- [ ] 2.3 Via `workflow_dispatch`, action installs deps, runs agent, surfaces `verdict` output

### Phase 3: Consumer workflow .github/workflows/review.yml

#### Automated

- [ ] 3.1 `review.yml` valid YAML; `actionlint` (if available) passes
- [ ] 3.2 Action path `./.github/actions/ai-review` resolves

#### Manual

- [ ] 3.3 Test PR: `AI Code Review` runs, comment with summary appears
- [ ] 3.4 Correct label set + check green on pass / red on fail
- [ ] 3.5 Adding `ai-cr:review` re-runs the review
- [ ] 3.6 Job log shows agent invocation + token usage (10xChampion proof)
