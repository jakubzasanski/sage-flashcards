import type { APIRoute } from "astro";
import { z } from "zod";
import { generateCandidates, GenerationError, MAX_SOURCE_CHARS } from "@/lib/services/generation";
import type { GenerateResponse } from "@/types";

export const prerender = false;

// Authenticated JSON endpoint: pasted source text -> AI candidate cards (roadmap S-01).
// PRIVACY GUARDRAIL: never log or echo `sourceText` (not in console, not in error bodies).

const requestSchema = z.object({
  sourceText: z.string().trim().min(1).max(MAX_SOURCE_CHARS),
});

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

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: `sourceText is required and must be 1–${MAX_SOURCE_CHARS} characters` }, 400);
  }

  try {
    const candidates = await generateCandidates(parsed.data.sourceText);
    return json({ candidates } satisfies GenerateResponse, 200);
  } catch (err) {
    if (err instanceof GenerationError && err.kind === "config") {
      return json({ error: "Generation is not configured" }, 500);
    }
    // Upstream/parse failures: generic message, no source text or prompt echoed.
    return json({ error: "Could not generate cards. Please try again." }, 502);
  }
};
