import { SessionPanel } from "./SessionPanel";
import { CardCatalog } from "./CardCatalog";
import type { Card } from "../domain/cards";
import type { Attempt } from "../shared/schemas";
interface Props {
  onIndependent?: (role?: "independent_writing" | "near_transfer") => void;
  cards: Card[];
  drafts: Attempt[];
  recent: Attempt[];
  busy: boolean;
  onStart: (
    cardId: string,
    variant?: "standard" | "easy",
    constraint?: boolean,
  ) => void;
  onOpen: (id: string) => void;
}
export function Home({
  cards,
  drafts,
  recent,
  busy,
  onStart,
  onOpen,
  onIndependent,
}: Props) {
  return (
    <section className="exercise-catalog">
      <h1>Ćwiczenia</h1>
      <p className="intro">
        Wybierz temat i spróbuj opisać go własnymi słowami. W tych zadaniach
        możesz korzystać z podpowiedzi. Pełne ćwiczenie prowadzone z odpowiedzią
        Bielika znajdziesz na ekranie Start.
      </p>
      <CardCatalog cards={cards} busy={busy} onStart={onStart} />
      {onIndependent && (
        <section className="catalog-independent">
          <h2>Samodzielne pisanie</h2>
          <p>
            Osobny temat bez podpowiedzi na początku. Możesz skończyć po jednym
            zdaniu.
          </p>
          <div className="button-row">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => onIndependent("independent_writing")}
            >
              Zacznij nowy tekst
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => onIndependent("near_transfer")}
            >
              Podobne ćwiczenie z nowym tematem
            </button>
          </div>
        </section>
      )}
      <details className="catalog-session">
        <summary>Krótka sesja z kilkoma ćwiczeniami</summary>
        <SessionPanel onOpen={onOpen} />
      </details>
      {drafts.length > 0 && (
        <section className="draft-list">
          <h2>Twoje szkice</h2>
          {drafts.map((draft) => (
            <button
              key={draft.id}
              className="draft-link"
              disabled={busy}
              onClick={() => onOpen(draft.id)}
            >
              <span>
                <strong>{draft.promptSnapshot.title}</strong>
                <small>
                  {draft.currentText.slice(0, 95) || "Czeka na pierwsze słowa"}
                </small>
              </span>
              <span>Kontynuuj →</span>
            </button>
          ))}
        </section>
      )}
      {recent.length > 0 && (
        <details className="catalog-recent">
          <summary>Ostatnio zapisane ćwiczenia</summary>
          {recent.map((attempt) => (
            <button
              key={attempt.id}
              className="draft-link"
              disabled={busy}
              onClick={() => onOpen(attempt.id)}
            >
              <span>
                <strong>{attempt.promptSnapshot.title}</strong>
                <small>
                  {attempt.currentText.slice(0, 95) || "Bez tekstu"}
                </small>
              </span>
              <span>Otwórz →</span>
            </button>
          ))}
        </details>
      )}
    </section>
  );
}
