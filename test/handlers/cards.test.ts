import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CANDIDATES } from "@/lib/services/generation";
import { createClient } from "@/lib/supabase";
import { GET, POST } from "@/pages/api/cards";
import type { DeckCard } from "@/types";
import { makeApiContext } from "../support/api-context";

// Phase 2 / risks #5 (auth gate), #6 (resource abuse), #1 (owner forcing), #4 ("persist nothing
// extra") — handler-level properties of /api/cards, proven without a database. The real DB isolation
// (risk #1 proper) lives in the integration suite; here we mock the Supabase client and CAPTURE the
// insert payload to prove the route forces source:"ai" + user_id = the session user, overriding any
// client-supplied value. Error bodies must stay generic (no row contents echoed).

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const mockedCreate = vi.mocked(createClient);

const CARDS_BODY_CAP = 128 * 1024;
const USER_ID = "user-1";
const SENTINEL = "ROW-LEAK-CANARY-cards-4b2";

// A fake Supabase client whose from("flashcards").insert(rows) records its argument.
function fakeClient(insertResult: { error: unknown } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as ReturnType<typeof createClient>, insert, from };
}

function card(question: string, answer: string, extra: Record<string, unknown> = {}) {
  return { question, answer, ...extra };
}

afterEach(() => {
  vi.clearAllMocks();
});

// --- GET /api/cards (roadmap S-03, FR-012): paginated newest-first browse. ---
// A chainable, call-recording fake mirroring review-due.test.ts. The route's terminal await is
// `.range(...)`, so the builder resolves the queued result via `.then`.
const PAGE_SIZE = 50;
const GET_SENTINEL = "ROW-LEAK-CANARY-cards-get-9f1";

function fakeListClient(result: { data?: unknown; error?: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "order", "range"]) {
      builder[m] = vi.fn((...args: unknown[]) => {
        calls.push({ method: m, args });
        return builder;
      });
    }
    builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
    return builder;
  });
  return { client: { from } as unknown as ReturnType<typeof createClient>, from, calls };
}

const findCall = (calls: { method: string; args: unknown[] }[], method: string) =>
  calls.find((c) => c.method === method);

function deckRows(n: number): DeckCard[] {
  return Array.from({ length: n }, (_v, i) => ({
    id: `id-${i}`,
    question: `q${i}`,
    answer: `a${i}`,
    created_at: `2026-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
  }));
}

describe("GET /api/cards — auth & config gates", () => {
  it("returns 401 when there is no authenticated user", async () => {
    const res = await GET(makeApiContext({ user: null }));
    expect(res.status).toBe(401);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 500 when the client cannot be created", async () => {
    mockedCreate.mockReturnValue(null);
    const res = await GET(makeApiContext());
    expect(res.status).toBe(500);
  });

  it.each([
    ["negative offset", "-1"],
    ["non-integer offset", "1.5"],
    ["garbage offset", "abc"],
  ])("returns 400 on %s (and does not query)", async (_label, offset) => {
    const res = await GET(makeApiContext({ searchParams: { offset } }));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns a generic 500 without echoing row contents on a DB error", async () => {
    const { client } = fakeListClient({ data: null, error: { message: GET_SENTINEL } });
    mockedCreate.mockReturnValue(client);
    const res = await GET(makeApiContext());
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(GET_SENTINEL);
  });
});

describe("GET /api/cards — pagination contract", () => {
  it("queries newest-first and ranges [offset, offset+PAGE_SIZE] for offset=0", async () => {
    const { client, calls } = fakeListClient({ data: deckRows(3), error: null });
    mockedCreate.mockReturnValue(client);

    const res = await GET(makeApiContext());

    expect(res.status).toBe(200);
    expect(findCall(calls, "order")?.args).toEqual(["created_at", { ascending: false }]);
    expect(findCall(calls, "range")?.args).toEqual([0, PAGE_SIZE]);
    const body = (await res.json()) as { cards: DeckCard[]; nextOffset: number; hasMore: boolean };
    expect(body.hasMore).toBe(false);
    expect(body.nextOffset).toBe(3); // offset 0 + 3 cards
  });

  it("ranges from the supplied offset", async () => {
    const { client, calls } = fakeListClient({ data: deckRows(0), error: null });
    mockedCreate.mockReturnValue(client);

    await GET(makeApiContext({ searchParams: { offset: "100" } }));

    expect(findCall(calls, "range")?.args).toEqual([100, 100 + PAGE_SIZE]);
  });

  it("sets hasMore and trims to PAGE_SIZE when PAGE_SIZE+1 rows return", async () => {
    const { client } = fakeListClient({ data: deckRows(PAGE_SIZE + 1), error: null });
    mockedCreate.mockReturnValue(client);

    const res = await GET(makeApiContext({ searchParams: { offset: "100" } }));

    const body = (await res.json()) as { cards: DeckCard[]; nextOffset: number; hasMore: boolean };
    expect(body.hasMore).toBe(true);
    expect(body.cards).toHaveLength(PAGE_SIZE); // trimmed
    expect(body.nextOffset).toBe(100 + PAGE_SIZE); // offset + trimmed length
  });

  it("hasMore is false on a full-but-final page (exactly PAGE_SIZE rows)", async () => {
    const { client } = fakeListClient({ data: deckRows(PAGE_SIZE), error: null });
    mockedCreate.mockReturnValue(client);

    const res = await GET(makeApiContext());

    const body = (await res.json()) as { cards: DeckCard[]; nextOffset: number; hasMore: boolean };
    expect(body.hasMore).toBe(false);
    expect(body.cards).toHaveLength(PAGE_SIZE);
    expect(body.nextOffset).toBe(PAGE_SIZE);
  });
});

describe("POST /api/cards — auth gate (risk #5)", () => {
  it("returns 401 when there is no authenticated user", async () => {
    const res = await POST(makeApiContext({ user: null, body: [card("q", "a")] }));
    expect(res.status).toBe(401);
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

describe("POST /api/cards — resource abuse (risk #6)", () => {
  it("returns 413 before parsing when content-length exceeds the cap", async () => {
    const res = await POST(makeApiContext({ contentLength: CARDS_BODY_CAP + 1, jsonThrows: true }));
    expect(res.status).toBe(413);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 400 on an unparseable JSON body", async () => {
    const res = await POST(makeApiContext({ jsonThrows: true }));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["empty array", []],
    ["over MAX_CANDIDATES", Array.from({ length: MAX_CANDIDATES + 1 }, (_v, i) => card(`q${i}`, `a${i}`))],
    ["item with empty question", [card("", "a")]],
    ["item with whitespace answer", [card("q", "   ")]],
    ["not an array", { question: "q", answer: "a" }],
  ])("returns 400 on invalid input: %s", async (_label, body) => {
    const res = await POST(makeApiContext({ body }));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("accepts exactly MAX_CANDIDATES cards (boundary)", async () => {
    const { client } = fakeClient();
    mockedCreate.mockReturnValue(client);
    const body = Array.from({ length: MAX_CANDIDATES }, (_v, i) => card(`q${i}`, `a${i}`));
    const res = await POST(makeApiContext({ body }));
    expect(res.status).toBe(201);
  });
});

describe("POST /api/cards — owner/origin forcing (risks #1, #4)", () => {
  it("forces source:'ai' and user_id = session user, overriding client-supplied values", async () => {
    const { client, from, insert } = fakeClient();
    mockedCreate.mockReturnValue(client);

    const res = await POST(
      makeApiContext({
        user: { id: USER_ID },
        body: [
          card("q1", "a1", { user_id: "ATTACKER-ID", source: "manual" }),
          card("q2", "a2", { user_id: "ATTACKER-ID" }),
        ],
      }),
    );

    expect(res.status).toBe(201);
    expect(from).toHaveBeenCalledWith("flashcards");
    const rows = insert.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.source).toBe("ai");
      expect(row.user_id).toBe(USER_ID);
      // the foreign user_id never survives, and no extra fields leak through
      expect(row.user_id).not.toBe("ATTACKER-ID");
      expect(Object.keys(row).sort()).toEqual(["answer", "question", "source", "user_id"]);
    }
  });

  it("returns 201 with the saved count", async () => {
    const { client } = fakeClient();
    mockedCreate.mockReturnValue(client);
    const res = await POST(makeApiContext({ body: [card("q1", "a1"), card("q2", "a2")] }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { saved: number };
    expect(json.saved).toBe(2);
  });
});

describe("POST /api/cards — persistence errors stay generic", () => {
  it("returns 500 when the client cannot be created", async () => {
    mockedCreate.mockReturnValue(null);
    const res = await POST(makeApiContext({ body: [card("q", "a")] }));
    expect(res.status).toBe(500);
  });

  it("returns 500 without echoing row contents on an insert error (risk #2)", async () => {
    const { client } = fakeClient({ error: { message: "rls denied" } });
    mockedCreate.mockReturnValue(client);
    const res = await POST(makeApiContext({ body: [card(`q ${SENTINEL}`, `a ${SENTINEL}`)] }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(SENTINEL);
  });
});
