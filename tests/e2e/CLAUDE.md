# E2E Testing Rules

These rules govern every Playwright spec in this directory. They are the second quality lever
alongside `seed.spec.ts` (the exemplar). Read both before generating or editing a test.

- Use `getByRole`, `getByLabel`, `getByText` as primary locators.
  Fall back to `getByTestId` only when accessibility attributes are ambiguous.
- Never use CSS selectors, XPath, or DOM structure for locating elements.
- Each test must be independently runnable — no shared state between tests.
- Never use `page.waitForTimeout()`. Wait for specific conditions:
  `toBeVisible()`, `waitForURL()`, `waitForResponse()`.
- Assert the business outcome, not implementation details.
- Use unique identifiers (e.g., a timestamp / run-id suffix) for test data
  to avoid collisions in parallel runs. Clean up in `afterEach`.
- Use `storageState` for authentication — never log in through the UI in
  individual tests (the `setup` project in `playwright.config.ts` handles it).

## Project specifics

- **Base URL** is `http://localhost:4321` (Astro dev). The dev server is reused locally and
  started in CI via the `webServer` block.
- **Real vs mocked.** Auth, routing, and the Supabase DB stay **real** — that is where the
  integration risk this suite protects actually lives. Mock only the non-deterministic LLM call
  at the network layer: `page.route('**/api/generate', ...)`. The browser issues that fetch
  client-side, so `page.route` intercepts it; `/api/cards` (save) is left real.
- **Risk-tied names.** Each spec is named after a risk in `context/foundation/test-plan.md`
  and must fail if that risk materializes (verified by a deliberate-break check).
- **Cleanup** uses `deleteCardsByQuestionPrefix(runId)` from `support/supabase.ts`; tag every
  generated card's question with a unique run id so teardown targets exactly the test's own rows.
