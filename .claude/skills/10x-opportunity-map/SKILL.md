---
name: 10x-opportunity-map
description: >
  Turn recurring friction or an unmet need into a
  build-vs-buy-vs-complement-vs-wait decision artifact: an opportunity map with
  the existing/default response, a thin complement, a first useful version, and a
  data-risk caveat, plus one recommended candidate to try. Works for any idea —
  product, feature, internal tool, service, or automation — with a worked
  internal-builder lens. Use when someone wants to classify pain or signals,
  decide whether something is worth building before writing code, or sort a "let's
  build a dashboard / agent / app / automation" idea into build, buy, complement,
  or wait.
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

# Opportunity Map: Classify Ideas Before Building

This skill helps the user decide whether a recurring friction or unmet need should be handled by an existing tool or default workflow, by a thin complement around what already exists, by a fuller build later, or by no build at all. It works for any idea — product, feature, internal tool, service, or automation. Opportunity mapping is a general technique; the running examples use an **internal-builder lens** (team tools, services, automations), because that is where build-vs-buy bites hardest and where the 10xDevs internal-builder path picks it up.

The output is a decision artifact, not an implementation plan. Do not write SDK code, CI configuration, packaging, auth, deployment, scheduling, or backlog/productization steps. If the candidate proves valuable, route that work forward (see Step 5).

Default to English. Switch to Polish (or any other language) if the user writes to you in it.

## Initial Response

When invoked:

1. If the user provided friction signals, notes, tickets, meeting notes, or a file path, read/capture them and continue.
2. If no concrete input was provided, ask for **3–5 recurring frictions or unmet needs** and the **sources** behind them (GitHub, Linear/Jira, CI, Slack, docs, support tickets, analytics, internal DB, CSV/mock data). Keep this open — friction is freeform; don't force it into options.
3. Capture the **data constraint** with AskUserQuestion, because it changes how lightweight the first version can be:

```
AskUserQuestion:
- question: "What data will the first version run on?"
  header: "Data"
  options:
  - label: "Mock / local / read-only / non-sensitive (Recommended)"
    description: "You can start light — no access control or auditing up front."
  - label: "Real company / customer / production data"
    description: "Access, permissions, and auditability thinking moves before implementation."
  - label: "Not sure yet"
    description: "We'll start from the least-sensitive variant and flag this as to-be-decided."
  multiSelect: false
```

Then explain that you will first classify the signals, and only recommend a first candidate if one earns it.

## Guardrails

- Treat "let's build a dashboard / agent / app / automation" as a proposed solution, not a friction signal. Ask what repeated pain, delay, coordination cost, or manual check it removes.
- Default generic/utility workflows to SaaS or existing tools unless the user shows local cross-system friction.
- Prefer complementing source systems over replacing them. A first version may link to PRs, tickets, jobs, docs, and records; it must not pretend to become the new system of record.
- Keep the first useful version narrow, local, read-only, and easy to throw away: a script, static report, CSV digest, spreadsheet-like view, or mocked dashboard.
- Escalate data risk early. Mock/local/read-only/non-sensitive data can stay lightweight. Real company/customer data needs access-control and auditability thinking before implementation.
- Watch for essential vs accidental complexity. Some friction is accidental and a thin complement genuinely shortens it; some is essential and reflects a real constraint or decision. Before calling friction "fixable", check it isn't friction that exists for a reason.
- Do not imply outcomes (career, growth, revenue). Leverage means real pain reduced and trust earned, not a guaranteed result.

## Process

### Step 1: Normalize Signals

Turn raw ideas into specific signals. Good signals are observable and repeated:

- "Every morning we manually check which PRs block the release."
- "Tickets and code changes drift apart, so status is hard to trust."
- "AI skills and rules are copied between repositories by hand."
- "Review comments repeat, but they are not encoded as a quality gate."

Weak signals need unpacking:

- "Build a dashboard."
- "Add an agent."
- "Automate everything."

For each weak signal, ask one short question that separates the pain from the proposed solution.

### Step 2: Classify Each Signal

Work through the signals **one at a time**, as a block per signal — don't render a wide table mid-conversation. Each block is easier to read and react to, and lets the user correct one signal before you move on:

```text
Signal: [repeated observable pain or unmet need]
  Existing / default response: [what existing tools or workflows already do]
  Thin complement: [the smallest complement around existing systems]
  First useful version: [local/read-only/mockable check]
  Data risk: [mock / local / read-only / non-sensitive / real company-customer data]
  Direction if it proves valuable: [product / feature / internal tool / service / wait]
```

Guidance for each field — keep the eventual table cells terse (a phrase, not a paragraph); push longer reasoning into Step 4 and the "Why this candidate" note:

- **Signal**: repeated observable pain or unmet need, preferably with a coordination cost.
- **Existing / default response**: what GitHub, Linear/Jira, Slack, Notion, CI, dashboards, native AI summaries, reports, filters, an off-the-shelf SaaS, or existing processes already do.
- **Thin complement**: a complement around existing systems, especially when value comes from joining two or more sources.
- **First useful version**: local/read-only/mockable version that validates value without full product responsibility.
- **Data risk**: `mock`, `local`, `read-only`, `non-sensitive`, or `real company/customer data`; add a practical caveat when data is sensitive.
- **Direction if it proves valuable** — the kind of thing it grows into once it has earned a regular user. Pick the general shape first: `Product`, `Feature` in an existing product, `Internal tool`, `Service`, or `Wait / no build` (signal weak, already solved, or not worth the maintenance). When the shape is an **internal tool**, the 10xDevs internal-builder paths refine it:
  - `Team agent` when it needs an SDK, tools, model calls, cost/privacy handling, or metrics.
  - `Review / CI gate` when the value is code review, PR gates, a Definition of Done, or CI behavior.
  - `Shared artifact registry` when the problem is shared skills, prompts, rules, commands, packages, or team artifact distribution.
  - `Async / remote work` when the helper should run remotely, asynchronously, or on a schedule.

Once all signals are classified, you can read them back as a compact comparison table (one row per signal, terse cells) — that scannable matrix is what lands in the saved artifact.

### Step 3: Recommend One Candidate

Pick at most one candidate for the first useful version. Rank by:

1. Repeats regularly.
2. Combines at least two information sources or two roles.
3. Has a clear manual pain today.
4. Can be tested read-only or on mock/exported data.
5. Does not replace an existing platform's responsibility.
6. Has a clear later direction if it proves valuable.

If no signal passes, recommend no build and explain which existing tool or default response should be tried first. Building two or three considered candidates beats shipping ten prototypes nobody maintains — the scarce resource is the attention to keep them alive, not the time to start them.

### Step 4: Draft The First Useful Version

For the selected candidate, write:

```text
Candidate:
[working name]

Reads:
[sources, e.g. GitHub export, Jira CSV, CI logs, mock data]

Returns:
[short report/view/digest description]

Does not do:
[what is intentionally excluded now]

Data risk:
[mock/local/read-only/non-sensitive or real company/customer data; for real data, say what access limitation must come first]

Direction if it proves valuable:
[product / feature / internal tool / service / wait]
```

Then add a short "Why this one, not the others" note.

### Step 5: Decide The Next Move

The opportunity map classifies the problem on paper. Before turning a classification into code, decide how to proceed:

```
AskUserQuestion:
- question: "You have a map and a candidate. What next?"
  header: "Next"
  options:
  - label: "Validate, then shape — /10x-mom-test → /10x-shape (Recommended)"
    description: "Pressure-test the problem in conversations about past behavior. If it survives, the validated opportunity feeds /10x-shape → /10x-prd → /10x-roadmap."
  - label: "Shape now without validating — /10x-shape → /10x-prd → /10x-roadmap"
    description: "Only when you are already confident the problem is real and the risk is understood. Skips the cheapest evidence step."
  - label: "Go straight to building — /10x-new → /10x-research → /10x-plan → /10x-implement"
    description: "When the signal is narrow, the first version is clear, and the risks are understood."
  - label: "Nothing for now"
    description: "Save the map and come back when more signals accumulate."
  multiSelect: false
```

Whichever path is chosen, the cheapest first step is usually a short conversation with the people who live with the friction (for an internal tool, the manager and the team it is for) — they often know why the friction exists and whether your picture of it is complete. Name the chosen skill in your closing message; do not run it yourself unless the user asks.

## Artifact

Offer to write the result. Use AskUserQuestion:

```
AskUserQuestion:
- question: "Save the opportunity map to a file?"
  header: "Save"
  options:
  - label: "Yes — context/team/opportunity-map.md (Recommended)"
    description: "The standard path. I'll create the directory if it's missing."
  - label: "Different path"
    description: "Give your own file location."
  - label: "Don't save"
    description: "Keep the map in the conversation only."
  multiSelect: false
```

When writing, create the target directory if needed (`mkdir -p`). Use this file shape:

```markdown
# Opportunity Map

## Context

- **Project / context**:
- **Data constraint**:
- **Date**:

## Map

One row per signal, terse cells (a phrase each) — longer reasoning belongs in the sections below:

| Signal | Existing / default response | Thin complement | First useful version | Data risk | Direction if valuable |
|---|---|---|---|---|---|

## Recommended First Candidate

[first useful version block]

## Why This Candidate

[brief justification]

## Next Direction If Valuable

[direction and rationale]
```
