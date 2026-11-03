import { useState } from "react";
import type { AttemptDetail } from "../shared/schemas";
import { GuidedHistory, ReviewContent } from "./GuidedReview";
import { Versions } from "./AttemptNotes";
import { userMessage } from "./api";

export function GuidedCompleted({
  detail,
  onHome,
}: {
  detail: AttemptDetail;
  onHome: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const guided = detail.attempt.guided!;
  return (
    <section className="guided-completed">
      <span className="eyebrow">ĆWICZENIE ZACHOWANE NA TYM KOMPUTERZE</span>
      <h1>
        {detail.attempt.status === "completed"
          ? "Od szczegółu do Twojej sceny"
          : "Twoje słowa zostały zachowane"}
      </h1>
      <p className="intro">
        Masz tutaj swoje odpowiedzi i wskazówki lokalnego Bielika. Wrócisz do
        nich przez „Moje teksty” → „Odpowiedzi z ćwiczeń”.
      </p>
      <article className="guided-final">
        <h2>
          {guided.step === 2 ? "Twoja scena" : "Twoja ostatnia odpowiedź"}
        </h2>
        <p className="preserve-text">
          {detail.attempt.currentText || "Bez odpowiedzi."}
        </p>
      </article>
      {guided.feedback && (
        <details className="guided-feedback">
          <summary>Wskazówka Bielika do ostatniego kroku</summary>
          <ReviewContent review={guided.feedback} />
        </details>
      )}
      <GuidedHistory reviews={guided.history} />
      <p className="fine-print">
        Ćwiczenie obejmowało {guided.step + 1}{" "}
        {guided.step === 0 ? "krok" : "kroki"}: szczegół
        {guided.step > 0 ? ", porównanie" : ""}
        {guided.step > 1 ? " i małą scenę" : ""}. Wskazówki modelu są pomocą w
        pisaniu, a nie oceną Twoich zdolności.
      </p>
      <Versions versions={detail.versions} />
      {error && (
        <p role="alert" className="connection-error">
          {error}
        </p>
      )}
      <button
        className="primary-button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onHome().catch((failure) => {
            setError(userMessage(failure));
            setBusy(false);
          });
        }}
      >
        Wróć na Start
      </button>
    </section>
  );
}
