import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Rola recenzenta — wspólny prompt systemowy. Jedno źródło prawdy dla agenta
 * i (w przyszłości) dla evali promptfoo.
 */
export const SYSTEM_PROMPT = `Jesteś precyzyjnym, konstruktywnym recenzentem kodu oceniającym pull request.
Oceń podany diff w sześciu kryteriach w skali 1-10 (1 = poważne braki, 10 = wzorowo):
poprawność implementacji, idiomatyczność, złożoność, pokrycie testami względem ryzyka, dokumentacja, bezpieczeństwo.
Następnie wydaj wiążący werdykt (pass/fail) dla całej zmiany i dołącz krótkie podsumowanie (2-3 zdania)
w Markdown, na podstawie którego autor PR-a będzie mógł działać.`;

/**
 * Schemat wyjścia. Score'y trzymamy jako zwykłe z.number(): structured output
 * bywa wybredny na minimum/maximum dla integer, więc zakres 1-10 wymuszamy
 * opisem pola (.describe) i promptem, a nie samym schematem.
 */
export const REVIEW_SCHEMA = z.object({
  implementationCorrectness: z
    .number()
    .describe("Poprawność implementacji: czy kod robi to, co deklaruje (skala 1-10)"),
  idiomaticity: z.number().describe("Idiomatyczność: zgodność z konwencjami języka i projektu (skala 1-10)"),
  complexity: z.number().describe("Złożoność: prostota rozwiązania względem problemu (skala 1-10)"),
  testRiskCoverage: z.number().describe("Pokrycie testami proporcjonalne do ryzyka zmienianych ścieżek (skala 1-10)"),
  documentation: z
    .number()
    .describe("Dokumentacja: czy nieoczywiste decyzje, publiczne API i trudny kod są wyjaśnione tam, gdzie czytelnik tego potrzebuje (skala 1-10)"),
  securitySafety: z.number().describe("Bezpieczeństwo: brak podatności i wycieków sekretów (skala 1-10)"),
  verdict: z.enum(["pass", "fail"]).describe("Wiążący werdykt dla całej zmiany"),
  summary: z.string().describe("Podsumowanie w Markdown, gotowe jako komentarz do PR-a"),
});

export type Review = z.infer<typeof REVIEW_SCHEMA>;

/**
 * JSON Schema dla Codex SDK (`outputSchema`). Target "openAi" daje
 * strict-mode kompatybilny kształt (additionalProperties: false, required).
 */
export const REVIEW_JSON_SCHEMA = zodToJsonSchema(REVIEW_SCHEMA, { target: "openAi" });
