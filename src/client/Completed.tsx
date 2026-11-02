import { useState } from "react";
import {
  AttemptSchema,
  type AttemptDetail,
  type Ratings,
} from "../shared/schemas";
import { api } from "./api";
import { assistanceLabel, Versions } from "./AttemptNotes";
interface Props {
  detail: AttemptDetail;
  onHome: () => Promise<void>;
}
export function Completed({ detail, onHome }: Props) {
  const [attempt, setAttempt] = useState(detail.attempt),
    [ratings, setRatings] = useState<Ratings>(detail.attempt.selfRatings ?? {});
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    expectedRevision: number;
    clientMutationId: string;
    selfRatings: Ratings;
  }>();
  async function saveRatings() {
    setBusy(true);
    setMessage("");
    const input = pending ?? {
      expectedRevision: attempt.revision,
      clientMutationId: crypto.randomUUID(),
      selfRatings: ratings,
    };
    setPending(input);
    try {
      const saved = AttemptSchema.parse(
        await api(`/attempts/${attempt.id}/ratings`, "POST", input),
      );
      setAttempt(saved);
      setPending(undefined);
      setMessage("Zapisano Twoją obserwację.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Nie udało się zapisać.",
      );
    } finally {
      setBusy(false);
    }
  }
  const skipped = attempt.status === "skipped";
  return (
    <section className="completed">
      <span className="eyebrow">
        {skipped
          ? "MOŻESZ ZACZĄĆ OD CZEGOŚ INNEGO"
          : "TWOJE SŁOWA ZOSTAJĄ TUTAJ"}
      </span>
      <h1>{skipped ? "Innym razem też dobrze." : "Jest Twój ślad."}</h1>
      <p className="intro">
        {skipped
          ? "Ćwiczenie pominięte. Wpisany tekst został zachowany."
          : "Ćwiczenie zapisane na Twoim Macu. Możesz już na tym skończyć."}
      </p>
      <article className="saved-text">
        <span className="eyebrow">{attempt.promptSnapshot.stimulus}</span>
        <h2>{attempt.promptSnapshot.title}</h2>
        <p className="preserve-text">
          {attempt.currentText || "Jeszcze bez słów."}
        </p>
        <p className="assistance-label">
          {assistanceLabel(detail.assistanceEvents)}
        </p>
      </article>
      {!skipped && (
        <details className="reflection">
          <summary>
            Jak Ci się pisało? <span>Opcjonalna chwila obserwacji</span>
          </summary>
          <p className="fine-print">
            To Twoja obserwacja, bez oceny tekstu. Każde pole można pominąć.
          </p>
          <div className="ratings-grid">
            {(
              [
                {
                  key: "ease",
                  label: "Łatwość",
                  low: "bardzo trudno",
                  high: "bardzo łatwo",
                },
                {
                  key: "voice",
                  label: "Moje brzmienie",
                  low: "zupełnie nie moje",
                  high: "bardzo moje",
                },
                {
                  key: "fatigue",
                  label: "Zmęczenie",
                  low: "bez zmęczenia",
                  high: "duże zmęczenie",
                },
              ] as const
            ).map((field) => (
              <label key={field.key}>
                {field.label}
                <select
                  disabled={busy || !!pending}
                  value={ratings[field.key] ?? ""}
                  onChange={(e) =>
                    setRatings((old) => ({
                      ...old,
                      [field.key]: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    }))
                  }
                >
                  <option value="">Pomiń</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option value={n} key={n}>
                      {n}
                      {n === 1
                        ? ` — ${field.low}`
                        : n === 5
                          ? ` — ${field.high}`
                          : ""}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="note-label" htmlFor="self-note">
            Własna notatka
          </label>
          <textarea
            id="self-note"
            maxLength={2000}
            disabled={busy || !!pending}
            value={ratings.note ?? ""}
            onChange={(e) =>
              setRatings((old) => ({ ...old, note: e.target.value }))
            }
            placeholder="Jeśli chcesz coś sobie zostawić…"
          />
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              void saveRatings();
            }}
          >
            {pending ? "Ponów zapis obserwacji" : "Zachowaj obserwację"}
          </button>
          <p role="status" className="fine-print">
            {message}
          </p>
        </details>
      )}
      <Versions versions={detail.versions} />
      <div className="button-row">
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => {
            void onHome().catch((error) =>
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Nie udało się wrócić.",
              ),
            );
          }}
        >
          Wróć do Dzisiaj <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
