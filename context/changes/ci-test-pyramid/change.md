---
change_id: ci-test-pyramid
title: CI — full test pyramid gating every PR
status: planned
created: 2026-06-26
updated: 2026-06-26
archived_at: null
---

## Notes

Phase 1 / slice S-01 from ci-automation-roadmap.md (north star). Expand `.github/workflows/ci.yml` into the full test pyramid: `lint+unit+build`, `integration` (supabase start), and `e2e` (supabase start + Playwright) jobs, with concurrency-cancel, Playwright cache + report artifacts, and a `nightly-e2e` workflow. Refs: ask #1.
