import { test as setup, expect } from "@playwright/test";
import { ensureTestUser } from "./support/supabase";
import { E2E_USER, AUTH_FILE } from "./support/config";

// One-time authentication. Creates a confirmed user, signs in through the real UI exactly once,
// and persists the session to storageState. Individual tests reuse that state and never log in
// through the UI (E2E rule: authenticate without the UI). This is the reproducible, CI-friendly
// equivalent of `playwright-cli state-save`.
setup("authenticate", async ({ page }) => {
  await ensureTestUser(E2E_USER.email, E2E_USER.password);

  await page.goto("/auth/signin");

  // The sign-in form is a `client:load` React island. Filling + clicking before it hydrates drops
  // the value from React's controlled state, so onSubmit preventDefaults on an "empty" field and no
  // navigation happens. Retry the fill+submit until the redirect lands — this waits on STATE (the
  // /dashboard navigation), not a timeout. Mirrors the `submitForm` helper in password-reset.spec.ts.
  await expect(async () => {
    await page.getByLabel("Email", { exact: true }).fill(E2E_USER.email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Sign-in redirects to "/dashboard" on success — wait for that state, not a timeout.
    await page.waitForURL("/dashboard", { timeout: 3000 });
  }).toPass({ timeout: 15_000 });

  // Prove the session is real: the protected route now renders instead of redirecting.
  await page.goto("/generate");
  await expect(page.getByRole("heading", { name: "Turn your notes into cards" })).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
