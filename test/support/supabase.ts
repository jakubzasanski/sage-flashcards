// Shared test-data helpers for local Supabase: seed confirmed users, get a user's access token,
// and clean up flashcards. Used by both the integration (Vitest) and e2e (Playwright) suites.
//
// User creation goes through the GoTrue admin API (service-role). Token grants and cleanup go
// through each user's OWN authenticated token + RLS — the `flashcards` table grants DML to the
// `authenticated` role only (not `service_role`), and per lessons.md ownership work should run as
// the user, never the service-role key. The service-role key is for seeding/cleanup only and must
// never be the asserting client in an RLS isolation test.
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, E2E_USER } from "./config";

const adminHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

// Ensure a confirmed auth user exists (idempotent). Uses the admin API so the user is usable
// immediately, independent of the signup UI.
export async function ensureTestUser(email: string, password: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (res.ok) return;
  if (res.status === 422) return; // already registered — fine for a reusable fixture
  throw new Error(`Failed to ensure test user: ${res.status} ${await res.text()}`);
}

// Cache access tokens per email so two distinct users (e.g. an RLS isolation test) don't collide.
const tokenCache = new Map<string, string>();

// Sign in (password grant) and return the user's access token, cached by email. Defaults to the
// shared test user so existing e2e call sites keep working.
export async function getUserToken(
  email: string = E2E_USER.email,
  password: string = E2E_USER.password,
): Promise<string> {
  const cached = tokenCache.get(email);
  if (cached) return cached;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Token grant failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  tokenCache.set(email, data.access_token);
  return data.access_token;
}

// Delete every flashcard whose question starts with `prefix`, as the given user (RLS-scoped).
// Each test tags its cards with a unique run id, so this removes exactly what that test created —
// guaranteeing re-runnable, collision-free tests. Defaults to the shared test user.
export async function deleteCardsByQuestionPrefix(
  prefix: string,
  email: string = E2E_USER.email,
  password: string = E2E_USER.password,
): Promise<void> {
  const token = await getUserToken(email, password);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/flashcards?question=like.${encodeURIComponent(prefix + "*")}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: "return=minimal",
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Cleanup failed: ${res.status} ${await res.text()}`);
  }
}
