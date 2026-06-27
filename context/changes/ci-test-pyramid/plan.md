# CI — Full Test Pyramid Implementation Plan

## Overview

Expand `.github/workflows/ci.yml` from a single `lint + unit + build` job into a full test-pyramid pipeline that runs on every PR/push to `master`: a fast Docker-free base job, an `integration` job and an `e2e` job (each booting local Supabase), plus a scheduled `nightly-e2e` safety net. This is slice **S-01** (north star) of `context/foundation/ci-automation-roadmap.md` — everything downstream (branch protection, release automation, deploy-on-green, dependabot auto-merge) depends on a trustworthy green CI signal existing first.

## Current State Analysis

`.github/workflows/ci.yml` is one job `ci` on `push`/`pull_request` to `master`: `checkout@v4 → setup-node@v4 (node 24, cache npm) → npm ci → npx astro sync → npm run lint → npm test → npm run build` (build reads `SUPABASE_URL`/`SUPABASE_KEY` repo secrets). `npm test` = `vitest run --project unit` (unit only). There is **no** concurrency control, no integration/e2e execution, no artifact upload, no caching beyond setup-node's npm cache.

### Key Discoveries

- `package.json` scripts already exist: `test` (unit), `test:integration` (`vitest run --project integration`), `test:e2e` (`playwright test`).
- `test/support/config.ts` **hardcodes** the well-known Supabase **local demo** anon + service_role keys and falls back to them when env is unset — identical on every `supabase start`. → **integration + e2e need NO GitHub secrets.**
- `playwright.config.ts` `webServer` runs `npm run build && npm run preview` on :4321 with `reuseExistingServer:false`, `retries:2` in CI, `trace:on-first-retry`, github reporter, and a `setup` project that writes `playwright/.auth/user.json`. → the e2e job just runs `npm run test:e2e`; Playwright owns build+preview.
- `supabase/config.toml` provisions API :54321, DB :54322, Mailpit/inbucket :54324, auth (`enable_confirmations=false`). The e2e suite (`password-reset.spec`) talks to GoTrue admin API + PostgREST + Mailpit — all of which `supabase start` provides (a bare `services: postgres` would not). The `supabase` CLI is already a pinned devDependency.
- GitHub-hosted `ubuntu-latest` has Docker preinstalled → `supabase start` works out of the box.

## Desired End State

Opening a PR triggers three jobs — `lint-unit-build`, `integration`, `e2e` — that must all pass; a superseded push cancels the in-flight run; the e2e job uploads its HTML report + traces as artifacts on failure. A separate `nightly-e2e` workflow runs the e2e suite on a cron and on manual dispatch. Verifiable by: opening a throwaway PR and seeing all three checks run and go green, and the Actions tab showing the nightly workflow available via "Run workflow".

## What We're NOT Doing

- **Branch protection / required-status-checks** — that's an external GitHub Settings/ruleset step owned by slice **S-02** (`release-automation`). This slice only makes the checks *exist*; it does not make them *required*.
- **Deploy / migrations** — slice S-03.
- **Browser matrix or Playwright sharding** — premature for 4 specs / 1 browser (parked in the roadmap).
- **Secret scanning toggle, CodeQL, coverage** — slice S-05.
- Changing any test code or `playwright.config.ts` / `vitest.config.ts` — the pipeline runs the suites as they are.

## Implementation Approach

Refactor the existing single job into `lint-unit-build` (the fast Docker-free floor) and add `concurrency` at the top level. Then add `integration` and `e2e` as separate jobs, each `needs: lint-unit-build` (so a lint/unit failure doesn't waste a Docker boot), each booting Supabase via `supabase/setup-cli` + `supabase start`. The e2e job adds a Playwright browser cache + `chromium --with-deps` install and uploads report/trace artifacts. Finally add a `nightly-e2e.yml` (cron + `workflow_dispatch`) that reuses the e2e recipe. Third-party actions use floating major tags (`@vN`); Dependabot (Phase 4) will bump them later.

## Critical Implementation Details

- **e2e job needs no secrets.** Do NOT pass `SUPABASE_*` to integration/e2e — they rely on the hardcoded local demo keys reproduced by `supabase start`. Passing real secrets would point tests at prod.
- **Ordering:** integration/e2e `needs: lint-unit-build`. Keep the `build` step inside `lint-unit-build`; the e2e job's own build happens inside Playwright's `webServer`.
- **Supabase boot cost:** ~60-120s per Docker boot; integration and e2e boot separately (isolation > saving one boot). `supabase stop` as an `if: always()` cleanup step is harmless on ephemeral runners but keeps local parity.

## Phase 1: Fast lane + concurrency

### Overview

Refactor the existing single job into `lint-unit-build` and add top-level concurrency-cancel. No Docker, no behavior change to the steps themselves.

### Changes Required:

#### 1. CI workflow — fast job + concurrency

**File**: `.github/workflows/ci.yml`

**Intent**: Rename the `ci` job to `lint-unit-build` (keeping its steps: checkout, setup-node, `npm ci`, `astro sync`, lint, `npm test`, build). Add a top-level `concurrency` block so a newer push to the same ref cancels the in-flight run.

**Contract**: top-level `concurrency: { group: "${{ github.workflow }}-${{ github.ref }}", cancel-in-progress: true }`; job key `lint-unit-build` on `ubuntu-latest`. Build step keeps its existing `SUPABASE_URL`/`SUPABASE_KEY` env from secrets. Triggers unchanged (`push`/`pull_request` → `master`). Workflow `name:` stays `CI` (downstream S-03 keys off it).

### Success Criteria:

#### Automated Verification:

- Workflow YAML is valid (e.g. `actionlint .github/workflows/ci.yml` if available, or GitHub parses it on push).
- `lint-unit-build` job runs and passes on a PR.

#### Manual Verification:

- Pushing a second commit to an open PR cancels the first run (concurrency works).

---

## Phase 2: Integration job (local Supabase)

### Overview

Add an `integration` job that boots local Supabase and runs the Vitest integration project.

### Changes Required:

#### 1. CI workflow — integration job

**File**: `.github/workflows/ci.yml`

**Intent**: Add job `integration` (`needs: lint-unit-build`) that checks out, sets up Node, installs deps, runs `astro sync`, brings up Supabase via `supabase/setup-cli` + `supabase start`, runs `npm run test:integration`, and stops Supabase.

**Contract**: job `integration`, `needs: [lint-unit-build]`, `runs-on: ubuntu-latest`. Steps: `actions/checkout@v4` → `actions/setup-node@v4` (node 24, `cache: npm`) → `npm ci` → `npx astro sync` → `supabase/setup-cli@v1` (`with: version: latest`) → `supabase start` → `npm run test:integration` → `supabase stop` (`if: always()`). No `SUPABASE_*` env (relies on hardcoded demo keys).

### Success Criteria:

#### Automated Verification:

- `integration` job boots Supabase and `npm run test:integration` passes in CI.

#### Manual Verification:

- Job logs show Supabase services healthy before tests run; total job time is acceptable (~3-5 min).

---

## Phase 3: E2E job (Supabase + Playwright)

### Overview

Add an `e2e` job that boots Supabase, restores/install Playwright Chromium, runs the Playwright suite (which builds+previews itself), and uploads the report/traces on failure.

### Changes Required:

#### 1. CI workflow — e2e job

**File**: `.github/workflows/ci.yml`

**Intent**: Add job `e2e` (`needs: lint-unit-build`) that boots Supabase, caches + installs Chromium, runs `npm run test:e2e`, and uploads artifacts even on failure.

**Contract**: job `e2e`, `needs: [lint-unit-build]`, `runs-on: ubuntu-latest`. Steps: checkout@v4 → setup-node@v4 (node 24, cache npm) → `npm ci` → `npx astro sync` → `supabase/setup-cli@v1` → restore Playwright cache (`actions/cache@v4`, path `~/.cache/ms-playwright`, key `${{ runner.os }}-playwright-${{ hashFiles('package-lock.json') }}`) → `npx playwright install --with-deps chromium` → `supabase start` → `npm run test:e2e` → `actions/upload-artifact@v4` (`if: ${{ !cancelled() }}`) for `playwright-report/` and a second for `test-results/` (retention ~14 days) → `supabase stop` (`if: always()`). No `SUPABASE_*` env.

### Success Criteria:

#### Automated Verification:

- `e2e` job runs `npm run test:e2e` green in CI (Playwright builds+previews via its `webServer`).
- On a deliberately failing run, `playwright-report` + `test-results` artifacts are uploaded.

#### Manual Verification:

- Download the uploaded HTML report and confirm it opens with traces for any retried/failed spec.
- e2e flake rate is acceptable across a few runs (retries:2 already configured).

---

## Phase 4: Nightly e2e safety net

### Overview

Add a scheduled workflow that runs the e2e suite nightly and on manual dispatch — an early-warning net for flake/regressions, separate from the PR gate.

### Changes Required:

#### 1. Nightly workflow

**File**: `.github/workflows/nightly-e2e.yml` (new)

**Intent**: Run the same e2e recipe (Supabase + Playwright) on a cron and on `workflow_dispatch`, uploading the report.

**Contract**: `name: Nightly E2E`; `on: { schedule: [{ cron: "0 3 * * *" }], workflow_dispatch: {} }`. One `e2e` job mirroring Phase 3's steps (checkout → setup-node → npm ci → astro sync → setup-cli → Playwright cache+install → supabase start → `npm run test:e2e` → upload-artifact → supabase stop). Runs against `master` (default branch for scheduled events).

### Success Criteria:

#### Automated Verification:

- `nightly-e2e.yml` parses and appears under Actions with a "Run workflow" (dispatch) button.

#### Manual Verification:

- Manually dispatch the workflow once and confirm it runs the full e2e suite green and uploads the report.

---

## Testing Strategy

### Unit Tests:

- Unchanged — `npm test` runs in `lint-unit-build`. No new unit tests (this slice is CI config).

### Integration Tests:

- Existing `test:integration` project, now executed in CI against `supabase start`.

### Manual Testing Steps:

1. Open a throwaway PR with a trivial change → confirm `lint-unit-build`, `integration`, `e2e` all run and pass.
2. Push a second commit → confirm the prior run is cancelled (concurrency).
3. Temporarily break a spec → confirm the e2e job fails and uploads the report/traces; revert.
4. Actions → Nightly E2E → "Run workflow" → confirm green.

## Performance Considerations

Integration + e2e each pay a ~60-120s Docker boot; running them as separate jobs (parallel after `lint-unit-build`) keeps wall-clock near the slowest single job rather than the sum. The Playwright browser cache avoids re-downloading Chromium each run. `concurrency` cancels superseded runs to save minutes.

## Migration Notes

Pure additive CI change; no app/runtime/data impact. The existing `build` step and its secrets are preserved. Making the new checks *required* for merge is a follow-up GitHub setting (slice S-02), not part of this change.

## References

- Roadmap slice: `context/foundation/ci-automation-roadmap.md` → S-01 (`ci-test-pyramid`)
- Current workflow: `.github/workflows/ci.yml`
- Test config: `playwright.config.ts`, `vitest.config.ts`, `test/support/config.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Fast lane + concurrency

#### Automated

- [x] 1.1 Workflow YAML valid / parses on push — 97528c2
- [ ] 1.2 `lint-unit-build` job runs and passes on a PR

#### Manual

- [ ] 1.3 Second push to a PR cancels the in-flight run (concurrency)

### Phase 2: Integration job (local Supabase)

#### Automated

- [ ] 2.1 `integration` boots Supabase and `test:integration` passes in CI

#### Manual

- [ ] 2.2 Supabase healthy before tests; job time acceptable

### Phase 3: E2E job (Supabase + Playwright)

#### Automated

- [ ] 3.1 `e2e` runs `test:e2e` green in CI
- [ ] 3.2 On failure, `playwright-report` + `test-results` artifacts uploaded

#### Manual

- [ ] 3.3 Downloaded HTML report opens with traces
- [ ] 3.4 e2e flake rate acceptable across a few runs

### Phase 4: Nightly e2e safety net

#### Automated

- [x] 4.1 `nightly-e2e.yml` parses and exposes a dispatch button

#### Manual

- [ ] 4.2 Manual dispatch runs full e2e green + uploads report
