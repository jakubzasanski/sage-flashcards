---
change_id: dependency-automation
title: Dependency automation
status: implementing
created: 2026-06-27
updated: 2026-06-27
archived_at: null
---

## Notes

### Execution log (2026-06-27)

- Repo **left the fork network** mid-change → now standalone; `gh pr create` works normally (see memory `fork-pr-creation`).
- **Phase 1** (`.github/dependabot.yml`) shipped via **PR #9** → master. Dependabot activated, opened grouped PRs correctly: dev-dependencies group (#17), production-minor-patch group (#18), github-actions majors as individual PRs (#10–#14). Manual checks 1.3–1.5 verified ✅.
- **npm job initially errored**: *"can't access a private package registry"*. Root cause = `packages/code-reviewer`'s `@openai/codex` pulls `npm:`-aliased platform builds that Dependabot misclassifies as private (dependabot-core#13797). Fix landed in two PRs: `packages/code-reviewer/.npmrc` (**#15**) then the decisive **root `/.npmrc`** (**#16**) — the root npm job reads root `.npmrc` and resolves all repo manifests. After #16, npm PRs flowed.
- **`@eslint/js@10` (PR #19)** slipped the ignore list (`eslint` was pinned, `@eslint/js` — the ESLint 10 core — was not). **Decision: leave #19 open with its failing CI as a visible reminder**, do NOT add it to ignore (user preference: visibility over silent ignore). See memory `eslint-10-blocked`.
- **github-actions** ecosystem is at the default `open-pull-requests-limit` of 5 (no explicit limit set for that entry) — 5 major action PRs open. Acceptable; revisit if it blocks future action updates.

### Phase 2 status

- Auto-merge workflow (`dependabot-auto-merge.yml`) is committed on branch `feat/dependency-automation` but **deliberately held off `master`** until slice **S-02** (branch protection + required checks) lands. Manual checks 2.4–2.7 are blocked on S-02. Change stays `implementing` until then.
