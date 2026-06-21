import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { DueResponse, ReviewCard } from "@/types";

export const prerender = false;

// Authenticated due-queue fetch for a review session (roadmap S-02). Returns the user's cards that
// are due now (due <= now), oldest-due first, capped at one session's worth — the client fetches
// this once at session start. When nothing is due, returns the soonest upcoming due time so the UI
// can show "all caught up" and when to come back. RLS scopes every row to the session user; the cap
// bounds the payload for large decks (perf NFR).

const SESSION_CAP = 100;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Persistence is not configured" }, 500);
  }

  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("flashcards")
    .select("id, question, answer")
    .lte("due", nowIso)
    .order("due", { ascending: true })
    .limit(SESSION_CAP);

  if (error) {
    return json({ error: "Could not load the review queue. Please try again." }, 500);
  }

  // Nothing due now — surface the soonest upcoming card so the UI can say when to return.
  let nextDueAt: string | null = null;
  if (due.length === 0) {
    const { data: upcoming } = await supabase
      .from("flashcards")
      .select("due")
      .gt("due", nowIso)
      .order("due", { ascending: true })
      .limit(1);
    nextDueAt = upcoming?.[0]?.due ?? null;
  }

  return json({ cards: due as ReviewCard[], nextDueAt } satisfies DueResponse, 200);
};
