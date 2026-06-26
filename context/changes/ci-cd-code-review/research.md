---
date: 2026-06-26T15:46:26+0200
researcher: Jakub Zasański
git_commit: e4894a14560bbbd6a4573bc567882b1197e814a6
branch: master
repository: jakubzasanski/sage-flashcards
topic: "CI/CD code-review workflow — wire the Codex code-review agent into PRs"
tags: [research, codebase, ci-cd, github-actions, code-reviewer, composite-action]
status: complete
last_updated: 2026-06-26
last_updated_by: Jakub Zasański
---

# Research: CI/CD code-review workflow for PRs

**Date**: 2026-06-26T15:46:26+0200
**Researcher**: Jakub Zasański
**Git Commit**: e4894a14560bbbd6a4573bc567882b1197e814a6
**Branch**: master
**Repository**: jakubzasanski/sage-flashcards

## Research Question

Per `context/changes/ci-cd-code-review/requirements.md`: introduce a GitHub Actions workflow that runs on every PR to `master`, hands the PR's diff (+ title/body) to our code-review agent, scores it on 6 criteria (1–10) with structured output, and posts the result back as a PR comment + an `ai-cr:passed`/`ai-cr:failed` label, with on-demand retry on the `ai-cr:review` label. How does this map onto the existing codebase, and what's the most direct implementation?

## Summary

**Recommended approach: Path A — wire our own `@sage/code-reviewer` (Codex SDK) agent into a local composite action.** It is the only path runnable today (the project has an OpenAI key, not an Anthropic one), it fits the requirements with the least retrofitting (the agent already emits a `pass`/`fail` verdict + per-criterion scores + Markdown summary as JSON), and it completes the M5L2→M5L3 arc. Anthropic's Claude Code Action (Path B) is blocked on a credential we don't have and targets a different review contract (`10x-impl-review-ci`, plan-driven, 7 dims).

**Key constraint: the gate is advisory only for now.** Branch protection (roadmap slice **S-02**, status `proposed`) isn't built, and the CI signal it would gate on (**S-01**, status `ready`) isn't done either. So this workflow can post a comment + label but **cannot block merge** until S-02 ships branch protection and adds this check to the ruleset.

**Shape of the work:** a new `.github/workflows/review.yml` (separate from the existing `ci.yml`) + a local composite action at `.github/actions/ai-review/`. Small extensions to `packages/code-reviewer` (6th criterion, accept PR title/body, surface a machine-readable verdict). All GitHub side-effects (comment, labels) live in the workflow/action, consuming the agent's stdout JSON.

## Detailed Findings

### Existing CI & repo conventions

- **One workflow today:** `.github/workflows/ci.yml` — single `ci` job on `push`/`pull_request` to `master`: `checkout@v4` → `setup-node@v4` (node `24`, `cache: npm`) → `npm ci` → `npx astro sync` → `npm run lint` → `npm test` → `npm run build` (with `SUPABASE_URL`/`SUPABASE_KEY` secrets). No concurrency, no artifacts. The review workflow should be **separate** so it doesn't entangle with the app's lint/build gate.
- **No composite actions exist** (`.github/actions/` absent) — greenfield.
- **Node conventions:** `.nvmrc` = `24`; root `package.json` `"type": "module"`; **not** an npm workspace (no `"workspaces"`). Use `node-version-file: .nvmrc` in the new workflow for parity.
- **`packages/code-reviewer` is a standalone package** with its own `package-lock.json`, deliberately excluded from the app's lint/typecheck: `tsconfig.json:4` (`"exclude": ["dist", "packages"]`) and `eslint.config.js:87` (`ignores: [..., "packages/**"]`). **Implication:** the root `npm ci` does NOT install the Codex deps — the action must run `npm ci` *inside* `packages/code-reviewer` (or `--prefix` it).
- **No branch protection, no `dependabot.yml`.** `.gitignore` already ignores `.env`, `node_modules/`, `dist/` (so the runner secret never leaks via `.env`).

### The `@sage/code-reviewer` agent — current contract & gaps

Source: `packages/code-reviewer/src/{index,reviewer,review-schema}.ts`.

- **Input:** diff on stdin (`index.ts:22`), fixture fallback to `fixtures/sample.diff` (`index.ts:25-28`). `.env` loaded from package dir via `process.loadEnvFile` (`index.ts:9-13`). Auth = `OPENAI_API_KEY ?? CODEX_API_KEY` (`reviewer.ts:17`); with a key → `new Codex({ apiKey })`, without → `new Codex({})` deferring to `codex login` (won't exist in CI — **CI must set the key**).
- **Output:** zod `REVIEW_SCHEMA` (`review-schema.ts:19-29`): 5 scores (`implementationCorrectness`, `idiomaticity`, `complexity`, `testRiskCoverage`, `securitySafety`), `verdict: "pass"|"fail"`, Markdown `summary`. **stdout = the review JSON only** (`index.ts:36`); usage/metrics + notices go to **stderr** (`index.ts:28,37`, `reviewer.ts:19-22`) — clean for a workflow to parse.
- **Codex thread** (`reviewer.ts:29-35`): `sandboxMode:"read-only"`, `networkAccessEnabled:false`, `approvalPolicy:"never"`, `modelReasoningEffort:"low"`, `skipGitRepoCheck:true`. **No model pinned** (CLI default). Sandbox is **CI-compatible** — it restricts the *agent's tool sandbox*, not the Node process's own OpenAI API call. The `codex` binary ships via the `@openai/codex` dep.
- **Reusability:** `reviewDiff(diff)` **is exported** (`reviewer.ts:14`), returns `{ review, finalResponse, usage }`. But the package is `"private": true` with **no `exports`/`main` and no build** — so cross-package import means importing `.ts` via a TS runtime. Simplest for CI: **shell out to `npm run review`** inside the package and parse stdout JSON.

**Gap analysis vs requirements:**
1. **6th criterion `documentation`** — add to `REVIEW_SCHEMA` (`review-schema.ts:19-29`) + update `SYSTEM_PROMPT` ("pięć" → "sześć", add the criterion) (`review-schema.ts:8-12`). `REVIEW_JSON_SCHEMA` + `Review` type regenerate automatically.
2. **Accept PR title/body** — `reviewDiff` takes only the diff (`reviewer.ts:14,37-41`); extend signature + prompt, and let `index.ts` ingest title/body (env vars or a JSON stdin envelope) (`index.ts:22`).
3. **Machine-readable verdict** — `verdict` is in the JSON but never surfaced as a CI signal. The workflow can `jq -r .verdict` the stdout JSON to drive labels; an optional flag-gated `process.exit(1)` on `fail` would let it also fail the step. (Distinguish from the existing input-guard `exit(1)` at `index.ts:31`.)
4. **Comment + labels + retry** — belong in the **workflow/action**, not the package. `summary` is already comment-ready Markdown.

### GitHub Actions mechanics (2026 best practices)

- **Composite action** `.github/actions/ai-review/action.yml`: `runs: using: composite` + `steps`; **every `run` step needs an explicit `shell: bash`** (no inherited default); reference the action's own dir via env `$GITHUB_ACTION_PATH` (run `npm ci --prefix "$GITHUB_ACTION_PATH/..."` for the package deps and `node`/`npm run` the script); `outputs.<name>.value` must map to `${{ steps.<id>.outputs.<key> }}`. **Secrets can't be read inside a composite action** — the caller passes them through `with:` → `inputs`.
- **Diff plumbing (critical):** checkout with `fetch-depth: 0`, compute `git diff "origin/${GITHUB_BASE_REF}...HEAD"` (three-dot = PR changes only). **Do NOT pass the diff through `$GITHUB_OUTPUT` or a `with:` input** — newlines corrupt the `key=value` line and large values are unreliable. **Write the diff to `$RUNNER_TEMP/pr.diff` and pass the file path.** (If a multiline output is unavoidable, use the heredoc-delimiter form with a random delimiter.)
- **Comment + labels** via built-in `GITHUB_TOKEN` + `gh` CLI: `gh pr comment "$PR" --body-file summary.md`; `gh pr edit "$PR" --add-label/--remove-label`. Requires top-level `permissions: { contents: read, pull-requests: write, issues: write }` (labels are issue objects — `issues: write` is mandatory) and `env: GH_TOKEN: ${{ github.token }}`. Create labels idempotently with `gh label create <name> --color <hex> --force`.
- **Triggers:** `on: pull_request: types: [opened, synchronize, labeled]` + `workflow_dispatch`. Guard the job so `labeled` only runs for the retry label:
  `if: github.event_name == 'workflow_dispatch' || (github.event_name == 'pull_request' && github.event.action != 'labeled') || (github.event.action == 'labeled' && github.event.label.name == 'ai-cr:review')`.
- **Security:** pin third-party actions to a full commit **SHA** (not `@v1`). Use plain `pull_request` (not `pull_request_target`) — same-repo branch PRs get the write token + secrets safely; for fork PRs that need secrets, the recommended pattern is privilege-split via `workflow_run` (out of scope for the MVP, which targets internal branches).

### Path A vs Path B (which agent)

| | **A: custom Codex agent** (recommended) | **B: Claude Code Action + `10x-impl-review-ci`** |
|---|---|---|
| Credential | `OPENAI_API_KEY` (already have) | Anthropic/Bedrock/Vertex (**don't have**) |
| Fit to requirements | direct — already emits 6→ (5+1) criteria JSON + verdict + summary | different contract: plan-driven, 7 dims, APPROVED/NEEDS ATTENTION/REJECTED |
| Lesson arc | the M5L2→M5L3 exercise (wire `reviewDiff()` into CI) | the Deep Dive "ready-made" contrast |
| 10xChampion proof | logs show *your* agent running end-to-end | logs show vendor black-box step |

## Code References

- `.github/workflows/ci.yml:1-26` — existing single CI job; new review workflow stays separate.
- `tsconfig.json:4` & `eslint.config.js:87` — `packages/**` excluded → action must install package deps itself.
- `packages/code-reviewer/src/review-schema.ts:8-12,19-29,37` — system prompt, 5-criteria schema (add `documentation`), JSON-schema export.
- `packages/code-reviewer/src/reviewer.ts:14,17,29-35,37-41` — exported `reviewDiff`, auth, Codex thread opts, prompt assembly.
- `packages/code-reviewer/src/index.ts:9-13,22,31,36-37` — `.env` load, stdin diff, input-guard exit, stdout JSON / stderr metrics.
- `packages/code-reviewer/package.json:8-9,12-21` — `review`/`review:sample` scripts; Codex SDK + CLI deps; no `exports`/build.
- `context/changes/ci-cd-code-review/requirements.md` — the spec driving this change.

## Architecture Insights

- **Two-layer split mirrors the lesson's own teaching:** *criteria* (what we judge — lives in the agent's schema/prompt, the durable asset) vs *mechanics* (how CI runs it + posts results — lives in the workflow/action, swappable). Keep PR comment/label logic out of the package.
- **Treat the pipeline as a feature, MVP-first:** narrow but complete loop — diff in → verdict + comment + label out. Parked (per requirements): business alignment, architectural fit; deferred to later: required-merge gating, triage/cost-observability (M5L3 Deep Dive).
- **Monorepo hygiene:** the standalone package is a feature, not a bug — the action installs its deps in isolation; the app's CI is untouched.

## Historical Context (from prior changes)

- `context/foundation/ci-automation-roadmap.md:32-33,91,95,98,103` — **S-01** (full test pyramid, `ready`) and **S-02** (branch protection + release-please, `proposed`) are the slices that would turn this review into a *required* gate. Neither is done → **advisory only now**. S-02 explicitly needs a CI signal to exist first.
- `.claude/skills/10x-impl-review-ci/` — the plan-driven CI review skill (Path B's basis); a different contract than this 6-criteria/`ai-cr:*` requirement.
- M5L2 (`packages/code-reviewer`, committed `c969d40`) — the agent this change wires in; chosen SDK = Codex (OpenAI).

## Related Research

- None prior for this change. Upstream context: `context/foundation/ci-automation-roadmap.md`.

## Open Questions

1. **Verdict gating semantics:** comment+label only (advisory), or also fail the step (`exit 1`) so it shows red even though it can't block merge yet? (Leaning: advisory comment+label for MVP; flag-gated exit later.)
2. **Run the agent via `npm run review` (shell out, parse stdout) vs add a package build + import `reviewDiff`?** Shell-out is simpler for the MVP and avoids touching the package's `private`/no-`exports` setup.
3. **PR body cost tradeoff** (`requirements.md:9`): include the PR description in the prompt or drop it to save tokens? Decide in planning.
4. **Codex model/cost in CI:** no model pinned — pin a cheaper model for per-PR runs? (`reviewer.ts` has no `model` set.)
