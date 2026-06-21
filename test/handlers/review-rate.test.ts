import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase";
import { schedule } from "@/lib/services/scheduling";
import { POST } from "@/pages/api/review/rate";
import type { FsrsSchedule } from "@/types";
import { makeApiContext } from "../support/api-context";

// Roadmap S-02 — handler properties of POST /api/review/rate, proven without a database. The route
// is the client trust boundary: it must compute the next schedule from the STORED card (re-read
// under RLS), never from client input, and persist that. We mock both the Supabase client and the
// scheduling service so we can assert (a) the auth/validation/cap gates, (b) a 404 on an RLS miss,
// and (c) that scheduling is fed the fetched row and its output — not any client-supplied fields —
// is what gets written. Real per-user isolation lives in the integration suite (rls-review).

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/services/scheduling", () => ({ schedule: vi.fn() }));

const mockedCreate = vi.mocked(createClient);
const mockedSchedule = vi.mocked(schedule);

const RATE_BODY_CAP = 4 * 1024;
const CARD_ID = "11111111-1111-4111-8111-111111111111";

// The schedule as stored in the DB for the card under review.
const STORED: FsrsSchedule = {
  due: "2026-06-21T12:00:00.000Z",
  stability: 3.2,
  difficulty: 5.1,
  scheduled_days: 1,
  learning_steps: 0,
  reps: 2,
  lapses: 0,
  state: 2,
  last_review: "2026-06-20T12:00:00.000Z",
};

// The schedule the service returns for the rating — distinct sentinel values so we can prove it is
// THIS object (not client input) that gets persisted and echoed.
const NEXT: FsrsSchedule = {
  due: "2026-06-25T12:00:00.000Z",
  stability: 9.9,
  difficulty: 5.0,
  scheduled_days: 4,
  learning_steps: 0,
  reps: 3,
  lapses: 0,
  state: 2,
  last_review: "2026-06-21T13:00:00.000Z",
};

interface RecordedCall {
  method: string;
  args: unknown[];
}

// Chainable, call-recording fake. from() #1 serves the read (.maybeSingle()); from() #2 the write
// (.update().eq()). Each from() yields the next queued result.
function fakeSupabase(results: { data?: unknown; error?: unknown }[]) {
  const calls: RecordedCall[] = [];
  let fromIndex = 0;
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    const result = results[fromIndex] ?? { data: null, error: null };
    fromIndex++;
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "update"]) {
      builder[m] = vi.fn((...args: unknown[]) => {
        calls.push({ method: m, args });
        return builder;
      });
    }
    builder.maybeSingle = vi.fn((...args: unknown[]) => {
      calls.push({ method: "maybeSingle", args });
      return Promise.resolve(result);
    });
    builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
    return builder;
  });
  return { client: { from } as unknown as ReturnType<typeof createClient>, from, calls };
}

const findCall = (calls: RecordedCall[], method: string) => calls.find((c) => c.method === method);

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/review/rate — gates", () => {
  it("returns 401 when there is no authenticated user", async () => {
    const res = await POST(makeApiContext({ user: null, body: { cardId: CARD_ID, rating: 3 } }));
    expect(res.status).toBe(401);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 413 before parsing when content-length exceeds the cap", async () => {
    const res = await POST(makeApiContext({ contentLength: RATE_BODY_CAP + 1, jsonThrows: true }));
    expect(res.status).toBe(413);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 400 on an unparseable JSON body", async () => {
    const res = await POST(makeApiContext({ jsonThrows: true }));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["missing cardId", { rating: 3 }],
    ["non-uuid cardId", { cardId: "not-a-uuid", rating: 3 }],
    ["rating below scale", { cardId: CARD_ID, rating: 0 }],
    ["rating above scale", { cardId: CARD_ID, rating: 5 }],
    ["rating as string", { cardId: CARD_ID, rating: "3" }],
    ["missing rating", { cardId: CARD_ID }],
  ])("returns 400 on invalid input: %s", async (_label, body) => {
    const res = await POST(makeApiContext({ body }));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("returns 500 when the client cannot be created", async () => {
    mockedCreate.mockReturnValue(null);
    const res = await POST(makeApiContext({ body: { cardId: CARD_ID, rating: 3 } }));
    expect(res.status).toBe(500);
  });

  it("returns 404 when the card is absent or not owned (RLS miss)", async () => {
    const { client } = fakeSupabase([{ data: null, error: null }]);
    mockedCreate.mockReturnValue(client);
    const res = await POST(makeApiContext({ body: { cardId: CARD_ID, rating: 3 } }));
    expect(res.status).toBe(404);
    expect(mockedSchedule).not.toHaveBeenCalled();
  });

  it("returns 500 when the read errors", async () => {
    const { client } = fakeSupabase([{ data: null, error: { message: "boom" } }]);
    mockedCreate.mockReturnValue(client);
    const res = await POST(makeApiContext({ body: { cardId: CARD_ID, rating: 3 } }));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/review/rate — scheduling is driven by the stored card, not client input", () => {
  it("schedules from the fetched row and persists the service's output, returning it", async () => {
    mockedSchedule.mockReturnValue(NEXT);
    const { client, calls } = fakeSupabase([
      { data: STORED, error: null }, // read
      { error: null }, // write
    ]);
    mockedCreate.mockReturnValue(client);

    const res = await POST(makeApiContext({ body: { cardId: CARD_ID, rating: 3 } }));

    expect(res.status).toBe(200);
    // scheduled from the STORED row + a server clock, with the validated rating.
    expect(mockedSchedule).toHaveBeenCalledTimes(1);
    expect(mockedSchedule.mock.calls[0][0]).toEqual(STORED);
    expect(mockedSchedule.mock.calls[0][1]).toBe(3);
    expect(mockedSchedule.mock.calls[0][2]).toBeInstanceOf(Date);
    // the service's output is what gets written and echoed.
    expect(findCall(calls, "update")?.args[0]).toEqual(NEXT);
    expect((await res.json()) as { schedule: FsrsSchedule }).toEqual({ schedule: NEXT });
  });

  it("ignores client-supplied schedule/owner fields (spoofing guard)", async () => {
    mockedSchedule.mockReturnValue(NEXT);
    const { client, calls } = fakeSupabase([{ data: STORED, error: null }, { error: null }]);
    mockedCreate.mockReturnValue(client);

    const res = await POST(
      makeApiContext({
        body: {
          cardId: CARD_ID,
          rating: 4,
          // hostile extras a client might try to smuggle in:
          due: "1999-01-01T00:00:00.000Z",
          stability: 99999,
          user_id: "ATTACKER",
          state: 0,
        },
      }),
    );

    expect(res.status).toBe(200);
    // scheduling saw the stored row only — none of the smuggled fields reached it.
    expect(mockedSchedule.mock.calls[0][0]).toEqual(STORED);
    expect(mockedSchedule.mock.calls[0][1]).toBe(4);
    // the persisted payload is the service output, never the client's due/stability/user_id.
    const written = findCall(calls, "update")?.args[0] as Record<string, unknown>;
    expect(written).toEqual(NEXT);
    expect(written.user_id).toBeUndefined();
    expect(written.due).toBe(NEXT.due);
  });
});
