# Repository Guidelines

Astro 6 SSR app (`output: "server"`) with React 19 islands, Tailwind 4, Supabase cookie-based auth, and shadcn/ui, deployed to Cloudflare Workers. See @CLAUDE.md for full architecture and conventions.

## Hard rules

- Run `npx astro sync` after `npm install` and after editing the `env.schema` in @astro.config.mjs. It generates the `astro:env` virtual module types; type-checked lint and `astro build` fail without it. CI runs it before lint.
- Every API route under `src/pages/api/` must export `const prerender = false` — pages are server-rendered by default.
- Merge Tailwind classes with `cn()` from `@/lib/utils` (clsx + tailwind-merge); never concatenate class strings.
- Add React islands only when interactivity is needed; no Next.js directives (`"use client"`). Extract hooks to `src/components/hooks/`.
- New Supabase tables: enable RLS with granular per-operation, per-role policies. Migrations go in `supabase/migrations/`, named `YYYYMMDDHHmmss_description.sql`.

## Project structure

`src/pages/` holds routes (`api/` endpoints, `auth/` pages); `src/components/` holds UI (`ui/` is shadcn "new-york", `auth/` is form widgets); plus `src/layouts/`, `src/lib/` (helpers; `services/` for extracted business logic), and `src/styles/`. Path alias `@/*` maps to `src/*`. Shared entities and DTOs go in `src/types.ts`.

## Commands

- `npm run dev` — dev server (Cloudflare workerd runtime)
- `npm run build` — SSR production build
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier
- `npx astro check` — one-off type check

No test runner is configured; `lint` + `build` are the only validation gates.

## Style

TypeScript throughout, Node 22 (@.nvmrc). ESLint + Prettier (prettier-plugin-astro, prettier-plugin-tailwindcss) enforce style; the pre-commit hook runs `eslint --fix` on `*.{ts,tsx,astro}`. Validate API input with zod; export uppercase `GET`/`POST` handlers.

## Commits & CI

Conventional Commits with scopes (`feat(redesign):`, `fix(ci):`, `chore:`). PRs target `master`. CI runs `astro sync` → `lint` → `build`, and requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.

## Configuration

`SUPABASE_URL` and `SUPABASE_KEY` are server-only secrets. Copy `.env.example` to `.env` (Node) or `.dev.vars` (Cloudflare local dev). Local Supabase: `npx supabase start` (requires Docker).
