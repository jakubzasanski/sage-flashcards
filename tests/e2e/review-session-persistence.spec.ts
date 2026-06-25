/**
 * Risk #4 (test-plan.md §2): accepted cards are lost — the in-progress review session is lost on
 * refresh before save. Impact High.
 *
 * What proves protection: a refresh mid-review restores the session (edits + accept/reject
 * decisions), and the accepted set then saves. This risk lives ONLY in the rendered UI
 * (localStorage-backed session across a real reload) — exactly what e2e is for.
 *
 * Boundary: the non-deterministic LLM (/api/generate) is mocked; the localStorage review session
 * and the real DB save (/api/cards) stay real.
 */
import { test, expect } from "@playwright/test";
import { deleteCardsByQuestionPrefix } from "./support/supabase";
import { fillSourceText } from "./support/generate";

test.describe("in-progress review session", () => {
  // Unique id tags this run's cards so cleanup targets exactly them.
  const runId = `persist-${Date.now()}`;

  test.afterEach(async () => {
    await deleteCardsByQuestionPrefix(runId);
  });

  test("survives a page refresh with accept/reject decisions intact", async ({ page }) => {
    // Deterministic candidates; DB save stays real.
    await page.route("**/api/generate", async (route) => {
      await route.fulfill({
        json: {
          candidates: [
            { question: `${runId} Keep me`, answer: "Accepted answer." },
            { question: `${runId} Reject me`, answer: "Rejected answer." },
          ],
        },
      });
    });

    await page.goto("/generate");
    await fillSourceText(page, "Source text to distill into two cards.");
    await page.getByRole("button", { name: "Generate cards" }).click();

    // Both candidates start accepted.
    await expect(page.getByText("2 of 2 cards accepted")).toBeVisible();

    // Reject the second card — the accepted count drops and the card shows its rejected state.
    await page.getByRole("button", { name: "Reject" }).nth(1).click();
    await expect(page.getByText("1 of 2 cards accepted")).toBeVisible();
    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();

    // The risk: a refresh before saving must NOT wipe the review session.
    await page.reload();

    // Session restored exactly — same accepted count AND the rejection decision survived.
    // (If the risk materializes, the page returns to the empty paste state and these fail.)
    await expect(page.getByText("1 of 2 cards accepted")).toBeVisible();
    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();

    // The restored, accepted card still saves to the deck — exactly one card, not two.
    await page.getByRole("button", { name: /save 1 card/i }).click();
    await expect(page.getByText("1 card saved to your deck")).toBeVisible();
  });
});
