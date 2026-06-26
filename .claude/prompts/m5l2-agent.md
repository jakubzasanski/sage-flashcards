# Pierwszy Agent zespołowy - v1

## Goal

/goal I want to follow @.claude/skills/ai-sdk/SKILL.md and integrate ai-sdk, openrouter provider and zod, making basic entry-point for further integration, let's call it src/index.ts — make sure that node works well with typescript and we use newest version of these libraries (you can use context7 if you need), tsx is also welcomed

## Plan

/10x-plan tool-loop-agent I want to convert '/packages/code-reviewer/src/index.ts' into well-organized, modular code review agent based on ai-sdk ToolLoopAgent. Use @packages/code-reviewer/.claude/skills/ai-sdk/SKILL.md to understand its API. Extract structured output schemas into separate modules, as well as prompts. Make sure agent module is reusable and exports our reviewer so that we can run promptfoo evals on it in the future. Do not configure eval environment in this change.
