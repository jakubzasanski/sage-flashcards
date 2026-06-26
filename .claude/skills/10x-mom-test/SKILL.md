---
name: 10x-mom-test
description: >
  Validate any idea — product, feature, internal tool, service, or workflow —
  using The Mom Test principles before building. Use after someone has a draft
  idea or supporting notes (user interviews, tickets, or a shape/PRD/roadmap/
  opportunity-map) and wants to check whether the problem is real. Produces a
  non-leading critique, an interview guide, survey questions, and go/no-go
  decision criteria grounded in past behavior and concrete pain, not opinions
  about the solution.
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

# Mom Test: Validate The Problem Before Building

This skill stress-tests an idea before implementation. It helps the user avoid polite false positives, aspirational answers, and surveys that ask people to approve a solution they have not actually needed. It works for any kind of idea — a consumer app, a B2B SaaS, a feature, an internal tool, or a service business.

Default to English. Switch to Polish (or any other language) if the user writes to you in it.

## Core Rule

Never ask whether people like the idea, would use the product, or think the feature is useful. Ask about what they already do, what happened recently, what they tried, what cost they paid, and what workaround exists today.

Good questions reveal behavior (across domains):

- "Walk me through the last time you tried to plan a week of meals — what did you actually do?"
- "What did you do the last time an invoice didn't match the work delivered?"
- "When did you last manually check which PRs were blocking a release?"
- "How do you handle that today, without any new tool?"

Weak questions invite politeness or fantasy:

- "Would you use a product like this?"
- "Do you like this idea?"
- "Would a dashboard with this data be useful?"
- "How much would you pay for this?"

## Inputs

Accept any of:

- an inline idea,
- notes from users, customers, tickets, incidents, support threads, meeting notes, or prior interviews,
- a supporting artifact if one exists, such as `context/team/opportunity-map.md`, `context/foundation/shape-notes.md`, `context/foundation/prd.md`, or `context/foundation/roadmap.md`.

If no input exists, ask for:

1. the idea or solution being considered,
2. target users, customers, or roles,
3. the suspected problem or friction,
4. whether the user wants interviews, a survey, or both.

## Process

### Step 1: Extract The Hypotheses

Read the provided material and extract:

- **User/role**: who has the problem.
- **Suspected friction**: what repeated pain exists.
- **Current workaround**: how the user likely solves it today.
- **Proposed solution**: what the builder wants to create.
- **Risky assumptions**: claims that could be wrong.
- **Evidence already present**: facts from logs, tickets, interviews, incidents, or usage data.

Separate facts from guesses. If the PRD is polished but evidence is thin, say so plainly.

### Step 2: Challenge The Idea In Conversation

Run a short critique before generating questions:

- Where might the user be confusing a solution with a problem?
- Which assumptions depend on future intent instead of past behavior?
- What would prove that the problem is not worth building for?
- What existing product, tool, process, or manual workaround might already be good enough?
- What would count as strong evidence to proceed?

Ask up to three clarifying questions only when needed. Prefer questions about users, recent incidents, current workarounds, or decision stakes.

### Step 3: Rewrite Bad Questions

If the user provides draft questions, classify each one:

- `keep`: concrete and behavior-based,
- `rewrite`: useful intent but leading/abstract,
- `drop`: asks for compliments, hypotheticals, pricing fantasy, or solution approval.

For every rewrite, show:

```text
Instead of:
[bad question]

Ask:
[better question]

Why:
[what signal this question can reveal]
```

### Step 4: Produce Interview Guide

Create a 20-30 minute interview guide:

1. **Context warm-up**: role, workflow, frequency.
2. **Recent story**: ask about the last real occurrence of the friction.
3. **Current workaround**: tools, people, artifacts, time, errors.
4. **Cost of pain**: delays, rework, risk, coordination load.
5. **Existing alternatives**: products, tools, scripts, dashboards, manual habits, or rituals.
6. **Decision signal**: what would make this worth changing.
7. **Closing ask**: permission to follow up or inspect anonymized artifacts.

Include 8-12 questions. Keep them neutral. Add optional follow-ups for interesting answers.

### Step 5: Produce Survey

Create a short survey for broader signal:

- 6-10 questions maximum.
- Prefer multiple-choice ranges for frequency and effort.
- Include 1-2 open questions about recent examples.
- Avoid asking users to rank a solution they have not experienced.
- Include one screener question that checks whether the respondent actually faces the workflow.

The survey should produce evidence for a go/no-go decision, not applause.

### Step 6: Define Decision Criteria

End with concrete criteria:

- **Proceed** if: [observable threshold]
- **Narrow scope** if: [mixed signal]
- **Do not build yet** if: [weak signal]
- **Try existing tool/process first** if: [an existing product, tool, or process is already good enough]

Use thresholds appropriate to the context, for example:

- "At least 3 of 5 interviewees describe the same recent workaround without being prompted."
- "At least 40% of surveyed target users report this happening weekly or more."
- "The pain costs measurable time, money, or rework — not just mild annoyance."

## Output Artifact

Offer to write the result to `context/team/mom-test-validation.md` when a `context/` directory exists or the user wants a durable artifact. Create the `context/team/` directory if it doesn't exist (`mkdir -p`). If the user prefers a different path, use it.

Use this shape:

```markdown
# Mom Test Validation Plan

## Input Idea

[short summary]

## Hypotheses

- **User/role**:
- **Friction**:
- **Current workaround**:
- **Risky assumptions**:
- **Evidence already present**:

## Critique

[non-leading critique]

## Interview Guide

[questions + follow-ups]

## Survey

[questions]

## Decision Criteria

- **Proceed**:
- **Narrow scope**:
- **Do not build yet**:
- **Try existing tool/process first**:
```
