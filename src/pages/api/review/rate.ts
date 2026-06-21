import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { schedule } from "@/lib/services/scheduling";
import type { RateResponse } from "@/types";

export const prerender = false;

// Authenticated rating endpoint (roadmap S-02, FR-016) — the single place scheduling runs and the
// client trust boundary. Re-reads the card under the user's RLS context, computes the next schedule
// from the STORED state (never from client input), persists it before responding (no-data-loss),
// and returns the new schedule. The client sends only { cardId, rating }; zod strips any extra body
// fields, so a client can never write schedule values, and RLS prevents touching another user's card.

const requestSchema = z.object({
  cardId: z.uuid(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

// Tiny fixed-shape body; reject anything larger before buffering/parsing.
const MAX_BODY_BYTES = 4 * 1024;

// The schedule columns read into FsrsSchedule and written back. Kept in sync with the type.
const SCHEDULE_COLUMNS = "due, stability, difficulty, scheduled_days, learning_steps, reps, lapses, state, last_review";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
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
    return json({ error: "cardId (uuid) and rating (1–4) are required" }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return json({ error: "Persistence is not configured" }, 500);
  }

  // Read the current schedule under RLS. A miss (absent OR not owned) is indistinguishable by
  // design and surfaces as 404 — never leaks whether another user's card exists.
  const { data: card, error: readError } = await supabase
    .from("flashcards")
    .select(SCHEDULE_COLUMNS)
    .eq("id", parsed.data.cardId)
    .maybeSingle();

  if (readError) {
    return json({ error: "Could not load the card. Please try again." }, 500);
  }
  if (!card) {
    return json({ error: "Card not found" }, 404);
  }

  // Schedule from the STORED state + server clock, then persist before responding.
  const next = schedule(card, parsed.data.rating, new Date());

  const { error: writeError } = await supabase.from("flashcards").update(next).eq("id", parsed.data.cardId);
  if (writeError) {
    return json({ error: "Could not save your rating. Please try again." }, 500);
  }

  return json({ schedule: next } satisfies RateResponse, 200);
};
