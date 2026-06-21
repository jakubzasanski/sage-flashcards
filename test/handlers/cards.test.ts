import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CANDIDATES } from "@/lib/services/generation";
import { createClient } from "@/lib/supabase";
import { POST } from "@/pages/api/cards";
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
