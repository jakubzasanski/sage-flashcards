# CI/CD Code-Review Workflow — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

Every PR to `master` should get an automatic first-pass code review. We wire the `@sage/code-reviewer` (Codex SDK) agent built in M5L2 into GitHub Actions so it scores each PR on 6 criteria, posts a comment, and tags it `ai-cr:passed`/`ai-cr:failed` — turning a local script into a team-visible CI step.

## Starting Point

The agent exists and works locally (`reviewDiff()` → JSON with 5 scores + `pass`/`fail` verdict + Markdown summary, auth via `OPENAI_API_KEY`). CI today is a single `ci.yml` (lint+test+build); no composite actions, no branch protection.

## Desired End State

Opening/pushing a PR to `master` triggers an `AI Code Review` job: it computes the diff, runs the agent via a composite action, comments the summary, sets one `ai-cr:*` label, and shows green (pass) / red (fail). Adding `ai-cr:review` re-runs it. The run (pipeline view + job log + LLM comment) is the 10xChampion proof.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Which agent | Custom Codex agent (not Claude Code Action) | Only path runnable on the OpenAI key; fits requirements; completes the lesson arc | Research |
| Gate behavior on `fail` | Red check + comment + label (exit non-zero) | Strong visible signal; becomes a hard gate for free once S-02 adds branch protection | Plan |
| Verdict source | Trust the agent's `verdict` field | It's the agent's job; simplest, MVP-aligned | Plan |
| Agent input | PR title + body + diff | Better intent assessment; diff dominates token cost anyway | Plan |
| Model selection | CLI default + `low` reasoning, model via env | No guessing model IDs now; tunable later | Plan |
| Action hosting | Local `.github/actions/ai-review/` | Lesson's recommended start; easy to extract later | Research |
| Merge blocking | Advisory only (no branch protection yet) | S-02 not built; can't require a check that nothing enforces | Research |

## Scope

**In scope:** 6th criterion (`documentation`); PR title/body input; gateable exit + `REVIEW_MODEL`; composite action (pure scoring → `verdict`+`summary`); consumer workflow (diff plumbing, comment, labels, retry, red/green check).

**Out of scope:** required merge gating (S-02); agent posting comments itself (drabina sprawczości); separate-repo/Marketplace action; forked-PR secret isolation; numeric score thresholds; touching `ci.yml`; parked criteria (business/architectural fit).

## Architecture / Approach

Three layers, criteria-vs-mechanics split: **agent** (what we judge — schema + prompt) → **composite action** (`install deps → run agent → output verdict+summary`, no side-effects) → **workflow** (compute diff to a file, call action with the secret, post comment + labels, fail red on `fail`). Diff passed as a file path, never through `$GITHUB_OUTPUT`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Extend agent | 6 criteria, PR title/body input, gateable exit + model env | Keeping `review:sample`/promptfoo non-gating (exit-code collision) |
| 2. Composite action | Pure `ai-review` action returning verdict+summary | Installing Codex deps inside `packages/**` (excluded from root) |
| 3. Workflow | PR trigger, comment, labels, retry, red/green check | GHA permissions + diff plumbing + secret setup; only verifiable on a real PR |

**Prerequisites:** `OPENAI_API_KEY` repo secret; a test PR to `master`.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Advisory only until S-02 (branch protection) lands — the red check won't block merge yet.
- Codex SDK auth in CI relies on the explicit `OPENAI_API_KEY` secret (no interactive `codex login` on runners).
- Score fields aren't schema-range-validated (1-10 enforced by prompt only) — fine since we gate on `verdict`, not numbers.

## Success Criteria (Summary)

- A PR to `master` gets an AI comment + correct `ai-cr:*` label automatically; check is red on `fail`, green on `pass`.
- The `ai-cr:review` label re-runs the review on demand.
- Job logs show the agent running end-to-end with token usage (10xChampion proof).
