#!/usr/bin/env node
// PostToolUse (Write|Edit) hook: project-wide type check after a source edit.
// astro check covers .astro + .ts/.tsx. Exit 2 => feedback goes back to Claude.
// NOTE: this runs the whole project. If it gets slow, move it to .husky/pre-commit
// (see lint-staged config) and drop this hook from settings.json.
import { execSync } from "node:child_process";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const filePath = data?.tool_input?.file_path || "";
  // Only bother type-checking when a type-relevant file changed.
  if (!/\.(ts|tsx|astro)$/.test(filePath)) process.exit(0);

  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    execSync(`npx astro check`, { cwd, stdio: "pipe" });
  } catch (e) {
    const out =
      (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
    console.error(`Type errors detected:\n${out}`);
    process.exit(2); // blocking
  }
  process.exit(0);
});