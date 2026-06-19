import { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } from "astro:env/server";
import { z } from "zod";
import type { CandidateCard } from "@/types";

// Roadmap S-01: turn pasted source text into atomic AI-distilled candidate cards.
// Calls any OpenAI-compatible chat-completions endpoint (OpenAI by default; OpenRouter or a local
// proxy via LLM_BASE_URL) with the global `fetch` (no Node SDK) so it runs on workerd.
// PRIVACY GUARDRAIL: `sourceText` must never be logged or echoed in errors.

const CHAT_COMPLETIONS_PATH = "/chat/completions";

// Caps. The route also validates the input length, but the service is the last line of defence
// (it owns the prompt) so it enforces both independently.
export const MAX_SOURCE_CHARS = 10_000;
export const MAX_CANDIDATES = 30;

// The atomic-card rule (PRD Business Logic): each card is one self-contained, unambiguous Q/A pair.
const SYSTEM_PROMPT = `You distill source text into atomic flashcards for spaced-repetition study.

Rules:
- Produce up to ${MAX_CANDIDATES} cards. Fewer is fine when the text is short; never invent facts not present in the source.
- Each card tests ONE idea (atomic). Questions and answers must be self-contained and unambiguous on their own.
- Keep questions specific and answers concise. No card numbering, no "according to the text" phrasing.
- Respond with ONLY a JSON object of the form {"cards":[{"question":"...","answer":"..."}]}. No prose, no markdown.`;

// Typed error so the route can map it to a clean HTTP status without leaking internals.
// `retryable` distinguishes transient faults (network/429/5xx, malformed output) worth a second
// attempt from deterministic ones (config, 4xx like bad key/credits/policy) that would only fail
// again — so we never waste a second provider round-trip on an error that can't succeed.
export class GenerationError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "upstream" | "parse",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

// Shape the model is asked to return. Coerce defensively, then trim/cap downstream.
// An empty `cards` array is valid output (text yielded nothing flashcard-worthy) — it flows
// through as 200 {candidates:[]} rather than being treated as a parse failure.
const modelOutputSchema = z.object({
  cards: z.array(
    z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
    }),
  ),
});

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

// Tolerant JSON extraction. Models (especially cheaper/free ones that ignore response_format)
// often wrap the object in ```json fences or surround it with prose. Try a direct parse, then
// a markdown-fence strip, then the first balanced `{...}` slice. Returns undefined if all fail.
function extractJson(content: string): unknown {
  const attempts: string[] = [];
  const trimmed = content.trim();
  attempts.push(trimmed);

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced) {
    attempts.push(fenced[1].trim());
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    attempts.push(trimmed.slice(first, last + 1));
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next strategy
    }
  }
  return undefined;
}

// One provider round-trip. Throws GenerationError("upstream") on network/non-2xx,
// GenerationError("parse") on missing/unparseable content. Never references sourceText in errors.
async function callProvider(apiKey: string, model: string, sourceText: string): Promise<CandidateCard[]> {
  let response: Response;
  try {
    response = await fetch(`${LLM_BASE_URL}${CHAT_COMPLETIONS_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: sourceText },
        ],
      }),
    });
  } catch {
    // Network-level failure (DNS, connection reset, timeout) — transient.
    throw new GenerationError("Failed to reach the generation provider", "upstream", true);
  }

  if (!response.ok) {
    // 429 (rate limit) and 5xx are transient; other 4xx (bad key, 402 credits, 403, content
    // policy, rejected params) are deterministic and would only fail again on retry.
    const retryable = response.status === 429 || response.status >= 500;
    throw new GenerationError(`Generation provider returned ${response.status}`, "upstream", retryable);
  }

  let completion: ChatCompletion;
  try {
    completion = (await response.json()) as ChatCompletion;
  } catch {
    throw new GenerationError("Generation provider returned malformed JSON", "parse", true);
  }

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new GenerationError("Generation provider returned no content", "parse", true);
  }

  const parsed = extractJson(content);
  if (parsed === undefined) {
    throw new GenerationError("Generated content was not valid JSON", "parse", true);
  }

  const result = modelOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new GenerationError("Generated content did not match the expected shape", "parse", true);
  }

  return result.data.cards.slice(0, MAX_CANDIDATES).map((c) => ({
    question: c.question.trim(),
    answer: c.answer.trim(),
  }));
}

// Public entry point. Reads provider config from astro:env/server, enforces the input cap,
// and rides out one transient failure (network/5xx/parse) before surfacing a clean error.
export async function generateCandidates(sourceText: string): Promise<CandidateCard[]> {
  if (!LLM_API_KEY) {
    throw new GenerationError("Generation is not configured", "config", false);
  }

  const trimmed = sourceText.trim();
  if (!trimmed) {
    throw new GenerationError("Source text is empty", "parse", false);
  }
  const capped = trimmed.slice(0, MAX_SOURCE_CHARS);

  try {
    return await callProvider(LLM_API_KEY, LLM_MODEL, capped);
  } catch (err) {
    // Retry once, but only for transient faults (network/429/5xx/malformed output).
    // Deterministic failures (config, 4xx) re-throw immediately — a second call can't help.
    if (err instanceof GenerationError && !err.retryable) {
      throw err;
    }
    return await callProvider(LLM_API_KEY, LLM_MODEL, capped);
  }
}
