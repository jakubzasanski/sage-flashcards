import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase";
import { GET } from "@/pages/api/review/due";
import { makeApiContext } from "../support/api-context";

// Roadmap S-02 — handler properties of GET /api/review/due, proven without a database. The real
// per-user isolation lives in the integration suite (rls-review); here we mock the Supabase client
// and CAPTURE the query the route builds, to pin the due-queue contract: due <= now, oldest-due
// first, capped at one session. The empty-queue path must look up the soonest upcoming due time.

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const mockedCreate = vi.mocked(createClient);
const SESSION_CAP = 100;

interface RecordedCall {
  method: string;
  args: unknown[];
}

// A fake Supabase client whose query-builder methods are chainable and record their calls. Each
// from() call yields the next queued result; terminal awaits (.limit()) and .maybeSingle() resolve it.
function fakeSupabase(results: { data?: unknown; error?: unknown }[]) {
  const calls: RecordedCall[] = [];
  let fromIndex = 0;
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    const result = results[fromIndex] ?? { data: [], error: null };
    fromIndex++;
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "lte", "gt", "order", "limit", "eq", "update"]) {
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/review/due — auth & config gates", () => {
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

  it("returns 500 when the query errors", async () => {
    const { client } = fakeSupabase([{ data: null, error: { message: "boom" } }]);
    mockedCreate.mockReturnValue(client);
    const res = await GET(makeApiContext());
    expect(res.status).toBe(500);
  });
});

describe("GET /api/review/due — due-queue contract", () => {
  it("queries due <= now, oldest-due first, capped at one session", async () => {
    const cards = [{ id: "c1", question: "q1", answer: "a1" }];
    const { client, calls } = fakeSupabase([{ data: cards, error: null }]);
    mockedCreate.mockReturnValue(client);

    const res = await GET(makeApiContext());

    expect(res.status).toBe(200);
    expect(findCall(calls, "lte")?.args[0]).toBe("due");
    expect(typeof findCall(calls, "lte")?.args[1]).toBe("string"); // an ISO `now`
    expect(findCall(calls, "order")?.args).toEqual(["due", { ascending: true }]);
    expect(findCall(calls, "limit")?.args).toEqual([SESSION_CAP]);

    const body = (await res.json()) as { cards: unknown[]; nextDueAt: string | null };
    expect(body.cards).toEqual(cards);
    expect(body.nextDueAt).toBeNull(); // cards present → no next-due lookup
  });

  it("returns nextDueAt from the soonest upcoming card when nothing is due", async () => {
    const { client, calls } = fakeSupabase([
      { data: [], error: null }, // nothing due now
      { data: [{ due: "2026-06-22T09:00:00.000Z" }], error: null }, // soonest upcoming
    ]);
    mockedCreate.mockReturnValue(client);

    const res = await GET(makeApiContext());

    expect(res.status).toBe(200);
    const body = (await res.json()) as { cards: unknown[]; nextDueAt: string | null };
    expect(body.cards).toEqual([]);
    expect(body.nextDueAt).toBe("2026-06-22T09:00:00.000Z");
    // the upcoming lookup is forward-looking and tiny: due query caps at the session size, the
    // follow-up upcoming query caps at 1.
    expect(findCall(calls, "gt")?.args[0]).toBe("due");
    expect(calls.filter((c) => c.method === "limit").map((c) => c.args[0])).toEqual([SESSION_CAP, 1]);
  });

  it("returns nextDueAt null when the deck has no cards at all", async () => {
    const { client } = fakeSupabase([
      { data: [], error: null },
      { data: [], error: null },
    ]);
    mockedCreate.mockReturnValue(client);

    const res = await GET(makeApiContext());

    const body = (await res.json()) as { cards: unknown[]; nextDueAt: string | null };
    expect(body.cards).toEqual([]);
    expect(body.nextDueAt).toBeNull();
  });
});
