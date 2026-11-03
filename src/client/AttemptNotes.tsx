import type {
  AssistanceEvent,
  AttemptVersion,
  Attempt,
} from "../shared/schemas";
export function assistanceLabel(
  events: AssistanceEvent[],
  attempt?: Pick<Attempt, "assistanceTracking">,
) {
  const relevant = events.filter((e) => e.status !== "failed");
  if (!relevant.length)
    return attempt?.assistanceTracking === "known"
      ? "Bez pomocy w aplikacji"
      : "Brak pełnej historii podpowiedzi";
  if (relevant.some((event) => event.kind === "guided_feedback"))
    return relevant.some((event) => event.status === "prepared")
      ? "Ćwiczenie prowadzone z Bielikiem · część pomocy bez potwierdzenia pokazania"
      : "Ćwiczenie prowadzone z lokalnym Bielikiem";
  if (relevant.every((e) => e.kind === "word_bank"))
    return relevant.some((e) => e.status === "prepared")
      ? "Słowa pomocnicze przygotowane; brak potwierdzenia pokazania"
      : "Z tekstem źródłowym";
  const level = Math.max(...relevant.map((e) => e.level));
  return relevant.some((e) => e.status === "prepared")
    ? `Podpowiedź przygotowana; brak potwierdzenia pokazania · poziom ${level}`
    : level === 3
      ? "Po obejrzeniu przykładu"
      : `Z pomocą · poziom ${level}`;
}
export function Versions({
  versions,
  slots = [],
}: {
  versions: AttemptVersion[];
  slots?: { id: string; label: string }[];
}) {
  if (!versions.length) return null;
  const labels = {
    pre_hint: "Przed podpowiedzią",
    final: "Wersja końcowa",
    manual: "Zapisana wersja",
    recovery: "Odzyskana osobna wersja",
  };
  return (
    <details className="versions">
      <summary>Zachowane wersje tekstu ({versions.length})</summary>
      {versions.map((v) => (
        <article key={v.id}>
          <h3>{labels[v.reason]}</h3>
          <p className="fine-print">
            {new Date(v.createdAt).toLocaleString("pl-PL")} · poziom pomocy przy
            zapisie:{" "}
            {v.assistanceStateAtCapture === "unknown"
              ? "nieznany"
              : v.assistanceLevelAtCapture}
          </p>
          <p className="preserve-text">{v.text || "Jeszcze bez słów."}</p>
          {Object.keys(v.scaffolding).length > 0 && (
            <details>
              <summary>Własne pola z tej wersji</summary>
              <dl>
                {Object.entries(v.scaffolding).map(([id, value]) => (
                  <div key={id}>
                    <dt>{slots.find((s) => s.id === id)?.label ?? id}</dt>
                    <dd className="preserve-text">{value || "—"}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </article>
      ))}
    </details>
  );
}
