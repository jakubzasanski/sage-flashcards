import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationError, MAX_CANDIDATES, MAX_SOURCE_CHARS, generateCandidates } from "@/lib/services/generation";

// Risk #3 — generation degrades the wedge.
//
// Oracle is the PRD contract (atomic Q/A, ≤30 cap, empty-is-valid), NOT card JSON copied from the
// implementation. We drive `generateCandidates` (→ `callProvider`/`extractJson`) across every
// failure and success branch through a stubbed global `fetch`, asserting handled outcomes and the
// fetch call-count that proves the one-shot retry fires only on transient faults.
//
// The provider is an OpenAI-compatible chat-completions endpoint; a response carries the model's
// reply at `choices[0].message.content`, a string the service then JSON-parses into `{cards:[...]}`.

const SOURCE = "Some pasted source text to distill.";

// Shape of the request body the service POSTs to the provider — used to inspect what reached the wire.
interface SentBody {
  model: string;
  messages: { role: string; content: string }[];
}

// Build a fresh provider success response wrapping `content` as the model reply. Fresh per call so
// retried paths (which read the body) never trip "Body already consumed" on a reused Response.
function chatResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Serialize cards into the `{"cards":[...]}` envelope the model is asked to return.
function cardsContent(cards: { question: string; answer: string }[]): string {
  return JSON.stringify({ cards });
}

// Install a `fetch` stub whose implementation runs fresh each call (so body-reading retries are safe).
function stubFetch(impl: () => Response): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(impl()));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Await a promise expected to reject and return the rejection value for inspection.
async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err: unknown) {
    return err;
  }
  throw new Error("Expected the promise to reject, but it resolved.");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generateCandidates — retry classification (risk #3)", () => {
  // Transient: 429 + 5xx are worth a second attempt. Both attempts fail here → throws after 2 calls.
  it.each([429, 500, 503])(
    "treats status %i as transient: retries once, then throws a retryable upstream error (fetch called twice)",
    async (status) => {
      const fetchMock = stubFetch(() => new Response("upstream error", { status }));

      const err = await captureError(generateCandidates(SOURCE));

      expect(err).toBeInstanceOf(GenerationError);
      expect((err as GenerationError).kind).toBe("upstream");
      expect((err as GenerationError).retryable).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  // Deterministic 4xx (bad key, no credits, forbidden): a second call can't help → fail fast, once.
  it.each([400, 401, 402, 403])(
    "treats status %i as deterministic: throws a non-retryable upstream error without retrying (fetch called once)",
    async (status) => {
      const fetchMock = stubFetch(() => new Response("client error", { status }));

      const err = await captureError(generateCandidates(SOURCE));

      expect(err).toBeInstanceOf(GenerationError);
      expect((err as GenerationError).kind).toBe("upstream");
      expect((err as GenerationError).retryable).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("rides out a transient 503 and resolves with the cards from the successful second attempt", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(chatResponse(cardsContent([{ question: "Q1", answer: "A1" }])));
    vi.stubGlobal("fetch", fetchMock);

    const cards = await generateCandidates(SOURCE);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cards).toEqual([{ question: "Q1", answer: "A1" }]);
  });

  it("treats a network-level fetch rejection as transient and retries", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(chatResponse(cardsContent([{ question: "Q", answer: "A" }])));
    vi.stubGlobal("fetch", fetchMock);

    const cards = await generateCandidates(SOURCE);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(cards).toEqual([{ question: "Q", answer: "A" }]);
  });

  it("surfaces a retryable upstream error when the network fails on both attempts", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("connection reset"));
    vi.stubGlobal("fetch", fetchMock);

    const err = await captureError(generateCandidates(SOURCE));

    expect(err).toBeInstanceOf(GenerationError);
    expect((err as GenerationError).kind).toBe("upstream");
    expect((err as GenerationError).retryable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("generateCandidates — content extraction strategies (risk #3)", () => {
  const validShapes = [
    {
      name: "a direct JSON object",
      content: JSON.stringify({ cards: [{ question: "Q", answer: "A" }] }),
    },
    {
      name: "a ```json-fenced object",
      content: "```json\n" + JSON.stringify({ cards: [{ question: "Q", answer: "A" }] }) + "\n```",
    },
    {
      name: "an object embedded in surrounding prose",
      content: "Sure, here are the cards: " + JSON.stringify({ cards: [{ question: "Q", answer: "A" }] }) + " Enjoy!",
    },
  ];

  it.each(validShapes)("extracts cards from $name", async ({ content }) => {
    stubFetch(() => chatResponse(content));

    const cards = await generateCandidates(SOURCE);

    expect(cards).toEqual([{ question: "Q", answer: "A" }]);
  });

  it("throws a parse error when no extraction strategy yields valid JSON", async () => {
    const fetchMock = stubFetch(() => chatResponse("not json in any form"));

    const err = await captureError(generateCandidates(SOURCE));

    expect(err).toBeInstanceOf(GenerationError);
    expect((err as GenerationError).kind).toBe("parse");
    // parse failures are transient, so the one-shot retry fires before giving up.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("generateCandidates — caps (risk #3)", () => {
  it("caps output at MAX_CANDIDATES and trims whitespace from question/answer", async () => {
    const overCap = Array.from({ length: MAX_CANDIDATES + 5 }, (_, i) => ({
      question: `  Question ${i}  `,
      answer: `  Answer ${i}  `,
    }));
    stubFetch(() => chatResponse(cardsContent(overCap)));

    const cards = await generateCandidates(SOURCE);

    expect(cards).toHaveLength(MAX_CANDIDATES);
    expect(cards[0]).toEqual({ question: "Question 0", answer: "Answer 0" });
  });

  it("caps the user message sent to the provider at MAX_SOURCE_CHARS", async () => {
    const fetchMock = stubFetch(() => chatResponse(cardsContent([{ question: "Q", answer: "A" }])));
    const longSource = "x".repeat(MAX_SOURCE_CHARS + 100);

    await generateCandidates(longSource);

    const init = fetchMock.mock.calls[0][1];
    if (typeof init?.body !== "string") {
      throw new Error("Expected the provider request to carry a string JSON body.");
    }
    const sent = JSON.parse(init.body) as SentBody;
    const userMessage = sent.messages.find((m) => m.role === "user");
    expect(userMessage?.content).toHaveLength(MAX_SOURCE_CHARS);
  });
});

describe("generateCandidates — malformed provider output (risk #3)", () => {
  it("throws a parse error when the response body is not JSON", async () => {
    stubFetch(() => new Response("<<<not json>>>", { status: 200 }));

    const err = await captureError(generateCandidates(SOURCE));

    expect(err).toBeInstanceOf(GenerationError);
    expect((err as GenerationError).kind).toBe("parse");
  });

  it("throws a parse error when the completion carries no message content", async () => {
    stubFetch(() => new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }));

    const err = await captureError(generateCandidates(SOURCE));

    expect(err).toBeInstanceOf(GenerationError);
    expect((err as GenerationError).kind).toBe("parse");
  });

  it("throws a parse error when the extracted JSON does not match the card schema", async () => {
    // `question` present but `answer` missing → fails modelOutputSchema.
    stubFetch(() => chatResponse(JSON.stringify({ cards: [{ question: "Q" }] })));

    const err = await captureError(generateCandidates(SOURCE));

    expect(err).toBeInstanceOf(GenerationError);
    expect((err as GenerationError).kind).toBe("parse");
  });
});

describe("generateCandidates — empty cards is valid output (regression lock, risk #3)", () => {
  // Regression from the first-ai-cards-to-deck review: an over-eager `.min(1)` turned an empty
  // array into a parse→retry→502. Empty MUST resolve to [] without throwing or retrying.
  it("resolves to an empty array without retrying when the model returns no cards", async () => {
    const fetchMock = stubFetch(() => chatResponse(cardsContent([])));

    const cards = await generateCandidates(SOURCE);

    expect(cards).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("generateCandidates — guard paths (risk #3)", () => {
  it.each(["", "   ", "\n\t  "])(
    "throws a non-retryable parse error and never calls the provider for blank source %j",
    async (blank) => {
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchMock);

      const err = await captureError(generateCandidates(blank));

      expect(err).toBeInstanceOf(GenerationError);
      expect((err as GenerationError).kind).toBe("parse");
      expect((err as GenerationError).retryable).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("throws a non-retryable config error and never calls the provider when LLM_API_KEY is missing", async () => {
    // The alias makes `astro:env/server` resolvable; this per-test mock overrides the value to falsy.
    vi.resetModules();
    vi.doMock("astro:env/server", () => ({
      LLM_API_KEY: "",
      LLM_BASE_URL: "https://api.openai.com/v1",
      LLM_MODEL: "gpt-test",
    }));
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    const { generateCandidates: generateWithoutKey, GenerationError: ScopedGenerationError } =
      await import("@/lib/services/generation");

    const err = await captureError(generateWithoutKey(SOURCE));

    expect(err).toBeInstanceOf(ScopedGenerationError);
    expect((err as GenerationError).kind).toBe("config");
    expect((err as GenerationError).retryable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.doUnmock("astro:env/server");
    vi.resetModules();
  });
});
