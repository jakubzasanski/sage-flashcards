---
project: Sage Flashcards — CI/CD & Automation
version: 1
status: active
created: 2026-06-25
updated: 2026-06-26
source: ci-automation research workflow (2026-06-25) + repo audit (2026-06-26) — NOT a product PRD
main_goal: quality
top_blocker: external
---

# Roadmap: Sage Flashcards — CI/CD & Automation

> Derived from the CI/automation research plan + an evidence-based repo audit (2026-06-26).
> This is an **infrastructure** roadmap, so slices trace to the original asks (**#1–#7**) and phases, not to product PRD FRs. The product feature roadmap lives separately in `roadmap.md`.
> Slices are listed in dependency order. The "At a glance" table is the index. Hand a `Change ID` to `/10x-plan`.

## Vision recap

Turn a repo with a single `lint + unit + build` CI job and fully-manual deploys into an automated delivery pipeline: every change on a branch, the full test pyramid gating merges, version + changelog cut automatically, and Supabase migrations + the Cloudflare Worker shipped on green `master`. The guiding bias is **quality** — trustworthy gates first, convenience automation second.

## North star

**S-01: every PR runs the full test pyramid (lint + unit + integration + e2e) and must pass to merge.** — north star = the smallest end-to-end change that proves the pipeline's core value (catching regressions before merge); everything downstream (branch protection, release, deploy-on-green, dependabot auto-merge) depends on a green CI signal existing first.

## At a glance

| ID   | Change ID                   | Outcome                                                        | Prerequisites      | Refs            | Status   |
| ---- | --------------------------- | ------------------------------------------------------------- | ------------------ | --------------- | -------- |
| S-00 | phase-0-rebrand             | repo/app rebranded to Sage Flashcards (in-repo)               | —                  | #7, rename      | done*    |
| F-01 | live-cutover-sage-worker    | (foundation) live cutover: renamed Worker + Supabase URLs + GitHub brand surfaces | S-00     | rename, #7      | blocked  |
| S-01 | ci-test-pyramid             | full test pyramid runs on every PR and gates merges           | —                  | #1              | ready    |
| S-02 | release-automation          | branch-per-change + auto version bump + changelog on merge    | S-01               | #3, #4, #5      | proposed |
| S-03 | cd-migrate-and-deploy       | merges to master ship Supabase migrations → Cloudflare Worker | S-01, F-01, (S-02) | #2              | blocked  |
| S-04 | dependency-automation       | dependency PRs open automatically and safe ones auto-merge    | S-01, S-02         | #6              | proposed |
| S-05 | extra-ci-tooling            | security scan + coverage + preview deploys + mutation cron    | S-01               | "co jeszcze"    | proposed |

<sub>* S-00 is implemented in-repo on **PR #4** (awaiting merge); flips to fully `done` once merged + its external steps land via F-01.</sub>

## Streams

Navigation aid — groups items sharing a Prerequisites chain. Canonical order lives in the dependency graph below.

| Stream | Theme                | Chain                                  | Note                                                            |
| ------ | -------------------- | -------------------------------------- | -------------------------------------------------------------- |
| A      | Gates & releases     | `S-01` → `S-02` → `S-04`               | The quality spine; each step needs the green CI signal from S-01. |
| B      | Delivery             | `F-01` → `S-03`                        | Live cutover unblocks CD; S-03 also gates on S-01 (green CI).   |
| C      | Hardening            | `S-05`                                 | Parallel with Stream A once S-01 lands.                         |

## Baseline

What's in place as of **2026-06-26** (evidence-based audit). Foundations/slices below assume these and do not redo them.

- **App / rebrand:** ✅ present — Sage Flashcards rename, logo, favicon/og/PWA icons, README, manifest all in-repo (PR #4).
- **CI:** 🟡 partial — `.github/workflows/ci.yml` is one job: lint + `npm test` (unit) + build. No integration/e2e, no concurrency, no artifact upload.
- **CD:** ⬜ absent — Supabase migrations + `wrangler deploy` are manual; no `deploy.yml`.
- **Release / versioning:** ⬜ absent — no release-please / changelog / commitlint / branch protection.
- **Dependency automation:** ⬜ absent — no `.github/dependabot.yml` (only a draft inside the old plan doc).
- **Security / quality tooling:** ⬜ absent (CodeQL, coverage, secret-scanning) · 🟡 Stryker installed but not wired to CI · ✅ README status badges present.
- **External (live):** 🔧 renamed Worker not yet deployed; Worker secrets/KV not re-added; Supabase Auth URLs not updated; GitHub social-preview/avatar not uploaded.

## Foundations

### F-01: Live cutover to the renamed Worker + Supabase + GitHub brand surfaces

- **Outcome:** (foundation) the renamed `sage-flashcards` Worker is live with its 5 secrets + SESSION KV; the old `10x-cards` Worker is deleted; Supabase Auth Site/Redirect URLs point at the new origin; `og-image.png` + avatar uploaded to GitHub.
- **Change ID:** live-cutover-sage-worker
- **Refs:** rename (D2), ask #7
- **Unlocks:** S-03 (CD must deploy the *new* Worker with secrets/KV already provisioned); the live production app on the new URL.
- **Prerequisites:** S-00 (in-repo rename — done on PR #4)
- **Parallel with:** S-01
- **Blockers:** needs your Cloudflare + Supabase + GitHub account access (cannot be done from the repo).
- **Unknowns:**
  - Use a custom domain (`app.sage-flashcards.com`) now, or stay on `*.workers.dev`? — Owner: user. Block: no.
- **Risk:** sequenced before S-03 so CD never targets a half-provisioned Worker; renaming orphans the old Worker, so do the checklist in one sitting.
- **Status:** blocked

## Slices

### S-01: Full CI test pyramid gating every PR

- **Outcome:** every PR/push runs lint + unit + integration + e2e (Supabase via `supabase start`), with concurrency-cancel + Playwright report artifacts; failing tests block merge.
- **Change ID:** ci-test-pyramid
- **Refs:** ask #1
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:**
  - e2e blocking vs nightly-only — Owner: user. Block: no. (Decision D4 = blocking.)
- **Risk:** the load-bearing slice — branch protection, release, deploy-on-green, and dependabot auto-merge all reference the CI check this creates. Build it first or the rest has nothing to gate on.
- **Status:** ready

### S-02: Branch-per-change + automated version bump + changelog

- **Outcome:** master is protected (PR required, squash-only, linear history, CI required); merges drive release-please to bump `package.json`, write `CHANGELOG.md`, tag, and cut a GitHub Release; commit/PR-title linting keeps the conventional-commit history clean.
- **Change ID:** release-automation
- **Refs:** asks #3, #4, #5
- **Prerequisites:** S-01 (the required status check the ruleset enforces must exist first)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Required approvals = 0 (solo) or 1? — Owner: user. Block: no.
- **Risk:** branch protection can only require a check that already runs (S-01); squash-merge is required so release-please reads exactly one conventional commit per merge.
- **Status:** proposed

### S-03: CD — Supabase migrations → Cloudflare Worker on green master

- **Outcome:** a merge to master (on green CI) applies Supabase migrations then deploys the Worker, in that order, with runtime secrets pushed via the deploy; per-PR Cloudflare preview deploys post a URL.
- **Change ID:** cd-migrate-and-deploy
- **Refs:** ask #2
- **Prerequisites:** S-01 (deploy gates on green CI), F-01 (live Worker + secrets/KV must exist), S-02 (optional: tag-then-deploy on release)
- **Parallel with:** S-04, S-05
- **Blockers:** GitHub `production` environment + secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, …) — needs your access.
- **Unknowns:**
  - Declare `kv_namespaces`/`images` bindings in `wrangler.jsonc` for non-interactive deploy — Owner: user/team. Block: yes (CI deploy hangs on interactive provisioning otherwise).
- **Risk:** migrations are destructive + forward-only; deploy is fully automatic on green CI (D5), so rely on `db push --dry-run` + expand-then-contract + PITR. Migrate-before-deploy ordering is mandatory.
- **Status:** blocked

### S-04: Dependency automation

- **Outcome:** Dependabot opens grouped npm + github-actions update PRs (ESLint-10 and framework majors pinned out); patch + dev-dep-minor PRs auto-merge after the required CI passes.
- **Change ID:** dependency-automation
- **Refs:** ask #6
- **Prerequisites:** S-01 (auto-merge waits on the required CI check), S-02 (branch protection makes auto-merge gate meaningful)
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** committing `.github/dependabot.yml` activates Dependabot immediately, and auto-merge with no required check would merge ungated — so this must land after S-01 + S-02, not before.
- **Status:** proposed

### S-05: Extra CI/quality tooling

- **Outcome:** CodeQL + secret-scanning, vitest coverage reporting, per-PR Cloudflare preview deploys, and a nightly Stryker mutation run — added incrementally.
- **Change ID:** extra-ci-tooling
- **Refs:** "co jeszcze" (research Phase 5)
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04
- **Blockers:** secret-scanning/push-protection toggle — GitHub Settings (your access).
- **Unknowns:**
  - Coverage: gate at a threshold or report-only first? — Owner: user. Block: no.
- **Risk:** all optional/additive; sequenced last so it never blocks the core pipeline. Stryker is already installed — only a CI cron is missing.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                | Suggested issue title                                  | Ready for `/10x-plan` | Notes                                  |
| ---------- | ------------------------ | ----------------------------------------------------- | --------------------- | -------------------------------------- |
| F-01       | live-cutover-sage-worker | Live cutover: deploy renamed Worker + Supabase + brand| no                    | External ops; checklist in old plan/PR #4 |
| S-01       | ci-test-pyramid          | CI: full test pyramid gating PRs                      | yes                   | `/10x-plan ci-test-pyramid`            |
| S-02       | release-automation       | Branch protection + release-please + changelog         | after S-01            | —                                      |
| S-03       | cd-migrate-and-deploy    | CD: migrate Supabase → deploy Worker on green master   | after S-01 + F-01     | needs production env secrets           |
| S-04       | dependency-automation    | Dependabot + safe auto-merge                           | after S-01 + S-02     | —                                      |
| S-05       | extra-ci-tooling         | CodeQL + coverage + preview deploys + Stryker cron     | after S-01            | additive; can split per tool           |

## Open Roadmap Questions

1. **Custom domain now or later?** — Owner: user. Block: `F-01` framing (workers.dev is fine to start).
2. **e2e a required merge gate?** — Owner: user. Block: none (D4 = blocking; revisit if flaky).
3. **Deploy fully automatic vs add an approval gate later?** — Owner: user. Block: none (D5 = automatic).

## Parked

- **Renovate instead of Dependabot** — Why parked: overkill for a single-maintainer fork (research recommendation).
- **changesets / semantic-release** — Why parked: release-please fits the existing conventional-commit + single-app shape better.
- **Browser matrix / Playwright sharding in CI** — Why parked: 4 specs, 1 browser; premature until the suite is much larger.

## Done

- **S-00: repo/app rebranded to Sage Flashcards (in-repo)** — implemented on PR #4 (`chore/rebrand-sage-flashcards`); awaiting merge. Flips to fully done once merged + F-01 (live cutover) lands.
