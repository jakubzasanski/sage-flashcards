/**
 * Risk #5 (test-plan.md §2): an unauthenticated visitor reaches a protected route or a save
 * endpoint. Impact High.
 *
 * Must challenge (per Risk Response Guidance): "the page gate implies the API is gated" — so this
 * asserts BOTH the browser redirect AND the API 401. Anti-pattern to avoid: only testing the page
 * redirect, never the API.
 *
 * These tests run UNauthenticated, overriding the shared storageState.
 */
import { test, expect } from "@playwright/test";

test.describe("unauthenticated access is blocked", () => {
  // No stored session for this file — the whole point is the logged-out experience.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a protected route redirects to sign-in", async ({ page }) => {
    await page.goto("/generate");

    // Middleware redirects unauthenticated users away from /generate.
    await expect(page).toHaveURL(/\/auth\/signin/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("the save API rejects an unauthenticated request with 401", async ({ request }) => {
    // The API must be gated independently of the page — a logged-out client must not save cards.
    const res = await request.post("/api/cards", { data: [{ question: "q", answer: "a" }] });

    expect(res.status()).toBe(401);
  });
});
