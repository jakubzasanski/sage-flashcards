---
change_id: ci-test-pyramid
title: CI — full test pyramid gating every PR
status: implemented
created: 2026-06-26
updated: 2026-06-27
archived_at: null
---

## Notes

Phase 1 / slice S-01 from ci-automation-roadmap.md (north star). Expand `.github/workflows/ci.yml` into the full test pyramid: `lint+unit+build`, `integration` (supabase start), and `e2e` (supabase start + Playwright) jobs, with concurrency-cancel, Playwright cache + report artifacts, and a `nightly-e2e` workflow. Refs: ask #1.

Implemented on `feat/ci-test-pyramid` (PR #7), green pipeline run 28283339958. E2E recipe extracted to a reusable `e2e.yml` (`workflow_call`) shared by ci.yml + nightly. Three non-obvious fixes vs the original plan: (1) e2e needs local `SUPABASE_URL/KEY` — plan's "no SUPABASE_* for e2e" conflated GitHub prod secrets with env vars; (2) Supabase CLI pinned to `2.107.0` (lockfile parity) — `config.toml` rejects older CLIs; (3) `.dev.vars` must be written in CI because `astro preview` runs on workerd, which ignores `process.env`. Artifacts upload only on `failure()`. Jobs kept parallel (plan's perf choice); e2e intentionally secret-free (hermetic gate, no `secrets: inherit`).

**Post-merge manual checklist** (Progress rows still open — verifiable only after merge to master): 1.3 concurrency-cancel on overlapping pushes · 2.2 job time acceptable · 3.3 HTML report opens with traces · 3.4 flake rate across runs · 4.2 Nightly E2E manual dispatch green.
