import { vi } from "vitest";

// Shared provider-mock helpers for the generation-service test suites. Lives outside the
// `*.test.ts` glob (vitest `include`) so it is never collected as a suite — only imported.
// Single source of truth for the OpenAI-compatible fetch-boundary stub so the risk-#3 and
// risk-#2 suites can't drift apart.

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

// Build a fresh provider success response wrapping `content` as the model reply. Fresh per call so
// retried (body-reading) paths never trip "Body already consumed" on a reused Response.
export function chatResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// Serialize cards into the `{"cards":[...]}` envelope the model is asked to return.
export function cardsContent(cards: { question: string; answer: string }[]): string {
  return JSON.stringify({ cards });
}

// Install a `fetch` stub whose implementation runs fresh each call (so body-reading retries are
// safe), and return the mock for call-count / call-arg assertions.
export function stubFetch(impl: () => Response): FetchMock {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(impl()));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Install a `fetch` stub that rejects, simulating a network-level failure (DNS, reset, timeout).
export function stubRejectingFetch(error: Error = new TypeError("connection reset")): FetchMock {
  const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(error);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Await a promise expected to reject and return the rejection value for inspection.
export async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err: unknown) {
    return err;
  }
  throw new Error("Expected the promise to reject, but it resolved.");
}
