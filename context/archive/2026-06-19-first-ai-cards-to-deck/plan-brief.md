# First AI Cards to Deck — Plan Brief

> Full plan: `context/changes/first-ai-cards-to-deck/plan.md`

## What & Why

The north star (roadmap S-01): a signed-in user pastes source text, gets AI-distilled candidate flashcards, reviews each (edit/accept/reject), and bulk-saves the accepted ones to their deck. This is the product's core hypothesis — paste-and-accept beats hand-crafting — and the only slice that can validate the "75% of AI cards accepted" metric. Covers US-01, FR-008/009/010.

## Starting Point

F-01 is done: `flashcards` table (with `source` 'ai'|'manual', RLS, GRANT), typed Supabase client, `CreateFlashcardCommand` DTO. Auth + middleware exist; React-island pattern is established (auth forms). No `zod`, no LLM dependency, no generator UI yet. Runtime is Cloudflare Workers (workerd) — LLM access must be fetch-based.

## Desired End State

`/generate` (authenticated): paste ≤10k chars → up to ~30 candidate cards within the latency budget → inline edit / accept / reject each, session surviving refresh → bulk save accepted cards as `source:'ai'` → "N saved" confirmation + session cleared. Source text is never logged or persisted server-side.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| LLM provider | OpenRouter via `fetch` | workerd-safe (no Node SDK), model swappable invisibly | Plan (Open Q#2) |
| Transport | Single JSON response + progress | Simple, meets 15s p95 for ≤30 cards | Plan |
| Session persistence | localStorage | Survives refresh AND keeps source text off the server (privacy) | Plan |
| Validation | Add `zod` | Validate input + LLM JSON; CLAUDE.md convention | Plan |
| LLM errors | One retry on transient, then clean error | Rides out flakiness within latency budget | Plan |
| Save | Single bulk insert via authenticated client | One round-trip, RLS-enforced, matches "bulk action" | Plan |
| Post-save | Confirmation + clear (no deck browse) | Deck browse is S-03; keeps S-01 bounded | Plan |
| Route | `/generate`, added to `PROTECTED_ROUTES` | Matches middleware pattern; anon trial layered later (S-06) | Plan |
| Edit UX | Inline-editable candidate cards | Simplest; one-view per-card review | Plan |
| Model config | `OPENROUTER_MODEL` env var w/ default | Invisible + swappable per PRD, no redeploy | Plan |
| Verification | Service boundary + manual via `wrangler dev` | No test runner in repo; exercises real edge runtime | Plan |

## Scope

**In scope:** generation service (OpenRouter), `/api/generate`, `/api/cards` (bulk save), `/generate` page + review island, localStorage session, `zod`, env secret + model.

**Out of scope:** manual create (S-04), anonymous trial (S-06), deck browse/edit/delete (S-03), SRS review (S-02), streaming, server-side source-text/session persistence, model-picker UI, prod deploy/secrets.

## Architecture / Approach

`/generate` page mounts a `GeneratorView` island → `fetch POST /api/generate` (auth-gated) → `generation.ts` service calls OpenRouter via fetch, zod-validates JSON, returns candidates → island renders editable candidates, persists to localStorage → `fetch POST /api/cards` bulk-inserts accepted cards through the user's authenticated client (RLS enforces ownership). Three phases: generate API → save API → UI, each verifiable independently (the two APIs via curl under `wrangler dev` before any UI).

## Phases at a Glance

| Phase | Delivers | Key risk |
|---|---|---|
| 1. Generation service + `/api/generate` | OpenRouter-backed candidate JSON, auth-gated, capped, privacy-safe | LLM client on workerd; source-text leaking to logs |
| 2. Bulk-save `/api/cards` | Accepted cards persisted (source='ai'), RLS-enforced | Wrong user_id / RLS gap on the insert path |
| 3. `/generate` page + review island | Full paste→review→save UX, refresh-surviving | Island state + localStorage correctness |

**Prerequisites:** F-01 (done); a local OpenRouter API key in `.dev.vars`; Docker/Supabase running for the save path.
**Estimated effort:** ~2-3 sessions across 3 phases.

## Open Risks & Assumptions

- LLM card quality must clear the 75%-accept bar — prompt iteration is expected and ongoing (the whole product bet).
- OpenRouter `fetch` works under workerd (per infra.md) — verify under `wrangler dev`, not just `astro dev`.
- Generation latency depends on the chosen model; the default must be fast enough for 15s p95.
- Privacy guardrail relies on discipline (no logging source text) — enforced in the service + routes, checked via `wrangler tail`.

## Success Criteria (Summary)

- A signed-in user completes paste → generate → edit/accept/reject → save → confirmation, end-to-end under `wrangler dev`.
- Saved cards persist as `source:'ai'`, owned by and visible only to that user (RLS).
- No source text appears in logs; `npm run lint` + `npm run build` pass.
