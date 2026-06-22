import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { DeckCard, DeckPage, FlashcardInsert } from "@/types";
import { MAX_CANDIDATES } from "@/lib/services/generation";

export const prerender = false;

// Browse the signed-in user's deck (roadmap S-03, FR-012), newest first, in bounded pages so a
// large deck never ships in one payload. RLS scopes rows to the owner. Paging is keyed by a 0-based
// ROW offset (not a page index): the client decrements the offset by one per delete so "Load more"
// stays aligned with the live ordering (see plan F2).
const PAGE_SIZE = 50;

// 0-based row offset; absent → 0. Reject negatives / non-integers / garbage with an explicit 400.
const offsetSchema = z.coerce.number().int().nonnegative();

// Authenticated bulk-save: persist accepted candidate cards to the deck as source:'ai' (roadmap S-01).
// The insert goes through the user's authenticated client, so RLS enforces per-user ownership.

const cardSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

// The request body is the array of accepted cards itself, capped at the generation batch size.
const requestSchema = z.array(cardSchema).min(1).max(MAX_CANDIDATES);

// Reject oversized bodies before buffering/parsing. Up to 30 cards of edited Q/A — 128KB is
// generous headroom while bounding what an authed client can make us buffer.
const MAX_BODY_BYTES = 128 * 1024;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // An absent `offset` param coerces to 0 (the first page); negatives / non-integers / garbage 400.
  const offsetParsed = offsetSchema.safeParse(context.url.searchParams.get("offset"));
  if (!offsetParsed.success) {
    return json({ error: "offset must be a non-negative integer" }, 400);
  }
  const offset = offsetParsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Persistence is not configured" }, 500);
  }

  // Fetch PAGE_SIZE + 1 rows (range is inclusive) to derive `hasMore` without a separate count
  // round-trip. Served by the existing (user_id, created_at desc) index.
  const { data, error } = await supabase
    .from("flashcards")
    .select("id, question, answer, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE);

  if (error) {
    return json({ error: "Could not load your cards. Please try again." }, 500);
  }

  const rows = data as DeckCard[];
  const hasMore = rows.length > PAGE_SIZE;
  const cards = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return json({ cards, nextOffset: offset + cards.length, hasMore } satisfies DeckPage, 200);
};

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: `Expected 1–${MAX_CANDIDATES} cards with non-empty question and answer` }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Persistence is not configured" }, 500);
  }

  const rows: FlashcardInsert[] = parsed.data.map((c) => ({
    question: c.question,
    answer: c.answer,
    source: "ai",
    user_id: user.id,
  }));

  const { error } = await supabase.from("flashcards").insert(rows);
  if (error) {
    // RLS/DB failure: generic message, no row contents echoed.
    return json({ error: "Could not save cards. Please try again." }, 500);
  }

  return json({ saved: rows.length }, 201);
};
