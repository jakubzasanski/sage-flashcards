import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteCardsByQuestionPrefix,
  ensureTestUser,
  flashcardsRequest,
  getUserToken,
  userIdFromToken,
} from "../support/supabase";

// Roadmap S-03 / risk #1 applied to deck browse + edit + delete. Two REAL users, each asserted
// through their OWN access token via PostgREST against local Supabase; the service-role key only
// mints users (RLS on flashcards is `enable`, not `force`, so it bypasses every policy and would
// prove nothing — lessons.md, test-plan §2 #1). Needs local Supabase (`npx supabase start`); runs
// in the integration Vitest project only (`npm run test:integration`).
//
// The load-bearing assertion here is the FR-013 DB backstop: a content-only PATCH leaves every FSRS
// schedule column byte-for-byte unchanged. This proves the DB itself preserves columns absent from
// the SET list; the ROUTE-level structural guard (zod strips a hostile `due`/`state`) is covered by
// the handler test (cards-id.test.ts). Together they pin FR-013 from both ends.

const USER_A = { email: "rls-deck-a@example.com", password: "rls-deck-a-password-12345" };
const USER_B = { email: "rls-deck-b@example.com", password: "rls-deck-b-password-12345" };

// The FSRS schedule columns FR-013 must never touch on a content edit. Kept in sync with FsrsSchedule.
const SCHEDULE_KEYS = [
  "due",
  "stability",
  "difficulty",
  "scheduled_days",
  "learning_steps",
  "reps",
  "lapses",
  "state",
  "last_review",
] as const;

type ScheduleRow = Record<(typeof SCHEDULE_KEYS)[number], unknown>;
const pickSchedule = (row: ScheduleRow): ScheduleRow =>
  Object.fromEntries(SCHEDULE_KEYS.map((k) => [k, row[k]])) as ScheduleRow;

// Unique per execution so re-runs and parallel runs never collide; cleanup targets exactly this run.
const runId = `rls-deck-${Date.now()}`;

let tokenA: string;
let tokenB: string;
let aUserId: string;
let aCardId: string;

beforeAll(async () => {
  await ensureTestUser(USER_A.email, USER_A.password);
  await ensureTestUser(USER_B.email, USER_B.password);
  tokenA = await getUserToken(USER_A.email, USER_A.password);
  tokenB = await getUserToken(USER_B.email, USER_B.password);
  aUserId = userIdFromToken(tokenA);

  // Seed one card owned by A (schedule columns take their defaults).
  const res = await flashcardsRequest("POST", tokenA, {
    body: { question: `${runId} A's private card`, answer: "A's answer", source: "ai", user_id: aUserId },
    prefer: "return=representation",
  });
  expect(res.status).toBe(201);
  const [row] = (await res.json()) as { id: string }[];
  aCardId = row.id;
});

afterAll(async () => {
  // Clean up through each owner's own RLS-scoped token (service_role has no GRANT on flashcards).
  await deleteCardsByQuestionPrefix(runId, USER_A.email, USER_A.password);
  await deleteCardsByQuestionPrefix(runId, USER_B.email, USER_B.password);
});

const ownRowQuery = `?question=like.${encodeURIComponent(runId + "*")}`;

// Shared single-row fixture → these run IN ORDER: the read-back / B-cannot-mutate assertions precede
// the mutators (A edits, then A deletes), placed last. Do not run with --sequence.shuffle or
// test.concurrent — reordering would let a mutation invalidate an earlier "unchanged" assertion.
describe("deck management RLS — two-user isolation + FR-013 (risk #1, S-03)", () => {
  it("user B's browse returns none of user A's rows; A's returns A's row", async () => {
    const bRes = await flashcardsRequest("GET", tokenB, { query: ownRowQuery });
    expect(bRes.ok).toBe(true);
    expect((await bRes.json()) as unknown[]).toHaveLength(0);

    const aRes = await flashcardsRequest("GET", tokenA, { query: ownRowQuery });
    const rows = (await aRes.json()) as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(aCardId);
  });

  it("user B cannot edit user A's card (using filter → 0 rows; A's content untouched)", async () => {
    const res = await flashcardsRequest("PATCH", tokenB, {
      query: `?id=eq.${aCardId}`,
      body: { question: `${runId} hijacked`, answer: "hijacked by B" },
      prefer: "return=representation",
    });
    expect((await res.json()) as unknown[]).toHaveLength(0);

    const check = await flashcardsRequest("GET", tokenA, { query: `?id=eq.${aCardId}` });
    const [row] = (await check.json()) as { answer: string }[];
    expect(row.answer).toBe("A's answer");
  });

  it("user B cannot delete user A's card (using filter → 0 rows; A's row survives)", async () => {
    const res = await flashcardsRequest("DELETE", tokenB, {
      query: `?id=eq.${aCardId}`,
      prefer: "return=representation",
    });
    expect((await res.json()) as unknown[]).toHaveLength(0);

    const check = await flashcardsRequest("GET", tokenA, { query: `?id=eq.${aCardId}` });
    expect((await check.json()) as unknown[]).toHaveLength(1);
  });

  it("FR-013: a content-only edit by A leaves every schedule column byte-for-byte unchanged", async () => {
    // Read A's card before the edit (schedule + content + updated_at).
    const before = await flashcardsRequest("GET", tokenA, { query: `?id=eq.${aCardId}` });
    const [pre] = (await before.json()) as (ScheduleRow & { question: string; answer: string; updated_at: string })[];
    const preSchedule = pickSchedule(pre);

    // Edit ONLY question + answer (the route's contract), straight through PostgREST.
    const editRes = await flashcardsRequest("PATCH", tokenA, {
      query: `?id=eq.${aCardId}`,
      body: { question: `${runId} A's edited card`, answer: "A's edited answer" },
      prefer: "return=representation",
    });
    const editRows = (await editRes.json()) as unknown[];
    expect(editRows).toHaveLength(1);

    // Re-read and assert: schedule identical, content changed, updated_at advanced.
    const after = await flashcardsRequest("GET", tokenA, { query: `?id=eq.${aCardId}` });
    const [post] = (await after.json()) as (ScheduleRow & { question: string; answer: string; updated_at: string })[];
    expect(pickSchedule(post)).toEqual(preSchedule);
    expect(post.question).toBe(`${runId} A's edited card`);
    expect(post.answer).toBe("A's edited answer");
    expect(new Date(post.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(pre.updated_at).getTime());
  });

  it("the DB itself would accept a schedule spoof — proving the route's zod schema is the only blocker", async () => {
    // PATCH a schedule column directly through PostgREST (NOT the route): the DB accepts it. This
    // makes explicit that nothing in the database prevents writing `due` — only the route's
    // content-only zod schema does (covered structurally in cards-id.test.ts).
    const spoof = await flashcardsRequest("PATCH", tokenA, {
      query: `?id=eq.${aCardId}`,
      body: { due: "2999-01-01T00:00:00+00:00" },
      prefer: "return=representation",
    });
    const [row] = (await spoof.json()) as { due: string }[];
    expect(new Date(row.due).getUTCFullYear()).toBe(2999);
  });

  it("user A can delete their own card", async () => {
    const res = await flashcardsRequest("DELETE", tokenA, {
      query: `?id=eq.${aCardId}`,
      prefer: "return=representation",
    });
    const rows = (await res.json()) as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(aCardId);

    const check = await flashcardsRequest("GET", tokenA, { query: `?id=eq.${aCardId}` });
    expect((await check.json()) as unknown[]).toHaveLength(0);
  });
});
