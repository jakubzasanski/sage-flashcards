/**
 * Seed E2E test — the exemplar every generated test in this project is modeled on.
 *
 * Demonstrates the four patterns (see tests/e2e/CLAUDE.md):
 *   1. Role/label/text locators — never CSS or DOM structure.
 *   2. Wait for state (toBeVisible), never for time.
 *   3. Unique test data (run-id) so parallel runs and re-runs never collide.
 *   4. Cleanup in afterEach.
 * Auth comes from storageState (playwright.config.ts setup project) — no UI login here.
 *
 * Risk: #4 (no data loss — accepted cards actually reach the deck). test-plan.md §2.
 * Boundary: auth + routing + the Supabase save (/api/cards) are REAL; only the
 * non-deterministic LLM (/api/generate) is mocked at the network layer.
 */
import { test, expect } from "@playwright/test";
import { deleteCardsByQuestionPrefix } from "./support/supabase";
import { fillSourceText } from "./support/generate";

test.describe("generate → save (seed exemplar)", () => {
  // Unique id tags this run's cards so cleanup targets exactly them.
  const runId = `seed-${Date.now()}`;

  test.afterEach(async () => {
    await deleteCardsByQuestionPrefix(runId);
  });

  test("accepted cards are saved to the user's deck", async ({ page }) => {
    // Mock the non-deterministic LLM so candidates are deterministic; DB save stays real.
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        json: {
          candidates: [
            { question: `${runId} What is Astro?`, answer: "A web framework." },
            { question: `${runId} What is Playwright?`, answer: "An E2E test runner." },
          ],
        },
      });
    });

    // Paste source text and generate.
    await page.goto("/generate");
    await fillSourceText(page, "Source text about web tooling.");
    await page.getByRole("button", { name: "Generate cards" }).click();

    // Review state: wait for the candidate count to render (state, not time).
    await expect(page.getByText("2 of 2 cards accepted")).toBeVisible();

    // Save the accepted cards and confirm they reached the deck.
    await page.getByRole("button", { name: /save 2 cards/i }).click();
    await expect(page.getByText("2 cards saved to your deck")).toBeVisible();
  });
});
