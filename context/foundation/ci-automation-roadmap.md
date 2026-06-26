# Roadmap: Better CI/CD & Automation — Sage Flashcards

> Stack: Astro 7 (SSR) · @astrojs/cloudflare v14 · React 19 · Tailwind 4 · Supabase · Cloudflare Workers (`10x-cards`) · Node 24.
> Source: parallel research workflow `ci-automation-research` (2026-06-25). This doc is the plan; each phase is sized to hand to `/10x-plan` → `/10x-implement`.

## TL;DR — the shape of the work

Today CI is a single job: `lint + unit + build` on push/PR to master. No e2e/integration in CI, no deploy, no versioning, no dependency bot, no branch protection. Deploys (Supabase migrations + `wrangler deploy`) are manual.

The 7 asks collapse into **5 dependency-ordered phases**. The big realization: **asks #3 (version bump on merge), #4 (changelog), and #5 (branch-per-change) are one solution** — Conventional Commits + squash-merge + branch-protection ruleset + **release-please**. Don't build them separately.

```
Phase 0  Rebrand & identity        (M)  ── independent; includes Worker rename migration (decided)
Phase 1  CI: full test pyramid     (M)  ── foundation; gates + deploy depend on green CI
Phase 2  Branch flow + releases    (M)  ── asks #3+#4+#5 as ONE thing (release-please)
Phase 3  CD: deploy on release     (M)  ── asks #1(deploy) + #2 (Supabase→Cloudflare, ordered)
Phase 4  Dependency automation     (S)  ── ask #6 (Dependabot + auto-merge)
Phase 5  Extra tooling (optional)  (M)  ── what else I recommend (prioritized top-5)
```

Asks #1(tests) → Phase 1 · #2 → Phase 3 · #3/#4 → Phase 2 · #5 → Phase 2 · #6 → Phase 4 · #7(icon) → Phase 0 · rename → Phase 0 · "co jeszcze" → Phase 5.

---

## Phase 0 — Rebrand to "Sage Flashcards" + GitHub identity  `[S]`

Do the rename in **two tracks** (research-recommended).

### Track A — in-repo identifiers (low-risk, do now)
Rename `10x-astro-starter` / `10x-cards` **project** references → `sage-flashcards`:
- `package.json` `name` (+ `package-lock.json` top-level name) → `sage-flashcards`
- `supabase/config.toml` `project_id` → `sage-flashcards`
- `CLAUDE.md` prose; any hardcoded repo/docs URLs (e.g. config-status `docsUrl`). (`README.md` gets a full rewrite — see dedicated task below.)
- `astro.config.mjs` `site` URL → **changes** to the new `…sage-flashcards…workers.dev` URL (because the Worker is being renamed — see Track B). Update the Supabase Auth Site URL + Redirect URLs to match.

⚠️ **Leave alone** — these are 10xDevs **course tooling**, not the project name: `.claude/skills/10x-*`, `.agents/skills/10x-*`, `skills-lock.json`, `.claude/.10x-cli-manifest.json`, and the `10x-cli`/`10xDevs` references throughout `context/`.

### Track B — Cloudflare Worker rename → `sage-flashcards`  🔒 DECIDED (full rebrand)
> You chose to rename the Worker too (overrides the research default of keeping `10x-cards`). This provisions a **brand-new** Worker and **orphans** the old one — execute this migration checklist as discrete tasks, ideally **before** Phase 3 so CD targets the new Worker:
1. Set `wrangler.jsonc` `name` → `sage-flashcards`.
2. `wrangler kv namespace create SESSION` for the new Worker → put the id in `wrangler.jsonc` `kv_namespaces` (the old namespace doesn't carry over).
3. `npm run build && npx wrangler deploy` once to create the new Worker → note the new `sage-flashcards.<sub>.workers.dev` URL.
4. Re-add all 5 runtime secrets to the new Worker: `wrangler secret put SUPABASE_URL|SUPABASE_KEY|LLM_API_KEY|LLM_BASE_URL|LLM_MODEL` (secrets are per-Worker; they do **not** migrate).
5. Update `astro.config.mjs` `site` + **Supabase Auth Site URL & Redirect URLs** to the new origin (else auth/password-reset redirects break).
6. Verify the new URL serves + auth works, then **delete the old `10x-cards` Worker** in the Cloudflare dashboard.
7. (Optional, recommended) add a **custom domain** (e.g. `app.sage-flashcards.com`) so future URL churn is zero.

> ⚠️ Effort for Phase 0 rises to **M** because of this migration (was S). Do it in one sitting to avoid a half-renamed state.

### GitHub repo rename
`jakubzasanski/10x-astro-starter` → `sage-flashcards`. GitHub **auto-redirects** the old URL; re-point the remote with one command (`git remote set-url origin …`); fork link is preserved.

### Branding assets (ask #7)
**Correction:** a GitHub repo has **no favicon** — github.com serves its own. The real surfaces are:
1. **Repo Social Preview** — 1280×640 (2:1) PNG <1MB, Settings → General. The card shown when the link is shared.
2. **Account avatar** — ≥500×500 PNG (account-level, affects all your repos).
3. *(optional)* Profile README banner.

Deliverable: one master **dark-background** (#1a1a1a plate) Sage-leaf SVG (gradient `#84B673→#4E7C4D`) → export a square avatar + a 1280×640 social card with the "Sage Flashcards" wordmark. Plus optionally a dark **maskable** PWA icon + `apple-touch-icon` in `public/` wired in `Layout.astro`.

### README rewrite — real project page + screenshot
The current `README.md` is the **generic starter template** (titled "10x Astro Starter", says Astro v6, clones the *upstream* `przeprogramowani/10x-astro-starter`, shows the placeholder `public/template.png`). Replace it end-to-end with a real **Sage Flashcards** project README:
- **Title + one-line pitch:** "Sage Flashcards — paste your notes, let AI draft flashcards, review on an FSRS schedule."
- **Hero image:** a real **app screenshot** (not `template.png`) — capture the `/generate` and/or `/dashboard` screens of the running app, save to `public/` (or `docs/`/`.github/`), e.g. `public/screenshot.png`, and embed at the top. *(Bundle the capture with the `verify`/`run` flow, or use the `web-perf`/Chrome DevTools tooling to screenshot the live Worker.)* Optionally use the new dark social-preview card as the banner.
- **Sections:** features (AI generation, accept/reject review, spaced repetition, auth, password reset) · tech stack (correct versions: **Astro 7**, React 19, Tailwind 4, Supabase, Cloudflare Workers) · getting started (clone **your** repo URL, `npm install`, local Supabase, `.dev.vars`) · scripts · testing (unit/integration/e2e) · deployment (Cloudflare) · license.
- **Fix the clone URL** to the renamed `sage-flashcards` repo (not upstream); add CI/build **status badges** once Phase 1 lands.
- Delete `public/template.png` once it's no longer referenced.

**Files:** `package.json`, `package-lock.json`, `supabase/config.toml`, `README.md` (full rewrite), `CLAUDE.md`, `public/` (new icons + app screenshot, remove `template.png`), `src/layouts/Layout.astro`.

---

## Phase 1 — CI: full test pyramid  `[M]`

Expand `.github/workflows/ci.yml` into **three parallel jobs** off a fast base + a nightly safety net. Use `supabase/setup-cli` + `supabase start` (NOT a bare `services: postgres` — the tests need GoTrue admin API, PostgREST **and** Mailpit on :54324, all of which `supabase start` provisions with the exact demo keys `test/support/config.ts` hardcodes). **No GitHub secrets required for the test jobs.**

| Job | Runs | Gate |
|---|---|---|
| `lint-unit-build` | lint + `npm test` (unit) + `astro build` — Docker-free, ~2 min | **required** |
| `integration` | `supabase start` → `npm run test:integration` | **required** |
| `e2e` | `supabase start` + cached Playwright Chromium → `npm run test:e2e`, upload report/traces | **required** (recommended; see decisions) |

Plus:
- Top-level `concurrency: { group: …${{ github.ref }}, cancel-in-progress: true }` (free win, halves minutes).
- `actions/cache@v4` on `~/.cache/ms-playwright` keyed by `package-lock.json`; install `chromium --with-deps` only (config is single-project).
- `actions/upload-artifact@v4` for `playwright-report/` + `test-results/` (`if: !cancelled()`).
- New `.github/workflows/nightly-e2e.yml` (`cron` + `workflow_dispatch`) as the flake early-warning net.
- No sharding / no browser matrix (4 specs, 1 browser — premature).

**Quick win to bundle here:** enable **GitHub secret scanning + push protection** (Settings → Code security — one toggle, highest-value/lowest-effort security control given the repo handles `SUPABASE_KEY`/`LLM_API_KEY`-shaped values).

**Files:** `.github/workflows/ci.yml`, `.github/workflows/nightly-e2e.yml`.

---

## Phase 2 — Branch-per-change + version bump + changelog (asks #3 + #4 + #5)  `[M]`

One coherent system. The repo already writes **100% Conventional Commits**, so this is mostly wiring.

1. **Branch protection ruleset** on `master`: require a PR · require the Phase-1 CI checks · require branch up-to-date · **linear history** · **squash-merge only**.
   - *Why squash:* the squash subject defaults to the PR title, which we lint to Conventional Commits → every merge lands exactly one conventional commit → release-please parses it cleanly. Merge/rebase would leak "wip" commits that mis-drive the bump.
2. **Conventional-commit enforcement:** `@commitlint/config-conventional` via the **existing husky** (commit-msg hook, fast local feedback) **+** `amannn/action-semantic-pull-request@v6` (pin `v6.1.1`) to lint the PR title (the squash source of truth).
3. **release-please** (`googleapis/release-please-action@v4`, `release-type: node`) — this is **both** the version bumper **and** the changelog generator (asks #3 + #4 in one tool):
   - Merges accumulate into a standing **"Release PR"** that previews the next semver + `CHANGELOG.md`.
   - Merging *that* PR = bump `package.json`/lock + write `CHANGELOG.md` + tag `vX.Y.Z` + GitHub Release. Code-merged is decoupled from version-cut (right for an app).
   - Seed `.release-please-manifest.json` → `{ ".": "1.0.1" }` and add `release-please-config.json`.
   - Exposes `release_created` + `tag_name` → the hook for **tag-then-deploy** in Phase 3.

> Why not changesets/semantic-release: changesets needs a manual `.changeset/*.md` per PR (friction, no payoff for one app); semantic-release tags on *every* qualifying merge (over-tags an unpublished app). release-please's review-before-cut model fits best.

**Files:** `release-please-config.json`, `.release-please-manifest.json`, `.github/workflows/release.yml`, `commitlint.config.js`, `.husky/commit-msg`, `.github/workflows/pr-title-lint.yml`. Branch ruleset is a GitHub Settings/API step (after Phase 1 checks exist so their names are registerable).

---

## Phase 3 — CD: migrations → Worker deploy, gated on a release (asks #1-deploy + #2)  `[M]`

New `.github/workflows/deploy.yml`, triggered by `workflow_run` of **CI** success on `master` (`conclusion == 'success'` AND `head_branch == 'master'`) — or gated on release-please's `release_created` (tag-then-deploy). **Two sequential jobs in one file so ordering is guaranteed:**

1. **`migrate`** (Supabase) — `supabase/setup-cli` → `supabase link --project-ref vntwhoqvtsuyrdosjrgc` → `supabase db push` (idempotent; forward-only; tracked in `supabase_migrations`). 🔒 **DECIDED: fully automatic on green CI — no manual approval gate.** Still wrap in a GitHub **`production` environment** for *environment-scoped secrets* (just don't add the required-reviewer rule). **Safety compensations for skipping the gate** (do these, since the DB step is destructive + non-rollbackable): run `supabase db push --dry-run` and fail on unexpected diffs; keep migrations **expand-then-contract** (additive first, drop in a later release) so a bad deploy never breaks live; rely on Supabase PITR / a pre-push `supabase db dump` as the rollback net.
2. **`deploy-worker`** (`needs: migrate`) — build → `cloudflare/wrangler-action@v4` `command: deploy`, pushing the 5 runtime secrets via the action's `secrets:` input (`wrangler secret bulk`). **Migrations always land before the Worker** that depends on the new schema. Favor expand-then-contract migrations so a partial deploy never breaks live.

**Prerequisite:** declare the adapter-required bindings in `wrangler.jsonc` so deploy is **non-interactive** (auto-provisioning prompts hang headless runners): create a SESSION KV namespace (`wrangler kv namespace create SESSION`) → add `kv_namespaces` + `images` (IMAGES) bindings.

**Per-PR preview deploys** (also a Phase-5 top-5 item): `wrangler versions upload` on `pull_request` → post the preview URL as a PR comment. Keep disabled for external-fork PRs (no secrets).

**Files:** `.github/workflows/deploy.yml`, `.github/workflows/preview.yml`, `wrangler.jsonc`.

**Secrets (GitHub `production` environment):** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`=`vntwhoqvtsuyrdosjrgc`, `CLOUDFLARE_API_TOKEN` (Workers Scripts:Edit + Account:Read + Workers KV Storage:Edit + Memberships:Read), `CLOUDFLARE_ACCOUNT_ID`, and `SUPABASE_URL`/`SUPABASE_KEY`/`LLM_API_KEY` (+ optionally `LLM_BASE_URL`/`LLM_MODEL`).

---

## Phase 4 — Dependency automation (ask #6)  `[S]`

**Dependabot** (not Renovate): native to GitHub, zero infra, and every constraint maps to a native field. `.github/dependabot.yml`:
- ecosystems: `npm` + `github-actions`.
- **`ignore` `version-update:semver-major`** for `eslint` (must stay on 9), and flag framework majors (`astro`, `@astrojs/cloudflare`, `react`/`react-dom`, `tailwindcss`, `wrangler`) for manual review.
- `groups` minor+patch to collapse noise; weekly schedule.
- Safe **auto-merge** via a companion workflow (`dependabot/fetch-metadata@v3` + `gh pr merge --auto`) — merges only after the required CI checks pass. Dependabot PR titles are already conventional (`build(deps): …`), so they pass Phase-2 PR-title lint.

> Renovate is more powerful but its value (custom managers, monorepo, automerge infra) is wasted on a single-maintainer fork.

**Files:** `.github/dependabot.yml`, `.github/workflows/dependabot-automerge.yml`.

> ⚠️ **Do not add `.github/dependabot.yml` to master until Phase 4 is intentionally started** — GitHub activates Dependabot the moment that file lands on the default branch, and auto-merge needs the Phase-2 branch-protection `ci` check first or `gh pr merge --auto` merges with no gate. The two configs below are research-drafted and ready to paste when that time comes.

<details><summary>Ready-to-use <code>.github/dependabot.yml</code></summary>

```yaml
# Dependabot config for sage-flashcards
# Docs: https://docs.github.com/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly", day: "monday", time: "06:00", timezone: "Europe/Warsaw" }
    open-pull-requests-limit: 10
    labels: ["dependencies"]
    versioning-strategy: "increase"
    ignore:
      # ESLint 10 breaks eslint-plugin-react / jsx-a11y -> hard pin to v9.
      - { dependency-name: "eslint", update-types: ["version-update:semver-major"] }
      # Framework / platform majors need migration work + manual verification.
      - { dependency-name: "astro", update-types: ["version-update:semver-major"] }
      - { dependency-name: "@astrojs/cloudflare", update-types: ["version-update:semver-major"] }
      - { dependency-name: "@astrojs/react", update-types: ["version-update:semver-major"] }
      - { dependency-name: "react", update-types: ["version-update:semver-major"] }
      - { dependency-name: "react-dom", update-types: ["version-update:semver-major"] }
      - { dependency-name: "@types/react", update-types: ["version-update:semver-major"] }
      - { dependency-name: "@types/react-dom", update-types: ["version-update:semver-major"] }
      - { dependency-name: "tailwindcss", update-types: ["version-update:semver-major"] }
      - { dependency-name: "@tailwindcss/vite", update-types: ["version-update:semver-major"] }
      - { dependency-name: "wrangler", update-types: ["version-update:semver-major"] }
      - { dependency-name: "@supabase/supabase-js", update-types: ["version-update:semver-major"] }
      - { dependency-name: "@supabase/ssr", update-types: ["version-update:semver-major"] }
      - { dependency-name: "supabase", update-types: ["version-update:semver-major"] }
      - { dependency-name: "typescript", update-types: ["version-update:semver-major"] }
      - { dependency-name: "zod", update-types: ["version-update:semver-major"] }
    groups:
      all-minor-patch:
        applies-to: version-updates
        update-types: ["minor", "patch"]
    commit-message: { prefix: "chore(deps)", prefix-development: "chore(deps-dev)", include: "scope" }

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly", day: "monday", time: "06:00", timezone: "Europe/Warsaw" }
    open-pull-requests-limit: 5
    labels: ["dependencies", "github-actions"]
    groups:
      github-actions:
        applies-to: version-updates
        patterns: ["*"]
        update-types: ["minor", "patch"]
    commit-message: { prefix: "chore(ci)", include: "scope" }
```
</details>

<details><summary>Ready-to-use <code>.github/workflows/dependabot-automerge.yml</code></summary>

```yaml
name: Dependabot auto-merge
# Auto-merges low-risk Dependabot PRs (patch any; minor dev-deps) AFTER required CI passes.
# Prereqs: Settings>General>Allow auto-merge ON; master branch-protection requires the "ci"
# check; Settings>Code security>Dependabot "Allow Actions to create/approve PRs" if approvals required.
on: pull_request
permissions: { contents: write, pull-requests: write }
jobs:
  automerge:
    runs-on: ubuntu-latest
    if: github.actor == 'dependabot[bot]'
    steps:
      - id: meta
        uses: dependabot/fetch-metadata@v3
        with: { github-token: "${{ secrets.GITHUB_TOKEN }}" }
      - if: >-
          steps.meta.outputs.update-type == 'version-update:semver-patch' ||
          (steps.meta.outputs.dependency-type == 'direct:development' &&
           steps.meta.outputs.update-type == 'version-update:semver-minor')
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```
</details>

---

## Phase 5 — Additional tooling I recommend (the "co jeszcze")  `[M, optional]`

Prioritized top-5 (ship in order; the first two are nearly free):

1. **Concurrency groups + e2e-trace-on-failure** — folded into Phase 1 already; called out as the #1 zero-cost win.
2. **Secret scanning + push protection** — folded into Phase 1; one toggle, highest security ROI.
3. **Per-PR Cloudflare preview deploy** (`wrangler versions upload`) — folded into Phase 3; uniquely valuable because workerd diverges from `astro dev`.
4. **CodeQL** (`github/codeql-action`, JS/TS) — free static security analysis on PR; advisory or required.
5. **Test coverage reporting** — `vitest --coverage` + Codecov (tokenless on public repos); report/trend first, gate later.

Then, as appetite allows: **Stryker** mutation testing (already configured) on a weekly/nightly cron · **Lighthouse-CI / web-vitals budget** on PR (pairs with the `web-perf` skill) · **CODEOWNERS** + PR/issue templates · **README status badges** · SHA-pin all third-party actions (supply-chain hardening for a public fork).

---

## Consolidated decisions — 🔒 LOCKED 2026-06-25

| # | Decision | Choice |
|---|---|---|
| D1 | Rename GitHub repo → `sage-flashcards`? | 🔒 **Yes** (auto-redirect, 1-cmd remote re-point) |
| D2 | Cloudflare Worker name | 🔒 **Rename → `sage-flashcards`** (full rebrand; run the Track B migration checklist — new URL, re-add secrets, delete old Worker, update Supabase URLs) |
| D3 | Branded URL via custom domain? | Recommended alongside the Worker rename to end URL churn (optional) |
| D4 | e2e in PR: blocking vs nightly-only | 🔒 **Blocking** (4 specs, cheap; catches auth/review regressions) |
| D5 | Deploy trigger | 🔒 **Fully automatic on green CI** (no approval gate; rely on dry-run + expand/contract + PITR) |
| D6 | Merge strategy | **Squash-only** (clean conventional history for release-please) |
| D7 | Auto-merge scope (Dependabot) | Patches + dev-dep minors |
| D8 | SHA-pin actions vs floating `@vN` | SHA-pin (public fork) |

**Execution status:** roadmap approved as the document; implementation **not started** (per your choice "na razie tylko roadmapa"). Resume by handing a phase to `/10x-plan` → `/10x-implement`.

## Secrets checklist (one-time setup)
- **CI test jobs:** none (local Supabase demo keys are hardcoded + reproduced by `supabase start`).
- **Deploy (`production` env):** `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_KEY`, `LLM_API_KEY` (+ optional `LLM_BASE_URL`, `LLM_MODEL`).

## Pinned action versions (verify at implement time)
`actions/checkout@v4` · `actions/setup-node@v4` · `actions/cache@v4` · `actions/upload-artifact@v4` · `supabase/setup-cli` (current major) · `cloudflare/wrangler-action@v4` · `googleapis/release-please-action@v4` · `amannn/action-semantic-pull-request@v6.1.1` · `dependabot/fetch-metadata@v3` · `github/codeql-action@v3`.
