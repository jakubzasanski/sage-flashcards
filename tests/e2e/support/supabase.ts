// Test-data helpers for local Supabase: seed a confirmed user and clean up its flashcards.
//
// User creation goes through the GoTrue admin API (service-role). Cleanup goes through the
// test user's OWN authenticated token + RLS — the `flashcards` table grants DML to the
// `authenticated` role only (not `service_role`), and per lessons.md ownership work should run
// as the user, never the service-role key.
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

let cachedToken: string | null = null;

// Sign in as the E2E user (password grant) and cache the access token for cleanup calls.
async function getUserToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: E2E_USER.email, password: E2E_USER.password }),
  });
  if (!res.ok) throw new Error(`Token grant failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  cachedToken = data.access_token;
  return cachedToken;
}

// Delete every flashcard whose question starts with `prefix`, as the test user (RLS-scoped).
// Each test tags its cards with a unique run id, so this removes exactly what that test created —
// guaranteeing re-runnable, collision-free tests (anti-pattern #5: no cleanup).
export async function deleteCardsByQuestionPrefix(prefix: string): Promise<void> {
  const token = await getUserToken();
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
