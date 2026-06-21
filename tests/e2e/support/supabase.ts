// E2E test-data helpers now live in the shared module (test/support/supabase.ts) so the
// integration and e2e suites share one source of truth. Re-exported here to keep e2e import
// paths (`./support/supabase`) stable.
export { ensureTestUser, getUserToken, deleteCardsByQuestionPrefix } from "../../../test/support/supabase";
