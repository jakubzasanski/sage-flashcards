# Card Persistence Foundation Implementation Plan

## Overview

Create the first data-layer foundation for 10xCards: a user-owned `flashcards` table with row-level security and AI-vs-manual origin tracking, plus a typed access surface. This is roadmap item **F-01** — a minimal cross-cutting enabler that unlocks S-01 (save AI cards to deck), S-03 (browse/edit/delete), and S-04 (manual create). It establishes the project's migration and RLS conventions for every table that follows.

## Current State Analysis

- **No data layer exists.** There is no `supabase/migrations/` directory — only `supabase/config.toml` (Postgres major v17, project `10x-astro-starter`). This change creates the migrations directory and the first migration.
- **Supabase access is untyped.** `src/lib/supabase.ts` returns `createServerClient(...)` with no `Database` generic; there is no `src/types.ts` despite CLAUDE.md mandating shared entities/DTOs live there.
- **RLS is the correct enforcement layer.** `src/middleware.ts` resolves the authenticated user into `context.locals.user` via the cookie-based SSR client; queries made through that client carry the user JWT, so `auth.uid()`-scoped policies enforce per-user isolation without app-level filtering.
- **The Supabase CLI v2 is a dependency** (`supabase@^2.23.4`), so `supabase migration`, `supabase db reset/lint`, and `supabase gen types` are available. No npm scripts wrap them yet — calls are `npx supabase …`.
- **Production DB is already live** (per `context/deployment/deploy-plan.md`). Per decision, production `db push` is deferred to a separate human-gated step; this change targets the **local** Supabase only.

### Key Discoveries:

- Migration convention (CLAUDE.md): `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`; "Always enable RLS on new tables with granular per-operation, per-role policies."
- Shared types convention (CLAUDE.md): entities/DTOs in `src/types.ts`; path alias `@/*` → `./src/*`.
- SSR client construction lives in `src/lib/supabase.ts:5-24` — the single place to add the `Database` generic.
- `enable_confirmations = false` locally (`supabase/config.toml:209`) but on in production — irrelevant to this schema migration, noted only to avoid confusion.

## Desired End State

A `flashcards` table exists in the local Supabase database with RLS enabled and four granular per-operation policies scoping every row to its owner. The Supabase client is typed against a generated `Database` type, and `src/types.ts` exposes a `Flashcard` entity plus create/update DTOs. `npx astro sync && npm run lint && npm run build` all pass. A second authenticated user cannot read or mutate the first user's cards.

**Verification:** a catalog query shows `flashcards.relrowsecurity = true` with 4 rows in `pg_policies` for the table; `npx supabase db lint --schema public` (generic schema/typing gate) passes; the generated `src/db/database.types.ts` contains `flashcards` Row/Insert/Update; an insert as user A is invisible to user B.

## What We're NOT Doing

- **No spaced-repetition schedule columns** (due date, interval, ease, etc.) — deferred to S-02, whose SRS-library choice determines their shape. Adding them now would be speculative.
- **No production `db push`** — that is a separate human-gated deploy step.
- **No seed data.**
- **No API routes, services, or UI** — those are S-01/S-03/S-04. This change stops at the schema + type contract.
- **No card-content length/format constraints** beyond NOT NULL — input caps (FR-008) are enforced at the application layer in S-01.
- **No `decks` or multi-deck model** — the PRD has a single implicit per-user deck; cards belong directly to a user.

## Implementation Approach

Two phases with a clean verification boundary: first the SQL migration applied and proven against local Postgres, then the TypeScript surface generated from that proven schema. Generating types only after the migration is applied guarantees the types reflect reality rather than a hand-authored guess.

## Critical Implementation Details

- **`updated_at` via `moddatetime`.** Use Supabase's `moddatetime` extension (in the `extensions` schema) for the auto-update trigger rather than a hand-written PL/pgSQL function — it is the platform-standard pattern and keeps the migration short. The extension must be created in the migration before the trigger references it.
- **Local Supabase requires Docker.** `npx supabase start` needs Docker running; this is a hard prerequisite for Phase 1 verification. If Docker is unavailable, the migration SQL can still be authored but cannot be applied or type-generated locally — do not mark Phase 1 verified in that case.

## Phase 1: Schema migration & RLS

### Overview

Author and apply the `flashcards` table migration with RLS and per-operation policies, establishing the project's migration convention.

### Changes Required:

#### 1. Flashcards table migration

**File**: `supabase/migrations/<timestamp>_create_flashcards.sql` (generate `<timestamp>` with `date -u +%Y%m%d%H%M%S` at implementation time)

**Intent**: Create the `flashcards` table owned per-user, with AI-vs-manual origin tracking and auto-maintained timestamps; enable RLS and add granular per-operation policies so each user sees and mutates only their own cards. Add a composite index to support owner-scoped, recency-ordered deck browse (S-03 / FR-012 / the <300ms NFR).

**Contract**: Table `public.flashcards` with columns: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `question text not null`, `answer text not null`, `source text not null check (source in ('ai','manual'))`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`. RLS enabled with four policies (`select`, `insert`, `update`, `delete`) for role `authenticated`, each asserting `auth.uid() = user_id` (insert uses `with check`, update uses both `using` and `with check`). Index `flashcards_user_id_created_at_idx on (user_id, created_at desc)`. The exact migration body (this is the contract downstream slices and the type generation depend on):

```sql
create extension if not exists moddatetime schema extensions;

create table public.flashcards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  question    text not null,
  answer      text not null,
  source      text not null check (source in ('ai', 'manual')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index flashcards_user_id_created_at_idx
  on public.flashcards (user_id, created_at desc);

create trigger flashcards_set_updated_at
  before update on public.flashcards
  for each row execute procedure extensions.moddatetime (updated_at);

alter table public.flashcards enable row level security;

create policy "flashcards_select_own" on public.flashcards
  for select to authenticated using (auth.uid() = user_id);
create policy "flashcards_insert_own" on public.flashcards
  for insert to authenticated with check (auth.uid() = user_id);
create policy "flashcards_update_own" on public.flashcards
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "flashcards_delete_own" on public.flashcards
  for delete to authenticated using (auth.uid() = user_id);
```

### Success Criteria:

#### Automated Verification:

- Local Supabase is running: `npx supabase start`
- Migration applies cleanly from scratch: `npx supabase db reset`
- RLS is enabled with all four policies present (catalog assertion — `db lint` does NOT check this): `psql "$LOCAL_DB_URL" -tAc "select relrowsecurity from pg_class where relname='flashcards'"` returns `t`, and `psql "$LOCAL_DB_URL" -tAc "select count(*) from pg_policies where tablename='flashcards'"` returns `4`
- Schema/typing lint passes (generic gate, not an RLS check): `npx supabase db lint --schema public`

#### Manual Verification:

- As authenticated user A, an inserted card is readable by A
- The same card is NOT readable or mutable by a second authenticated user B (RLS isolation holds)
- Updating a card bumps `updated_at`; `created_at` is unchanged

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Typed entity surface

### Overview

Generate the `Database` type from the applied schema, type the Supabase client, and expose the `Flashcard` entity and DTOs from `src/types.ts`.

### Changes Required:

#### 1. Generated database types

**File**: `src/db/database.types.ts` (generated)

**Intent**: Produce the canonical `Database` type from the live local schema so all DB access is compile-time-checked against reality.

**Contract**: File generated by `npx supabase gen types typescript --local > src/db/database.types.ts`, exporting `Database` with `public.Tables.flashcards` Row/Insert/Update. Regenerated after any future migration. (No snippet — output is tool-generated.)

#### 2. Typed Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Parameterize the SSR client with the generated `Database` type so query results and inserts are typed end-to-end.

**Contract**: Import `type { Database } from "@/db/database.types"`; change `createServerClient(...)` to `createServerClient<Database>(...)`. Return type becomes `SupabaseClient<Database> | null`. No behavioral change.

#### 3. Entity and DTO surface

**File**: `src/types.ts` (new)

**Intent**: Expose the card entity and the create/update command DTOs that S-01/S-03/S-04 will consume, per the CLAUDE.md convention that shared types live here.

**Contract**: Re-export from the generated `Database` type — `Flashcard` (Row), `FlashcardInsert`, `FlashcardUpdate`; a `CardSource = "ai" | "manual"` union; and DTOs `CreateFlashcardCommand = Pick<FlashcardInsert, "question" | "answer" | "source">` and `UpdateFlashcardCommand = Pick<FlashcardUpdate, "question" | "answer">` (origin is immutable after creation).

### Success Criteria:

#### Automated Verification:

- Type generation produces a non-empty file containing `flashcards`: `npx supabase gen types typescript --local > src/db/database.types.ts`
- Astro types regenerate: `npx astro sync`
- Lint passes (type-checked): `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Generated `src/db/database.types.ts` includes `flashcards` Row/Insert/Update with the expected columns
- `import type { Flashcard, CreateFlashcardCommand } from "@/types"` resolves in an editor with correct field types

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before considering the change complete.

---

## Testing Strategy

### Unit Tests:

- None — no test runner is configured in this repo (`lint` + `build` are the validation gates per CLAUDE.md). Correctness is established by the migration applying cleanly, `db lint` passing, and the RLS isolation manual check.

### Integration Tests:

- The RLS two-user isolation check (Phase 1 manual) is the integration-level guarantee that matters for this foundation.

### Manual Testing Steps:

1. `npx supabase start`, then `npx supabase db reset` — confirm the migration applies with no errors.
2. Using Supabase Studio (local, port 54323) or `psql`, sign in / impersonate two users; insert a card as user A; confirm user B sees zero rows and cannot update/delete A's card.
3. Update a card and confirm `updated_at` advanced while `created_at` held.
4. Run the Phase 2 toolchain (`gen types` → `astro sync` → `lint` → `build`) and confirm green.

## Performance Considerations

The `(user_id, created_at desc)` index directly serves the owner-scoped, recency-ordered browse query (S-03 / FR-012) and keeps it within the <300ms NFR for sub-1000-card decks. No other performance concerns at MVP scale (small users, low QPS).

## Migration Notes

- This is the first migration; it creates `supabase/migrations/`. Follow the `YYYYMMDDHHmmss_short_description.sql` naming.
- **Production rollout is deferred and human-gated**: a later step runs `npx supabase db push` (or `supabase db reset` is NOT used against prod) against the linked production project after human approval, per `deploy-plan.md`. Supabase migrations do not roll back with a Worker deploy — coordinate separately.

## References

- Roadmap item: `context/foundation/roadmap.md` → F-01 (`card-persistence-foundation`)
- Change identity: `context/changes/card-persistence-foundation/change.md`
- Deploy posture (human-gated prod): `context/deployment/deploy-plan.md`
- Conventions: `CLAUDE.md` (migration naming, RLS policy, `src/types.ts`)
- SSR client to type: `src/lib/supabase.ts:5-24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema migration & RLS

#### Automated

- [x] 1.1 Local Supabase is running: `npx supabase start` — 2fbc652
- [x] 1.2 Migration applies cleanly from scratch: `npx supabase db reset` — 2fbc652
- [x] 1.3 RLS enabled + 4 policies present (catalog assertion via pg_class/pg_policies) — 2fbc652
- [x] 1.4 Schema/typing lint passes (generic gate): `npx supabase db lint --schema public` — 2fbc652

#### Manual

- [x] 1.5 As authenticated user A, an inserted card is readable by A — 2fbc652
- [x] 1.6 The same card is NOT readable or mutable by a second authenticated user B — 2fbc652
- [x] 1.7 Updating a card bumps `updated_at`; `created_at` is unchanged — 2fbc652

### Phase 2: Typed entity surface

#### Automated

- [x] 2.1 Type generation produces a non-empty file containing `flashcards` — 25b6e69
- [x] 2.2 Astro types regenerate: `npx astro sync` — 25b6e69
- [x] 2.3 Lint passes (type-checked): `npm run lint` — 25b6e69
- [x] 2.4 Build passes: `npm run build` — 25b6e69

#### Manual

- [x] 2.5 Generated `src/db/database.types.ts` includes `flashcards` Row/Insert/Update with expected columns — 25b6e69
- [x] 2.6 `import type { Flashcard, CreateFlashcardCommand } from "@/types"` resolves with correct field types — 25b6e69
