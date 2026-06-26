# Introducing promptfoo to project

## Research

/10x-research code-review-evals Analyze the current state of '@packages/code-reviewer' in the context of potential eval introduction - reusability of prompts, importability of agent, etc. My first pick for eval toolkit is promptfoo. If my tech stack is aligned with this tool, go in that direction. Otherwise, you can analyze other oss tools allowing me to eval my prompts and agents. Use Web Search or context7 to get the most up to date docs.

## Plan

/10x-plan code-review-evals Plan how to introduce promptfoo within '@packages/code-reviewer'. My goal is to create first configuration, allowing me to test the same code review prompt on three different models (z-ai/glm-5.1 and deepseek/deepseek-v4-flash). For test cases, there should be one, rather complex diff migrating React 16 component into React 19+ with three impactful flaws in it. LLM-as-a-judge should verify whether code review results correctly identify what is broken. You can also add static test verifying if code review actually fail.