import { Codex, type Usage } from "@openai/codex-sdk";
import { REVIEW_JSON_SCHEMA, REVIEW_SCHEMA, SYSTEM_PROMPT, type Review } from "./review-schema";

export interface ReviewResult {
  review: Review;
  finalResponse: string;
  usage: Usage | null;
}

/** Kontekst PR-a (tytuł + opis). Opcjonalny — lokalne uruchomienia i evale promptfoo działają na samym diffie. */
export interface PrContext {
  prTitle?: string;
  prBody?: string;
}

/**
 * Recenzuje pojedynczy git diff i zwraca ustrukturyzowaną ocenę.
 * Eksportowane jako reużywalna funkcja — w M5L3 to samo wejście pójdzie pod evale promptfoo.
 * `context` jest opcjonalny: gdy podany, intencja PR-a (tytuł/opis) trafia do promptu przed diffem.
 */
export async function reviewDiff(diff: string, context: PrContext = {}): Promise<ReviewResult> {
  // Dwie ścieżki auth: jawny klucz API (env/.env) albo sesja `codex login`.
  // Jeśli nie ma klucza, oddajemy auth binarce codex — błąd (jeśli będzie) wyjdzie z CLI.
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.CODEX_API_KEY;
  if (!apiKey) {
    console.error(
      "ℹ️  Brak OPENAI_API_KEY/CODEX_API_KEY — liczę na sesję `codex login`. " +
        "Jeśli zobaczysz błąd auth, ustaw klucz w packages/code-reviewer/.env lub wykonaj `codex login`.",
    );
  }

  const codex = new Codex(apiKey ? { apiKey } : {});

  // Recenzent ma tylko zrecenzować diff z promptu — nie eksplorować, nie pisać plików,
  // nie wychodzić do sieci. Zamykamy go w sandboxie read-only bez sieci i bez zatwierdzeń.
  // Model bierzemy z CLI (domyślny) — chyba że CI/lokalnie wskaże inny przez REVIEW_MODEL.
  const model = process.env.REVIEW_MODEL;

  const thread = codex.startThread({
    skipGitRepoCheck: true,
    sandboxMode: "read-only",
    networkAccessEnabled: false,
    approvalPolicy: "never",
    modelReasoningEffort: "low",
    ...(model ? { model } : {}),
  });

  // Intencja PR-a (tytuł/opis) przed diffem — recenzent ocenia kod względem tego, co PR deklaruje.
  const prContextBlock = buildPrContextBlock(context);

  const prompt =
    `${SYSTEM_PROMPT}\n\n` +
    "Zrecenzuj poniższy diff i zwróć WYŁĄCZNIE obiekt JSON zgodny ze schematem " +
    "(bez komentarza, bez bloków ```):\n\n" +
    prContextBlock +
    diff;

  const result = await thread.run(prompt, { outputSchema: REVIEW_JSON_SCHEMA });

  const review = parseReview(result.finalResponse);
  return { review, finalResponse: result.finalResponse, usage: result.usage };
}

/** Składa blok "Kontekst PR-a" (tytuł + opis) poprzedzający diff. Pusty string, gdy brak kontekstu. */
function buildPrContextBlock({ prTitle, prBody }: PrContext): string {
  const title = prTitle?.trim();
  const body = prBody?.trim();
  if (!title && !body) return "";

  const lines = ["## Kontekst PR-a"];
  if (title) lines.push(`Tytuł: ${title}`);
  if (body) lines.push(`Opis:\n${body}`);
  return `${lines.join("\n")}\n\n--- DIFF ---\n`;
}

/** Wyłuskuje i waliduje JSON z odpowiedzi modelu (tolerując bloki ``` lub otaczający tekst). */
function parseReview(text: string): Review {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    const match = /\{[\s\S]*\}/.exec(cleaned);
    if (!match) throw new Error(`Odpowiedź modelu nie zawiera JSON-a:\n${text}`);
    json = JSON.parse(match[0]);
  }

  const parsed = REVIEW_SCHEMA.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Niepoprawny structured output: ${parsed.error.message}\n\nSurowa odpowiedź:\n${text}`);
  }
  return parsed.data;
}
