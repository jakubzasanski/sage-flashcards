import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Manual card authoring (roadmap S-04, FR-011). Captures one question + answer, POSTs to
// /api/cards/manual (the trust boundary that forces source:'manual' + user_id server-side), surfaces
// loading/error states, and confirms + clears on success so the user can add another. Mirrors
// GeneratorView's input/error/loading/confirmation idioms.

export default function ManualCardForm() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canSave = question.trim().length > 0 && answer.trim().length > 0 && !isSaving;

  async function handleSave() {
    if (!canSave) return;
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch("/api/cards/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), answer: answer.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Could not add the card. Please try again.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function addAnother() {
    setQuestion("");
    setAnswer("");
    setSaved(false);
    setError(null);
  }

  // Confirmation state after a successful save.
  if (saved) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/10 p-8 text-center backdrop-blur-xl">
        <Check className="mx-auto mb-3 size-10 text-emerald-300" />
        <p className="text-lg font-semibold">Card added to your deck</p>
        <Button className="mt-6" variant="secondary" onClick={addAnother}>
          <Plus className="size-4" /> Add another
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
      <div className="space-y-1">
        <label htmlFor="manual-question" className="text-xs font-medium tracking-wide text-blue-100/50 uppercase">
          Question
        </label>
        <Textarea
          id="manual-question"
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
          }}
          placeholder="What do you want to be asked?"
          className="min-h-24 bg-white/5 text-white"
          disabled={isSaving}
        />
      </div>

      <div className="mt-4 space-y-1">
        <label htmlFor="manual-answer" className="text-xs font-medium tracking-wide text-blue-100/50 uppercase">
          Answer
        </label>
        <Textarea
          id="manual-answer"
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
          }}
          placeholder="The answer to recall."
          className="min-h-24 bg-white/5 text-white"
          disabled={isSaving}
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <Button onClick={handleSave} disabled={!canSave} className="mt-4 w-full">
        {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {isSaving ? "Adding..." : "Add card"}
      </Button>
      <p className="mt-2 text-center text-xs text-blue-100/40">Adds one card to your deck, immediately reviewable.</p>
    </div>
  );
}
