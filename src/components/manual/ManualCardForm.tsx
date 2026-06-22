import { useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { t, type Locale } from "@/i18n";

// Manual card authoring (roadmap S-04, FR-011). Captures one question + answer, POSTs to
// /api/cards/manual (the trust boundary that forces source:'manual' + user_id server-side), surfaces
// loading/error states, and confirms + clears on success so the user can add another. Mirrors
// GeneratorView's input/error/loading/confirmation idioms.

interface ManualCardFormProps {
  locale: Locale;
}

export default function ManualCardForm({ locale }: ManualCardFormProps) {
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
        setError(data?.error ?? t(locale, "new.errAdd"));
        return;
      }
      setSaved(true);
    } catch {
      setError(t(locale, "gen.errNetwork"));
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
      <div className="done">
        <div className="seal">
          <Check aria-hidden="true" />
        </div>
        <h2>{t(locale, "new.added")}</h2>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={addAnother}>
            <Plus aria-hidden="true" /> {t(locale, "new.addAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gen-box">
      <div className="field">
        <label htmlFor="manual-question">{t(locale, "field.question")}</label>
        <textarea
          id="manual-question"
          className="area"
          style={{ minHeight: "90px" }}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
          }}
          placeholder={t(locale, "new.qPlaceholder")}
          disabled={isSaving}
        />
        <div className="field-foot">
          <span />
          <span>
            {question.length} {t(locale, "gen.chars")}
          </span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="manual-answer">{t(locale, "field.answer")}</label>
        <textarea
          id="manual-answer"
          className="area"
          style={{ minHeight: "120px" }}
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
          }}
          placeholder={t(locale, "new.aPlaceholder")}
          disabled={isSaving}
        />
        <div className="field-foot">
          <span />
          <span>
            {answer.length} {t(locale, "gen.chars")}
          </span>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="savebar-actions" style={{ marginTop: "6px" }}>
        <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={!canSave}>
          {isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {isSaving ? t(locale, "new.saving") : t(locale, "new.save")}
        </button>
        <a className="btn btn-ghost" href="/cards">
          {t(locale, "btn.cancel")}
        </a>
      </div>
      <p className="gen-cap">{t(locale, "new.cap")}</p>
    </div>
  );
}
