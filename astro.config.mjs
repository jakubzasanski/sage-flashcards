// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";
import { createLogger } from "vite";

// Filter one upstream-only Vite 8 deprecation: @astrojs/cloudflare@14 still sets
// `optimizeDeps.esbuildOptions` (an esbuild banner/plugin workaround that can't be naively
// remapped to Rolldown's options). It's harmless dev-time dep-optimization noise — drop just
// that line until the adapter migrates, leaving every other warning intact.
const logger = createLogger();
const baseWarn = logger.warn.bind(logger);
/** @type {typeof logger.warn} */
logger.warn = (msg, options) => {
  if (msg.includes("optimizeDeps.esbuildOptions")) return;
  baseWarn(msg, options);
};

// https://astro.build/config
export default defineConfig({
  site: "https://sage-flashcards.zasanski.workers.dev",
  output: "server",
  compressHTML: true,
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    customLogger: logger,
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // LLM provider is any OpenAI-compatible chat-completions endpoint (OpenAI direct by default,
      // OpenRouter or a local proxy by overriding LLM_BASE_URL). Model is swappable, no redeploy.
      LLM_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      LLM_BASE_URL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
        default: "https://api.openai.com/v1",
      }),
      LLM_MODEL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
        default: "gpt-5-mini",
      }),
    },
  },
});
