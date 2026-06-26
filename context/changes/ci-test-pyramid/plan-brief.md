# CI — Full Test Pyramid — Plan Brief

> Full plan: `context/changes/ci-test-pyramid/plan.md`
> Roadmap slice: `context/foundation/ci-automation-roadmap.md` → S-01 (north star)

## What & Why

Turn CI from a single `lint + unit + build` job into the full test pyramid — adding `integration` and `e2e` jobs (each on local Supabase) plus a nightly e2e run. This is the foundation the rest of the automation roadmap stands on: branch protection, release automation, deploy-on-green, and dependabot auto-merge all need a trustworthy green CI signal to exist first.

## Starting Point

`.github/workflows/ci.yml` is one job (checkout → setup-node → npm ci → astro sync → lint → unit → build). Integration + e2e scripts already exist in `package.json` but never run in CI. No concurrency, no artifacts, no Docker.

## Desired End State

Every PR runs three checks — `lint-unit-build`, `integration`, `e2e` — that must pass; superseded pushes auto-cancel; the e2e job uploads its HTML report + traces on failure; and a `nightly-e2e` workflow runs the suite on a cron + manual dispatch.

## Key Decisions Made

| Decision                  | Choice                                  | Why                                                                 | Source   |
| ------------------------- | --------------------------------------- | ------------------------------------------------------------------- | -------- |
| Supabase in CI            | `supabase/setup-cli` + `supabase start` | Tests need GoTrue + PostgREST + Mailpit, not just Postgres          | Research |
| Secrets for test jobs     | None                                    | Demo keys hardcoded in `test/support/config.ts` + reproduced locally| Research |
| e2e as a merge gate       | Blocking on PR                          | 4 specs / 1 browser is cheap; catches auth/review regressions (D4)  | Roadmap  |
| Job dependency            | `integration`/`e2e` `needs: lint-unit-build` | Don't waste a Docker boot when lint/unit fails                  | Plan     |
| Nightly e2e               | Included in this slice                  | Completes the slice intent; early flake warning                     | Plan     |
| Action pinning            | Floating `@vN` now                      | Simpler; Dependabot (Phase 4) bumps them; SHA-pin later (D8)        | Plan     |

## Scope

**In scope:** refactor `ci.yml` into `lint-unit-build` + `integration` + `e2e`; top-level concurrency-cancel; Playwright browser cache + report/trace artifacts; new `nightly-e2e.yml`.

**Out of scope:** making checks *required* for merge (S-02, a GitHub setting); deploy/migrations (S-03); CodeQL/coverage/secret-scanning (S-05); browser matrix/sharding (parked); any test or test-config changes.

## Architecture / Approach

One workflow file, top-level `concurrency`. `lint-unit-build` is the Docker-free fast floor. `integration` and `e2e` each `needs: lint-unit-build`, boot Supabase via the CLI, and run their suite (Playwright builds+previews itself via its `webServer`). `e2e` caches Chromium and uploads artifacts on failure. A separate scheduled workflow reuses the e2e recipe.

## Phases at a Glance

| Phase                          | What it delivers                          | Key risk                                            |
| ------------------------------ | ----------------------------------------- | --------------------------------------------------- |
| 1. Fast lane + concurrency     | `lint-unit-build` job + cancel-in-progress | None — pure refactor of the existing job            |
| 2. Integration job             | `integration` on local Supabase           | Supabase boot time / flakiness in CI                |
| 3. E2E job                     | `e2e` + Playwright cache + artifacts       | e2e flake; Docker+build+browser reliability         |
| 4. Nightly e2e                 | `nightly-e2e.yml` (cron + dispatch)        | Cron runs against `master` only                     |

**Prerequisites:** none in-repo (independent of the rebrand PR). Branch-protection wiring is a later GitHub setting (S-02).
**Estimated effort:** ~1 focused session; mostly YAML + a verification PR.

## Open Risks & Assumptions

- `supabase/setup-cli` major version — confirm `@v1` vs `@v2` at implement time (Supabase docs vary).
- Supabase boot adds ~1-2 min/job; acceptable but the largest cost.
- e2e relies on retries:2 to absorb hydration-race flake already documented in the suite.

## Success Criteria (Summary)

- A PR shows `lint-unit-build`, `integration`, `e2e` all running and green.
- A failing e2e run uploads a downloadable report with traces.
- The nightly workflow can be run on demand and passes.
