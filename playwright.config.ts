import { defineConfig, devices } from "@playwright/test";

// E2E config for the 10xDevs flashcards app. Drives a PRODUCTION build served by
// `astro preview` (Cloudflare workerd) against a local Supabase — not `astro dev`, whose
// on-the-fly compilation intermittently wedges SSR (auth pages stream empty) and injects a
// click-intercepting dev toolbar. The preview build is deterministic. See tests/e2e/CLAUDE.md
// for the E2E rules every spec must follow, and tests/e2e/seed.spec.ts for the exemplar.

const PORT = 4321; // Astro dev default
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI: github annotations + an HTML report written to playwright-report/ (uploaded as an
  // artifact on failure by ci e2e job). `open: "never"` so the reporter never blocks the runner.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    // Logs in once through the real UI and writes storageState. Everything else depends on it.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Authenticated session captured by the setup project — tests never log in via the UI.
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  // Build then serve the production output. We do NOT reuse an already-running server: a stale
  // `astro preview` left over from a prior run keeps serving its old `dist/`, so reusing it runs
  // the suite against outdated code (false pass/fail) — and reusing a flaky `astro dev` reintroduces
  // the SSR-wedge/dev-toolbar problems this preview setup exists to avoid. Always building fresh
  // (locally and in CI) guarantees e2e tests the current code; Playwright owns the server lifecycle
  // and tears it down on exit. If the port is occupied, Playwright fails fast — free :4321 and re-run.
  webServer: {
    command: "npm run build && npm run preview",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
