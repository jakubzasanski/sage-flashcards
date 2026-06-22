import { useCallback, useEffect, useState } from "react";
import { Layers, Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { cardNoun, t, type Locale } from "@/i18n";
import type { DeckCard, DeckPage } from "@/types";

// Roadmap S-03 deck management. Owns the full browse/edit/delete loop against /api/cards and
// /api/cards/[id]. Browse is a "Load more" pager keyed by a ROW offset (DeckPage.nextOffset): on a
// delete we decrement the cursor by one so the next page stays aligned with the live ordering and
// skips nothing (plan F2). Editing PATCHes only { question, answer } — the route preserves the FSRS
// schedule (FR-013). Deleting is confirm-gated (FR-014): the first click arms, the second fires.

type Status = "loading" | "ready" | "error";

interface ActionError {
  id: string;
  message: string;
}

interface DeckViewProps {
  locale: Locale;
}

export default function DeckView({ locale }: DeckViewProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ question: string; answer: string }>({ question: "", answer: "" });
  const [savingId, setSavingId] = useState<string | null>(null);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // At most one row is being acted on at a time, but bind the error to a card id so it renders
  // under the right card.
  const [actionError, setActionError] = useState<ActionError | null>(null);

  const loadInitial = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/cards");
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = (await res.json()) as DeckPage;
      setCards(data.cards);
      setNextOffset(data.nextOffset);
      setHasMore(data.hasMore);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; loadInitial only setStates after the await
    void loadInitial();
  }, [loadInitial]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const res = await fetch(`/api/cards?offset=${nextOffset}`);
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as DeckPage;
      setCards((prev) => [...prev, ...data.cards]);
      setNextOffset(data.nextOffset);
      setHasMore(data.hasMore);
    } catch {
      setLoadMoreError(t(locale, "deck.loadMoreError"));
    } finally {
      setLoadingMore(false);
    }
  }

  function startEdit(card: DeckCard) {
    setEditingId(card.id);
    setDraft({ question: card.question, answer: card.answer });
    setActionError(null);
    setConfirmingDeleteId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setActionError(null);
  }

  async function saveEdit(id: string) {
    const question = draft.question.trim();
    const answer = draft.answer.trim();
    if (!question || !answer || savingId) return;
    setSavingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      if (!res.ok) throw new Error("save failed");
      const updated = (await res.json()) as DeckCard;
      setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch {
      // Keep edit mode open so the user's edits aren't lost (no silent drop).
      setActionError({ id, message: t(locale, "deck.saveError") });
    } finally {
      setSavingId(null);
    }
  }

  async function confirmDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setCards((prev) => prev.filter((c) => c.id !== id));
      // The deleted row no longer occupies a slot below the cursor — keep "Load more" aligned (F2).
      setNextOffset((prev) => Math.max(0, prev - 1));
      setConfirmingDeleteId(null);
    } catch {
      setActionError({ id, message: t(locale, "deck.deleteError") });
    } finally {
      setDeletingId(null);
    }
  }

  if (status === "loading") {
    return (
      <div className="review-loading" aria-busy="true">
        <Loader2 aria-hidden="true" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="empty">
        <p>{t(locale, "deck.loadError")}</p>
        <button type="button" className="btn btn-primary" onClick={() => void loadInitial()}>
          {t(locale, "deck.tryAgain")}
        </button>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="empty">
        <div className="ico">
          <Layers aria-hidden="true" />
        </div>
        <h2>{t(locale, "deck.empty")}</h2>
        <p>{t(locale, "deck.emptySub")}</p>
        <a className="btn btn-primary" href="/generate">
          <Sparkles aria-hidden="true" /> {t(locale, "deck.genCta")}
        </a>
      </div>
    );
  }

  const aiCount = cards.filter((c) => c.source === "ai").length;
  const totalText =
    locale === "pl"
      ? `${cards.length} ${cardNoun(locale, cards.length)} · ${aiCount} od AI`
      : `${cards.length} ${cardNoun(locale, cards.length)} · ${aiCount} from AI`;

  return (
    <div>
      <div className="deck-tools">
        <span className="total">{totalText}</span>
      </div>

      {cards.map((card) => {
        const isEditing = editingId === card.id;
        const isConfirmingDelete = confirmingDeleteId === card.id;
        const error = actionError?.id === card.id ? actionError.message : null;
        const isAi = card.source !== "manual";

        if (isEditing) {
          return (
            <div key={card.id} className="row editing">
              <textarea
                className="area"
                value={draft.question}
                aria-label={t(locale, "field.question")}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, question: e.target.value }));
                }}
              />
              <textarea
                className="area"
                value={draft.answer}
                aria-label={t(locale, "field.answer")}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, answer: e.target.value }));
                }}
              />
              {error && <p className="form-error">{error}</p>}
              <div className="acts confirm">
                <button type="button" className="btn btn-ghost" onClick={cancelEdit} disabled={savingId === card.id}>
                  {t(locale, "btn.cancel")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void saveEdit(card.id)}
                  disabled={!draft.question.trim() || !draft.answer.trim() || savingId === card.id}
                >
                  {savingId === card.id && <Loader2 className="animate-spin" aria-hidden="true" />}
                  {t(locale, "deck.save")}
                </button>
              </div>
            </div>
          );
        }

        return (
          <div key={card.id} className="row">
            <div className="body">
              <p className="rq">{card.question}</p>
              <p className="ra">{card.answer}</p>
              {error && <p className="form-error">{error}</p>}
            </div>
            <span className={isAi ? "origin ai" : "origin manual"}>
              {isAi ? <Sparkles aria-hidden="true" /> : <Pencil aria-hidden="true" />}
              {isAi ? t(locale, "deck.ai") : t(locale, "deck.manual")}
            </span>
            {isConfirmingDelete ? (
              <div className="acts confirm">
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    setConfirmingDeleteId(null);
                  }}
                  disabled={deletingId === card.id}
                >
                  {t(locale, "btn.cancel")}
                </button>
                <button
                  type="button"
                  className="chip reject on"
                  onClick={() => void confirmDelete(card.id)}
                  // Don't fire a delete while a page fetch is in flight: loadMore sets nextOffset
                  // absolutely and would clobber the delete's cursor decrement.
                  disabled={deletingId === card.id || loadingMore}
                >
                  {deletingId === card.id ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                  {t(locale, "deck.confirmDelete")}
                </button>
              </div>
            ) : (
              <div className="acts">
                <button
                  type="button"
                  className="iconbtn"
                  title={t(locale, "deck.edit")}
                  onClick={() => {
                    startEdit(card);
                  }}
                >
                  <Pencil aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="iconbtn danger"
                  title={t(locale, "deck.delete")}
                  onClick={() => {
                    setActionError(null);
                    setConfirmingDeleteId(card.id);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {hasMore && (
        <div className="load-more">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void loadMore()}
            disabled={loadingMore || deletingId !== null}
          >
            {loadingMore && <Loader2 className="animate-spin" aria-hidden="true" />}
            {t(locale, "deck.loadMore")}
          </button>
          {loadMoreError && <p className="form-error">{loadMoreError}</p>}
        </div>
      )}
    </div>
  );
}
