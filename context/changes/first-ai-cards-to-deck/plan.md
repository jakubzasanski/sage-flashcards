# First AI Cards to Deck Implementation Plan

## Overview

Implement the north-star flow (roadmap S-01): an authenticated user pastes source text, receives a batch of AI-distilled candidate flashcards, reviews each one (inline edit / accept / reject) in a session that survives a refresh, and bulk-saves the accepted cards to their deck. This is the product's core hypothesis — that pasted-text → accepted AI cards beats hand-crafting — and the only slice that can validate the "75% of AI cards accepted" success metric. It builds directly on F-01 (`flashcards` table, typed Supabase client, `CreateFlashcardCommand` DTO, RLS).

## Current State Analysis

- **F-01 is done**: `public.flashcards` (id, user_id, question, answer, `source` text CHECK 'ai'|'manual', created_at, updated_at) with RLS + 4 per-operation policies + `authenticated` GRANT. `src/types.ts` exports `Flashcard`, `CreateFlashcardCommand = Pick<FlashcardInsert,"question"|"answer"|"source">`. The Supabase SSR client is typed (`createServerClient<Database>`).
- **Auth + middleware exist**: `src/middleware.ts` resolves `context.locals.user`; `PROTECTED_ROUTES = ["/dashboard"]` redirects unauthenticated users to `/auth/signin`. API routes use uppercase `POST` exports (`src/pages/api/auth/*.ts`).
- **React-island pattern exists**: auth forms (`src/components/auth/SignInForm.tsx`) use `useState` + lucide icons, mounted via `<Form client:load />` in `.astro`. They POST via native form action → server redirect. The generator needs a **client-side `fetch` to a JSON API** instead (candidates render in place).
- **No `zod`** installed; **no LLM/AI** dependency; only `button` + `LibBadge` in `src/components/ui/`. shadcn configured (new-york, lucide, `@/components/ui`).
- **env schema** (`astro.config.mjs`) declares only `SUPABASE_URL`/`SUPABASE_KEY` as server secrets. New secrets need an `env.schema` entry + `npx astro sync`.
- **Runtime**: Cloudflare Workers (workerd). `infra.md` warns LLM access must be **fetch-based** (no Node-only SDK). `observability.enabled=true` — be careful what reaches logs.

### Key Discoveries:

- Island mount pattern: `src/pages/auth/signin.astro:8` → `<SignInForm serverError={error} client:load />`.
- API route pattern: `src/pages/api/auth/signin.ts` — `export const POST: APIRoute`, builds the client via `createClient(context.request.headers, context.cookies)`, returns/redirects.
- `createClient` returns `null` when secrets are absent (`src/lib/supabase.ts:6`) — every route must null-check.
- **Lesson (lessons.md)**: new RLS tables need explicit GRANT — N/A here (no new table), but the authenticated-client insert path relies on F-01's grant being in place.
- Per-user isolation is enforced by RLS at the DB; the save route inserts through the user's authenticated client, so `user_id` is set to `auth.uid()`-matching value and RLS `with check` guards it.

## Desired End State

A signed-in user visits `/generate`, pastes up to ~10 000 characters, and triggers generation. Within the latency budget they see up to ~30 candidate Q/A cards, each individually editable, acceptable, or rejectable. The in-progress session survives a page refresh. Clicking save persists the accepted cards (as `source: 'ai'`) to their deck in one bulk insert, shows a success confirmation, and clears the session. Source text is never written to logs or persisted server-side.

**Verification:** under `wrangler dev`, `POST /api/generate` with valid text returns a JSON array of `{question, answer}` candidates; `POST /api/cards` as user A inserts rows visible only to A; the `/generate` page completes the full paste→review→save→confirm loop; `npm run lint` and `npm run build` pass.

## What We're NOT Doing

- **No manual card creation** (FR-011) — that's S-04.
- **No anonymous-trial generation / claim-on-signup** (FR-001/FR-002) — that's S-06; `/generate` is authenticated-only.
- **No deck browse / edit / delete UI** (FR-012–014) — that's S-03. After save we confirm + clear; viewing the deck in-app comes later.
- **No spaced-repetition review** (US-02) — S-02.
- **No streaming** of candidates — single JSON response with a progress indicator.
- **No server-side persistence of source text or in-progress sessions** — localStorage only.
- **No model-picker UI** — model is env-configured and invisible (PRD non-goal).
- **No production deploy / secret-setting** — local (`wrangler dev` / `.dev.vars`) only; prod secret + deploy are separate human-gated steps.

## Implementation Approach

Three phases with curl-verifiable boundaries: first the generation service + API (the risky LLM/privacy/latency part, testable without UI), then the bulk-save API (small, RLS-backed), then the user-facing page + review island that wires both together. Server contracts are proven via curl under `wrangler dev` before any UI exists, so UI work builds on a known-good backend.

## Critical Implementation Details

- **Source-text privacy (guardrail).** The pasted text must never be logged. Do not `console.log` request bodies; do not include source text in error messages returned to the client or written to `wrangler tail`. Catch-and-rethrow LLM errors without echoing the prompt. This is a launch guardrail, not a nicety.
- **workerd-compatible LLM access.** Call OpenRouter with the global `fetch` (`https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer`), not a Node SDK. Request structured JSON output and validate with zod; on unparseable output, treat as a transient failure (one retry) then surface a clean error.
- **Latency budget (NFR).** First candidate within 15s p95; any wait >2s shows continuous progress. Single round-trip for ≤30 cards fits; the UI shows a progress state for the whole await.
- **`createClient` may be null.** Both API routes must handle the secrets-absent case (return 500 with a generic message), mirroring the auth routes.

## Phase 1: Generation service + `/api/generate`

### Overview

Stand up the OpenRouter-backed generation service and an authenticated JSON API that turns pasted text into validated candidate cards.

### Changes Required:

#### 1. Environment + dependency

**File**: `astro.config.mjs`, `package.json` (+ `.dev.vars` locally, not committed)

**Intent**: Declare the OpenRouter secret + configurable model, and add `zod` for validation.

**Contract**: `env.schema` gains `OPENROUTER_API_KEY` (`context:"server", access:"secret"`) and `OPENROUTER_MODEL` (`context:"server", access:"secret", optional:true, default:` a sensible fast/cheap model id). Add `zod` to dependencies. Run `npx astro sync` after editing the schema. `.dev.vars` gets `OPENROUTER_API_KEY` for local dev.

#### 2. Candidate types

**File**: `src/types.ts`

**Intent**: Shared DTOs for the generation request/response and a single candidate.

**Contract**: Add `GenerateRequest = { sourceText: string }`; `CandidateCard = { question: string; answer: string }`; `GenerateResponse = { candidates: CandidateCard[] }`. (Accepted cards reuse `CreateFlashcardCommand` from F-01.)

#### 3. Generation service

**File**: `src/lib/services/generation.ts` (new)

**Intent**: Encapsulate the OpenRouter call behind one function so the route stays thin and the provider is swappable/mockable. Owns the atomic-card system prompt (the PRD Business Logic distillation rule), JSON-output request, zod validation, the single transient retry, and the input cap.

**Contract**: Export `generateCandidates(sourceText: string): Promise<CandidateCard[]>`. Uses `fetch` to OpenRouter chat-completions with the env model, a system prompt instructing atomic, self-contained, unambiguous Q/A pairs returned as JSON, capped at ~30 cards. Parses the model output with a zod schema; on network/5xx/parse failure retries once, then throws a typed error. Never logs `sourceText`. Reads `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` from `astro:env/server`.

#### 4. Generate API route

**File**: `src/pages/api/generate.ts` (new)

**Intent**: Authenticated JSON endpoint that validates input and returns candidates.

**Contract**: `export const prerender = false; export const POST: APIRoute`. Rejects unauthenticated requests (`context.locals.user` null → 401). Parses JSON body, zod-validates `sourceText` (non-empty, ≤10 000 chars) → 400 on failure. Calls `generateCandidates`, returns `200 {candidates}` JSON. LLM/service failure → 502/500 with a generic message (no source text echoed). Null client/secrets → 500 generic.

### Success Criteria:

#### Automated Verification:

- `npx astro sync` succeeds after env edit
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Under `wrangler dev` with a real key in `.dev.vars`: `POST /api/generate` (authenticated) with a paragraph returns a JSON array of `{question, answer}` candidates (≤30)
- `POST /api/generate` unauthenticated → 401; oversized/empty `sourceText` → 400
- `wrangler tail` shows NO source text in logs during a generation
- A forced bad/oversized response path surfaces a clean error (no prompt leakage)

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual steps (needs a real OpenRouter key) before the commit.

---

## Phase 2: Bulk-save `/api/cards`

### Overview

Authenticated endpoint that persists accepted candidate cards to the deck in one bulk insert, RLS-enforced.

### Changes Required:

#### 1. Cards API route

**File**: `src/pages/api/cards.ts` (new)

**Intent**: Accept a batch of approved cards and write them to `flashcards` as `source:'ai'` for the current user.

**Contract**: `export const prerender = false; export const POST: APIRoute`. Unauthenticated → 401. zod-validate body as a non-empty array (≤30) of `{question, answer}` (non-empty strings). Map each to `CreateFlashcardCommand` with `source:'ai'` and `user_id = context.locals.user.id`, single `.from("flashcards").insert([...])` via the authenticated `createClient`. Returns `201 {saved: <count>}`. DB/RLS error → 500 generic; null client → 500.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Under `wrangler dev`, authenticated as user A: `POST /api/cards` with 2 cards → 201 `{saved:2}`; rows present in `flashcards` with `source='ai'`, `user_id=A`
- The same rows are NOT visible to user B (RLS isolation holds via the authenticated client path)
- Unauthenticated → 401; empty/oversized/invalid array → 400

**Implementation Note**: After automated verification passes, pause for human confirmation of the manual steps before the commit.

---

## Phase 3: `/generate` page + review island

### Overview

The user-facing flow: a protected generator page with a React island that handles input, generation, per-card review, refresh-surviving session, and bulk save.

### Changes Required:

#### 1. shadcn UI primitives

**File**: `src/components/ui/textarea.tsx`, `src/components/ui/card.tsx` (generated)

**Intent**: Add the primitives the review UI needs.

**Contract**: `npx shadcn@latest add textarea card` (new-york variant, per `components.json`).

#### 2. Protected route registration

**File**: `src/middleware.ts`

**Intent**: Gate `/generate` behind auth.

**Contract**: Add `"/generate"` to `PROTECTED_ROUTES`. No other change.

#### 3. Generator page

**File**: `src/pages/generate.astro` (new)

**Intent**: Server-rendered shell that mounts the island for an authenticated user.

**Contract**: Imports `Layout`; reads `Astro.locals.user`; renders `<GeneratorView client:load />`. Follows the `signin.astro` shell pattern.

#### 4. Generator island

**File**: `src/components/generation/GeneratorView.tsx` (new) (+ small child components as needed)

**Intent**: The whole client-side flow.

**Contract**: A `client:load` React island that:
- renders a textarea with the input cap visible before submit (FR-008: ~10 000 chars, "up to ~30 cards"), disabling submit when empty/over cap;
- on submit, `fetch("/api/generate", {POST, json})`, showing a continuous progress state while awaiting (NFR >2s);
- renders returned candidates as a list of inline-editable cards, each with accept / reject controls (FR-009);
- persists `{candidates, per-card decisions/edits}` to `localStorage` so a refresh restores the in-progress session (FR-010); clears it on save or explicit discard;
- on save, `fetch("/api/cards", {POST})` with the accepted cards, shows "N cards saved", clears the session;
- surfaces generation/save errors inline without leaking internals.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- `npx astro check` passes

#### Manual Verification:

- Under `wrangler dev`, signed in: paste text → generate → candidates render; edit one, reject one, accept the rest
- Refresh mid-review → candidates + decisions restored from localStorage
- Save → "N cards saved", session cleared; the saved cards exist in the DB for this user (verify via SQL/Studio)
- Unauthenticated visit to `/generate` → redirected to `/auth/signin`
- Over-cap input is blocked client-side with the limit shown; a generation error shows a clean inline message

**Implementation Note**: After automated verification passes, pause for human confirmation of the full manual E2E before the commit.

---

## Testing Strategy

### Unit Tests:

- None — no test runner is configured (lint + build are the gates). The LLM call is isolated behind `generation.ts` so it can be unit-tested later (S-deferred) without restructuring.

### Integration Tests:

- The curl-level API checks (Phases 1–2) and the manual E2E (Phase 3) under `wrangler dev` are the integration coverage. The two-user check confirms RLS on the save path.

### Manual Testing Steps:

1. `wrangler dev` with `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`) and Supabase secrets in `.dev.vars`.
2. Authenticated `POST /api/generate` → candidate JSON; confirm `wrangler tail` shows no source text.
3. Authenticated `POST /api/cards` → rows saved as `source='ai'`, RLS-isolated.
4. `/generate` page: paste → generate → edit/accept/reject → refresh (state restored) → save → confirmation; saved cards in DB.

## Performance Considerations

Single LLM round-trip for ≤30 cards fits the 15s p95 budget; the UI shows continuous progress during the await (NFR >2s). On workerd, the time awaiting the LLM `fetch` is I/O (not billed CPU); keep response parsing lean (zod over a bounded ≤30-item array). No other hotspots at MVP scale.

## Migration Notes

No schema changes — reuses F-01's `flashcards`. New runtime config: `OPENROUTER_API_KEY` (and optional `OPENROUTER_MODEL`) must be set as Workers Secrets for production (separate human-gated step, like the Supabase secrets in `deploy-plan.md`); the build succeeds without them but generation fails at runtime until set.

## References

- Roadmap item: `context/foundation/roadmap.md` → S-01 (`first-ai-cards-to-deck`), north star
- Foundation built on: `context/changes/card-persistence-foundation/plan.md` (F-01)
- PRD: FR-008, FR-009, FR-010, US-01; NFRs (latency, source-text privacy); Business Logic (atomic-card rule)
- Infra constraint (fetch-based LLM on workerd): `context/foundation/infrastructure.md`
- Lesson: `context/foundation/lessons.md` (RLS GRANT — relied on via F-01)
- Patterns: `src/pages/api/auth/signin.ts` (API route), `src/components/auth/SignInForm.tsx` (island), `src/pages/auth/signin.astro` (mount)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Generation service + /api/generate

#### Automated

- [x] 1.1 `npx astro sync` succeeds after env edit
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Build passes: `npm run build`

#### Manual

- [x] 1.4 Authenticated `POST /api/generate` returns ≤30 `{question,answer}` candidates (wrangler dev, real key)
- [x] 1.5 Unauthenticated → 401; empty/oversized sourceText → 400
- [x] 1.6 `wrangler tail` shows no source text during generation
- [x] 1.7 Forced bad/oversized LLM response surfaces a clean error (no prompt leakage)

### Phase 2: Bulk-save /api/cards

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Build passes: `npm run build`

#### Manual

- [ ] 2.3 Authenticated `POST /api/cards` with 2 cards → 201 {saved:2}; rows present with source='ai', user_id=A
- [ ] 2.4 Same rows NOT visible to user B (RLS isolation)
- [ ] 2.5 Unauthenticated → 401; empty/oversized/invalid array → 400

### Phase 3: /generate page + review island

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Build passes: `npm run build`
- [ ] 3.3 `npx astro check` passes

#### Manual

- [ ] 3.4 Signed in: paste → generate → candidates render; edit one, reject one, accept rest
- [ ] 3.5 Refresh mid-review restores candidates + decisions from localStorage
- [ ] 3.6 Save → "N cards saved", session cleared; saved cards exist in DB for the user
- [ ] 3.7 Unauthenticated `/generate` → redirected to `/auth/signin`
- [ ] 3.8 Over-cap input blocked client-side with limit shown; generation error shows clean inline message
