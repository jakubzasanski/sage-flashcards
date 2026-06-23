---
bootstrapped_at: 2026-06-17T08:12:27Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10x-cards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md`.

Frontmatter:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10x-cards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack

A solo developer shipping 10xCards in a 3-week, after-hours MVP window with a hard deadline needs a battle-tested, agent-friendly starter that delivers auth, a Postgres database, and edge deploy without assembly. 10x-astro-starter is the recommended default for `(web, js)` and clears all four agent-friendly gates — TypeScript-first with Zod boundaries, opinionated layout/routing, popular in JS training data, and version-pinned docs. The PRD's auth requirements (email/password, verification, reset, 7-day sessions) map directly onto the starter's Supabase SSR auth, and AI flashcard generation rides as an external LLM call from an API route, so the `has_auth` and `has_ai` flags are set while payments, realtime, and background jobs stay out of scope per the PRD non-goals. Cloudflare Pages is the starter's shipping default; one gotcha to watch is the edge runtime's limit on long-running tasks, but the 15-second generation budget streams comfortably within it. CI runs on GitHub Actions with auto-deploy-on-merge — exactly what the starter ships with. Bootstrapper confidence is first-class, so scaffolding should be mostly smooth with occasional manual steps.

## Pre-scaffold verification

| Signal      | Value                                                     | Severity | Notes                                                               |
| ----------- | --------------------------------------------------------- | -------- | ------------------------------------------------------------------- |
| npm package | not run                                                   | n/a      | `cmd_template` is a `git clone`, not a `create-*` CLI — no npm step  |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | from card `docs_url`; within the last month                         |

`gh` CLI was unavailable; the GitHub `pushed_at` signal was retrieved via the public REST API (`curl`) as a read-only fallback.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (clone the starter repo without keeping its history)
**Exit code**: 0 (clone + `npm install` both succeeded; 774 packages added)
**Net new project files added to cwd**: 0
**Conflicts**: every top-level entry the clone shipped collided with an identical-named file already in cwd
**.gitignore handling**: scaffold copy byte-identical to cwd — no change
**node_modules handling**: scaffold's freshly-installed `node_modules` (625M, generated/gitignored) not copied — not a meaningful diff target
**.bootstrap-scaffold cleanup**: deleted

### Important context for this run

This working directory **already was** the `10x-astro-starter` repository (the user had cloned it before invoking the chain). A git-clone bootstrap into an identical directory therefore produces zero net-new files: every file the starter ships already existed, with the user's local edits (notably `CLAUDE.md`). The conflict policy's normal behaviour here is to sideline the clone's copies as `.scaffold` siblings — but since they were 100% redundant against an already-present identical repo, they were removed after the audit at the user's request, and the original tracked files were restored from `HEAD`. The scaffold step's exit code (0) and the dependency audit below are the substantive, accurate outputs of this run.

## Post-scaffold audit

**Tool**: `npm audit --json`, run against the freshly-cloned tree (lockfile + `node_modules` intact, before any move-up). Result was identical across two independent clone+install runs, confirming accuracy.
**Summary**: 0 CRITICAL, 8 HIGH, 9 MODERATE, 1 LOW (18 total)
**Direct vs transitive**: direct — 0 CRITICAL, 3 HIGH, 2 MODERATE, 0 LOW; remaining 0/5/7/1 are transitive.

#### CRITICAL findings

None.

#### HIGH findings

- **astro** (direct, range `<=7.0.0-alpha.1`) — fix available
  - Reflected XSS via unescaped slot name [GHSA-8hv8-536x-4wqp]
  - XSS via unescaped attribute names in spread props [GHSA-jrpj-wcv7-9fh9]
  - Host header SSRF in prerendered error page fetch [GHSA-2pvr-wf23-7pc7]
- **@astrojs/cloudflare** (direct, range `<=0.0.0-cf-no-prerender-chunks-... || >=10.0.0`) — fix: `@astrojs/cloudflare@9.2.1`
- **wrangler** (direct, range `<=0.0.0-kickoff-demo || >=3.7.0`) — fix: `wrangler@3.6.0`
- **@cloudflare/vite-plugin** (transitive) — fix available
- **devalue** (transitive, range `5.6.3 - 5.8.0`) — DoS via sparse array deserialization [GHSA-77vg-94rm-hx3p]
- **esbuild** (transitive, range `0.17.0 - 0.28.0`) — fix via `wrangler@3.6.0`
  - Missing binary integrity verification enables RCE via NPM_CONFIG_REGISTRY [GHSA-gv7w-rqvm-qjhr]
  - Arbitrary file read via dev server on Windows [GHSA-g7r4-m6w7-qqqr]
- **vite** (transitive, range `4.2.0-beta.0 - 8.0.3`) — fix available
  - launch-editor NTLMv2 hash disclosure via UNC path on Windows [GHSA-v6wh-96g9-6wx3]
  - `server.fs.deny` bypass on Windows alternate paths [GHSA-fx2h-pf6j-xcff]
- **ws** (transitive, range `8.0.0 - 8.20.1`) — fix via `wrangler@3.6.0`
  - Uninitialized memory disclosure [GHSA-58qx-3vcg-4xpx]
  - Memory exhaustion DoS from tiny fragments [GHSA-96hv-2xvq-fx4p]

#### MODERATE findings

- **@astrojs/check** (direct, range `>=0.9.3`) — fix: `@astrojs/check@0.9.2`
- **supabase** (direct, range `1.1.6 - 2.98.2`) — fix available
- **@astrojs/language-server** (transitive) — fix: `@astrojs/check@0.9.2`
- **js-yaml** (transitive, range `<=4.1.1`) — quadratic-complexity DoS in merge key handling [GHSA-h67p-54hq-rp68]
- **miniflare** (transitive) — fix via `wrangler@3.6.0`
- **tar** (transitive, range `<=7.5.15`) — PAX size override file smuggling [GHSA-vmf3-w455-68vh]
- **volar-service-yaml** (transitive, range `<=0.0.70`) — fix: `@astrojs/check@0.9.2`
- **yaml** (transitive, range `2.0.0 - 2.8.2`) — stack overflow via deeply nested collections [GHSA-48c2-rrv3-qjmp]
- **yaml-language-server** (transitive) — fix: `@astrojs/check@0.9.2`

#### LOW / INFO findings

- **@babel/core** (transitive, range `<=7.29.0`) — arbitrary file read via sourceMappingURL comment [GHSA-4x5r-pxfx-6jf8]

Note: bootstrapper does not auto-patch. Many fixes land via `npm audit fix`, but the `astro` and `wrangler` ranges imply major-version bumps — review before applying.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | true                 |
| has_background_jobs     | false                |

These fields were read into the run and carried into this log without automated action in v1. No CI/CD scaffolding, no feature-flag-driven scaffold changes, and no `CLAUDE.md` / `AGENTS.md` generation were performed — those belong to a future M1L4 ("Memory Architecture") skill.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- This directory is already a working clone of the starter with dependencies installed; no further scaffolding is needed. Do **not** re-run the bootstrapper against this directory — a git-clone bootstrap into an identical repo only produces redundant `.scaffold` siblings.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log. `npm audit fix` covers most; the `astro` and `wrangler` direct HIGH findings need a reviewed major-version bump.
