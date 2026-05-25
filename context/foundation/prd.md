---
project: "10xCards"
version: 1
status: draft
created: 2026-05-25
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-06-15
  after_hours_only: true
---

# 10xCards — Product Requirements Document

## Vision & Problem Statement

Working professionals — developers, doctors, lawyers — who must absorb large volumes of domain knowledge from articles, online courses, and reference material face an acute time bottleneck right before a deadline (certification exam, board exam, project kickoff). They know spaced repetition works, but manually crafting high-quality flashcards from source material is so expensive in time that they either skip spaced repetition entirely or reach the deadline under-prepared. The pain is not "I want to learn"; it is "the upfront card-creation cost makes the most effective learning method unusable when I need it most".

The insight is that modern AI-generated flashcards have crossed the "good enough" quality threshold. The historical tradeoff — slow hand-crafted cards versus no cards at all — has flipped. 10xCards bets that paste-source-text-and-accept-AI-cards beats the manual workflow by enough margin that professionals who never adopted spaced repetition will adopt it now, and existing spaced-repetition users will produce far more cards than they otherwise would.

## User & Persona

**Primary persona — the upskilling professional.** A working developer, doctor, or lawyer studying for a specific deadline: a cloud certification, medical board recertification, bar exam in a new specialty, or domain ramp-up for a new project. Their study material is heterogeneous: articles, online-course transcripts, textbook chapters, internal reference docs. They reach for 10xCards during the pre-deadline crunch window — typically a few weeks before the deadline — when their backlog of unconverted reading is large and hand-building cards is no longer something they can absorb.

Flashcard data is per-user — each professional's deck is private and tied to their account. The product requires authentication; details of the access model are captured in `## Access Control`.

## Success Criteria

### Primary

- A new user, in a single sitting, can sign up, verify email, paste a source text, accept AI-generated flashcards into their deck, and complete at least one spaced-repetition review session driven by an off-the-shelf spaced-repetition algorithm. The full end-to-end flow (sign-up → generate → accept/edit → review) works.
- **75% of AI-generated flashcards are accepted by users** — the AI quality is good enough that users keep most cards without editing or rejecting.
- **75% of all flashcards in the system are created via AI generation** — the AI path is the dominant authoring path, not a side feature.

### Secondary

- **7-day return retention.** A user who completed a first review session returns for a second review session within 7 days. Indicates the product enters the user's study rhythm, not just a one-time trial.

### Guardrails

- **Source-text privacy.** Source text pasted into the generator is not retained beyond what is required to produce the flashcards for that request, is never written to operator-readable logs, and is never used to train any model. Even a flawless Primary outcome is a failure if a user's confidential study material leaks.
- **No data loss.** Once a flashcard is accepted into a deck, it persists across sessions and devices for the lifetime of the account. A review session in progress survives navigation, refresh, and transient network failures without losing the user's answers or the schedule updates already applied.

## User Stories

### US-01: Generate flashcards from pasted source text

- **Given** a logged-in user on the generator page
- **When** they paste source text into the input area and trigger AI generation
- **Then** they receive a batch of candidate flashcards, each shown as a question/answer pair with controls to accept, edit, or reject independently

#### Acceptance Criteria

- Generation completes within the user-visible latency budget defined in NFRs.
- The user can accept, edit, or reject each candidate individually; no card enters the deck until the user invokes the save action.
- Saved cards persist to the user's deck immediately and are visible in deck browse.
- Source text used for the request is not retained beyond what is required to produce the response.

### US-02: Review flashcards in a spaced-repetition session

- **Given** a logged-in user with at least one card scheduled for review
- **When** they start a review session
- **Then** they see each due card one at a time, can reveal the answer, and rate their recall — the next-review schedule for each card updates after each rating

#### Acceptance Criteria

- Card order within a session is determined by the spaced-repetition algorithm, not by the user.
- Each rating action persists the updated schedule before the next card is presented.
- A session interrupted mid-way (navigation, refresh, transient network failure) preserves progress on the cards already rated; resuming returns the user to the next un-rated due card.

## Functional Requirements

### Anonymous Trial

- FR-001: First-time visitor can paste source text and trigger AI flashcard generation without creating an account. Priority: must-have
  > Socratic: Counter-argument considered: "account-first creates friction and hides AI value behind a signup wall." Resolution: added anonymous-trial generation as a distinct FR (this one) so visitors can experience the core insight before committing. Original signup capability is preserved (FR-003).
- FR-002: When an anonymous visitor signs up in the same browser session, any cards they generated during the trial are imported into their new account. Priority: must-have
  > Socratic: Companion to FR-001. Without claim-on-signup the anonymous trial is a dead-end demo. Resolution: kept as must-have; the trial→account hand-off is what makes the onboarding hook real.

### Auth

- FR-003: User can sign up with email and password. Priority: must-have
- FR-004: User can verify their email address via a confirmation link before the account is usable. Priority: must-have
  > Socratic: Counter-argument considered: "trust-on-signup ships faster; verify lazily at first recovery." Resolution: rejected. Trust-on-signup paired with deferred password reset (FR-006) would silently violate the 'no data loss' guardrail — a typo'd email blocks recovery permanently. Email infrastructure is required regardless for FR-006, so the marginal cost of verify-at-signup is zero.
- FR-005: User can sign in with email and password; the user remains signed in for at least 7 days by default. Priority: must-have
  > Socratic: Counter-argument considered: "short sessions are safer." Resolution: the persona is a pre-deadline professional using the product daily for weeks; forcing daily re-auth is friction without a corresponding security win. Session-length acceptance criterion added.
- FR-006: User can request a password-reset link by email and complete the reset via that link. Priority: must-have
  > Socratic: Counter-argument considered: "defer to v2 with 'contact us' fallback to save 3-week scope." Resolution: rejected. Without self-serve reset the 'no data loss' guardrail is hollow — a forgotten password becomes a lost deck. Email infrastructure is already on the critical path for FR-004; reset reuses it.
- FR-007: User can sign out, terminating their session. Priority: must-have
  > Socratic: Counter-argument considered: "rely on session expiry; explicit logout is UX nice-to-have." Resolution: rejected. The professional persona realistically uses shared / on-call laptops; missing explicit logout is a real privacy concern at trivial implementation cost.

### AI Generation (authenticated)

- FR-008: Authenticated user can paste source text and trigger AI flashcard generation. The pasted input is capped at approximately 10 000 characters, and a single generation produces at most ~30 candidate cards. The limits are shown in the UI before the user submits. Priority: must-have
  > Socratic: Counter-argument considered: "no limit — observe costs in production." Resolution: rejected. Unbounded input invites runaway generation cost and timeouts; user expectations about generation latency would also be unmanageable. Hard limits added as acceptance criteria.
- FR-009: User can review each AI-generated candidate card and accept, edit, or reject it independently before any card enters their deck. Priority: must-have
  > Socratic: Counter-argument considered: "bulk-accept-all is faster; edit later in deck." Resolution: rejected. Per-card decision is the signal channel for the Success Criterion "75% AI cards accepted by users" — bulk-accept would invalidate the metric. Per-card stays.
- FR-010: User can save accepted cards to their personal deck in a single bulk action at the end of a generation session; the in-progress session (candidate cards, accept/reject decisions) survives a page refresh until either saved or explicitly discarded. Priority: must-have
  > Socratic: Counter-argument considered: "auto-save per accepted card maximizes the 'no data loss' guardrail." Resolution: rejected. Bulk save preserves user intent ("save these X cards") and avoids polluting the deck with abandoned mid-session work; session-state persistence handles the data-loss concern without auto-save.

### Manual Card Creation

- FR-011: User can create a flashcard manually by entering a question and an answer. Priority: must-have
  > Socratic: Counter-argument considered: "75% of cards come via AI; manual path can be deferred — edit-after-stub-gen is a workable hack." Resolution: rejected. Source-text-less use cases (terminology from memory, single ad-hoc card) are common enough in the persona's workflow that gating manual creation behind AI generation is a real-user blocker.

### Deck Management

- FR-012: User can browse all flashcards in their deck. The list handles hundreds of cards via pagination or virtualized scrolling; no full-text search or tag filter in the MVP. Priority: must-have
  > Socratic: Counter-argument considered: "add search/filter in MVP for 100+ card decks." Resolution: search deferred to v2 — the pre-deadline persona generates and reviews against the spaced-repetition schedule, not by free-form browsing. Acceptance criterion added for pagination/scroll only.
- FR-013: User can edit any flashcard (question or answer) after creation. Editing the content does NOT reset the card's spaced-repetition schedule — the card retains its review history and next-review timing. Priority: must-have
  > Socratic: Counter-argument considered: "edit resets schedule because content drift = new card." Resolution: rejected for MVP. The typo-fix penalty (lost progress) is worse than the rare case of substantial content drift. Schedule-preserving edit is the default; users can manually re-create if they want a fresh schedule.
- FR-014: User can delete any flashcard from their deck. Deletion is permanent (no restore, no archive) but requires an explicit confirmation prompt before it proceeds. Priority: must-have
  > Socratic: Counter-argument considered: "an archive-with-restore flow is safer." Resolution: rejected. Preserving deleted cards in an archive adds a separate archive view, a retention policy, and a restore action — too much scope for the 3-week MVP. The confirmation prompt catches the accidental-click case; intentional-delete-regret is rare enough to defer.

### Spaced Repetition Review

- FR-015: User can start a review session in which an off-the-shelf spaced-repetition algorithm decides the order and timing of cards due for review. Priority: must-have
  > Socratic: Counter-argument considered: "lock a specific spaced-repetition algorithm in the PRD" and "add an acceptance criterion that the algorithm must be modern-class." Resolution: both rejected. Stack openness is binding — the algorithm choice is downstream of this PRD, in the tech-stack-selection step. The PRD captures the capability and leaves the algorithm-shape as a stack decision.
- FR-016: User can rate their recall on each reviewed card using a four-level scale (Again / Hard / Good / Easy); the card's next-review schedule updates after each rating. Priority: must-have
  > Socratic: Counter-argument considered: "binary Pass/Fail is simpler UX." Resolution: rejected. Modern spaced-repetition algorithms rely on a richer recall-quality signal; binary rating throws away information that improves retention. Four-key rating is a recognized recall-quality scale and acceptable for a keyboard-driven review session.

## Non-Functional Requirements

- A user who triggers AI flashcard generation sees the first rendered candidate card within 15 seconds of submitting, at the 95th percentile. Operations that exceed 2 seconds present continuous visible progress to the user.
- Source text submitted to the generator leaves no trace in operator-readable storage or logs after the request that consumed it completes, and is never used to train any model. The text exists only for the lifetime of the generation request.
- The product remains fully functional on the latest two major versions of the four mainstream desktop browsers. Mobile-web is not in scope for the MVP.
- A user can complete a full spaced-repetition review session — reveal answer, rate recall, advance to next card — using only the keyboard. No interaction in the review loop requires a mouse or touch.
- For a deck of fewer than 1 000 cards, list browse, card edit, and review-session card transitions complete in under 300 milliseconds at the 95th percentile, as perceived by the user.

## Business Logic

Given user-supplied source text, 10xCards produces a set of question/answer flashcards distilled from that text, each pair representing a single learnable fact, sized for spaced-repetition recall.

The user-facing input is a chunk of source text — an article, a course transcript, a chapter excerpt, a reference doc — pasted into the generator. The output is a batch of candidate flashcards, each a question on one side and an answer on the other, each scoped to one atomic concept the user can practice recalling in isolation. The user encounters the rule at the moment they trigger generation: within a single user-perceived operation, what was a paragraph of prose becomes a reviewable set of cards. The rule's quality is operationalized by the Success Criteria — the product is doing its job when 75% of generated cards are accepted by the user, indicating the distillation matched what they actually wanted to remember.

Cards are atomic by construction: one fact per card, the question is self-contained (does not require context outside the card to make sense), and the answer is unambiguous. Multi-fact paragraphs are split, not collapsed. Cards that fail to be atomic, self-contained, or unambiguous are expected to be rejected or edited in FR-009, which is why per-card review is on the critical path.

## Access Control

Multi-user product. Every flashcard belongs to exactly one user account; no sharing, no team workspaces, no admin visibility into another user's deck.

**Authentication.** Email and password. Sign-up requires email verification before the account is usable. Password reset via an emailed reset link is supported from day one — a professional studying for a deadline cannot afford to lose access to their deck because they forgot a password.

**Role model.** Flat — one user role. Every authenticated user has the same capabilities over their own data (create, read, update, delete flashcards; run AI generation against pasted text; run review sessions). No admin role, no moderation surface, no privileged tier in the MVP.

**Unauthenticated access.** The marketing/landing page and the auth pages (sign-up, sign-in, password reset, email confirmation) are publicly reachable. The anonymous-trial generator (FR-001) is also publicly reachable; saving the generated cards into a deck requires creating an account. Every other route — deck browse, deck management, review session — requires a valid authenticated user and redirects unauthenticated visitors to sign-in.

## Non-Goals

- **No custom spaced-repetition algorithm.** The MVP integrates an off-the-shelf scheduler; we do not write our own scheduling logic. Building it is months of work and a solved problem.
- **No import of formatted documents (PDF, DOCX, HTML, EPUB, etc.).** Input is plain text pasted into a textarea, nothing else. File parsing is a rabbit-hole of edge cases.
- **No sharing, collaboration, team workspaces, or public/discoverable decks.** Every deck is private to its owner. No share links, no copy-deck flow, no community library.
- **No mobile-native applications and no integrations with external learning platforms.** Web only; no platform plumbing.
- **No search, filter, or tagging in the deck browse view.** A simple list with pagination/scroll handles the MVP. Search is a v2 concern.
- **No restore, archive, undo, or recovery flow for deleted cards.** Permanent deletion with a confirmation prompt is the only deletion path. Restore is a v2 concern.
- **No analytics dashboard, retention metrics, or streak/progress UI for the end user.** The Success Criteria are measured by the operator, not exposed to the user, in the MVP.
- **No in-product picker for the underlying generation model.** Users do not select among AI providers or models in the MVP; a single default is used invisibly.

## Open Questions

1. **Scope-vs-timeline confirmation.** During shaping, the functional-requirement list expanded from the originally sketched 14 to 16 FRs (anonymous-trial generation FR-001 and claim-on-signup FR-002 added) while the 3-week MVP timeline and 2026-06-15 hard deadline were held constant. Is the expanded scope still realistic within the timeline, or should the anonymous-trial path (FR-001, FR-002) be demoted to nice-to-have / deferred to v2 to protect the timeline? — Owner: project lead. By: start of build (2026-05-28).
