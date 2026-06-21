import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerationError, MAX_SOURCE_CHARS, generateCandidates } from "@/lib/services/generation";
import { POST } from "@/pages/api/generate";
import { makeApiContext } from "../support/api-context";

// Phase 2 / risks #5 (auth gate) + #6 (resource abuse) — handler-level properties of /api/generate,
// proven without a network call. The generation SERVICE is owned by the Phase 1 unit suite; here we
// mock it so the test is about the ROUTE: its gate, body cap, validation, and generic error bodies.
//
// Privacy reinforcement (risk #2, locked at the unit layer): the 502 body must not echo sourceText.

vi.mock("@/lib/services/generation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/generation")>();
  return { ...actual, generateCandidates: vi.fn() };
});

const mockedGenerate = vi.mocked(generateCandidates);

const GENERATE_BODY_CAP = 64 * 1024;
const SENTINEL = "SOURCE-LEAK-CANARY-generate-9f1";

afterEach(() => {
  vi.clearAllMocks();
});

async function bodyText(res: Response): Promise<string> {
  return res.text();
}

describe("POST /api/generate — auth gate (risk #5)", () => {
  it("returns 401 when there is no authenticated user", async () => {
    const res = await POST(makeApiContext({ user: null, body: { sourceText: "x" } }));
    expect(res.status).toBe(401);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });
});

describe("POST /api/generate — resource abuse (risk #6)", () => {
  it("returns 413 before parsing when content-length exceeds the cap", async () => {
    const res = await POST(makeApiContext({ contentLength: GENERATE_BODY_CAP + 1, jsonThrows: true }));
    expect(res.status).toBe(413);
    // proves the cap short-circuits before json() / the service
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("allows a content-length exactly at the cap (boundary)", async () => {
    mockedGenerate.mockResolvedValue([]);
    const res = await POST(makeApiContext({ contentLength: GENERATE_BODY_CAP, body: { sourceText: "ok" } }));
    expect(res.status).toBe(200);
  });

  it("returns 400 on an unparseable JSON body", async () => {
    const res = await POST(makeApiContext({ jsonThrows: true }));
    expect(res.status).toBe(400);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it.each([
    ["missing sourceText", {}],
    ["empty sourceText", { sourceText: "" }],
    ["whitespace-only sourceText", { sourceText: "   " }],
    ["sourceText over MAX_SOURCE_CHARS", { sourceText: "a".repeat(MAX_SOURCE_CHARS + 1) }],
  ])("returns 400 on invalid input: %s", async (_label, body) => {
    const res = await POST(makeApiContext({ body }));
    expect(res.status).toBe(400);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("accepts sourceText exactly at MAX_SOURCE_CHARS (boundary)", async () => {
    mockedGenerate.mockResolvedValue([{ question: "q", answer: "a" }]);
    const res = await POST(makeApiContext({ body: { sourceText: "a".repeat(MAX_SOURCE_CHARS) } }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/generate — success + error mapping", () => {
  it("returns 200 with the candidates on success", async () => {
    mockedGenerate.mockResolvedValue([{ question: "Q1", answer: "A1" }]);
    const res = await POST(makeApiContext({ body: { sourceText: "source" } }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { candidates: { question: string; answer: string }[] };
    expect(json.candidates).toEqual([{ question: "Q1", answer: "A1" }]);
  });

  it("maps a config GenerationError to 500", async () => {
    mockedGenerate.mockRejectedValue(new GenerationError("missing key", "config", false));
    const res = await POST(makeApiContext({ body: { sourceText: "source" } }));
    expect(res.status).toBe(500);
  });

  it("maps any other failure to 502 without leaking sourceText (risk #2)", async () => {
    mockedGenerate.mockRejectedValue(new GenerationError("upstream 500", "upstream", true));
    const res = await POST(makeApiContext({ body: { sourceText: `notes ${SENTINEL}` } }));
    expect(res.status).toBe(502);
    expect(await bodyText(res)).not.toContain(SENTINEL);
  });

  it("does not leak sourceText when the service throws a generic error", async () => {
    mockedGenerate.mockRejectedValue(new Error(`boom ${SENTINEL}`));
    const res = await POST(makeApiContext({ body: { sourceText: `notes ${SENTINEL}` } }));
    expect(res.status).toBe(502);
    expect(await bodyText(res)).not.toContain(SENTINEL);
  });
});
