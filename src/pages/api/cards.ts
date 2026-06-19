import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { FlashcardInsert } from "@/types";
import { MAX_CANDIDATES } from "@/lib/services/generation";

export const prerender = false;

// Authenticated bulk-save: persist accepted candidate cards to the deck as source:'ai' (roadmap S-01).
// The insert goes through the user's authenticated client, so RLS enforces per-user ownership.

const cardSchema = z.object({
  question: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});

// The request body is the array of accepted cards itself, capped at the generation batch size.
const requestSchema = z.array(cardSchema).min(1).max(MAX_CANDIDATES);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
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
