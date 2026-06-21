/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// NOTE: we deliberately do NOT use Astro's `getViteConfig` here. It loads the
// `@astrojs/cloudflare` adapter's Vite plugin, which rejects Vitest's environment options
// ("resolve.external ... incompatible with the Cloudflare Vite plugin") and aborts at startup.
// The code under test is pure logic over global `fetch` + Zod (or talks to PostgREST directly), so
// a plain Vite/Vitest config with two manual aliases is faithful and avoids the workerd plugin.
//
// The load-bearing line is the `astro:env/server` alias: without it Vite cannot resolve that
// virtual id under Vitest and `generation.ts` / `supabase.ts` fail to transform before any
// `vi.mock` could apply. The alias key must be the exact id. The `@` alias mirrors tsconfig `@/*`.
const alias = {
  "astro:env/server": fileURLToPath(new URL("./test/stubs/astro-env-server.ts", import.meta.url)),
  "@": fileURLToPath(new URL("./src", import.meta.url)),
};

const sharedTest = {
  environment: "node" as const,
  globals: true,
  unstubGlobals: true,
};

// Two projects split the suite along the Docker boundary:
//   - "unit": Docker-free. Service logic + API route handler tests (mocked Supabase). `npm test`.
//   - "integration": needs a running local Supabase (RLS two-user isolation). `npm run test:integration`.
// `npm test` runs only the unit project (`--project unit`), so the Docker-free floor stays green.
export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          ...sharedTest,
          name: "unit",
          include: ["src/**/*.test.ts", "test/handlers/**/*.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          ...sharedTest,
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
