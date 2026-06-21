// E2E config — Supabase settings now live in the shared module (test/support/config.ts) so the
// integration and e2e suites share one source of truth. AUTH_FILE is Playwright-specific and stays here.
export { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, E2E_USER } from "../../../test/support/config";

// storageState location — gitignored (playwright/.auth/).
export const AUTH_FILE = "playwright/.auth/user.json";
