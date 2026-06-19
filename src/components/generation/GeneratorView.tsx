import { useEffect, useState } from "react";
import { Sparkles, Check, X, Save, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import type { CandidateCard, GenerateResponse } from "@/types";

// Client-side cap for UX (count + disable). The server is the source of truth and re-validates;
// these mirror generation.ts MAX_SOURCE_CHARS / MAX_CANDIDATES without importing the server module
// (which pulls astro:env/server and must not reach the client bundle).
const MAX_SOURCE_CHARS = 10_000;
const STORAGE_KEY = "generate-session-v1";

// A candidate under review: the generated Q/A plus inline edits and an accept/reject decision.
interface ReviewCard extends CandidateCard {
  id: string;
  rejected: boolean;
}

function loadSession(): ReviewCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is ReviewCard => typeof c === "object" && c !== null && typeof (c as ReviewCard).question === "string",
    );
  } catch {
    return [];
  }
}

export default function GeneratorView() {
  const [sourceText, setSourceText] = useState("");
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // Restore an in-progress review session on mount (survives refresh — FR-010).
  // Done in an effect (not lazy useState) on purpose: SSR and the first client render must both
  // produce the empty state so hydration matches, then the effect repopulates from localStorage.
  useEffect(() => {
    const restored = loadSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration restore from localStorage
    if (restored.length > 0) setCards(restored);
  }, []);

  // Persist the review session whenever the cards change, so a refresh restores edits + decisions.
  // Best-effort: swallow storage errors (quota exceeded, Safari private mode) — the in-memory
  // session keeps working even if persistence fails.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (cards.length > 0) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // persistence is non-critical; ignore
    }
  }, [cards]);

  const overCap = sourceText.length > MAX_SOURCE_CHARS;
  const canGenerate = sourceText.trim().length > 0 && !overCap && !isGenerating;
  const acceptedCards = cards.filter((c) => !c.rejected && c.question.trim() && c.answer.trim());

  async function handleGenerate() {
    if (!canGenerate) return;
    setError(null);
    setSavedCount(null);
    setIsGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Could not generate cards. Please try again.");
        return;
      }
      const data = (await res.json()) as GenerateResponse;
      if (data.candidates.length === 0) {
        setError("No flashcards could be generated from this text. Try a longer or richer passage.");
        return;
      }
      setCards(
        data.candidates.map((c, i) => ({
          id: `c${i}-${c.question.slice(0, 12)}`,
          question: c.question,
          answer: c.answer,
          rejected: false,
        })),
      );
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  function updateCard(id: string, patch: Partial<Pick<ReviewCard, "question" | "answer" | "rejected">>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function handleSave() {
    if (acceptedCards.length === 0 || isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acceptedCards.map((c) => ({ question: c.question.trim(), answer: c.answer.trim() }))),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Could not save cards. Please try again.");
        return;
      }
      const data = (await res.json()) as { saved: number };
      setSavedCount(data.saved);
      setCards([]); // clears localStorage via the effect
      setSourceText("");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function startOver() {
    setCards([]);
    setSourceText("");
    setSavedCount(null);
    setError(null);
  }

  // Confirmation state after a successful save.
  if (savedCount !== null) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/10 p-8 text-center backdrop-blur-xl">
        <Check className="mx-auto mb-3 size-10 text-emerald-300" />
        <p className="text-lg font-semibold">
          {savedCount} {savedCount === 1 ? "card" : "cards"} saved to your deck
        </p>
        <Button className="mt-6" variant="secondary" onClick={startOver}>
          <Sparkles className="size-4" /> Generate more
        </Button>
      </div>
    );
  }

  // Review state: candidates returned, awaiting per-card decisions.
  if (cards.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm text-blue-100/70">
          <span>
            {acceptedCards.length} of {cards.length} accepted
          </span>
          <button type="button" onClick={startOver} className="inline-flex items-center gap-1 hover:text-white">
            <RotateCcw className="size-3.5" /> Start over
          </button>
        </div>

        {cards.map((card) => (
          <Card
            key={card.id}
            className={card.rejected ? "border-white/5 bg-white/5 opacity-50" : "border-white/10 bg-white/10"}
          >
            <CardContent className="space-y-3 p-4">
              <div className="space-y-1">
                <span className="text-xs font-medium tracking-wide text-blue-100/50 uppercase">Question</span>
                <Textarea
                  value={card.question}
                  disabled={card.rejected}
                  onChange={(e) => {
                    updateCard(card.id, { question: e.target.value });
                  }}
                  className="min-h-0 resize-none bg-white/5 text-white"
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium tracking-wide text-blue-100/50 uppercase">Answer</span>
                <Textarea
                  value={card.answer}
                  disabled={card.rejected}
                  onChange={(e) => {
                    updateCard(card.id, { answer: e.target.value });
                  }}
                  className="min-h-0 resize-none bg-white/5 text-white"
                  rows={2}
                />
              </div>
              <div className="flex justify-end">
                {card.rejected ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      updateCard(card.id, { rejected: false });
                    }}
                  >
                    <Check className="size-4" /> Restore
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-200 hover:text-red-100"
                    onClick={() => {
                      updateCard(card.id, { rejected: true });
                    }}
                  >
                    <X className="size-4" /> Reject
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="sticky bottom-4 flex items-center gap-3">
          <Button onClick={handleSave} disabled={acceptedCards.length === 0 || isSaving} className="flex-1">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {isSaving ? "Saving..." : `Save ${acceptedCards.length} ${acceptedCards.length === 1 ? "card" : "cards"}`}
          </Button>
        </div>
      </div>
    );
  }

  // Input state: paste source text and generate.
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
      <Textarea
        value={sourceText}
        onChange={(e) => {
          setSourceText(e.target.value);
        }}
        placeholder="Paste the text you want to turn into flashcards..."
        className="min-h-48 bg-white/5 text-white"
        disabled={isGenerating}
      />
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={overCap ? "text-red-300" : "text-blue-100/50"}>
          {sourceText.length.toLocaleString()} / {MAX_SOURCE_CHARS.toLocaleString()} characters
        </span>
        {cards.length === 0 && sourceText.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSourceText("");
            }}
            className="inline-flex items-center gap-1 text-blue-100/50 hover:text-white"
          >
            <Trash2 className="size-3.5" /> Clear
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <Button onClick={handleGenerate} disabled={!canGenerate} className="mt-4 w-full">
        {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {isGenerating ? "Generating..." : "Generate cards"}
      </Button>
      <p className="mt-2 text-center text-xs text-blue-100/40">Generates up to 30 cards. Review before saving.</p>
    </div>
  );
}
