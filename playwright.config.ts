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
  reporter: process.env.CI ? "github" : "list",
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
  // Build then serve the production output. Reuses a preview already running locally (fast
  // iteration); builds fresh in CI. NOTE: don't leave `npm run dev` running on this port during
  // e2e — the reused server must be the preview build, not the flaky dev server.
  webServer: {
    command: "npm run build && npm run preview",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
