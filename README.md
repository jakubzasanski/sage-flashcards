<div align="center">

<img src="./public/favicon.svg" width="88" alt="Sage Flashcards" />

# Sage Flashcards

**Paste your notes, let AI draft flashcards, and review them on a spaced-repetition schedule.**

[![CI](https://github.com/jakubzasanski/sage-flashcards/actions/workflows/ci.yml/badge.svg)](https://github.com/jakubzasanski/sage-flashcards/actions/workflows/ci.yml)
[![Astro](https://img.shields.io/badge/Astro-7-BC52EE?logo=astro&logoColor=white)](https://astro.build/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)

[Live app](https://sage-flashcards.zasanski.workers.dev)

<img src="./public/screenshot.png" alt="Sage Flashcards landing page" width="800" />

</div>

## What it does

Sage turns raw study material into a reviewable deck and helps you remember it:

- **AI generation** — paste a passage and Sage drafts question/answer flashcards from it.
- **Accept / reject / edit review** — you decide which candidates make the cut before anything is saved; the in-progress review session survives a page refresh.
- **Spaced repetition** — saved cards are scheduled with [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) so reviews are timed to beat forgetting.
- **Accounts & auth** — email/password sign-in, sign-up, and self-serve password reset, backed by Supabase with cookie-based SSR sessions.
- **Bilingual UI** — English and Polish, resolved server-side (no flash).

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | [Astro 7](https://astro.build/) — full SSR (`output: "server"`) |
| Interactivity | [React 19](https://react.dev/) islands |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) (new-york) |
| Auth & data | [Supabase](https://supabase.com/) (`@supabase/ssr`, RLS) |
| Scheduling | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) |
| Hosting | [Cloudflare Workers](https://workers.cloudflare.com/) (`@astrojs/cloudflare`) |
| Language | [TypeScript](https://www.typescriptlang.org/) · Node 24 |

## Getting started

**Prerequisites:** Node.js v24 (see `.nvmrc`), npm, and [Docker](https://www.docker.com/) for local Supabase.

```bash
# 1. Clone
git clone https://github.com/jakubzasanski/sage-flashcards.git
cd sage-flashcards

# 2. Install
npm install

# 3. Start local Supabase (requires Docker)
npx supabase start

# 4. Configure env — copy and fill in the values printed by `supabase start`
cp .env.example .dev.vars   # Cloudflare local dev (or .env for plain Node)

# 5. Run the dev server (Cloudflare workerd runtime)
npm run dev
```

The app runs at **http://localhost:4321**.

### Environment variables

Declared in `astro.config.mjs` (`astro:env/server`) and read as Worker secrets in production:

| Variable | Required | Description |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Supabase project URL (`https://<ref>.supabase.co`, or local `http://127.0.0.1:54321`) |
| `SUPABASE_KEY` | yes | Supabase **publishable / anon** key (public, client-side safe — never the secret key) |
| `LLM_API_KEY` | yes | API key for the OpenAI-compatible chat-completions endpoint |
| `LLM_BASE_URL` | no | LLM base URL (default `https://api.openai.com/v1`) |
| `LLM_MODEL` | no | Model id (default `gpt-5-mini`) |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Dev server (Cloudflare workerd runtime) |
| `npm run build` | Production SSR build |
| `npm run preview` | Preview the production build |
| `npm run lint` / `lint:fix` | ESLint (type-checked) |
| `npm run format` | Prettier (+ astro & tailwind plugins) |
| `npm test` / `test:watch` | Unit tests (Vitest) |
| `npm run test:integration` | Integration tests (Vitest — needs local Supabase) |
| `npm run test:e2e` | End-to-end tests (Playwright — builds + previews, needs local Supabase) |

> Run `npx astro sync` after `npm install` or after editing `env.schema` to regenerate Astro's generated types.

## Testing

- **Unit** (`vitest --project unit`) — pure logic, Docker-free.
- **Integration** (`vitest --project integration`) — real local Supabase (auth, PostgREST, RLS).
- **E2E** (`playwright test`) — drives a production preview build against local Supabase + Mailpit; see `tests/e2e/CLAUDE.md` for the conventions every spec follows and `tests/e2e/seed.spec.ts` for the exemplar.
- **Mutation** — [Stryker](https://stryker-mutator.io/) is configured for spot-checking test strength.

## Project structure

```
src/
  components/      React islands (auth, generation, ui/) + Astro components
  layouts/         Shared page shells
  lib/             Supabase client, services, helpers
  pages/           Routes — incl. api/auth/* endpoints
  middleware.ts    Auth resolution + route protection (PROTECTED_ROUTES)
  i18n/            en / pl strings
supabase/migrations/   SQL migrations (RLS-enabled)
tests/                 unit · integration · e2e
context/               Project knowledge base (foundation, changes, archive)
```

Path alias: `@/*` → `./src/*`. See `CLAUDE.md` for full conventions.

## Deployment

Deployed to **Cloudflare Workers**.

```bash
npm run build
npx wrangler deploy
```

Push runtime secrets to the Worker (they are not committed):

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_KEY
npx wrangler secret put LLM_API_KEY
# LLM_BASE_URL / LLM_MODEL only if overriding the defaults
```

A staged CI/CD automation plan (full test pyramid, migrate→deploy pipeline, release automation, Dependabot) lives in [`context/foundation/ci-automation-roadmap.md`](./context/foundation/ci-automation-roadmap.md).

## License

MIT
