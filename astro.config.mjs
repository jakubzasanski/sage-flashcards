// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
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
