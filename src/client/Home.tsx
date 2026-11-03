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
    <>
      <section className="welcome">
        <p className="small-heading">Dzisiaj</p>
        <h1>
          Zatrzymaj się.
          <br />
          Zobacz coś <em>po swojemu.</em>
        </h1>
        <p className="intro">
          Czasem wystarczy jeden szczegół, żeby pojawił się obraz.
          <br className="desktop-break" /> Zostaw tu kilka własnych słów. Tyle,
          ile chcesz.
        </p>
      </section>
      <SessionPanel onOpen={onOpen} />
      {drafts[0] && (
        <section className="draft-list" aria-label="Ostatni szkic">
          <h2>Wróć do szkicu</h2>
          <p>
            <strong>{drafts[0].promptSnapshot.title}</strong>
          </p>
          <p className="fine-print draft-preview">
            {drafts[0].currentText.slice(0, 95) || "Czeka na pierwsze słowa"}
          </p>
          <button
            className="secondary-button"
            disabled={busy}
            aria-label={`Kontynuuj szkic: ${drafts[0].promptSnapshot.title}`}
            onClick={() => onOpen(drafts[0].id)}
          >
            Kontynuuj
          </button>
        </section>
      )}
      <details className="more-options">
        <summary>Więcej możliwości</summary>
        {drafts.length > 1 && (
          <section className="draft-list" aria-label="Twoje szkice">
            <h2>Pozostałe szkice</h2>
            {drafts.slice(1).map((draft) => (
              <button
                disabled={busy}
                className="draft-link"
                key={draft.id}
                onClick={() => onOpen(draft.id)}
              >
                <span>
                  <strong>{draft.promptSnapshot.title}</strong>
                  <small>
                    {draft.currentText
                      ? draft.currentText.slice(0, 95)
                      : "Czeka na pierwsze słowa"}
                  </small>
                </span>
                <span>
                  Kontynuuj szkic <span aria-hidden="true">→</span>
                </span>
              </button>
            ))}
          </section>
        )}
        <section className="invitation" aria-labelledby="invitation-title">
          <div className="invitation-copy">
            <span className="eyebrow">Pojedyncze ćwiczenie</span>
            <h2 id="invitation-title">Od słowa do obrazu</h2>
            <p>
              Weź zwyczajną rzecz i przyjrzyj się jej uważniej.
              <br />
              Co można zobaczyć, usłyszeć, poczuć?
            </p>
            <button
              className="secondary-button"
              disabled={busy || !cards[0]}
              onClick={() => onStart(cards[0].id)}
            >
              Zacznij pisać <span aria-hidden="true">↗</span>
            </button>
            <span className="button-note">Jedno zdanie też wystarczy.</span>
          </div>
          <div className="window-art" aria-hidden="true">
            <div className="sun" />
            <div className="hill hill-back" />
            <div className="hill hill-front" />
            <div className="window-line" />
            <div className="horizon" />
            <span className="art-caption">zauważ to, co blisko</span>
          </div>
        </section>
        <section className="other-starts" aria-label="Inne punkty wyjścia">
          <span className="eyebrow">Inne tematy</span>
          <div>
            {cards.slice(1, 3).map((card) => (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => onStart(card.id)}
                key={card.id}
              >
                {card.prompt.stimulus} <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </section>
        {onIndependent && (
          <section className="new-writing">
            <span className="eyebrow">Osobny temat · własne słowa</span>
            <h2>Nowe pisanie</h2>
            <p>
              Nowy temat do samodzielnego pisania, bez podpowiedzi na początku.
              Możesz skończyć po jednym zdaniu albo przerwać.
            </p>
            <div className="button-row">
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => onIndependent("independent_writing")}
              >
                Zacznij nowy tekst <span aria-hidden="true">↗</span>
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
        <CardCatalog cards={cards} busy={busy} onStart={onStart} />
        {recent.length > 0 && (
          <section className="draft-list" aria-label="Zapisane ćwiczenia">
            <h2>Ostatnio zapisane</h2>
            {recent.map((attempt) => (
              <button
                disabled={busy}
                className="draft-link"
                key={attempt.id}
                onClick={() => onOpen(attempt.id)}
              >
                <span>
                  <strong>{attempt.promptSnapshot.title}</strong>
                  <small>
                    {attempt.currentText.slice(0, 95) || "Bez tekstu"}
                  </small>
                </span>
                <span>
                  Otwórz <span aria-hidden="true">→</span>
                </span>
              </button>
            ))}
          </section>
        )}
        <div className="quiet-grid">
          <section>
            <span className="note-number">Zauważ</span>
            <h3>Bez pośpiechu</h3>
            <p>
              Nie ma odliczania ani normy. Możesz napisać jedno zdanie i na tym
              skończyć.
            </p>
          </section>
          <section>
            <span className="note-number">Spróbuj</span>
            <h3>Własnym językiem</h3>
            <p>
              Nie szukaj idealnych słów. Zwykłe, konkretne szczegóły są dobrym
              początkiem.
            </p>
          </section>
          <section>
            <span className="note-number">Zapisz</span>
            <h3>Przestrzeń dla Ciebie</h3>
            <p>
              Twoje teksty zostają na Twoim komputerze. Nie ma ocen, punktów ani
              porównań.
            </p>
          </section>
        </div>
      </details>
    </>
  );
}
