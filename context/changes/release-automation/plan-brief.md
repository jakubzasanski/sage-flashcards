# Release Automation (S-02) — Plan Brief

> Full plan: `context/changes/release-automation/plan.md`

## What & Why

Make `master` a protected, release-automated branch. Every change lands as a squash-merged PR with a conventional-commit title; merges drive **release-please** to bump the version, regenerate `CHANGELOG.md`, tag, and cut a GitHub Release. Roadmap slice **S-02** — the quality spine on top of S-01's green CI.

## Starting Point

`sage-flashcards@1.1.0` with one tag `v1.1.0`, no changelog, no release tooling. History is already conventional. husky has a `pre-commit` hook but no `commit-msg`/commitlint. CI (S-01, merged) exposes three PR checks: `lint-unit-build`, `integration`, `e2e`. `master` is unprotected.

## Desired End State

Direct pushes to `master` are blocked; PRs require the three CI checks (0 approvals) and squash-merge into one conventional commit. Bad commit messages are caught locally; bad PR titles fail a CI check. A `feat`/`fix` merge makes release-please open a Release PR that, when merged, bumps `package.json`, writes `CHANGELOG.md`, tags `vX.Y.Z`, and publishes a Release.

## Key Decisions Made

| Decision            | Choice                                           | Why                                                                          | Source |
| ------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- | ------ |
| Required approvals  | 0                                                | Solo maintainer; CI gates, not human review                                  | Plan   |
| AI Code Review gate | Advisory                                         | Avoid lockout on API/budget failures; promotable later                       | Plan   |
| Commit linting      | PR-title CI action + local commitlint hook       | PR title = squash subject release-please reads; local hook for fast feedback | Plan   |
| Branch protection   | Repository ruleset via versioned `gh api` script | Reproducible, modern API, operator has admin                                 | Plan   |
| First release       | Aggregate since `v1.1.0` (seed manifest 1.1.0)   | Nothing lost; first Release PR → 1.2.0                                       | Plan   |
| Verification        | Throwaway PR + accept first Release PR           | Real end-to-end proof                                                        | Plan   |

## Scope

**In scope:** commitlint (local + PR-title CI), release-please config + workflow, master ruleset + squash-only merge settings, end-to-end verification.

**Out of scope:** CD / deploy (S-03), Dependabot + auto-merge (S-04), making AI review a hard gate, monorepo release config, changesets/semantic-release.

## Architecture / Approach

Two layers. **In-repo files** (phases 1–2): commitlint config + husky hook, PR-title workflow, release-please config/manifest/workflow — land via a normal PR. **GitHub-side state** (phase 3): a ruleset + repo merge-settings applied via `gh api`, captured as a versioned payload/script. Critical wiring: squash subject must equal the PR title so release-please parses the conventional commit. Ruleset applied last so it doesn't block the implementation PR.

## Phases at a Glance

| Phase                       | Delivers                                        | Key risk                                                                         |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Commit linting           | commitlint hook + PR-title CI check             | husky v9 hook syntax; action SHA pinning                                         |
| 2. release-please           | config/manifest/workflow, seeded at 1.1.0       | manifest seed correctness; token permissions                                     |
| 3. Ruleset + merge settings | protected master, squash-only, PR-title subject | **squash subject must = PR title** or release-please mis-parses; live repo state |
| 4. Verification             | throwaway PR → first Release PR (v1.2.0)        | mutates live history (real tag/release)                                          |

**Prerequisites:** S-01 merged (✅ CI checks exist); operator has repo admin (✅).
**Estimated effort:** ~1–2 sessions across 4 phases.

## Open Risks & Assumptions

- GitHub default squash subject is "commit titles", not PR title — must be flipped, else release-please never bumps. Highest-risk detail.
- release-please needs "Allow GitHub Actions to create and approve pull requests" enabled (verified in phase 3).
- Open Dependabot PRs predate the ruleset; they'll need the new checks green on next run.

## Success Criteria (Summary)

- A non-conventional PR title fails CI; a non-conventional local commit is blocked.
- Direct push to `master` rejected; PRs squash-merge after the three checks pass.
- Merging a `feat`/`fix` produces a Release PR → tag `v1.2.0` + GitHub Release + `CHANGELOG.md`.
