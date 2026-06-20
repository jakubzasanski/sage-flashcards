---
change_id: testing-runner-bootstrap-generation
title: Runner bootstrap + generation-service coverage (test rollout Phase 1)
status: archived
created: 2026-06-19
updated: 2026-06-20
archived_at: 2026-06-20T05:53:19Z
---

## Notes

Rollout Phase 1 of `context/foundation/test-plan.md`: "Runner bootstrap + generation-service coverage".

Risks covered: #2 (source-text privacy leak — pasted text reaching logs/error bodies/DB), #3 (generation degrades the wedge — provider failure / malformed / empty / over-cap output).
Test types planned: unit + contract (mock the OpenAI-compatible fetch boundary).

Risk response intent:
- #2: prove no sourceText reaches logs, error bodies, or the DB across BOTH success and failure paths; challenge "errors are generic" by asserting it rather than trusting the comment.
- #3: prove malformed/empty/5xx/over-cap provider output yields a clean handled result, the <=30 cap holds, and the retry fires only on transient faults; avoid the oracle problem (oracle is the PRD contract: atomic Q/A, caps, privacy — not the implementation).

Context: no test runner exists yet (CLAUDE.md: lint+build only) — this phase bootstraps Vitest. Code under test is `src/lib/services/generation.ts` (+ `src/pages/api/generate.ts`).

Next step: `/10x-research` (this phase needs the generation service's real failure paths and the workerd/Vitest setup grounded before planning tests).
