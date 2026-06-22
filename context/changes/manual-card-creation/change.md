---
change_id: manual-card-creation
title: Manual card creation
status: implemented
created: 2026-06-21
updated: 2026-06-22
archived_at: null
---

## Notes

Roadmap slice **S-04** (Stream B — deck authoring & management). The smallest
card-creation path: a logged-in user types a question and an answer and saves a
single flashcard to their deck with `source:'manual'`. Independent of the AI
generation slice (S-01); branches directly off F-01.

Outcome (from roadmap.md): user can create a flashcard manually by entering a
question and an answer, saved to their deck with manual origin.

- PRD refs: FR-011 (manual card creation); §Business Logic (atomic Q/A pair);
  §Access Control (per-user decks, redirect unauth to sign-in).
- Prerequisites: F-01 (shipped — `flashcards` table with RLS + grants + origin flag).
- The manual-origin write feeds the denominator of the "75% of cards via AI"
  success metric, so it shares F-01's `source` flag.
- Links to S-02: the `flashcards` table now carries FSRS schedule columns whose
  defaults (`due = now()`, `state = 0/New`, zeros) make a manually-created card
  immediately reviewable with no insert-path change — no coordination needed.
- This plan was drafted autonomously (no human Q&A); every decision is the
  recommended default grounded in existing codebase patterns and is recorded in
  the plan's "Open Risks & Assumptions" section.
