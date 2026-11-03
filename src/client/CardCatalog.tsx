import { useState } from "react";
import type { Card } from "../domain/cards";
import { FAMILY_LABELS } from "../shared/config";

interface Props {
  cards: Card[];
  busy: boolean;
  onStart: (
    id: string,
    variant?: "standard" | "easy",
    constraint?: boolean,
  ) => void;
}

export function CardCatalog({ cards, busy, onStart }: Props) {
  const [family, setFamily] = useState<Card["family"]>("property");
  const [selected, setSelected] = useState("");
  const [easy, setEasy] = useState(false);
  const [constraint, setConstraint] = useState(false);
  const group = cards.filter((card) => card.family === family);
  const card = group.find((item) => item.id === selected) ?? group[0];

  return (
    <details className="versions card-catalog">
      <summary>Wybierz ćwiczenie i własne tempo</summary>
      <div className="ratings-grid">
        <label>
          Rodzaj ćwiczenia
          <select
            value={family}
            onChange={(event) => {
              setFamily(event.target.value as Card["family"]);
              setSelected("");
              setConstraint(false);
            }}
          >
            {Object.entries(FAMILY_LABELS).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Temat ćwiczenia
          <select
            value={card?.id ?? ""}
            onChange={(event) => {
              setSelected(event.target.value);
              setConstraint(false);
            }}
          >
            {group.map((item) => (
              <option value={item.id} key={item.id}>
                {item.prompt.stimulus} · {item.prompt.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {card ? (
        <>
          <p>{easy ? card.easierInstruction : card.prompt.instruction}</p>
          <label className="choice">
            <input
              type="checkbox"
              checked={easy}
              onChange={(event) => setEasy(event.target.checked)}
            />
            Łatwiejszy wariant
          </label>
          {card.optionalConstraint && (
            <label className="choice">
              <input
                type="checkbox"
                checked={constraint}
                onChange={(event) => setConstraint(event.target.checked)}
              />
              Dodatkowe wyzwanie: {card.optionalConstraint}
            </label>
          )}
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              onStart(card.id, easy ? "easy" : "standard", constraint)
            }
          >
            Otwórz wybrane ćwiczenie <span aria-hidden="true">↗</span>
          </button>
        </>
      ) : (
        <p>Ten rodzaj ćwiczeń nie jest jeszcze dostępny.</p>
      )}
    </details>
  );
}
