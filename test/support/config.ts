// Shared local-Supabase configuration for both the integration (Vitest) and e2e (Playwright) suites.
//
// The keys below are the well-known Supabase **local development** demo keys — identical on
// every `npx supabase start`. They seed and clean the local test database only, are never
// production secrets, and are never used to assert RLS isolation (per lessons.md, asserting
// isolation through the service-role key proves nothing). Override via env if your stack differs.

export const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// A dedicated, confirmed test user. `enable_confirmations = false` in supabase/config.toml,
// so it can sign in immediately after the admin API creates it.
export const E2E_USER = {
  email: "e2e@example.com",
  password: "e2e-password-12345",
};
