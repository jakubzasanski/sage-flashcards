import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useReviewKeys } from "@/components/hooks/useReviewKeys";
import type { DueResponse, ReviewCard, ReviewRating } from "@/types";

// Roadmap S-02 review loop. Stateless session: the queue is fetched once from /api/review/due, and
// each rating is persisted server-side (the schedule is the source of truth — refresh/navigation
// resumes by re-querying). Advancing is optimistic local state so transitions are instant (<300ms
// NFR); the rating POST runs in the background, and a failed save is surfaced + retryable, never
// silently dropped. A card rated Again is re-appended to the end of THIS sitting's queue (no
// mid-session server re-query) so the user re-sees it now.

type Status = "loading" | "reviewing" | "caughtUp" | "error";

// Display order doubles as the 1–4 key mapping (FR-016 four-level scale).
const RATINGS: { rating: ReviewRating; label: string; className: string }[] = [
  { rating: 1, label: "Again", className: "text-red-200 hover:text-red-100" },
  { rating: 2, label: "Hard", className: "text-amber-200 hover:text-amber-100" },
  { rating: 3, label: "Good", className: "text-emerald-200 hover:text-emerald-100" },
  { rating: 4, label: "Easy", className: "text-sky-200 hover:text-sky-100" },
];

function formatNextDue(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (minutes < 60) return rtf.format(Math.max(1, minutes), "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export default function ReviewSession() {
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

  // Persist a rating in the background. A failed save is recorded (never lost) and shown for retry.
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
      <div className="flex justify-center py-16 text-blue-100/70">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/10 p-8 text-center backdrop-blur-xl">
        <AlertCircle className="mx-auto mb-3 size-8 text-red-300" />
        <p className="text-blue-100/80">Could not load your review queue.</p>
        <Button className="mt-6" variant="secondary" onClick={() => void loadQueue()}>
          <RefreshCw className="size-4" /> Try again
        </Button>
      </div>
    );
  }

  if (status === "caughtUp") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/10 p-8 text-center backdrop-blur-xl">
        <Check className="mx-auto mb-3 size-10 text-emerald-300" />
        <p className="text-lg font-semibold">All caught up</p>
        {reviewedCount > 0 && (
          <p className="mt-1 text-sm text-blue-100/60">
            Reviewed {reviewedCount} {reviewedCount === 1 ? "card" : "cards"} this session.
          </p>
        )}
        {nextDueAt && <p className="mt-1 text-sm text-blue-100/60">Next review {formatNextDue(nextDueAt)}.</p>}
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => void loadQueue()}>
            <RefreshCw className="size-4" /> Check for new cards
          </Button>
          <a
            href="/generate"
            className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20"
          >
            <Sparkles className="size-4" /> Generate more
          </a>
        </div>
      </div>
    );
  }

  // Reviewing state.
  return (
    <div className="space-y-4">
      <div className="text-center text-sm text-blue-100/60">
        Card {index + 1} of {queue.length}
      </div>

      <Card className="border-white/10 bg-white/10">
        <CardContent className="space-y-4 p-6">
          <div className="space-y-1">
            <span className="text-xs font-medium tracking-wide text-blue-100/50 uppercase">Question</span>
            <p className="text-lg text-white">{current.question}</p>
          </div>

          {revealed ? (
            <div className="space-y-1 border-t border-white/10 pt-4">
              <span className="text-xs font-medium tracking-wide text-blue-100/50 uppercase">Answer</span>
              <p className="text-lg text-white">{current.answer}</p>
            </div>
          ) : (
            <div className="border-t border-white/10 pt-4">
              <Button onClick={onReveal} className="w-full" variant="secondary">
                Show answer <kbd className="ml-1 rounded bg-white/15 px-1.5 text-xs">Space</kbd>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {revealed && (
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map(({ rating, label, className }) => (
            <Button
              key={rating}
              variant="ghost"
              className={`flex-col border border-white/10 bg-white/5 py-3 ${className}`}
              onClick={() => {
                onRate(rating);
              }}
            >
              <span className="font-medium">{label}</span>
              <kbd className="rounded bg-white/15 px-1.5 text-xs">{rating}</kbd>
            </Button>
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm text-amber-100">
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="size-4" />
            {failed.length} {failed.length === 1 ? "rating" : "ratings"} didn&apos;t save.
          </span>
          <button type="button" onClick={() => void retryFailed()} className="inline-flex items-center gap-1 underline">
            <RefreshCw className="size-3.5" /> Retry
          </button>
        </div>
      )}
    </div>
  );
}
