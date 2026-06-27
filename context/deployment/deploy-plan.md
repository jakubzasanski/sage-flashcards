---
project: 10xCards
planned_at: 2026-06-17
platform: Cloudflare Workers
worker_name: 10x-cards
deploy_mode: workers-static-assets
context_type: mvp
status: deployed
live_url: https://10x-cards.bdfuh4vy77s3rwqi.workers.dev
active_version: 5b147afe-27cf-4e15-a567-53258fbdb50b
deployed_at: 2026-06-17
---

# First production deploy — 10xCards → Cloudflare Workers

## Context

`context/foundation/infrastructure.md` selected **Cloudflare Workers** as the MVP platform (zero-migration: the repo already ships `@astrojs/cloudflare` + `wrangler.jsonc`). This is the **Plan Mode deploy** step from the 10xDevs chain: a reviewed, human-gated plan for the _first_ production deploy, persisted here as the audit trail ("what was supposed to happen") before any production mutation.

Two confirmed decisions are baked in:

- **Worker renamed to `10x-cards`** before first deploy (was `10x-astro-starter`). Applied to `wrangler.jsonc`.
- **Production Supabase does not exist yet** → an explicit manual gate to create it precedes secret-setting.

End state: 10xCards live at `https://10x-cards.<account-subdomain>.workers.dev`, backed by a hosted Supabase project, secrets stored as encrypted Workers Secrets, with a known rollback path.

## Ground truth (verified against the repo)

- **Deploy mode = Workers** (NOT Pages): `wrangler.jsonc` → `main: "@astrojs/cloudflare/entrypoints/server"`, `assets.directory: "./dist"`. Deploy verb is `npx wrangler deploy`. **Pages commands do not apply.**
- **No `deploy` npm script** exists — all wrangler calls are via `npx wrangler …`.
- `compatibility_flags: ["nodejs_compat"]`, `compatibility_date: "2026-05-08"`, `observability.enabled: true` — all already set; no change needed.
- `SUPABASE_URL` / `SUPABASE_KEY` are `optional: true` in `astro.config.mjs` → **the build succeeds without them**, so a green build does NOT prove runtime config is present. They must be set as Workers Secrets for the app to function.
- **CI does not deploy** (`.github/workflows/ci.yml` = sync + lint + build only). First deploy is **manual from local**. CI auto-deploy is out of scope.
- `wrangler` v4.90 pinned devDependency; `supabase` CLI v2 present.

## Plan

### Step 0 — Persist this plan ✅ (done)

- `context/deployment/deploy-plan.md` written (this file).

### Step 1 — 🔴 MANUAL GATE: Cloudflare account + auth

- Ensure a Cloudflare account exists.
- `npx wrangler login` (interactive browser OAuth — cannot be agent-run).
- Verify: `npx wrangler whoami` (confirms account + shows the `*.workers.dev` subdomain).

### Step 2 — 🔴 MANUAL GATE: Create the production Supabase project

- Create a hosted Supabase project (dashboard) in the desired region.
- Apply schema: migrations in `supabase/migrations/` (e.g. `npx supabase link --project-ref <ref>` then `npx supabase db push`), if any exist.
- Collect: **Project URL** and **anon/public key** (back `SUPABASE_URL` / `SUPABASE_KEY`).
- Configure Supabase Auth: add the production Worker origin (`https://10x-cards.<subdomain>.workers.dev`) to allowed redirect/site URLs so email confirmation links resolve. (Subdomain is known after Step 1's `whoami`; otherwise deploy once to learn the URL, add it, redeploy.)

### Step 3 — Rename the Worker ✅ (done)

- `wrangler.jsonc`: `"name"` → `"10x-cards"`. Set once before first create (renaming after deploy orphans the old Worker).

### Step 4 — 🔴 HUMAN-GATED: Set production secrets

- `npx wrangler secret put SUPABASE_URL` → paste the prod URL.
- `npx wrangler secret put SUPABASE_KEY` → paste the prod anon key.
- Verify names exist: `npx wrangler secret list`.

### Step 5 — Build with the same gates CI uses (agent-doable)

- `npx astro sync` → `npm run lint` → `npm run build` (SSR build → `./dist`).

### Step 6 — workerd smoke test (catch edge-only failures)

- `npx wrangler dev` — runs the built Worker on **workerd**, not Node/Vite (the only local step that exercises the real runtime; `npm run dev` = `astro dev` = Node).
- Hit `/`, `/auth/signin`, `/auth/signup`, `/dashboard`; confirm no `nodejs_compat`/runtime errors.

### Step 7 — 🔴 HUMAN APPROVAL → production deploy

- `npx wrangler deploy` — uploads `./dist` + server entry, creates/promotes the `10x-cards` Worker, prints the live URL. Irreversible publish.

### Step 8 — Verify at runtime (not just locally)

- `npx wrangler tail` — watch live logs while exercising the deployed URL.
- Smoke-test live URL: home, full signup → email confirmation → signin → `/dashboard`. Validates prod secrets + redirect URLs.
- `npx wrangler deployments list` / `npx wrangler versions list` — confirm deployment recorded; note the version id for rollback.

## Rollback

- `npx wrangler versions list` → find prior good version id.
- `npx wrangler rollback [version-id]` → reverts in seconds.
- ⚠️ Supabase schema/migrations do **not** roll back with the Worker — revert DB changes separately and coordinate with the code rollback.

## Out of scope (deferred, per infrastructure.md)

- CI auto-deploy-on-merge (wiring `wrangler deploy` + `CLOUDFLARE_API_TOKEN` into GitHub Actions).
- Hyperdrive for Supabase connection pooling (add when DB load grows; cookie-based auth SSR client is fine as-is).
- Custom domain (MVP uses `*.workers.dev`).
- Durable Objects / Queues (no realtime or background jobs in the PRD).

## Verification summary

End-to-end success = all true:

1. `npx wrangler whoami` shows the account (Step 1).
2. `npx wrangler secret list` shows `SUPABASE_URL` + `SUPABASE_KEY` (Step 4).
3. `npm run build` produces `./dist` with no errors (Step 5).
4. `npx wrangler dev` serves the app on workerd with no runtime errors (Step 6).
5. `npx wrangler deploy` returns a live `10x-cards.*.workers.dev` URL (Step 7).
6. Full signup→confirm→signin→dashboard works against the live URL, `wrangler tail` clean (Step 8).

## Deploy result (2026-06-17)

- **Live URL:** `https://10x-cards.bdfuh4vy77s3rwqi.workers.dev`
- **Active version (rollback anchor):** `5b147afe-27cf-4e15-a567-53258fbdb50b` → revert with `npx wrangler rollback 5b147afe-27cf-4e15-a567-53258fbdb50b`.
- **Provisioned on first deploy:** KV namespace `10x-cards-session` (binding `SESSION`), auto-created by `wrangler deploy`.
- **Secrets:** `SUPABASE_URL` + `SUPABASE_KEY` (publishable key `sb_publishable_*`) set as Workers Secrets. NOTE: first `SUPABASE_URL` had a trailing slash/path → Supabase returned `Invalid path specified in request URL`; fixed by re-`secret put` with the bare `https://<ref>.supabase.co`.
- **workers.dev subdomain** changed at account level from `10x-cards` to `bdfuh4vy77s3rwqi` (old `*.10x-cards.workers.dev` URL is dead). New subdomain needed ~4 min for TLS cert provisioning before HTTPS responded.
- **Runtime verification:** `/`, `/auth/signin`, `/auth/signup` → 200; `/dashboard` → 302 (unauth redirect); signup probe returns a real Supabase validation error (`Password should be at least 6 characters.`), confirming secrets + DB reachable. Astro `checkOrigin` CSRF protection confirmed active (403 on cross-origin POST).

### Manual follow-ups (completed 2026-06-17)

1. ✅ **Supabase → Authentication → URL Configuration:** Site URL = `https://10x-cards.bdfuh4vy77s3rwqi.workers.dev`, Redirect URLs = `https://10x-cards.bdfuh4vy77s3rwqi.workers.dev/**`. Verified: the confirmation link landed on `GET /?code=…` on production (not localhost).
2. ✅ **Real end-to-end auth test** against the live URL with `wrangler tail` running — all Ok, no exceptions: `GET /auth/signup` → `POST /api/auth/signup` → `GET /auth/confirm-email` → `GET /?code=…` (email confirm) → `GET /auth/signin` → `POST /api/auth/signin` → `GET /dashboard` (served to the authenticated user, no redirect).

---

## Continuous deployment (S-03 — added 2026-06-27)

Deploys are **no longer manual**. `.github/workflows/deploy.yml` ships every green
`master` push automatically. The manual runbook above remains the audit trail of the
_first_ deploy and the reference for break-glass manual deploys.

### How it fires

- Trigger: `workflow_run` on the **CI** workflow concluding `success`, guarded to
  `event == 'push'` and `head_branch == 'master'`. PR runs and red runs never deploy.
- It checks out the exact `head_sha` CI validated (not the branch tip).

### Ordered steps (in `deploy.yml`)

1. `npm ci` → `npx astro sync`
2. **Build** (`npm run build`) — first, so a build failure aborts before any DB change.
3. **Migrate**: `supabase link --project-ref …` → `supabase db push --dry-run` (audit
   log) → `supabase db push`. Always before deploy, so new code never meets an old schema.
4. **Sync secrets**: `wrangler secret bulk` from the GitHub `production` environment
   (GitHub is the source of truth for the 5 runtime secrets).
5. **Deploy**: `npx wrangler deploy`.

### Required GitHub `production` environment secrets

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (`44096d3541735becbea2ae6adde06ec4`),
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, and the runtime
secrets `SUPABASE_URL`, `SUPABASE_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`.

### Prerequisite (Phase 1)

`wrangler.jsonc` declares the `SESSION` KV (`14209e17613c4ecc865acb3f58c3d036`) and
`IMAGES` bindings so the headless `wrangler deploy` never blocks on interactive
namespace provisioning.

### Failure & rollback policy

The workflow **fails loud** — no auto-rollback. Migrations are forward-only:

- **Worker**: `npx wrangler versions list` → `npx wrangler rollback <version-id>`.
- **Database**: does **not** roll back with the Worker. Use Supabase PITR and coordinate
  with the code rollback. Author migrations expand-then-contract so the currently-live
  Worker tolerates the new schema during the deploy window.
