# Dependency Automation Implementation Plan

## Overview

Add Dependabot to the Sage Flashcards repo so dependency updates (npm + GitHub Actions) open as **grouped, risk-scoped PRs** on a weekly cadence, with **known-breaking majors pinned out**, and a **safe auto-merge workflow** that merges only low-risk updates once the required CI signal is green. This is roadmap slice **S-04** (`context/foundation/ci-automation-roadmap.md`, ask #6).

The work is deliberately split so the safe half ships now and the risky half is gated: Phase 1 (`.github/dependabot.yml`) only *opens* PRs and can land immediately; Phase 2 (the auto-merge workflow) carries a **hard prerequisite on slice S-02** (branch protection with required status checks), because auto-merge without a required check would merge ungated.

## Current State Analysis

- **No `.github/dependabot.yml` exists.** The roadmap only ever held a sketch; nothing is committed. This change creates the file from scratch.
- **The CI signal to gate on already exists** (S-01, shipped via PR #7). `.github/workflows/ci.yml` defines three jobs — `lint-unit-build`, `integration`, `e2e` (e2e via the reusable `e2e.yml`). These are the checks auto-merge will wait on.
- **A separate `AI Code Review` *commit status*** is published by `review-run.yml` (a `workflow_run` consumer). It is not attached to PR checks and is **advisory** for this change (see Decision below).
- **S-02 (branch protection + required checks) is NOT built.** `gh api repos/:owner/:repo/branches/master/protection` returns 404; there is no `release-automation` change folder. Auto-merge is only *meaningful and safe* once a required check exists — hence the Phase 2 gate.
- **The repo is a fork.** Dependabot operates *within* the fork (head and base both on the fork's own `master`), so the upstream-PR-routing problem that affects `gh pr create` here does **not** apply to Dependabot PRs. However, Dependabot must be enabled in the fork's GitHub settings (manual prerequisite, see Phase 1).
- **`package.json` has no `engines` field**; Node 24 is pinned via `.nvmrc` and `setup-node` in CI. Dependabot does not need engines to function.
- **Conventional commits matter downstream.** S-02 will run release-please, which reads conventional-commit history. Dependabot's commit messages must therefore use a conventional prefix (`chore`/`build`) so they don't pollute or break the changelog later.

### Key Discoveries

- CI job names to gate on: `lint-unit-build`, `integration`, `e2e` — `.github/workflows/ci.yml:18,40,57`.
- ESLint must stay on **9** — ESLint 10 has no plugin-react / jsx-a11y support and crashes lint ([[eslint-10-blocked]]).
- App is on **Astro 7** with React 19 ([[astro-7-cloudflare-bindings]]); framework majors (`astro`, `react`, `react-dom`) need a deliberate upgrade change, not an automated PR.
- Dependabot PRs receive a **read-only `GITHUB_TOKEN`** and **no access to repo secrets** (e.g. `OPENAI_API_KEY`) by default — this is exactly why the AI Code Review gate is advisory, not required, for dep PRs.
- The current third-party actions use floating major tags (`actions/checkout@v4`, `actions/setup-node@v4`, `supabase/setup-cli@v1`) — Dependabot's `github-actions` ecosystem will keep these current.

## Desired End State

Opening the repo's Dependabot tab shows scheduled npm + github-actions update runs. Each week, Dependabot opens a small set of **grouped** PRs (dev-deps; prod minor+patch; actions), with `eslint`/`astro`/`react`/`react-dom` major bumps suppressed. Once S-02 makes the three CI jobs required, the auto-merge workflow auto-approves and enables squash auto-merge for **patch (all deps)** and **minor (dev-deps + actions)** PRs; everything else waits for a human. No dependency PR can merge without the required CI passing.

Verifiable by: (1) `.github/dependabot.yml` present and valid; (2) the Dependabot section of the repo's Insights shows the config parsed with no errors; (3) the auto-merge workflow file present and YAML-valid; (4) after S-02, a patch-level Dependabot PR auto-merges on green CI while a prod-minor PR stays open for review.

## What We're NOT Doing

- **Branch protection / required-status-check ruleset** — owned by slice **S-02** (`release-automation`). Phase 2 *depends on* it but does not create it.
- **Migrating to Renovate** — parked in the roadmap (overkill for a single-maintainer fork).
- **Making AI Code Review a hard gate for dependency PRs** — kept advisory (decision below); the secret-access plumbing it would need is out of scope.
- **Security-only update tuning, version-update for ecosystems we don't use** (Docker, etc.).
- **Bumping any dependency in this change** — we only add the automation; the first actual bumps arrive as Dependabot's own PRs.
- **Enabling Dependabot in GitHub org/repo settings** — that's a one-time manual toggle (noted as a manual verification step), not a file in the repo.

## Implementation Approach

Two files, two phases. Phase 1 is the declarative `dependabot.yml` — independently shippable and risk-free because it only opens PRs. Phase 2 adds an event-driven workflow that reacts to Dependabot's PRs using the official `dependabot/fetch-metadata` action to classify update-type and dependency-type, then approves + enables native GitHub auto-merge (`gh pr merge --auto --squash`) only for the agreed safe classes. Native auto-merge means GitHub itself holds the merge until required checks pass — so the safety guarantee lives in S-02's branch protection, and the workflow merely *requests* the merge.

## Critical Implementation Details

- **Auto-merge safety is external.** `gh pr merge --auto` only *defers* a merge if the repo has a required check (or merge queue); with no required check it merges as soon as the PR is mergeable. This is precisely why Phase 2's success criteria require confirming S-02 branch protection is live before the workflow is allowed to act. Do not merge Phase 2 ahead of S-02.
- **Dependabot token scope.** The auto-merge workflow runs on the `pull_request` event for Dependabot's PR. Dependabot-authored events get a read-only token, so the workflow needs explicit `permissions: { contents: write, pull-requests: write }` to approve and merge. Approve/merge via `gh` with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
- **Conventional commit prefixes.** Set `commit-message.prefix` (e.g. `chore`) for npm and `ci` or `chore` for github-actions so the messages parse cleanly when S-02's release-please reads history. Keep prefixes consistent with the repo's existing conventional-commit style.

## Phase 1: Dependabot configuration

### Overview

Create `.github/dependabot.yml` declaring two ecosystems (npm, github-actions), weekly schedule, the three risk-scoped groups, the major-version ignore rules, conventional-commit prefixes, PR limits, and labels. Shippable on its own — only opens PRs, merges nothing.

### Changes Required:

#### 1. Dependabot config file

**File**: `.github/dependabot.yml`

**Intent**: Declare automated dependency scanning for npm and GitHub Actions with grouping and pin-outs that match the agreed risk policy, so weekly update PRs arrive pre-sorted by risk and the known-breaking majors never open.

**Contract**: `version: 2` with two `updates` entries.

- **npm entry** (`package-ecosystem: "npm"`, `directory: "/"`, `schedule.interval: "weekly"`):
  - `open-pull-requests-limit`: a small number (e.g. 10).
  - `commit-message.prefix: "chore"` (+ `prefix-development: "chore"` if distinguishing dev) for conventional-commit compatibility with S-02.
  - `labels`: e.g. `["dependencies"]`.
  - `groups`:
    - `dev-dependencies` — `dependency-type: "development"`, `update-types: ["minor", "patch"]`.
    - `production-minor-patch` — `dependency-type: "production"`, `update-types: ["minor", "patch"]`.
  - `ignore`: major updates for the four pinned packages — entries for `eslint`, `astro`, `react`, `react-dom`, each with `update-types: ["version-update:semver-major"]`. (Majors for all *other* deps still open as individual PRs for manual review — do **not** add a global major ignore.)
- **github-actions entry** (`package-ecosystem: "github-actions"`, `directory: "/"`, `schedule.interval: "weekly"`):
  - `commit-message.prefix: "ci"`.
  - `labels`: e.g. `["dependencies", "github-actions"]`.
  - `groups`: a single `actions` group covering `update-types: ["minor", "patch"]` (and majors as individual PRs).

Note: Dependabot config groups are defined here, but the **auto-merge decision** (which groups/update-types merge automatically) is enforced by the Phase 2 workflow reading `fetch-metadata`, not by the group definitions themselves. Groups only shape PR batching.

### Success Criteria:

#### Automated Verification:

- File exists and is valid YAML: `npx yaml-lint .github/dependabot.yml` or `python3 -c "import yaml,sys; yaml.safe_load(open('.github/dependabot.yml'))"`.
- No other workflow/lint regressions: `npm run lint` (config file is not linted by ESLint, but confirms nothing else broke).

#### Manual Verification:

- Dependabot is enabled for the repo (GitHub → Settings → Code security → Dependabot version updates) — one-time toggle.
- After commit, the repo's **Insights → Dependency graph → Dependabot** tab shows the config parsed with **no validation errors**.
- A manual "Check for updates" run opens grouped PRs (dev-deps / prod-minor-patch / actions) and opens **no** major-bump PR for eslint/astro/react/react-dom.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation that Dependabot parsed the config and produced sensibly grouped PRs before proceeding to Phase 2.

---

## Phase 2: Safe auto-merge workflow

### Overview

Add a workflow that reacts to Dependabot PRs and enables GitHub-native squash auto-merge for the agreed safe classes — **patch for any dependency, minor for dev-dependencies and github-actions** — leaving prod-dep minors and all majors for manual review. The merge is held by GitHub until the required CI checks pass, so this phase is **only safe once S-02 branch protection is live**.

### Changes Required:

#### 1. Auto-merge workflow

**File**: `.github/workflows/dependabot-auto-merge.yml`

**Intent**: When Dependabot opens/updates a PR, classify it and, if it falls in the safe set, auto-approve and turn on squash auto-merge so it lands automatically once required CI is green — with no human step for low-risk bumps.

**Contract**:

- **Trigger**: `on: pull_request` (types `opened`, `synchronize`, `reopened`).
- **Top-level guard**: job `if: github.actor == 'dependabot[bot]'`.
- **Permissions**: `contents: write`, `pull-requests: write`.
- **Steps**:
  1. `dependabot/fetch-metadata@<pinned SHA>` (pin third-party actions to a full commit SHA per repo convention; not a floating tag) → exposes `steps.meta.outputs.update-type` and `dependency-type`.
  2. A conditional gate computing "is safe": auto-merge when
     - `update-type == 'version-update:semver-patch'` (any dependency-type), **OR**
     - `update-type == 'version-update:semver-minor'` **AND** `dependency-type == 'direct:development'`, **OR**
     - the PR is a github-actions update with `update-type` in {patch, minor}.
  3. On safe: `gh pr review --approve "$PR_URL"` then `gh pr merge --auto --squash "$PR_URL"`, with `env: GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.
  4. On not-safe: no-op (PR stays open for manual review). Optionally `gh pr comment` noting it needs manual review.

  The github-actions vs npm distinction comes from `dependency-type` / the ecosystem in metadata; keep the condition readable with explicit `if:` expressions rather than one dense boolean.

**Prerequisite (hard gate)**: This workflow must not be merged/activated until **S-02** has configured branch protection on `master` requiring the `lint-unit-build`, `integration`, and `e2e` checks. Without a required check, `--auto` merges immediately and the safety model collapses.

### Success Criteria:

#### Automated Verification:

- Workflow file is valid YAML: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/dependabot-auto-merge.yml'))"`.
- Action is SHA-pinned (not a floating tag): grep confirms `dependabot/fetch-metadata@<40-hex>`.
- No regressions: `npm run lint`.

#### Manual Verification:

- **Prerequisite confirmed**: branch protection on `master` requires `lint-unit-build` + `integration` + `e2e` (S-02 done) — verified via `gh api repos/:owner/:repo/branches/master/protection` returning the three contexts.
- A **patch-level** Dependabot PR (or a dev-dep minor) gets auto-approved and shows "auto-merge enabled", then merges only after the three CI checks go green.
- A **prod-dep minor** PR and a **major** PR stay open, unmerged, awaiting manual review.
- "Allow auto-merge" is enabled in repo Settings → General (required for `gh pr merge --auto`).

**Implementation Note**: Because activation depends on an external S-02 state, after automated verification pause for explicit human confirmation that S-02 branch protection is live before relying on the workflow. If S-02 is not yet done, the file can be committed but its real behavior is verified later.

---

## Testing Strategy

### Unit Tests:

- N/A — this change is CI/automation config; there is no application code path to unit-test.

### Integration Tests:

- N/A in the repo test suite. The "integration" here is GitHub's own Dependabot parsing + Actions execution, verified manually below.

### Manual Testing Steps:

1. Commit Phase 1, push the branch, ensure Dependabot is enabled in repo settings.
2. In the repo's Dependabot tab, trigger "Check for updates" and confirm grouped PRs appear with the expected prefixes/labels and no pinned-major PRs.
3. (After S-02) Merge Phase 2's workflow. Wait for or trigger a patch/dev-minor Dependabot PR; confirm it is auto-approved, shows auto-merge enabled, and merges only after CI is green.
4. Confirm a prod-minor and a major PR remain open and unmerged.

## Performance Considerations

Negligible. The auto-merge workflow is a tiny metadata-read + a couple of `gh` calls per Dependabot PR. Weekly schedule and a small `open-pull-requests-limit` keep CI minute usage low.

## Migration Notes

- Committing `.github/dependabot.yml` activates Dependabot **immediately** once the feature is enabled in settings — expect an initial burst of grouped PRs reflecting the current backlog of available updates. Merge or close these deliberately.
- No data migration. To roll back, delete the two files (and optionally close the open Dependabot PRs).

## References

- Roadmap slice S-04: `context/foundation/ci-automation-roadmap.md` (ask #6)
- CI jobs to gate on: `.github/workflows/ci.yml:18,40,57`
- AI Code Review status producer/consumer: `.github/workflows/review.yml`, `.github/workflows/review-run.yml`
- Related (prerequisite) slice S-02: `release-automation` (not yet planned)
- Memory: [[eslint-10-blocked]], [[astro-7-cloudflare-bindings]], [[fork-pr-creation]]

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dependabot configuration

#### Automated

- [x] 1.1 `.github/dependabot.yml` exists and is valid YAML — 735e370
- [x] 1.2 `npm run lint` passes (no unrelated regressions) — 735e370

#### Manual

- [ ] 1.3 Dependabot enabled in repo settings (one-time toggle)
- [ ] 1.4 Dependabot tab shows config parsed with no validation errors
- [ ] 1.5 Manual update check opens grouped PRs and no pinned-major (eslint/astro/react/react-dom) PRs

### Phase 2: Safe auto-merge workflow

#### Automated

- [x] 2.1 `.github/workflows/dependabot-auto-merge.yml` is valid YAML — d0421ff
- [x] 2.2 `dependabot/fetch-metadata` is pinned to a full commit SHA — d0421ff
- [x] 2.3 `npm run lint` passes (no unrelated regressions) — d0421ff

#### Manual

- [ ] 2.4 S-02 branch protection requires lint-unit-build + integration + e2e (verified via gh api)
- [ ] 2.5 A patch / dev-minor Dependabot PR auto-approves, enables auto-merge, and merges only on green CI
- [ ] 2.6 A prod-minor and a major Dependabot PR remain open, unmerged
- [ ] 2.7 "Allow auto-merge" enabled in repo Settings → General
