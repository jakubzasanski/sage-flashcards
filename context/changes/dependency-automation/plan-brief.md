# Dependency Automation — Plan Brief

> Full plan: `context/changes/dependency-automation/plan.md`

## What & Why

Add Dependabot so dependency updates (npm + GitHub Actions) open automatically as grouped, risk-scoped PRs, and safe low-risk updates auto-merge once CI is green. This is roadmap slice **S-04** (ask #6) — the convenience layer that sits on top of the trustworthy CI gate built in S-01.

## Starting Point

No `.github/dependabot.yml` exists. CI from S-01 is live (`lint-unit-build`, `integration`, `e2e` in `ci.yml`). Branch protection (S-02) is **not** built yet — `master` has no required checks — which is the key constraint shaping this plan.

## Desired End State

Weekly, Dependabot opens a handful of grouped PRs (dev-deps / prod minor+patch / actions) with eslint·astro·react·react-dom majors held back. Once S-02 lands, patch (all) and minor (dev-deps + actions) PRs auto-approve and squash-merge only after the required CI passes; everything else waits for a human.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| S-02 dependency | Two phases; auto-merge phase gated on S-02 | Auto-merge without a required check merges ungated — config ships now, workflow waits | Plan |
| Auto-merge scope | Patch (all) + minor (dev-deps & actions) | Runtime-facing prod minors keep human eyes; matches roadmap risk line | Plan |
| AI Code Review gate | Advisory, not required for dep PRs | Dependabot PRs get a read-only token + no OpenAI secret, so a required AI check would block forever | Plan |
| PR grouping | dev-deps / prod-minor-patch / actions groups | Few weekly PRs, each scoped by risk so auto-merge rules apply cleanly | Plan |
| Major pins | Ignore eslint, astro, react, react-dom majors | Known-breaking / deliberate-upgrade-only; other majors still open for review | Roadmap + memory |

## Scope

**In scope:** `.github/dependabot.yml` (npm + actions, grouping, pins, conventional-commit prefixes); a `dependabot-auto-merge.yml` workflow using `dependabot/fetch-metadata` + native squash auto-merge.

**Out of scope:** Branch protection / required checks (S-02), Renovate, making AI review a hard gate, bumping any dependency, enabling Dependabot in GitHub settings (manual toggle).

## Architecture / Approach

Two files. The declarative config opens grouped PRs. The event-driven workflow reacts to Dependabot PRs, reads update-type/dependency-type from `fetch-metadata`, and for safe classes calls `gh pr review --approve` + `gh pr merge --auto --squash`. GitHub holds the merge until required checks pass — so the actual safety guarantee lives in S-02's branch protection, not in the workflow.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dependabot config | `.github/dependabot.yml`, grouped + pinned, opens PRs only | Initial burst of backlog PRs on first run |
| 2. Safe auto-merge | `dependabot-auto-merge.yml`, auto-merges safe classes | Unsafe until S-02 required checks exist — hard gate |

**Prerequisites:** Phase 1 — Dependabot enabled in repo settings. Phase 2 — **S-02 branch protection live** + "Allow auto-merge" enabled.
**Estimated effort:** ~1 session; Phase 2 activation deferred until S-02.

## Open Risks & Assumptions

- **S-02 is not done.** Phase 2 can be authored now but must not be relied upon until branch protection requires the three CI checks; merging it early risks ungated auto-merges.
- Fork context: Dependabot operates within the fork, so the upstream-PR-routing issue does not apply — but Dependabot must be toggled on in settings.
- Pinned majors (eslint/astro/react/react-dom) need periodic revisiting as those ecosystems stabilize.

## Success Criteria (Summary)

- Weekly grouped Dependabot PRs appear; no major PRs for the four pinned packages.
- After S-02: patch / dev-minor PRs auto-merge on green CI; prod-minor and majors stay open for review.
- No dependency PR can ever merge without the required CI passing.
