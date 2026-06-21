import { useEffect } from "react";
import type { ReviewRating } from "@/types";

// Keyboard contract for the review loop (roadmap S-02, NFR: fully keyboard-operable):
//   Space / Enter — reveal the answer (only while hidden; inert once revealed)
//   1 / 2 / 3 / 4 — rate Again / Hard / Good / Easy (only AFTER the answer is revealed)
// Rating keys are deliberately inert until the answer is shown, so a card can't be rated unseen.
// The listener is window-scoped and only active while `enabled`, so it never leaks to other views.
interface UseReviewKeysOptions {
  enabled: boolean;
  revealed: boolean;
  onReveal: () => void;
  onRate: (rating: ReviewRating) => void;
}

export function useReviewKeys({ enabled, revealed, onReveal, onRate }: UseReviewKeysOptions): void {
  useEffect(() => {
    if (!enabled) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === " " || event.key === "Enter") {
        if (!revealed) {
          event.preventDefault(); // Space would otherwise scroll the page
          onReveal();
        }
        return;
      }
      if (revealed && (event.key === "1" || event.key === "2" || event.key === "3" || event.key === "4")) {
        event.preventDefault();
        onRate(Number(event.key) as ReviewRating);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [enabled, revealed, onReveal, onRate]);
}
