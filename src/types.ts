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
