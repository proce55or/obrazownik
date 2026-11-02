import { useEffect, useState } from "react";
import { z } from "zod";
import {
  AssistanceStateSchema,
  DetailSchema,
  RatingsSchema,
} from "../shared/schemas";
import { api } from "./api";
import "./notebook.css";
import { modelModeLabel, bielikAssistanceLabel, bielikAssistanceState } from "./LocalModel";
const CategorySchema = z.enum([
  "training",
  "repeat",
  "near_transfer",
  "independent",
  "assisted_writing",
]);
const NoveltySchema = z.enum(["new_confirmed", "seen", "unknown"]);
const RatingsDistributionSchema = z.object({
  ease: z.array(z.number().int()).length(5),
  voice: z.array(z.number().int()).length(5),
  fatigue: z.array(z.number().int()).length(5),
  intention: z.array(z.number().int()).length(5),
});
const SampleSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  createdAt: z.iso.datetime(),
  category: CategorySchema,
  assistanceState: AssistanceStateSchema,
  assistanceLevel: z.number().int().min(0).max(3),
  noveltyStatus: NoveltySchema,
  selfRatings: RatingsSchema.nullable(),
  llmMode: z.enum(["off","bielik","unknown"]).default("unknown"),
  bielikAssistanceState: z.enum(["delivered","prepared","none","unknown"]).default("unknown"),
});
const ObservationsSchema = z.object({
  groups: z.array(
    z.object({
      category: CategorySchema,
      count: z.number().int().nonnegative(),
      assistance: z.object({
        none_confirmed: z.number().int(),
        assisted: z.number().int(),
        unknown: z.number().int(),
      }),
      novelty: z.object({
        new_confirmed: z.number().int(),
        seen: z.number().int(),
        unknown: z.number().int(),
      }),
      ratings: RatingsDistributionSchema,
    }),
  ),
  samples: z.array(SampleSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
type Category = z.infer<typeof CategorySchema>;
const categoryLabels: Record<Category, string> = {
  training: "Trening",
  repeat: "Powroty",
  near_transfer: "Bliskie przeniesienie",
  independent: "Samodzielne próby",
  assisted_writing: "Nowe pisanie z pomocą",
};
const ratingLabels = {
  ease: { title: "Łatwość", first: "bardzo trudno", last: "bardzo łatwo" },
  voice: {
    title: "Moje brzmienie",
    first: "zupełnie nie moje",
    last: "bardzo moje",
  },
  fatigue: {
    title: "Zmęczenie",
    first: "bez zmęczenia",
    last: "duże zmęczenie",
  },
  intention: {
    title: "Wyrażenie intencji",
    first: "nie udało się",
    last: "udało się w pełni",
  },
};
function helpLabel(state: string, level: number) {
  return state === "none_confirmed"
    ? "Bez pomocy w aplikacji"
    : state === "unknown"
      ? "Historia pomocy nieznana lub niepewna"
      : level === 3
        ? "Po obejrzeniu przykładu"
        : `Z pomocą · poziom ${level}`;
}
function noveltyLabel(value: string) {
  return value === "new_confirmed"
    ? "Nowy temat według zapisu aplikacji"
    : value === "seen"
      ? "Materiał widziany wcześniej"
      : "Historia ekspozycji nieznana";
}
type ComparisonSample = {
  id: string;
  title: string;
  text: string;
  createdAt: string;
  category: Category;
  help: string;
  novelty: string;
  model: string;
};

export function Observations() {
  const [data, setData] = useState<z.infer<typeof ObservationsSchema>>(),
    [offset, setOffset] = useState(0),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [leftId, setLeftId] = useState(""),
    [rightId, setRightId] = useState(""),
    [hiddenDates, setHiddenDates] = useState(true),
    [reverse, setReverse] = useState(false),
    [comparing, setComparing] = useState(false),
    [comparison, setComparison] = useState<ComparisonSample[]>([]),
    [compareError, setCompareError] = useState("");
  useEffect(() => {
    let active = true;
    api(`/observations?limit=30&offset=${offset}`)
      .then((value) => {
        if (active) {
          setData(ObservationsSchema.parse(value));
          setError("");
        }
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Nie udało się odczytać obserwacji.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [offset, reload]);
  useEffect(() => {
    if (!leftId || !rightId) return;
    let active = true;
    Promise.all([api(`/attempts/${leftId}`), api(`/attempts/${rightId}`)])
      .then((values) => {
        if (!active) return;
        const samples = values.map((value) => {
          const detail = DetailSchema.parse(value),
            attempt = detail.attempt;
          const relevant = detail.assistanceEvents.filter(
            (event) => event.status !== "failed",
          );
          const level = Math.max(0, ...relevant.map((event) => event.level));
          const state = relevant.some((event) => event.status === "prepared")
            ? "unknown"
            : relevant.some((event) => event.status === "delivered")
              ? "assisted"
              : attempt.assistanceTracking === "known"
                ? "none_confirmed"
                : "unknown";
          const category: Category =
            attempt.mode === "repeat"
              ? "repeat"
              : attempt.setRole === "near_transfer"
                ? "near_transfer"
                : attempt.mode === "independent"
                  ? "independent"
                  : attempt.setRole === "independent_writing"
                    ? "assisted_writing"
                    : "training";
          return {
            id: attempt.id,
            title: attempt.promptSnapshot.title,
            text: attempt.currentText,
            createdAt: attempt.createdAt,
            category,
            help: helpLabel(state, level),
            model: `${modelModeLabel(attempt.llmMode)} · ${bielikAssistanceLabel(bielikAssistanceState(detail.assistanceEvents, attempt.assistanceTracking))}`,
            novelty: noveltyLabel(attempt.noveltyStatus),
          };
        });
        setComparison(samples);
        setCompareError("");
      })
      .catch((failure) => {
        if (active)
          setCompareError(
            failure instanceof Error
              ? failure.message
              : "Nie udało się otworzyć próbek.",
          );
      })
      .finally(() => {
        if (active) setComparing(false);
      });
    return () => {
      active = false;
    };
  }, [leftId, rightId]);
  function choose(side: "left" | "right", value: string) {
    setComparison([]);
    setCompareError("");
    setComparing(!!value && !!(side === "left" ? rightId : leftId));
    if (side === "left") setLeftId(value);
    else setRightId(value);
  }
  const ordered = reverse ? [...comparison].reverse() : comparison;
  return (
    <section className="observations notebook">
      <span className="eyebrow">WŁASNE TEKSTY, WŁASNA OBSERWACJA</span>
      <h1>Jak Ci się pisze?</h1>
      <p className="intro">
        Osobno oglądaj trening, powroty i nowe pisanie. To zapis Twoich prób i
        odczuć, bez wyniku poetyckości.
      </p>
      <p className="fine-print">
        Poniżej są ukończone próby otwartego pisania. Pomoc, wcześniejszy
        kontakt z tematem i brak pewnej historii są oznaczane osobno. Brak
        pomocy w aplikacji nie wyklucza pomocy poza nią. Tryb Bielika przy próbce
        oznacza dostępność modelu; o użyciu pomocy mówi osobne oznaczenie.
      </p>
      {error && (
        <div className="connection-error" role="alert">
          <p>{error}</p>
          <button
            className="secondary-button"
            onClick={() => {
              setBusy(true);
              setReload((value) => value + 1);
            }}
          >
            Ponów odczyt
          </button>
        </div>
      )}
      {busy && (
        <p role="status" className="fine-print">
          Odczytywanie Twoich obserwacji…
        </p>
      )}
      {data && (
        <>
          <div className="observation-groups">
            {data.groups.map((group) => (
              <article key={group.category}>
                <h2>{categoryLabels[group.category]}</h2>
                <p>
                  {group.count}{" "}
                  {group.count === 1 ? "zapisana próbka" : "zapisanych próbek"}
                </p>
                <dl>
                  <div>
                    <dt>Bez pomocy w aplikacji</dt>
                    <dd>{group.assistance.none_confirmed}</dd>
                  </div>
                  <div>
                    <dt>Z pomocą</dt>
                    <dd>{group.assistance.assisted}</dd>
                  </div>
                  <div>
                    <dt>Historia pomocy niepewna</dt>
                    <dd>{group.assistance.unknown}</dd>
                  </div>
                  {(group.category === "independent" ||
                    group.category === "assisted_writing") && (
                    <>
                      <div>
                        <dt>Nowy temat potwierdzony zapisem</dt>
                        <dd>{group.novelty.new_confirmed}</dd>
                      </div>
                      <div>
                        <dt>Materiał widziany wcześniej</dt>
                        <dd>{group.novelty.seen}</dd>
                      </div>
                      <div>
                        <dt>Historia tematu nieznana</dt>
                        <dd>{group.novelty.unknown}</dd>
                      </div>
                    </>
                  )}
                </dl>
                <details>
                  <summary>Rozkład własnych odczuć</summary>
                  <p className="fine-print">
                    Liczby oznaczają liczbę zaznaczeń. Nie są normą ani oceną
                    sprawności.
                  </p>
                  {Object.entries(group.ratings).map(([key, counts]) => {
                    const label =
                      ratingLabels[key as keyof typeof ratingLabels];
                    return (
                      <div className="observation-rating" key={key}>
                        <h3>{label.title}</h3>
                        <p className="fine-print">
                          1 — {label.first}; 5 — {label.last}
                        </p>
                        <ol>
                          {counts.map((count, index) => (
                            <li key={index}>
                              <span>{index + 1}</span>
                              <strong>{count}</strong>
                            </li>
                          ))}
                        </ol>
                        {counts.every((count) => count === 0) && (
                          <p className="fine-print">Jeszcze bez samoocen.</p>
                        )}
                      </div>
                    );
                  })}
                </details>
              </article>
            ))}
          </div>
          <section className="notebook-comparison">
            <h2>Dwa własne teksty obok siebie</h2>
            <p>
              Wybierz próbki, przeczytaj je i zauważ, co pasuje do Twojej
              intencji. Kolejność i daty możesz ukryć; dane w zeszycie pozostają
              bez zmian.
            </p>
            <div className="ratings-grid">
              <label>
                Pierwsza próbka
                <select
                  value={leftId}
                  onChange={(event) => choose("left", event.target.value)}
                >
                  <option value="">Wybierz tekst</option>
                  {leftId &&
                    !data.samples.some((sample) => sample.id === leftId) && (
                      <option value={leftId}>Wybrana wcześniej próbka</option>
                    )}
                  {data.samples.map((sample) => (
                    <option key={sample.id} value={sample.id}>
                      {sample.title}
                      {hiddenDates
                        ? ""
                        : ` · ${modelModeLabel(sample.llmMode)} · ${bielikAssistanceLabel(sample.bielikAssistanceState)} · ${new Date(sample.createdAt).toLocaleString("pl-PL")}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Druga próbka
                <select
                  value={rightId}
                  onChange={(event) => choose("right", event.target.value)}
                >
                  <option value="">Wybierz tekst</option>
                  {rightId &&
                    !data.samples.some((sample) => sample.id === rightId) && (
                      <option value={rightId}>Wybrana wcześniej próbka</option>
                    )}
                  {data.samples.map((sample) => (
                    <option key={sample.id} value={sample.id}>
                      {sample.title}
                      {hiddenDates
                        ? ""
                        : ` · ${modelModeLabel(sample.llmMode)} · ${bielikAssistanceLabel(sample.bielikAssistanceState)} · ${new Date(sample.createdAt).toLocaleString("pl-PL")}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="button-row">
              <label>
                <input
                  type="checkbox"
                  checked={hiddenDates}
                  onChange={(event) => setHiddenDates(event.target.checked)}
                />{" "}
                Ukryj daty i informacje o próbkach
              </label>
              <button
                className="secondary-button"
                disabled={comparison.length !== 2 || comparing}
                onClick={() =>
                  setReverse(
                    crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0,
                  )
                }
              >
                Losuj kolejność
              </button>
            </div>
            {comparing && <p role="status">Otwieranie dwóch próbek…</p>}
            {compareError && (
              <p className="connection-error" role="alert">
                {compareError}
              </p>
            )}
            {!comparing && ordered.length === 2 && (
              <div className="notebook-comparison-grid">
                {ordered.map((sample, index) => (
                  <article key={`${sample.id}:${index}`}>
                    <h3>{hiddenDates ? `Tekst ${index + 1}` : sample.title}</h3>
                    {!hiddenDates && (
                      <p className="fine-print">
                        {new Date(sample.createdAt).toLocaleString("pl-PL")} ·{" "}
                        {categoryLabels[sample.category]}
                        <br />
                        {sample.help}
                        <br />
                        {sample.model}
                        <br />
                        {sample.novelty}
                      </p>
                    )}
                    <p className="preserve-text">
                      {sample.text || "Jeszcze bez słów."}
                    </p>
                  </article>
                ))}
              </div>
            )}
            <nav
              className="notebook-pagination"
              aria-label="Dalsze próbki do porównania"
            >
              <button
                className="secondary-button"
                disabled={busy || offset === 0}
                onClick={() => {
                  setOffset(Math.max(0, offset - 30));
                  setBusy(true);
                }}
              >
                ← Poprzednie próbki
              </button>
              <span>
                {data.total
                  ? `${offset + 1}–${Math.min(offset + 30, data.total)} z ${data.total}`
                  : "Jeszcze bez próbek"}
              </span>
              <button
                className="secondary-button"
                disabled={busy || offset + 30 >= data.total}
                onClick={() => {
                  setOffset(offset + 30);
                  setBusy(true);
                }}
              >
                Następne próbki →
              </button>
            </nav>
          </section>
        </>
      )}
      <p className="fine-print">
        Zmiana tematu, odpoczynek i znajomość zadania mogą wpływać na odczucia.
        Te obserwacje nie ustalają przyczyny zmian i nie dowodzą skuteczności
        klinicznej aplikacji.
      </p>
    </section>
  );
}
