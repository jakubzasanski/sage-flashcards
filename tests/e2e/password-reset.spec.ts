/**
 * FR-006 (roadmap S-05): self-serve password reset, end to end. The highest-value automated
 * coverage for the one net-new auth flow. Drives the REAL flow: request → recovery email (read from
 * the local mail server) → open link → set new password → sign in with the new password.
 *
 * This spec is the rare one that legitimately does NOT use the shared storageState: it owns a fresh,
 * throwaway user (timestamped, re-run-safe) and exercises the UNauthenticated reset path. Changing a
 * password must not touch the shared E2E_USER other tests sign in as.
 *
 * Requires local Supabase running (Docker) — the recovery link only exists in the local mailbox.
 */
import { test, expect } from "@playwright/test";
import { ensureTestUser } from "./support/supabase";
import { getLatestRecoveryLink } from "./support/mailpit";

// Logged-out for the whole file — the reset flow is the unauthenticated experience.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("password reset (FR-006)", () => {
  test("request → email link → set new password → sign in with it", async ({ page }) => {
    // Fresh throwaway user so the test is re-run-safe and never mutates the shared E2E_USER.
    const runId = Date.now();
    const email = `reset-${runId}@example.com`;
    const oldPassword = "old-password-12345";
    const newPassword = "new-password-67890";
    await ensureTestUser(email, oldPassword);

    // (1) Request the reset and land on the neutral, non-enumerating confirmation.
    await page.goto("/auth/forgot-password");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("we've sent a password-reset link", { exact: false })).toBeVisible();

    // (2) Read the recovery link from the local mail server (polled, not timed) and confirm its shape.
    const link = await getLatestRecoveryLink(email);
    expect(link).toContain("/auth/reset-password");
    expect(link).toContain("token_hash=");
    expect(link).toContain("type=recovery");

    // (3) Opening the link establishes the recovery session and shows the new-password form.
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();

    // (4) Set the new password → redirected back to sign-in with the success banner.
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await page.waitForURL("/auth/signin?reset=1");
    await expect(page.getByText("Your password has been updated", { exact: false })).toBeVisible();

    // (5) Sign in with the NEW password → reach the app and prove a protected route renders.
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/");

    await page.goto("/generate");
    await expect(page.getByRole("heading", { name: "Generate flashcards" })).toBeVisible();
  });

  test("an invalid/expired recovery link shows the 'request a new link' state", async ({ page }) => {
    // The recovery handoff lives in the .astro page, so handler tests can't reach it. A junk
    // token_hash drives verifyOtp's failure branch — proving it's wired, not just the happy path.
    await page.goto("/auth/reset-password?token_hash=invalid-junk&type=recovery");

    await expect(page.getByRole("heading", { name: "This reset link is invalid or has expired" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
  });
});
