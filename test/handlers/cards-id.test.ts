import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase";
import { DELETE, PATCH } from "@/pages/api/cards/[id]";
import { makeApiContext } from "../support/api-context";

// Roadmap S-03 — handler properties of PATCH/DELETE /api/cards/[id], proven without a database. The
// route is the slice's trust boundary; the load-bearing test is the FR-013 guard: a PATCH body that
// also carries hostile schedule/owner fields must still produce an update() payload of EXACTLY
// { question, answer } — the zod schema strips everything else before it can reach SQL (mirrors the
// rate.ts spoofing guard + cards.ts owner-forcing key assertion). Real per-user isolation and the
// DB-side schedule-preservation backstop live in the integration suite (rls-cards-management).

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const mockedCreate = vi.mocked(createClient);

const PATCH_BODY_CAP = 16 * 1024;
const CARD_ID = "11111111-1111-4111-8111-111111111111";
const SENTINEL = "ROW-LEAK-CANARY-cards-id-7c3";

interface RecordedCall {
  method: string;
  args: unknown[];
}

// Chainable, call-recording fake. Both verbs end their chain on .select(), so the queued result is
// resolved via .then (terminal await). update()/delete()/eq()/select() all record and chain.
function fakeSupabase(result: { data?: unknown; error?: unknown }) {
  const calls: RecordedCall[] = [];
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    const builder: Record<string, unknown> = {};
    for (const m of ["update", "delete", "eq", "select"]) {
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

const findCall = (calls: RecordedCall[], method: string) => calls.find((c) => c.method === method);

const ctx = (opts: Parameters<typeof makeApiContext>[0] = {}) => makeApiContext({ params: { id: CARD_ID }, ...opts });

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/cards/[id] — gates", () => {
  it("returns 401 when there is no authenticated user", async () => {
    const res = await PATCH(ctx({ user: null, body: { question: "q", answer: "a" } }));
    expect(res.status).toBe(401);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 400 on a non-uuid id", async () => {
    const res = await PATCH(makeApiContext({ params: { id: "not-a-uuid" }, body: { question: "q", answer: "a" } }));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 413 before parsing when content-length exceeds the cap", async () => {
    const res = await PATCH(ctx({ contentLength: PATCH_BODY_CAP + 1, jsonThrows: true }));
    expect(res.status).toBe(413);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 400 on an unparseable JSON body", async () => {
    const res = await PATCH(ctx({ jsonThrows: true }));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["missing question", { answer: "a" }],
    ["missing answer", { question: "q" }],
    ["blank question", { question: "   ", answer: "a" }],
    ["blank answer", { question: "q", answer: "" }],
  ])("returns 400 on invalid body: %s", async (_label, body) => {
    const res = await PATCH(ctx({ body }));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 500 when the client cannot be created", async () => {
    mockedCreate.mockReturnValue(null);
    const res = await PATCH(ctx({ body: { question: "q", answer: "a" } }));
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/cards/[id] — FR-013 structural guarantee", () => {
  it("writes EXACTLY { question, answer } even when the body smuggles schedule/owner fields", async () => {
    const updated = { id: CARD_ID, question: "new q", answer: "new a", created_at: "2026-06-20T00:00:00.000Z" };
    const { client, calls } = fakeSupabase({ data: [updated], error: null });
    mockedCreate.mockReturnValue(client);

    const res = await PATCH(
      ctx({
        body: {
          question: "new q",
          answer: "new a",
          // hostile extras a client might try to smuggle in:
          due: "1999-01-01T00:00:00.000Z",
          state: 0,
          stability: 99999,
          user_id: "ATTACKER",
          created_at: "1999-01-01T00:00:00.000Z",
        },
      }),
    );

    expect(res.status).toBe(200);
    const written = findCall(calls, "update")?.args[0] as Record<string, unknown>;
    // The whole point of FR-013: only content fields survive — no schedule/owner key reaches SQL.
    expect(Object.keys(written).sort()).toEqual(["answer", "question"]);
    expect(written.question).toBe("new q");
    expect(written.answer).toBe("new a");
    // the row is filtered by id, and the updated DeckCard is echoed.
    expect(findCall(calls, "eq")?.args).toEqual(["id", CARD_ID]);
    expect(await res.json()).toEqual(updated);
  });

  it("returns 404 when the update affects 0 rows (RLS miss or absent)", async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    mockedCreate.mockReturnValue(client);
    const res = await PATCH(ctx({ body: { question: "q", answer: "a" } }));
    expect(res.status).toBe(404);
  });

  it("returns a generic 500 without echoing row contents on a DB error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: SENTINEL } });
    mockedCreate.mockReturnValue(client);
    const res = await PATCH(ctx({ body: { question: `q ${SENTINEL}`, answer: `a ${SENTINEL}` } }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(SENTINEL);
  });
});

describe("DELETE /api/cards/[id]", () => {
  it("returns 401 when there is no authenticated user", async () => {
    const res = await DELETE(ctx({ user: null }));
    expect(res.status).toBe(401);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 400 on a non-uuid id", async () => {
    const res = await DELETE(makeApiContext({ params: { id: "not-a-uuid" } }));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 500 when the client cannot be created", async () => {
    mockedCreate.mockReturnValue(null);
    const res = await DELETE(ctx());
    expect(res.status).toBe(500);
  });

  it("deletes the owned row by id and returns { deleted: id }", async () => {
    const { client, calls } = fakeSupabase({ data: [{ id: CARD_ID }], error: null });
    mockedCreate.mockReturnValue(client);
    const res = await DELETE(ctx());
    expect(res.status).toBe(200);
    expect(findCall(calls, "eq")?.args).toEqual(["id", CARD_ID]);
    expect(await res.json()).toEqual({ deleted: CARD_ID });
  });

  it("returns 404 when the delete affects 0 rows (RLS miss or absent)", async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    mockedCreate.mockReturnValue(client);
    const res = await DELETE(ctx());
    expect(res.status).toBe(404);
  });

  it("returns a generic 500 on a DB error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: SENTINEL } });
    mockedCreate.mockReturnValue(client);
    const res = await DELETE(ctx());
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(SENTINEL);
  });
});
