import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteCardsByQuestionPrefix,
  ensureTestUser,
  flashcardsRequest,
  getUserToken,
  userIdFromToken,
} from "../support/supabase";

// Risk #1 — cross-user data access (IDOR / RLS gap). The irreplaceable test: two REAL users, each
// asserted through their OWN access token via PostgREST against local Supabase. The service-role
// key is used only to mint the users (seeding); it is NEVER the asserting client — RLS on
// `flashcards` is `enable`, not `force`, so service-role bypasses every policy and asserting
// through it would prove nothing (lessons.md, test-plan §2 #1).
//
// Needs a running local Supabase (`npx supabase start`). Lives in the integration Vitest project,
// so `npm test` (unit, Docker-free) never picks it up; run with `npm run test:integration`.

const USER_A = { email: "rls-a@example.com", password: "rls-a-password-12345" };
const USER_B = { email: "rls-b@example.com", password: "rls-b-password-12345" };

// Unique per execution so re-runs and parallel runs never collide; cleanup targets exactly this run.
const runId = `rls-${Date.now()}`;

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

  // Seed one card owned by A, through A's own token (with-check passes: user_id = auth.uid()).
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

// NOTE: these tests deliberately share the single row seeded in beforeAll (a cross-user fixture is
// expensive to stand up per-test) and therefore run IN ORDER: the read-back assertions (B cannot
// mutate A's row) must precede the one mutator that edits A's row, which is placed last. Do not run
// this file with `--sequence.shuffle` or `test.concurrent` — reordering would let a mutation
// invalidate an earlier "unchanged" assertion and produce a false pass.
describe("flashcards RLS — two-user isolation (risk #1)", () => {
  it("user B sees none of user A's rows", async () => {
    const res = await flashcardsRequest("GET", tokenB, { query: ownRowQuery });
    expect(res.ok).toBe(true);
    expect((await res.json()) as unknown[]).toHaveLength(0);
  });

  it("user A sees their own row", async () => {
    const res = await flashcardsRequest("GET", tokenA, { query: ownRowQuery });
    const rows = (await res.json()) as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(aCardId);
  });

  it("user B cannot update user A's row (using filter → 0 rows)", async () => {
    const res = await flashcardsRequest("PATCH", tokenB, {
      query: `?id=eq.${aCardId}`,
      body: { answer: "hijacked by B" },
      prefer: "return=representation",
    });
    expect((await res.json()) as unknown[]).toHaveLength(0);
    // A's row is untouched.
    const check = await flashcardsRequest("GET", tokenA, { query: `?id=eq.${aCardId}` });
    const [row] = (await check.json()) as { answer: string }[];
    expect(row.answer).toBe("A's answer");
  });

  it("user B cannot delete user A's row (using filter → 0 rows)", async () => {
    const res = await flashcardsRequest("DELETE", tokenB, {
      query: `?id=eq.${aCardId}`,
      prefer: "return=representation",
    });
    expect((await res.json()) as unknown[]).toHaveLength(0);
    // A's row still exists.
    const check = await flashcardsRequest("GET", tokenA, { query: `?id=eq.${aCardId}` });
    expect((await check.json()) as unknown[]).toHaveLength(1);
  });

  it("user B cannot insert a row owned by user A (with-check violation → 403)", async () => {
    const res = await flashcardsRequest("POST", tokenB, {
      body: { question: `${runId} B forging A's card`, answer: "x", source: "ai", user_id: aUserId },
    });
    expect(res.status).toBe(403);
  });

  it("user A can update their own row", async () => {
    const res = await flashcardsRequest("PATCH", tokenA, {
      query: `?id=eq.${aCardId}`,
      body: { answer: "A's edited answer" },
      prefer: "return=representation",
    });
    const rows = (await res.json()) as { answer: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].answer).toBe("A's edited answer");
  });
});
