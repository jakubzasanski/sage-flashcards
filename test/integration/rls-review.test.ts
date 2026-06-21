import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteCardsByQuestionPrefix,
  ensureTestUser,
  flashcardsRequest,
  getUserToken,
  userIdFromToken,
} from "../support/supabase";

// Roadmap S-02 / risk #1 applied to the new schedule columns. The F-01 lesson (lessons.md) — every
// owner-scoped write must be proven through real RLS, not mocks — extends to the FSRS columns this
// slice added. Two REAL users, each asserted through their OWN access token via PostgREST; the
// service-role key only mints users (RLS on flashcards is `enable`, not `force`, so it bypasses
// every policy and would prove nothing). Needs local Supabase; runs in the integration project only.

const USER_A = { email: "rls-review-a@example.com", password: "rls-review-a-password-12345" };
const USER_B = { email: "rls-review-b@example.com", password: "rls-review-b-password-12345" };

// Unique per execution so re-runs and parallel runs never collide; cleanup targets exactly this run.
const runId = `rls-review-${Date.now()}`;

let tokenA: string;
let tokenB: string;
let aUserId: string;
let aCardId: string;
let seeded: { due: string; state: number; stability: number };

beforeAll(async () => {
  await ensureTestUser(USER_A.email, USER_A.password);
  await ensureTestUser(USER_B.email, USER_B.password);
  tokenA = await getUserToken(USER_A.email, USER_A.password);
  tokenB = await getUserToken(USER_B.email, USER_B.password);
  aUserId = userIdFromToken(tokenA);

  // Seed one card owned by A (schedule columns take their defaults: due≈now, state=0/New, zeros).
  const res = await flashcardsRequest("POST", tokenA, {
    body: { question: `${runId} A's review card`, answer: "A's answer", source: "ai", user_id: aUserId },
    prefer: "return=representation",
  });
  expect(res.status).toBe(201);
  const [row] = (await res.json()) as { id: string; due: string; state: number; stability: number }[];
  aCardId = row.id;
  seeded = { due: row.due, state: row.state, stability: row.stability };
});

afterAll(async () => {
  await deleteCardsByQuestionPrefix(runId, USER_A.email, USER_A.password);
  await deleteCardsByQuestionPrefix(runId, USER_B.email, USER_B.password);
});

// Shared single-row fixture → these run IN ORDER: the "B cannot mutate" assertion must precede the
// one mutator (A edits its own schedule), placed last. Do not shuffle or run concurrently.
describe("flashcards schedule RLS — two-user isolation (risk #1, S-02 columns)", () => {
  it("user B cannot update user A's schedule columns (using filter → 0 rows; A's schedule untouched)", async () => {
    const res = await flashcardsRequest("PATCH", tokenB, {
      query: `?id=eq.${aCardId}`,
      body: { state: 2, stability: 99999, due: "2999-01-01T00:00:00+00:00" },
      prefer: "return=representation",
    });
    expect((await res.json()) as unknown[]).toHaveLength(0);

    // A's schedule is exactly as seeded — B's write reached nothing.
    const check = await flashcardsRequest("GET", tokenA, { query: `?id=eq.${aCardId}` });
    const [row] = (await check.json()) as { due: string; state: number; stability: number }[];
    expect(row.state).toBe(seeded.state);
    expect(row.stability).toBe(seeded.stability);
    expect(row.due).toBe(seeded.due);
  });

  it("a due-filtered read is owner-scoped: B sees none of A's due cards", async () => {
    const res = await flashcardsRequest("GET", tokenB, {
      query: `?question=like.${encodeURIComponent(runId + "*")}&due=lte.${encodeURIComponent("2999-01-01T00:00:00+00:00")}`,
    });
    expect(res.ok).toBe(true);
    expect((await res.json()) as unknown[]).toHaveLength(0);
  });

  it("user A can update its own schedule columns", async () => {
    const res = await flashcardsRequest("PATCH", tokenA, {
      query: `?id=eq.${aCardId}`,
      body: { state: 2, stability: 5.5, due: "2026-07-01T00:00:00+00:00" },
      prefer: "return=representation",
    });
    const rows = (await res.json()) as { state: number; stability: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe(2);
    expect(rows[0].stability).toBe(5.5);
  });
});
