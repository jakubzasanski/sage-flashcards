# Release Automation (S-02) Implementation Plan

## Overview

Turn `master` into a protected, release-automated branch. Every change lands via a squash-merged PR whose title is a conventional commit; merges to `master` drive **release-please** to bump `package.json`, regenerate `CHANGELOG.md`, tag, and cut a GitHub Release. Conventional-commit hygiene is enforced both locally (husky `commit-msg`) and in CI (PR-title lint). This is roadmap slice **S-02**, building on the green CI pyramid from S-01.

## Current State Analysis

- **Versioning:** `package.json` is `sage-flashcards@1.1.0`. A single git tag `v1.1.0` exists. No `CHANGELOG.md`, no release-please config/manifest, no GitHub Releases automation.
- **Commit hygiene:** History is already consistently conventional (`feat(scope): …`, `fix(...)`, `chore(...)`, `docs(...)`). husky is installed with **only** a `pre-commit` hook (lint-staged) — no `commit-msg` hook, no commitlint dependency.
- **CI (S-01, merged):** `ci.yml` exposes three PR-attached check jobs — `lint-unit-build`, `integration`, `e2e` (the last via reusable `e2e.yml`). These are the checks the ruleset will require.
- **AI review:** `review-run.yml` runs as a `workflow_run` consumer and publishes a commit **status** named `AI Code Review` on the PR head SHA (it is NOT a PR-attached check). Decision: keep it **advisory** — not in required checks.
- **Permissions:** the operator (`gh`) has `admin: true` on the repo, so the ruleset and repo merge-settings can be applied directly via `gh api`.
- **Merge settings:** unknown/default — must be set so squash is the only merge method and the **squash commit subject = PR title** (release-please reads the merge commit subject as the conventional commit).

### Key Discoveries:

- `package.json:5` → `"version": "1.1.0"`; tag `v1.1.0` is the release-please baseline.
- `.github/workflows/ci.yml:19,36,60` → required-check job names `lint-unit-build`, `integration`, `e2e`.
- `.github/workflows/review-run.yml:113` → posts commit status context `"AI Code Review"` (advisory, excluded from required checks).
- `.husky/pre-commit` exists; a sibling `commit-msg` hook is the insertion point for commitlint.
- Roadmap S-02 (`context/foundation/ci-automation-roadmap.md:93`) settles approach: release-please over changesets/semantic-release (the latter are Parked).

## Desired End State

- Direct pushes to `master` are rejected; all changes go through a PR that requires the three CI checks to pass (0 approvals required) and squash-merges into a single conventional commit.
- A bad PR title (non-conventional) fails a CI check; a bad local commit message is rejected by the `commit-msg` hook.
- After a `feat`/`fix` merge, release-please opens/updates a "release PR" that, when merged, bumps `package.json`, writes `CHANGELOG.md`, tags `vX.Y.Z`, and publishes a GitHub Release.
- The ruleset definition lives in-repo as a versioned `gh api` payload + apply script, so it is reproducible (the live ruleset is GitHub-side state; the file is its source of record).

Verify: open a throwaway PR with a conventional title → CI checks + PR-title lint run and gate it; merge it (squash) → release-please opens a Release PR aggregating all conventional commits since `v1.1.0` with a `1.2.0` bump; merge the Release PR → tag `v1.2.0` + GitHub Release appear.

## What We're NOT Doing

- **No deploy / CD** — applying Supabase migrations or `wrangler deploy` on release is S-03 (`cd-migrate-and-deploy`), explicitly out of scope.
- **No Dependabot / auto-merge** — that is S-04 (`dependency-automation`), already in flight on its own branch.
- **No making `AI Code Review` a hard gate** — stays advisory; can be promoted to a required check later by editing the ruleset payload.
- **No multi-package / monorepo release config** — single Node package, single release line.
- **No changesets / semantic-release** — Parked in the roadmap.
- **No `1` required approval** — solo-maintainer flow uses 0.

## Implementation Approach

Land phases 1–2 (pure in-repo files) on a feature branch via a normal PR. Apply the ruleset (phase 3) **after** those files are merged, so the protection rules don't block the implementation PR itself. Phase 4 verifies the whole loop on the live repo with a throwaway PR, then accepts the first real Release PR.

## Critical Implementation Details

- **Squash subject must be the PR title.** GitHub's default squash subject can be "commit titles", which would feed release-please a non-conventional subject. The repo setting must be `squash_merge_commit_title: "PR_TITLE"` (+ `squash_merge_commit_message: "COMMIT_MESSAGES"` or `"BLANK"`). Without this, release-please mis-parses merges and never bumps. This is the single highest-risk detail.
- **release-please baseline.** Seed `.release-please-manifest.json` with `{".": "1.1.0"}` so the action treats `v1.1.0` as the last release and aggregates conventional commits since that tag. No `bootstrap-sha` (decision: aggregate from the tag, not a clean baseline).
- **Ruleset ordering.** The required status checks the ruleset names must already be reported by runs on the branch (they are, post-S-01). Apply the ruleset only after phases 1–2 merge.
- **release-please permissions.** Its workflow needs `contents: write` + `pull-requests: write`; the default `GITHUB_TOKEN` suffices (no PAT) as long as repo setting "Allow GitHub Actions to create and approve pull requests" is enabled — verify in phase 3.

## Phase 1: Conventional-commit linting (local + PR title)

### Overview

Enforce conventional commits in two complementary places: a local husky `commit-msg` hook (fast feedback, bypassable) and a CI job that lints the **PR title** (authoritative, since the PR title becomes the squash commit).

### Changes Required:

#### 1. commitlint config + dependencies

**File**: `package.json`, `commitlint.config.js` (new)

**Intent**: Add `@commitlint/cli` + `@commitlint/config-conventional` as devDependencies and a config extending the conventional preset, so the local hook and (optionally) any commitlint consumer share one ruleset.

**Contract**: `commitlint.config.js` exports `{ extends: ['@commitlint/config-conventional'] }` (ESM `export default` — repo is `"type": "module"`). New devDeps added via `npm install -D`.

#### 2. husky commit-msg hook

**File**: `.husky/commit-msg` (new)

**Intent**: Run commitlint against the candidate commit message so non-conventional local commits are rejected before they're created.

**Contract**: Hook invokes `npx --no-install commitlint --edit "$1"`, matching the existing `.husky/pre-commit` style (husky v9 plain-script hook, no deprecated boilerplate).

#### 3. PR-title lint workflow

**File**: `.github/workflows/pr-title.yml` (new)

**Intent**: Add a CI check that fails when a PR's title is not a valid conventional commit, so the squash subject release-please consumes is always parseable.

**Contract**: Workflow on `pull_request` events `[opened, edited, synchronize, reopened]`; `permissions: pull-requests: read`; single job using `amannn/action-semantic-pull-request@v5` (pinned by SHA, per repo convention in `review-run.yml`) configured with the conventional types. Job name stable (e.g. `pr-title`) so it can later be added to required checks if desired.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (config file is lint-clean)
- `npx commitlint --version` resolves (deps installed)
- A non-conventional message is rejected: `echo "bad message" | npx commitlint` exits non-zero
- A conventional message passes: `echo "feat: x" | npx commitlint` exits zero
- `pr-title.yml` is valid YAML / parses (`actionlint` or CI run)

#### Manual Verification:

- Committing locally with a non-conventional message is blocked by the hook
- A PR opened with a non-conventional title shows the `pr-title` check red; fixing the title turns it green

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: release-please (version bump + changelog + release)

### Overview

Wire release-please so merges to `master` accumulate into a Release PR that bumps the version, regenerates the changelog, and (on merge) tags + publishes a GitHub Release.

### Changes Required:

#### 1. release-please manifest + config

**File**: `.release-please-manifest.json` (new), `release-please-config.json` (new)

**Intent**: Configure a single-package Node release line seeded at the current version so release-please aggregates conventional commits since `v1.1.0`.

**Contract**: Manifest = `{ ".": "1.1.0" }`. Config = root package mapping `"."` with `"release-type": "node"`, `"package-name": "sage-flashcards"`, changelog sections for `feat`/`fix` (others hidden per conventional defaults), `"include-component-in-tag": false` so tags stay `vX.Y.Z`.

#### 2. release-please workflow

**File**: `.github/workflows/release-please.yml` (new)

**Intent**: Run release-please on every push to `master` to create/update the Release PR and, on Release-PR merge, tag + release.

**Contract**: Trigger `push: branches: [master]`; `permissions: contents: write`, `pull-requests: write`; single job using `googleapis/release-please-action@v4` (pinned by SHA) with `manifest`/`config` file inputs and the default `GITHUB_TOKEN`.

### Success Criteria:

#### Automated Verification:

- `release-please-config.json` + `.release-please-manifest.json` are valid JSON
- `release-please.yml` parses (actionlint / CI)
- Dry run locally lists a pending release: `npx release-please release-pr --dry-run --repo-url <repo> --token $GH_TOKEN` (or the action's `--dry-run`) reports a `1.2.0` candidate aggregating commits since `v1.1.0`

#### Manual Verification:

- (Deferred to Phase 4 — proven end-to-end there, since it requires a real merge to `master`.)

**Implementation Note**: Pause for manual confirmation after automated verification before proceeding.

---

## Phase 3: Branch-protection ruleset + repo merge settings

### Overview

Apply a repository ruleset protecting `master` and flip repo merge settings to squash-only with PR-title squash subjects. Definition is committed in-repo as a `gh api` payload + apply script for reproducibility.

### Changes Required:

#### 1. Ruleset payload + apply script

**File**: `.github/rulesets/master.json` (new), `scripts/apply-ruleset.sh` (new)

**Intent**: Capture the master ruleset as a versioned JSON payload and a thin script that POSTs/PUTs it via `gh api`, so the protection config is documented and re-appliable.

**Contract**: Payload targets `~DEFAULT_BRANCH` (or `refs/heads/master`), `enforcement: active`, rules: `pull_request` (required_approving_review_count: 0, dismiss_stale: false), `required_status_checks` listing contexts `lint-unit-build`, `integration`, `e2e` (NOT `AI Code Review`), `required_linear_history`, `non_fast_forward` (block force-push), `deletion` (block branch deletion). Script: `gh api -X POST repos/{owner}/{repo}/rulesets --input .github/rulesets/master.json` (idempotent variant: detect existing ruleset id and `PUT`).

#### 2. Repo merge settings

**File**: (no repo file — `gh api` call, documented in `scripts/apply-ruleset.sh` or a sibling note)

**Intent**: Force squash-only merges and make the squash commit subject the PR title so release-please reads a conventional subject.

**Contract**: `gh api -X PATCH repos/{owner}/{repo}` with `allow_squash_merge=true`, `allow_merge_commit=false`, `allow_rebase_merge=false`, `squash_merge_commit_title=PR_TITLE`, `squash_merge_commit_message=COMMIT_MESSAGES`, `delete_branch_on_merge=true`. Also verify "Allow GitHub Actions to create and approve pull requests" is enabled (needed for release-please's PR).

### Success Criteria:

#### Automated Verification:

- `master.json` is valid JSON
- After apply: `gh api repos/{owner}/{repo}/rulesets` lists an active ruleset on `master`
- After apply: `gh api repos/{owner}/{repo} --jq '{squash:.allow_squash_merge, merge:.allow_merge_commit, rebase:.allow_rebase_merge, subj:.squash_merge_commit_title}'` shows squash-only + `PR_TITLE`

#### Manual Verification:

- A direct `git push` to `master` is rejected
- The repo PR UI shows only the "Squash and merge" option
- Opening a PR shows the three required checks as required before merge

**Implementation Note**: Apply the `gh api` calls (outward-facing, hard-to-reverse repo state) only after explicit human confirmation. Pause after this phase.

---

## Phase 4: End-to-end verification

### Overview

Prove the full loop on the live repo: protection + PR-title lint gate a throwaway PR, and merging it produces a correct Release PR.

### Changes Required:

#### 1. Throwaway verification PR

**File**: a trivial change (e.g. a `docs:` tweak or a no-op `chore:`)

**Intent**: Exercise the gates end-to-end without meaningful code risk.

**Contract**: Branch → small conventional-titled PR → observe required checks + `pr-title` gate → squash-merge.

#### 2. Accept the first Release PR

**File**: (none — merge the release-please PR)

**Intent**: Confirm release-please opened a Release PR aggregating commits since `v1.1.0`, then ship the first automated release.

**Contract**: Verify the Release PR bumps `package.json` → `1.2.0`, writes `CHANGELOG.md`; squash-merge it; confirm tag `v1.2.0` + GitHub Release are created.

### Success Criteria:

#### Automated Verification:

- After the verification PR merges, `gh pr list` shows a release-please PR titled like `chore(master): release 1.2.0`
- After the Release PR merges: `git tag -l` includes `v1.2.0`; `gh release list` shows the release; `package.json` version is `1.2.0`; `CHANGELOG.md` exists with entries since `v1.1.0`

#### Manual Verification:

- A non-conventional PR title was observed failing the `pr-title` check during testing
- The generated `CHANGELOG.md` reads sensibly (feat/fix grouped)

**Implementation Note**: This phase mutates live repo history (a real tag/release). Confirm with the human before merging the Release PR.

---

## Testing Strategy

### Unit / config Tests:

- commitlint accepts conventional, rejects non-conventional (CLI smoke).
- JSON configs and workflow YAML validate (actionlint + `jq`/parse).
- release-please `--dry-run` reports the expected `1.2.0` candidate.

### Integration Tests:

- Live PR exercises required checks + PR-title lint + squash-only merge.
- Merge → release-please Release PR → merge → tag + Release.

### Manual Testing Steps:

1. Push a branch and open a PR with a non-conventional title → `pr-title` check fails.
2. Fix the title → check goes green; required CI checks block until passing.
3. Attempt a direct push to `master` → rejected by ruleset.
4. Squash-merge the PR → release-please opens/updates a Release PR.
5. Merge the Release PR → verify tag `v1.2.0`, GitHub Release, bumped `package.json`, `CHANGELOG.md`.

## Performance Considerations

Negligible — adds a lightweight PR-title job and a release-please job (runs only on push to `master`). No impact on the existing CI critical path.

## Migration Notes

- Existing open PRs (e.g. Dependabot) predate the ruleset; once squash-only + required checks are active they must satisfy the new checks before merge. No retroactive breakage — checks evaluate on next run.
- `v1.1.0` tag is the release-please anchor; do not delete it.

## References

- Roadmap slice: `context/foundation/ci-automation-roadmap.md` (S-02, lines 93–105)
- Change identity: `context/changes/release-automation/change.md`
- Required-check job names: `.github/workflows/ci.yml:19,36,60`
- AI-review commit status (advisory): `.github/workflows/review-run.yml:113`
- SHA-pinning convention for actions: `.github/workflows/review-run.yml:37,40,47`
- Lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Conventional-commit linting (local + PR title)

#### Automated

- [x] 1.1 `npm run lint` passes (config file lint-clean) — 583c868
- [x] 1.2 `npx commitlint --version` resolves (deps installed) — 583c868
- [x] 1.3 Non-conventional message rejected by commitlint (non-zero exit) — 583c868
- [x] 1.4 Conventional message passes commitlint (zero exit) — 583c868
- [x] 1.5 `pr-title.yml` parses (actionlint / CI) — 583c868

#### Manual

- [x] 1.6 Local commit with non-conventional message blocked by `commit-msg` hook — 583c868
- [ ] 1.7 PR with non-conventional title shows `pr-title` red; fixing title turns it green

### Phase 2: release-please (version bump + changelog + release)

#### Automated

- [x] 2.1 `release-please-config.json` + `.release-please-manifest.json` valid JSON — b10dafa
- [x] 2.2 `release-please.yml` parses (actionlint / CI) — b10dafa
- [x] 2.3 release-please dry run reports a `1.2.0` candidate aggregating commits since `v1.1.0` — b10dafa

#### Manual

- [ ] 2.4 (Deferred to Phase 4 — proven end-to-end there)

### Phase 3: Branch-protection ruleset + repo merge settings

#### Automated

- [x] 3.1 `master.json` valid JSON
- [x] 3.2 Active ruleset on `master` listed via `gh api .../rulesets`
- [x] 3.3 Repo merge settings show squash-only + `squash_merge_commit_title=PR_TITLE`

#### Manual

- [x] 3.4 Direct `git push` to `master` is rejected
- [x] 3.5 PR UI offers only "Squash and merge"
- [x] 3.6 PR shows the three required checks as required before merge

### Phase 4: End-to-end verification

#### Automated

- [ ] 4.1 release-please PR (`chore(master): release 1.2.0`) appears after verification PR merges
- [ ] 4.2 After Release PR merges: tag `v1.2.0`, GitHub Release, `package.json` = `1.2.0`, `CHANGELOG.md` present

#### Manual

- [ ] 4.3 Non-conventional PR title observed failing `pr-title` during testing
- [ ] 4.4 Generated `CHANGELOG.md` reads sensibly (feat/fix grouped)
