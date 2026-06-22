import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, RefreshCw } from "lucide-react";
import { useReviewKeys } from "@/components/hooks/useReviewKeys";
import { cardNoun, plPL, t, type Locale } from "@/i18n";
import type { DueResponse, ReviewCard, ReviewRating } from "@/types";

// Roadmap S-02 review loop. Stateless session: the queue is fetched once from /api/review/due, and
// each rating is persisted server-side (the schedule is the source of truth — refresh/navigation
// resumes by re-querying). Advancing is optimistic local state so transitions are instant (<300ms
// NFR); the rating POST runs in the background, and a failed save is surfaced + retryable for the
// rest of the session. If the user leaves before retrying, no data is corrupted — the schedule is
// the source of truth, so an un-persisted card simply stays due and re-surfaces next session. A
// card rated Again is re-appended to the end of THIS sitting's queue (no mid-session server
// re-query) so the user re-sees it now.

type Status = "loading" | "reviewing" | "caughtUp" | "error";

// Display order doubles as the 1–4 key mapping (FR-016 four-level scale); the
// rating colour comes from the .rate[data-r] tokens in global.css.
const RATINGS = [
  { rating: 1, key: "rev.again" },
  { rating: 2, key: "rev.hard" },
  { rating: 3, key: "rev.good" },
  { rating: 4, key: "rev.easy" },
] as const;

function formatNextDue(iso: string, locale: Locale): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 60) return rtf.format(Math.max(1, minutes), "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

interface ReviewSessionProps {
  locale: Locale;
}

export default function ReviewSession({ locale }: ReviewSessionProps) {
  const [status, setStatus] = useState<Status>("loading");
  const [queue, setQueue] = useState<ReviewCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [failed, setFailed] = useState<{ cardId: string; rating: ReviewRating }[]>([]);

  // Caller sets "loading" first (button handlers); the mount effect relies on the initial "loading"
  // state, so this never calls setState synchronously inside the effect.
  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/review/due");
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = (await res.json()) as DueResponse;
      if (data.cards.length === 0) {
        setNextDueAt(data.nextDueAt);
        setStatus("caughtUp");
        return;
      }
      setQueue(data.cards);
      setIndex(0);
      setRevealed(false);
      setStatus("reviewing");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; loadQueue only setStates after the await
    void loadQueue();
  }, [loadQueue]);

  // Persist a rating in the background. A failed save is recorded and shown for in-session retry;
  // if never retried, the card stays due (un-advanced) rather than being corrupted.
  const persist = useCallback(async (cardId: string, rating: ReviewRating) => {
    try {
      const res = await fetch("/api/review/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, rating }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setFailed((prev) => [...prev, { cardId, rating }]);
    }
  }, []);

  const onReveal = useCallback(() => {
    setRevealed(true);
  }, []);

  const onRate = useCallback(
    (rating: ReviewRating) => {
      // onRate is only wired while reviewing, where index is always in range (state machine
      // guarantees a current card — see the caughtUp transition below).
      const card = queue[index];

      void persist(card.id, rating); // optimistic: advance now, save in the background
      setReviewedCount((n) => n + 1);

      const requeue = rating === 1; // Again → re-see this card later in the same sitting
      if (requeue) setQueue((prev) => [...prev, card]);

      const nextIndex = index + 1;
      const upcomingLength = queue.length + (requeue ? 1 : 0);
      if (nextIndex >= upcomingLength) {
        setStatus("caughtUp");
      } else {
        setIndex(nextIndex);
        setRevealed(false);
      }
    },
    [queue, index, persist],
  );

  const current = queue[index];
  useReviewKeys({ enabled: status === "reviewing" && !!current, revealed, onReveal, onRate });

  const retryFailed = useCallback(async () => {
    const toRetry = failed;
    setFailed([]);
    for (const r of toRetry) {
      await persist(r.cardId, r.rating);
    }
  }, [failed, persist]);

  if (status === "loading") {
    return (
      <div className="review-loading" aria-busy="true">
        <Loader2 aria-hidden="true" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="done">
        <div className="seal error">
          <AlertCircle aria-hidden="true" />
        </div>
        <p>{t(locale, "rev.loadError")}</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => void loadQueue()}>
            {t(locale, "rev.tryAgain")}
          </button>
        </div>
      </div>
    );
  }

  if (status === "caughtUp") {
    const reviewedText =
      locale === "pl"
        ? `Powtórzono ${reviewedCount} ${cardNoun(locale, reviewedCount, true)} w tej sesji.`
        : `Reviewed ${reviewedCount} ${cardNoun(locale, reviewedCount)} this session.`;
    const nextText = nextDueAt
      ? locale === "pl"
        ? `Następna powtórka ${formatNextDue(nextDueAt, locale)}.`
        : `Next review ${formatNextDue(nextDueAt, locale)}.`
      : null;

    return (
      <div className="done">
        <div className="seal">
          <Check aria-hidden="true" />
        </div>
        <h2>{t(locale, "rev.done")}</h2>
        {reviewedCount > 0 && <p>{reviewedText}</p>}
        {nextText && <p>{nextText}</p>}
        <div className="actions">
          <a className="btn btn-primary" href="/generate">
            {t(locale, "rev.genMore")}
          </a>
          <button type="button" className="btn btn-ghost" onClick={() => void loadQueue()}>
            {t(locale, "rev.checkNew")}
          </button>
        </div>
      </div>
    );
  }

  // Reviewing state.
  const left = queue.length - index;
  const pct = queue.length ? Math.round((index / queue.length) * 100) : 0;
  const leftText =
    locale === "pl" ? `Pozostało: ${left} ${cardNoun(locale, left)}` : `${left} ${cardNoun(locale, left)} left`;
  const failText =
    locale === "pl"
      ? `${failed.length} ${plPL(failed.length, "ocena", "oceny", "ocen")} nie zapisano.`
      : `${failed.length} ${failed.length === 1 ? "rating" : "ratings"} didn't save.`;

  return (
    <div>
      <div className="progress">
        <span className="count">{leftText}</span>
        <span className="bar">
          <i style={{ width: `${pct}%` }} />
        </span>
      </div>

      <div className={revealed ? "card lift" : "card"}>
        <span className="label">{t(locale, "rev.question")}</span>
        <p className="q">{current.question}</p>
        <div className={revealed ? "answer show" : "answer"}>
          <hr className="divider" />
          <span className="label">{t(locale, "rev.answer")}</span>
          <p className="a">{current.answer}</p>
        </div>
        {!revealed && (
          <div className="reveal-wrap">
            <button type="button" className="reveal" onClick={onReveal}>
              {t(locale, "rev.show")} <kbd>Space</kbd>
            </button>
          </div>
        )}
      </div>

      {revealed ? (
        <>
          <div className="ratings">
            {RATINGS.map(({ rating, key }) => (
              <button
                key={rating}
                type="button"
                className="rate"
                data-r={rating}
                onClick={() => {
                  onRate(rating);
                }}
              >
                <span className="dot" />
                <span className="name">{t(locale, key)}</span>
                <kbd>{rating}</kbd>
              </button>
            ))}
          </div>
          <p className="hint">
            <kbd>1</kbd> {t(locale, "rev.again")} · <kbd>2</kbd> {t(locale, "rev.hard")} · <kbd>3</kbd>{" "}
            {t(locale, "rev.good")} · <kbd>4</kbd> {t(locale, "rev.easy")}
          </p>
        </>
      ) : (
        <p className="hint">
          {t(locale, "rev.recallHint")} <kbd>Space</kbd>.
        </p>
      )}

      {failed.length > 0 && (
        <div className="retry-banner">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <AlertCircle aria-hidden="true" /> {failText}
          </span>
          <button type="button" className="retry-btn" onClick={() => void retryFailed()}>
            <RefreshCw aria-hidden="true" /> {t(locale, "rev.retry")}
          </button>
        </div>
      )}
    </div>
  );
}
