import { useEffect, useState } from "react";
import { Check, Loader2, Pencil, Sparkles, X } from "lucide-react";
import { cardNoun, t, type Locale } from "@/i18n";
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

interface GeneratorViewProps {
  locale: Locale;
}

export default function GeneratorView({ locale }: GeneratorViewProps) {
  const [sourceText, setSourceText] = useState("");
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [editingIds, setEditingIds] = useState<Set<string>>(() => new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // Restore an in-progress review session on mount (survives refresh — FR-010).
  // Done in an effect (not lazy useState) on purpose: SSR and the first client render must both
  // produce the empty state so hydration matches, then the effect repopulates from localStorage.
  useEffect(() => {
    const restored = loadSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect, @eslint-react/set-state-in-effect -- intentional post-hydration restore from localStorage
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
        setError(data?.error ?? t(locale, "gen.errGenerate"));
        return;
      }
      const data = (await res.json()) as GenerateResponse;
      if (data.candidates.length === 0) {
        setError(t(locale, "gen.errEmpty"));
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
      setError(t(locale, "gen.errNetwork"));
    } finally {
      setIsGenerating(false);
    }
  }

  function updateCard(id: string, patch: Partial<Pick<ReviewCard, "question" | "answer" | "rejected">>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function toggleEdit(id: string) {
    setEditingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
        setError(data?.error ?? t(locale, "gen.errSave"));
        return;
      }
      const data = (await res.json()) as { saved: number };
      setSavedCount(data.saved);
      setCards([]); // clears localStorage via the effect
      setEditingIds(new Set());
      setSourceText("");
    } catch {
      setError(t(locale, "gen.errNetwork"));
    } finally {
      setIsSaving(false);
    }
  }

  function startOver() {
    setCards([]);
    setEditingIds(new Set());
    setSourceText("");
    setSavedCount(null);
    setError(null);
  }

  // Confirmation state after a successful save.
  if (savedCount !== null) {
    const savedText =
      locale === "pl"
        ? `Zapisano ${savedCount} ${cardNoun(locale, savedCount, true)} w talii`
        : `${savedCount} ${cardNoun(locale, savedCount)} saved to your deck`;
    return (
      <div className="done">
        <div className="seal">
          <Check aria-hidden="true" />
        </div>
        <h2>{savedText}</h2>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={startOver}>
            <Sparkles aria-hidden="true" /> {t(locale, "gen.more")}
          </button>
        </div>
      </div>
    );
  }

  // Review state: candidates returned, awaiting per-card decisions.
  if (cards.length > 0) {
    const total = cards.length;
    const accepted = acceptedCards.length;
    const metaText =
      locale === "pl" ? `${total} propozycji · zachowaj te dobre` : `${total} drafted · keep the good ones`;
    const saveText =
      accepted === 0
        ? t(locale, "gen.saveNone")
        : locale === "pl"
          ? `Zapisz ${accepted} ${cardNoun(locale, accepted, true)} do talii`
          : `Save ${accepted} ${cardNoun(locale, accepted)} to deck`;

    return (
      <div>
        <div className="cand-head">
          <h2>{t(locale, "gen.candTitle")}</h2>
          <span className="meta">{metaText}</span>
        </div>

        <div>
          {cards.map((card) => {
            const editing = editingIds.has(card.id);
            return (
              <div key={card.id} className={card.rejected ? "cand is-rejected" : "cand is-accepted"}>
                {editing ? (
                  <>
                    <textarea
                      className="area"
                      value={card.question}
                      aria-label={t(locale, "field.question")}
                      onChange={(e) => {
                        updateCard(card.id, { question: e.target.value });
                      }}
                    />
                    <textarea
                      className="area"
                      value={card.answer}
                      aria-label={t(locale, "field.answer")}
                      onChange={(e) => {
                        updateCard(card.id, { answer: e.target.value });
                      }}
                    />
                  </>
                ) : (
                  <>
                    <p className="cq">{card.question}</p>
                    <p className="ca">{card.answer}</p>
                  </>
                )}
                <div className="cand-foot">
                  <span className="badge-state">
                    {card.rejected ? t(locale, "gen.rejected") : t(locale, "gen.accepted")}
                  </span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className={card.rejected ? "chip accept" : "chip accept on"}
                    onClick={() => {
                      updateCard(card.id, { rejected: false });
                    }}
                  >
                    <Check aria-hidden="true" /> {t(locale, "gen.keep")}
                  </button>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={editing}
                    onClick={() => {
                      toggleEdit(card.id);
                    }}
                  >
                    <Pencil aria-hidden="true" /> {t(locale, "gen.edit")}
                  </button>
                  <button
                    type="button"
                    className={card.rejected ? "chip reject on" : "chip reject"}
                    onClick={() => {
                      updateCard(card.id, { rejected: true });
                    }}
                  >
                    <X aria-hidden="true" /> {t(locale, "gen.reject")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="savebar">
          <span className="sumtext">
            {locale === "pl" ? (
              <>
                zaakceptowano <b>{accepted}</b> z {total}
              </>
            ) : (
              <>
                <b>{accepted}</b> of {total} cards accepted
              </>
            )}
          </span>
          <div className="savebar-actions">
            <button type="button" className="btn btn-ghost" onClick={startOver}>
              {t(locale, "gen.startOver")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSave()}
              disabled={accepted === 0 || isSaving}
            >
              {isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}
              {isSaving ? t(locale, "gen.saving") : saveText}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Input state: paste source text and generate.
  const counter = `${sourceText.length.toLocaleString(locale)} / ${MAX_SOURCE_CHARS.toLocaleString(locale)} ${t(locale, "gen.chars")}`;
  return (
    <div className="gen-box">
      <textarea
        className="area"
        value={sourceText}
        onChange={(e) => {
          setSourceText(e.target.value);
        }}
        placeholder={t(locale, "gen.placeholder")}
        aria-label={t(locale, "gen.title")}
        disabled={isGenerating}
      />
      <div className="gen-actions">
        <span className={overCap ? "note over" : "note"}>{counter}</span>
        <button type="button" className="btn btn-primary" onClick={() => void handleGenerate()} disabled={!canGenerate}>
          {isGenerating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          {isGenerating ? t(locale, "gen.generating") : t(locale, "gen.btn")}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      <p className="gen-cap">{t(locale, "gen.cap")}</p>
    </div>
  );
}
