# CD — Supabase migrations → Cloudflare Worker on green master (S-03) Implementation Plan

## Overview

Add the missing **continuous-deployment** half of the pipeline. Today the CI test pyramid, branch protection, and release-please are all in place, but there is **no `deploy.yml`** — Supabase migrations and `wrangler deploy` are run manually from a developer's laptop (the F-01 runbook). This change ships a `workflow_run`-gated `deploy.yml` that, on a green `master` push, applies Supabase migrations (dry-run → push) and then deploys the `sage-flashcards` Worker with its runtime secrets synced from GitHub — preceded by a `wrangler.jsonc` fix so a non-interactive CI deploy never hangs on binding provisioning.

This is roadmap slice **S-03** (`context/foundation/ci-automation-roadmap.md:108`), ask **#2**.

## Current State Analysis

- **No CD exists.** `.github/workflows/` has `ci.yml`, `e2e.yml` (reusable), `nightly-e2e.yml`, `pr-title.yml`, `release-please.yml`, `review.yml`, `review-run.yml` — none deploy. Deploys are manual (`context/deployment/deploy-plan.md`).
- **CI signal to gate on already exists.** `ci.yml` runs `lint-unit-build` → `integration` + `e2e` on push/PR to master (`.github/workflows/ci.yml:18-63`). This is the green signal CD will wait on.
- **`wrangler.jsonc` declares no bindings** beyond `ASSETS` (`wrangler.jsonc:1-17`). But:
  - First manual deploy auto-created a KV namespace for the `SESSION` binding (`context/deployment/deploy-plan.md:98`).
  - The Astro 7 / `@astrojs/cloudflare@14` adapter auto-enables `SESSION` (KV) + `IMAGES` bindings. A **non-interactive** `wrangler deploy` will prompt to provision an undeclared KV namespace and **hang in CI** — the roadmap's flagged blocking unknown (`ci-automation-roadmap.md:117`).
- **Runtime secrets are `optional` in the env schema** (`astro.config.mjs:33-52`): `SUPABASE_URL`, `SUPABASE_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`. A green build does **not** prove runtime config is present — secrets must be set as Workers Secrets. F-01 set them manually ("5 secrets").
- **Migrations**: three files in `supabase/migrations/`; apply path is `supabase link --project-ref <ref>` → `supabase db push` (needs `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`). `supabase/config.toml` `project_id = "sage-flashcards"`.
- **Established workflow conventions to mirror**: `node 24` + `cache: npm`, `npx astro sync` before lint/build, least-privilege `permissions:`, third-party actions pinned by commit SHA (`release-please.yml:33-38`), and the Supabase CLI pinned to `2.107.0` to match the lockfile (`ci.yml:50-53`, `e2e.yml:34-39`).

## Desired End State

A merge to `master` that passes the full required CI pyramid automatically:

1. applies any pending Supabase migrations to the production database (dry-run logged first, then pushed), **then**
2. deploys the `sage-flashcards` Worker — built from the exact tested commit — with all five runtime secrets synced from GitHub,

with no human in the loop on the happy path, and a documented loud-failure + manual-rollback story when something breaks. Verify by merging a trivial change to master and observing the `deploy.yml` run go green and the live URL serve the new build.

### Key Discoveries:

- Non-interactive deploy requires `SESSION` (KV) + `IMAGES` bindings declared in `wrangler.jsonc`, else CI hangs on provisioning (`ci-automation-roadmap.md:117`, `deploy-plan.md:98`).
- A green build ≠ working runtime — secrets are `optional` (`astro.config.mjs:35-36`), so CD must push them.
- `workflow_run` is the only way to gate a _separate_ workflow file on another workflow's success; it must filter on `conclusion == 'success'`, `head_branch == 'master'`, `event == 'push'`, and check out `head_sha` to deploy the exact tested commit.
- Supabase CLI must be pinned to `2.107.0` (lockfile parity) or `config.toml` fails to parse (`e2e.yml:36-39`).

## What We're NOT Doing

- **No per-PR preview deploys** — deferred to S-05 (decision this session; S-05 already lists them).
- **No manual approval gate** — deploy is fully automatic on green CI (roadmap D5 / Open Question 3).
- **No automatic rollback** — failures fail loud; rollback is a documented manual step (`wrangler rollback` / Supabase PITR).
- **No tag/release-triggered deploy** — trigger is every green `master` push, not release-please tags.
- **No custom domain, Hyperdrive, Durable Objects/Queues** — out of scope per `deploy-plan.md:79-83`.
- **Not changing `ci.yml`** — CD lives in its own file; CI stays read-only and PR-focused.

## Implementation Approach

A dedicated `deploy.yml` triggered by `workflow_run` keyed to the `CI` workflow concluding `success`. The job runs only when the triggering event was a `push` to `master`, checks out the tested `head_sha`, then executes the mandatory ordered sequence: **migrate (dry-run → push) → sync secrets → deploy**. Secrets and the Cloudflare/Supabase credentials are scoped to a GitHub `production` environment so they are never exposed to PR runs. The `wrangler.jsonc` binding fix lands first (Phase 1) because without it the deploy step cannot run unattended.

## Critical Implementation Details

- **Ordering is mandatory**: migrations apply **before** the Worker deploys, so the new code never runs against an old schema. Authoring follows expand-then-contract so the _currently-live_ Worker also tolerates the new schema during the brief window before the new Worker promotes. Migrations are forward-only.
- **Deploy the tested commit, not the branch tip**: `workflow_run` fires after CI finishes; another push could have landed. Check out `github.event.workflow_run.head_sha` so the build, migrations, and deploy all correspond to the commit CI actually validated.
- **`wrangler secret bulk` requires the Worker to already exist** — it does (F-01), so syncing secrets before `wrangler deploy` is safe; secrets are Worker-level and persist across deploys.
- **The live `SESSION` KV namespace id must be the real one** for the renamed `sage-flashcards` Worker (F-01 cutover) — fetched via `wrangler kv namespace list`, not the old `10x-cards-session` id.

---

## Phase 1: Make the Worker deployable non-interactively

### Overview

Declare the adapter-required bindings in `wrangler.jsonc` so a CI `wrangler deploy` runs unattended instead of prompting to provision a KV namespace. This unblocks Phase 2.

### Changes Required:

#### 1. Declare SESSION KV + IMAGES bindings

**File**: `wrangler.jsonc`

**Intent**: Add the `kv_namespaces` (binding `SESSION`) and `images` (binding `IMAGES`) declarations the `@astrojs/cloudflare@14` adapter auto-enables, so `wrangler deploy` never tries to interactively provision them. Without this, CI hangs.

**Contract**: Add to the existing JSON object:

- `"kv_namespaces": [{ "binding": "SESSION", "id": "<live-namespace-id>" }]` — `<live-namespace-id>` is the id of the renamed Worker's session namespace, obtained from `npx wrangler kv namespace list` (the real value is filled in during implementation; do not reuse the old `10x-cards-session` id).
- `"images": { "binding": "IMAGES" }` — the Images binding needs no provisioning, only declaration.

Preserve the existing `name`, `main`, `compatibility_date`, `compatibility_flags`, `assets`, and `observability` keys unchanged.

### Success Criteria:

#### Automated Verification:

- Config is valid JSONC and wrangler parses it: `npx wrangler deploy --dry-run --outdir /tmp/wr-dryrun` exits 0 with no interactive prompt (run after `npm run build`).
- Type-checked lint still passes: `npm run lint`.
- Build still succeeds: `npx astro sync && npm run build`.

#### Manual Verification:

- `npx wrangler kv namespace list` confirms the id placed in `wrangler.jsonc` matches the live `sage-flashcards` session namespace.
- A local `npx wrangler deploy` (or `--dry-run` with real credentials) shows the `SESSION` and `IMAGES` bindings resolved, with no prompt to create a namespace.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the namespace id is correct before proceeding.

---

## Phase 2: The CD workflow (migrate → secrets → deploy)

### Overview

Add `deploy.yml`, gated on CI success for `master` pushes, performing the ordered migrate → sync-secrets → deploy sequence inside a `production` environment.

### Changes Required:

#### 1. The deploy workflow

**File**: `.github/workflows/deploy.yml`

**Intent**: On the `CI` workflow concluding `success` for a `master` `push`, check out the tested commit and run the production deploy. Mirrors the repo's conventions (node 24, `npx astro sync`, pinned Supabase CLI, SHA-pinned third-party actions, least-privilege `permissions`).

**Contract**: A `workflow_run` workflow:

- Trigger: `on: workflow_run: { workflows: ["CI"], types: [completed] }`.
- Top-level `permissions: contents: read`.
- A single `deploy` job with `environment: production` and a guard `if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'master' && github.event.workflow_run.event == 'push'`.
- `concurrency: { group: deploy-production, cancel-in-progress: false }` — never cancel an in-flight deploy.
- Steps, in this exact order:
  1. `actions/checkout@v4` with `ref: ${{ github.event.workflow_run.head_sha }}` (deploy the tested commit).
  2. `actions/setup-node@v4` (node 24, `cache: npm`) → `npm ci` → `npx astro sync`.
  3. `supabase/setup-cli@v1` pinned to `2.107.0`.
  4. **Migrate**: `supabase link --project-ref <ref>` (ref from a secret/var), then `supabase db push --dry-run` (logged for audit), then `supabase db push`. Auth via `SUPABASE_ACCESS_TOKEN` (env) + `SUPABASE_DB_PASSWORD`.
  5. `npm run build` (with `SUPABASE_URL`/`SUPABASE_KEY` available for the build).
  6. **Sync secrets**: `wrangler secret bulk` from a JSON of the five runtime secrets (`SUPABASE_URL`, `SUPABASE_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`) sourced from the `production` environment.
  7. **Deploy**: `npx wrangler deploy`.
- Cloudflare auth via `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` env. Third-party actions (e.g. `supabase/setup-cli`) pinned by commit SHA per repo convention.

A snippet for the workflow_run guard, since the exact expression is load-bearing and easy to get wrong:

```yaml
if: >-
  github.event.workflow_run.conclusion == 'success' &&
  github.event.workflow_run.head_branch == 'master' &&
  github.event.workflow_run.event == 'push'
```

### Success Criteria:

#### Automated Verification:

- Workflow file is valid YAML and parses as a workflow (e.g. `actionlint .github/workflows/deploy.yml` if available, or it appears under the repo's Actions on push).
- `npm run lint` and `npx astro sync && npm run build` still pass (no regressions from any incidental config touched).

#### Manual Verification:

- The `deploy.yml` run does **not** trigger on a PR or on a failing CI run (verified by opening a PR and confirming no deploy fires).
- On a master push with green CI, the deploy job runs the steps in order: dry-run output appears in logs before `db push`; secrets sync before `wrangler deploy`.
- Step ordering is migrate → secrets → deploy, confirmed in the run log.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding — the first real run depends on Phase 3's secrets existing.

---

## Phase 3: External setup, first live deploy, and runbook

### Overview

Create the GitHub `production` environment and its secrets (needs your access), validate the first real end-to-end auto-deploy, and update the deploy runbook + roadmap.

### Changes Required:

#### 1. GitHub `production` environment + secrets (manual, your access)

**File**: (GitHub repo settings — no file)

**Intent**: Provision the environment and secrets `deploy.yml` reads, so the workflow can authenticate to Supabase and Cloudflare and sync runtime secrets.

**Contract**: A `production` environment containing: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, the Supabase `project-ref` (secret or variable), `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and the five runtime secrets (`SUPABASE_URL`, `SUPABASE_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`). No required-reviewer protection rule (automatic deploy).

#### 2. Deploy runbook + roadmap update

**File**: `context/deployment/deploy-plan.md`, `context/foundation/ci-automation-roadmap.md`

**Intent**: Record that deploys are now automated (CD), document the failure/rollback story, and flip S-03 to done.

**Contract**: In `deploy-plan.md`, add a "Continuous deployment (S-03)" section: trigger, ordered steps, the loud-failure + manual-rollback policy (`wrangler rollback <version-id>` for the Worker; Supabase PITR for the DB; note they don't roll back together). In `ci-automation-roadmap.md`, set S-03 `Status` to `done` in the slice and the "At a glance" + "Backlog Handoff" tables, and add a "Done" entry.

### Success Criteria:

#### Automated Verification:

- The `deploy.yml` run for the validating master push concludes `success` (visible in Actions).

#### Manual Verification:

- All `production` environment secrets exist (`gh secret list --env production` or the Settings UI).
- First auto-deploy: merge a trivial change to master → CI goes green → `deploy.yml` fires → migrations dry-run logged → `db push` applies (or no-ops if none pending) → secrets synced → `wrangler deploy` returns a live version.
- Live URL (`https://sage-flashcards.zasanski.workers.dev`) serves the new build; a full signup → confirm → signin → `/dashboard` flow works (proves secrets + DB reachable), `wrangler tail` clean.
- A forced failure (e.g. temporarily bad Cloudflare token) makes the workflow fail loudly without auto-rollback, and the documented manual rollback path works.

**Implementation Note**: This phase requires your access for the GitHub environment + secrets and for observing the live deploy. Pause for manual confirmation that the first production auto-deploy succeeded end-to-end before archiving the change.

---

## Testing Strategy

### Unit/Integration Tests:

- No application code changes — existing unit/integration/e2e suites are unaffected and continue to gate via `ci.yml`. CD only runs _after_ they pass.

### Manual Testing Steps:

1. Open a PR with a trivial change → confirm `ci.yml` runs and `deploy.yml` does **not** fire.
2. Merge to master → confirm CI goes green, then `deploy.yml` fires on the merged SHA.
3. Inspect the deploy log: dry-run diff appears before `db push`; secrets sync before `wrangler deploy`; deploy returns a version id.
4. Smoke-test the live URL end-to-end (signup → confirm → signin → dashboard) with `wrangler tail` running.
5. Verify rollback: `npx wrangler versions list` → `npx wrangler rollback <prior-version-id>`.

## Performance Considerations

CD adds one workflow run per master push (~a few minutes: npm ci + build + migrate + deploy). `concurrency: cancel-in-progress: false` serializes deploys so two never race the same Worker/DB.

## Migration Notes

Migrations are **forward-only and destructive-capable**. Safety net: `db push --dry-run` logged for audit, expand-then-contract authoring (old + new code both tolerate the schema across the deploy window), and Supabase PITR for recovery. The Worker rolls back with `wrangler rollback`; the DB does **not** roll back with it — coordinate manually.

## References

- Roadmap slice S-03: `context/foundation/ci-automation-roadmap.md:108-119`
- Manual deploy runbook (F-01): `context/deployment/deploy-plan.md`
- CI pattern to mirror: `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `.github/workflows/release-please.yml`
- Worker config: `wrangler.jsonc`; env schema: `astro.config.mjs:33-52`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Make the Worker deployable non-interactively

#### Automated

- [x] 1.1 `wrangler deploy --dry-run` exits 0 with no interactive prompt — 9e8825a
- [x] 1.2 Type-checked lint passes (`npm run lint`) — 9e8825a
- [x] 1.3 Build succeeds (`npx astro sync && npm run build`) — 9e8825a

#### Manual

- [x] 1.4 `wrangler kv namespace list` confirms the namespace id matches the live `sage-flashcards` session namespace — 9e8825a
- [x] 1.5 Local deploy/dry-run shows `SESSION` + `IMAGES` bindings resolved, no provisioning prompt — 9e8825a

### Phase 2: The CD workflow (migrate → secrets → deploy)

#### Automated

- [x] 2.1 `deploy.yml` is valid YAML / recognized as a workflow — ebd6c32
- [x] 2.2 `npm run lint` and `npx astro sync && npm run build` still pass — ebd6c32

#### Manual

- [ ] 2.3 Deploy does not fire on a PR or on a failing CI run
- [ ] 2.4 On green master push, steps run in order with dry-run output before `db push`
- [ ] 2.5 Ordering confirmed in run log: migrate → secrets → deploy

### Phase 3: External setup, first live deploy, and runbook

#### Automated

- [ ] 3.1 `deploy.yml` run for the validating master push concludes `success`

#### Manual

- [ ] 3.2 All `production` environment secrets exist
- [ ] 3.3 First auto-deploy: CI green → deploy fires → migrate (dry-run→push) → secrets synced → `wrangler deploy` returns a live version
- [ ] 3.4 Live URL serves new build; full signup→confirm→signin→dashboard works, `wrangler tail` clean
- [ ] 3.5 Forced failure fails loud (no auto-rollback); documented manual rollback path works
- [ ] 3.6 `deploy-plan.md` + `ci-automation-roadmap.md` updated (S-03 → done)
