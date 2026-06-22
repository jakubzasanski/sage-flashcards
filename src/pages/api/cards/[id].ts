import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { DeckCard } from "@/types";

export const prerender = false;

// Deck mutation endpoints (roadmap S-03) — the slice's trust boundary.
//   PATCH: schedule-preserving content edit (FR-013). The zod body schema is EXACTLY
//     { question, answer }; the update() payload is built from ONLY those two parsed fields, so the
//     FSRS schedule columns (due, stability, …) are structurally unreachable — a client that smuggles
//     `due`/`state` in the body has them stripped (mirrors the rate.ts spoofing guard).
//   DELETE: permanent hard delete (FR-014). The confirmation gate lives in the UI; the route deletes.
// Both filter by id only; RLS scopes the row to the owner, so a non-owned/absent id affects 0 rows,
// which we map to 404 — never leaking whether another user's card exists (same as rate.ts).

// Tiny content-only edit; reject anything larger before buffering/parsing.
const MAX_BODY_BYTES = 16 * 1024;

const idSchema = z.uuid();

// EXACTLY question + answer. Extra keys (a hostile `due`/`state`/`user_id`) are stripped by zod, so
// they can never reach the update() payload — the FR-013 structural guarantee.
const patchSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

const DECK_CARD_COLUMNS = "id, question, answer, created_at";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const id = idSchema.safeParse(context.params.id);
  if (!id.success) {
    return json({ error: "Invalid card id" }, 400);
  }

  const contentLength = Number(context.request.headers.get("content-length"));
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request body too large" }, 413);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "question and answer are required and must be non-empty" }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Persistence is not configured" }, 500);
  }

  // Payload built from ONLY the two parsed fields — never the raw body, never a schedule column.
  const { data, error } = await supabase
    .from("flashcards")
    .update({ question: parsed.data.question, answer: parsed.data.answer })
    .eq("id", id.data)
    .select(DECK_CARD_COLUMNS);

  if (error) {
    return json({ error: "Could not save the card. Please try again." }, 500);
  }
  // 0 rows → the card is absent or not owned (RLS miss). Indistinguishable by design → 404.
  const rows = data as DeckCard[];
  if (rows.length === 0) {
    return json({ error: "Card not found" }, 404);
  }

  return json(rows[0] satisfies DeckCard, 200);
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const id = idSchema.safeParse(context.params.id);
  if (!id.success) {
    return json({ error: "Invalid card id" }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Persistence is not configured" }, 500);
  }

  const { data, error } = await supabase.from("flashcards").delete().eq("id", id.data).select("id");

  if (error) {
    return json({ error: "Could not delete the card. Please try again." }, 500);
  }
  const rows = data as { id: string }[];
  if (rows.length === 0) {
    return json({ error: "Card not found" }, 404);
  }

  return json({ deleted: id.data }, 200);
};
