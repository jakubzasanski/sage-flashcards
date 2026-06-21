---
change_id: first-ai-cards-to-deck
title: Generate AI flashcards from pasted text and save accepted ones to the deck
status: archived
created: 2026-06-19
updated: 2026-06-21
archived_at: 2026-06-21T14:15:16Z
---

## Notes

Roadmap item **S-01** (the north star, `context/foundation/roadmap.md`). The core product hypothesis: paste source text → accept AI-distilled candidate cards → persist to deck. Covers US-01, FR-008 (generate w/ caps), FR-009 (per-card accept/edit/reject), FR-010 (bulk save + refresh-surviving session). Builds on F-01 (`flashcards` table, typed client, `CreateFlashcardCommand` DTO, RLS). Provider: OpenRouter via fetch (resolves roadmap Open Q#2). Privacy guardrail: source text is never logged or persisted server-side.
