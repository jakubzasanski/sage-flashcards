#!/usr/bin/env node
// PostToolUse (Write|Edit) hook: lint the single file the agent just touched.
// Exit 2 => stderr is fed back to Claude as blocking feedback.
import { execSync } from "node:child_process";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0); // no/garbled payload — don't block
  }

  const filePath = data?.tool_input?.file_path;
  if (!filePath) process.exit(0);

  // Only lint files ESLint actually handles in this project.
  if (!/\.(ts|tsx|astro|js|jsx|mjs|cjs)$/.test(filePath)) process.exit(0);

  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    execSync(`npx eslint --fix ${JSON.stringify(filePath)}`, {
      cwd,
      stdio: "pipe",
    });
  } catch (e) {
    const out =
      (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
    console.error(`ESLint reported issues in ${filePath}:\n${out}`);
    process.exit(2); // blocking — Claude sees this and should fix it
  }
  process.exit(0);
});
