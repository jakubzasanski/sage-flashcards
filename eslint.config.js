/* eslint-disable @typescript-eslint/no-deprecated -- tseslint.config() is the only way to use extends; core defineConfig has incompatible API */
import { includeIgnoreFile } from "@eslint/config-helpers";
import eslint from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import eslintPluginAstro from "eslint-plugin-astro";
import eslintReact from "@eslint-react/eslint-plugin";
import reactCompiler from "eslint-plugin-react-compiler";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import path from "node:path";
import tseslint from "typescript-eslint";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

const baseConfig = tseslint.config({
  extends: [eslint.configs.recommended, tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "no-console": "warn",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  },
});

const reactConfig = tseslint.config({
  files: ["**/*.{js,jsx,ts,tsx}"],
  // @eslint-react replaces eslint-plugin-react, which is stuck on the pre-ESLint-10 rule
  // context API (calls the removed `context.getFilename()`) and has no compatible release.
  extends: [eslintReact.configs["recommended-typescript"]],
  languageOptions: {
    globals: {
      window: true,
      document: true,
    },
  },
  plugins: {
    "react-hooks": eslintPluginReactHooks,
    "react-compiler": reactCompiler,
  },
  rules: {
    ...eslintPluginReactHooks.configs.recommended.rules,
    "react-compiler/react-compiler": "error",
  },
});

const astroConfig = tseslint.config({
  files: ["**/*.astro"],
  languageOptions: {
    parserOptions: {
      // astro-eslint-parser doesn't support `projectService` (inherited from baseConfig);
      // pin typed linting to `project` here to avoid the fallback warning on .astro files.
      projectService: false,
      project: true,
    },
  },
  rules: {
    "astro/no-set-html-directive": "error",
    "astro/no-unused-css-selector": "warn",
    "astro/prefer-class-list-directive": "warn",
  },
});

export default tseslint.config(
  includeIgnoreFile(gitignorePath),
  // Supabase-generated DB types are overwritten on every `supabase gen types` run, so
  // linting them is futile (in-file fixes get wiped) and they don't match prettier/strict rules.
  // `.claude/` holds Claude Code harness scripts (hooks) that live outside any tsconfig, so the
  // typed `projectService` can't resolve them — they're tooling, not app source, so skip them.
  // `packages/` are independent sub-packages with their own tsconfig + node_modules (e.g. the
  // Codex-SDK code-review agent); the app's typed lint can't resolve their deps, so skip them.
  { ignores: ["src/db/database.types.ts", ".claude/**", "packages/**"] },
  baseConfig,
  reactConfig,
  eslintPluginAstro.configs["flat/recommended"],
  ...eslintPluginAstro.configs["flat/jsx-a11y-recommended"],
  astroConfig,
  eslintPluginPrettier,
);
