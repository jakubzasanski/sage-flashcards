---
change_id: release-automation
title: Branch protection + release-please + conventional-commit linting
status: implementing
created: 2026-06-27
updated: 2026-06-27
archived_at: null
---

## Notes

Roadmap slice **S-02** (`context/foundation/ci-automation-roadmap.md`). Prereq S-01 (ci-test-pyramid) is merged to master — `ci.yml`/`e2e.yml`/`nightly-e2e.yml` present. Covers asks #3/#4/#5:

- Protect `master` (PR required, squash-only, linear history, required status checks).
- release-please drives version bump in `package.json` + `CHANGELOG.md` + tag + GitHub Release on merge.
- commit / PR-title linting keeps the conventional-commit history clean (one squashed conventional commit per merge so release-please reads it correctly).

Open decisions: required approvals = 0 (solo) or 1?; is the `AI Code Review` commit status (from `review-run.yml`) a hard merge gate or advisory? Required-checks list should include S-01 jobs `lint-unit-build`, `integration`, `e2e`.
