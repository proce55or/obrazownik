import type { Attempt } from "../shared/schemas";
import { InterfaceHelp } from "./AppShell";

export function StartScreen({
  drafts,
  busy,
  onStart,
  onOpen,
  onExercises,
}: {
  drafts: Attempt[];
  busy: boolean;
  onStart: () => void;
  onOpen: (id: string) => void;
  onExercises: () => void;
}) {
  return (
    <section className="start-screen">
      <h1>Stwórz obraz krok po kroku</h1>
      <p className="intro">
        Zacznij od jednej cechy. Dodaj porównanie. Ułóż małą scenę. W każdym
        kroku dostaniesz wskazówkę do tego, co napiszesz.
      </p>
      <div className="start-grid">
        <article className="start-suggestion">
          <span className="eyebrow">ĆWICZENIE PROWADZONE · 3 KROKI</span>
          <div className="help-heading">
            <h2>Kamień nad rzeką</h2>
            <InterfaceHelp label="Ćwiczenie prowadzone">
              Bielik przeczyta odpowiedź dopiero po naciśnięciu przycisku z
              prośbą o wskazówkę. Wskaże fragment tekstu i zaproponuje jeden
              następny ruch.
            </InterfaceHelp>
          </div>
          <p>
            Nie musisz wiedzieć, jak zacząć. Dostaniesz jedno konkretne
            polecenie, a potem pomoc lokalnego Bielika.
          </p>
          <p className="fine-print">
            Twoje odpowiedzi przeczyta model uruchomiony na tym komputerze. Nie
            wysyłamy ich do chmury.
          </p>
          <button className="primary-button" disabled={busy} onClick={onStart}>
            Zacznij z Bielikiem <span aria-hidden="true">→</span>
          </button>
          <p className="field-note">
            Możesz przerwać i zachować szkic w dowolnym kroku.
          </p>
        </article>
        <aside className="start-how">
          <h2>Co będziemy ćwiczyć?</h2>
          <ol>
            <li>
              <strong>Szczegół:</strong> co czujesz lub widzisz?
            </li>
            <li>
              <strong>Porównanie:</strong> co ma podobną cechę?
            </li>
            <li>
              <strong>Scenę:</strong> co się z tym dzieje?
            </li>
          </ol>
        </aside>
      </div>
      {drafts.length > 0 && (
        <section className="start-drafts" aria-label="Zachowane szkice">
          <h2>Wróć do swojego szkicu</h2>
          {drafts.slice(0, 3).map((draft) => (
            <article className="start-draft" key={draft.id}>
              <div>
                <h3>
                  {draft.guided
                    ? `Kamień nad rzeką · krok ${draft.guided.step + 1} z 3`
                    : draft.promptSnapshot.title}
                </h3>
                <p className="draft-preview">
                  {draft.currentText.slice(0, 100) || "Czeka na Twoje słowa"}
                </p>
              </div>
              <button
                className="secondary-button"
                disabled={busy}
                aria-label={`Kontynuuj szkic: ${draft.promptSnapshot.title}`}
                onClick={() => onOpen(draft.id)}
              >
                Kontynuuj szkic
              </button>
            </article>
          ))}
        </section>
      )}
      <section className="start-alternative">
        <h2>Wolisz inne ćwiczenie?</h2>
        <p>
          Wybierz własny temat, gotowe podpowiedzi albo samodzielne pisanie.
        </p>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={onExercises}
        >
          Przejdź do ćwiczeń
        </button>
      </section>
    </section>
  );
}
