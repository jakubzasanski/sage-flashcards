# CD — Supabase migrations → Cloudflare Worker on green master (S-03) — Plan Brief

> Full plan: `context/changes/cd-migrate-and-deploy/plan.md`
> Roadmap slice: `context/foundation/ci-automation-roadmap.md:108` (S-03, ask #2)

## What & Why

Add the missing **continuous-deployment** half of the pipeline. CI (test pyramid), branch protection, and release-please are shipped, but there's no `deploy.yml` — Supabase migrations and `wrangler deploy` are still manual from a laptop. This makes every green merge to `master` ship itself: migrations applied, then the Worker deployed.

## Starting Point

`ci.yml` runs lint+unit+build / integration / e2e on every push & PR to master and is the required merge gate. `wrangler.jsonc` declares only the `ASSETS` binding; the Worker's `SESSION` KV namespace was auto-created during the first manual deploy. Runtime secrets are `optional` in the env schema and were set manually (F-01). Nothing deploys automatically today.

## Desired End State

A merge to `master` that passes required CI automatically applies any pending Supabase migrations (dry-run logged, then pushed) and then deploys the `sage-flashcards` Worker — built from the exact tested commit, with all five runtime secrets synced from GitHub. No human on the happy path; loud failure + documented manual rollback otherwise.

## Key Decisions Made

| Decision         | Choice                                                 | Why (1 sentence)                                                   | Source  |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------ | ------- |
| Trigger          | Every green push to master                             | Roadmap D5 — true CD, ship on green                                | Roadmap |
| Gating mechanism | Separate `deploy.yml` via `workflow_run` on CI success | Keeps CI read-only/PR-focused; matches file-per-concern convention | Plan    |
| Deploy gate      | Automatic, no approval                                 | Roadmap D5 / Open Q3 = automatic; CI is the gate                   | Roadmap |
| Secrets          | Push every deploy via `wrangler secret bulk`           | GitHub = single source of truth, no drift                          | Plan    |
| Migration safety | Dry-run diff logged → `db push`                        | Cheap audit trail; rely on expand-contract + PITR                  | Plan    |
| Deploy failure   | Fail loud, leave DB migrated, manual rollback          | Honest about forward-only; expand-contract covers compat           | Plan    |
| Previews         | Deferred to S-05                                       | Keep the prod-touching slice focused; S-05 owns previews           | Plan    |
| Binding fix      | Declare `SESSION` KV + `IMAGES` in `wrangler.jsonc`    | Non-interactive deploy hangs otherwise                             | Plan    |

## Scope

**In scope:** `wrangler.jsonc` binding declarations; `deploy.yml` (migrate → secrets → deploy); GitHub `production` environment + secrets; runbook/roadmap updates.

**Out of scope:** per-PR preview deploys (S-05); manual approval gate; auto-rollback; tag/release-triggered deploys; custom domain / Hyperdrive / DO / Queues; changes to `ci.yml`.

## Architecture / Approach

`deploy.yml` triggers on the `CI` workflow's `completed` event, guarded to `conclusion == success && head_branch == master && event == push`. It checks out `head_sha` (the tested commit), then runs the mandatory ordered sequence inside a `production` environment: `supabase db push --dry-run` → `supabase db push` → `wrangler secret bulk` → `wrangler deploy`. Cloudflare/Supabase credentials and runtime secrets are scoped to the environment so PR runs can never reach them.

## Phases at a Glance

| Phase                   | What it delivers                                            | Key risk                                               |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| 1. Deployable Worker    | `SESSION` KV + `IMAGES` bindings in `wrangler.jsonc`        | Wrong/old namespace id → binding mismatch              |
| 2. CD workflow          | `deploy.yml` migrate→secrets→deploy, workflow_run-gated     | `workflow_run` guard misfiring (PRs, stale SHA)        |
| 3. Setup + first deploy | `production` env + secrets, first live auto-deploy, runbook | External secrets need your access; first prod mutation |

**Prerequisites:** S-01 (green CI — done), F-01 (live Worker + KV — done); your access for the GitHub `production` environment and Cloudflare/Supabase secrets.
**Estimated effort:** ~1–2 sessions; Phases 1–2 are code (small), Phase 3 is mostly manual setup + live validation.

## Open Risks & Assumptions

- The live `sage-flashcards` session KV namespace id must be fetched (`wrangler kv namespace list`) — not the old `10x-cards-session` id.
- Migrations are forward-only/destructive-capable; safety rests on dry-run + expand-then-contract + Supabase PITR.
- `workflow_run` must check out `head_sha` so build/migrate/deploy match the commit CI validated.

## Success Criteria (Summary)

- Merging to master auto-applies migrations then deploys the Worker, with no manual steps on the happy path.
- The live URL serves the new build and full auth flow works; deploy never fires on PRs or failing CI.
- A forced failure fails loud (no auto-rollback) and the documented manual rollback path works.
