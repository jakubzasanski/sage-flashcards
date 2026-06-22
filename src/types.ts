// Shared entities and DTOs for 10xCards. Per CLAUDE.md, cross-cutting types live here.
// Card persistence foundation (roadmap F-01).

import type { Database } from "@/db/database.types";

// Entity (DB row shape) and the table's Insert/Update shapes, sourced from generated types.
export type Flashcard = Database["public"]["Tables"]["flashcards"]["Row"];
export type FlashcardInsert = Database["public"]["Tables"]["flashcards"]["Insert"];
export type FlashcardUpdate = Database["public"]["Tables"]["flashcards"]["Update"];

// Card origin. The DB enforces this via a CHECK constraint; generated types widen it to
// `string`, so this union is the app-side source of truth for the allowed values.
export type CardSource = "ai" | "manual";

// DTOs consumed by S-01 (save AI cards), S-03 (edit), S-04 (manual create).
// Origin is set at creation and immutable thereafter, so it is absent from the update command.
export type CreateFlashcardCommand = Pick<FlashcardInsert, "question" | "answer" | "source">;
export type UpdateFlashcardCommand = Pick<FlashcardUpdate, "question" | "answer">;

// Deck management (roadmap S-03). The browse view's card shape — only the fields the deck list
// renders; the FSRS schedule stays server-side, as in ReviewCard.
export type DeckCard = Pick<Flashcard, "id" | "question" | "answer" | "created_at" | "source">;

// Response of GET /api/cards. `nextOffset` is a 0-based ROW offset (not a page index), so the
// client can decrement it by one per delete and keep "Load more" aligned with the live ordering.
export interface DeckPage {
  cards: DeckCard[];
  nextOffset: number;
  hasMore: boolean;
}

// AI generation flow (roadmap S-01).
// A single AI-distilled candidate card, before the user accepts it into the deck.
export interface CandidateCard {
  question: string;
  answer: string;
}

// Request/response contract for POST /api/generate. Source text is request-only and
// never persisted or logged server-side (privacy guardrail).
export interface GenerateRequest {
  sourceText: string;
}

export interface GenerateResponse {
  candidates: CandidateCard[];
}

// Spaced-repetition review (roadmap S-02).
// The FSRS schedule subset of a flashcard row — the columns the scheduler reads and writes.
// Mirrors the ts-fsrs v5 Card shape in DB-typed form (timestamps as ISO strings, state as a
// smallint). The rating endpoint reads a row into this shape, runs the scheduler, and persists it.
export type FsrsSchedule = Pick<
  Flashcard,
  "due" | "stability" | "difficulty" | "scheduled_days" | "learning_steps" | "reps" | "lapses" | "state" | "last_review"
>;

// The four-level recall scale (FR-016). Maps to ts-fsrs Rating Again/Hard/Good/Easy in the
// scheduling service; 0 (Manual) is intentionally excluded.
export type ReviewRating = 1 | 2 | 3 | 4;

// A single card presented in a review session — only the fields the client renders. The schedule
// stays server-side; the client sends back just { cardId, rating }, never schedule values.
export type ReviewCard = Pick<Flashcard, "id" | "question" | "answer">;

// Response of GET /api/review/due. `nextDueAt` is the soonest upcoming due time when nothing is
// currently due (null if the deck has no cards at all) — powers the "all caught up" screen.
export interface DueResponse {
  cards: ReviewCard[];
  nextDueAt: string | null;
}

// Request/response for POST /api/review/rate.
export interface RateRequest {
  cardId: string;
  rating: ReviewRating;
}

export interface RateResponse {
  schedule: FsrsSchedule;
}
