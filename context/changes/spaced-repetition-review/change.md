---
change_id: spaced-repetition-review
title: Keyboard-driven spaced-repetition review session
status: impl_reviewed
created: 2026-06-21
updated: 2026-06-21
archived_at: null
---

## Notes

Roadmap slice **S-02** (Stream A — generation & review wedge). Completes the
core success loop generate → review now that F-01 (card persistence) and S-01
(first AI cards to deck) have shipped.

Outcome (from roadmap.md): user can start a review session where an
off-the-shelf scheduler picks due-card order, reveal each answer, rate recall on
a four-level scale (Again/Hard/Good/Easy) with the schedule updating after each
rating, and resume mid-session after navigation/refresh/network loss without
losing progress — fully keyboard-driven.

- PRD refs: US-02, FR-015, FR-016; NFR (keyboard-first; card transitions <300ms p95); Guardrail (no data loss / resumable session).
- Prerequisites: F-01, S-01 (both shipped).
- Extends F-01's `flashcards` schema with schedule columns at the point they're first exercised — coordinate with S-03 (schedule-preserving edit) if it lands out of order.
- Open decision for /10x-plan: which off-the-shelf SRS library/algorithm (FR-015 leaves the choice open). Candidate: `ts-fsrs`.
