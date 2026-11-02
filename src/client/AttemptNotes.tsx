import type { AssistanceEvent, AttemptVersion, Attempt } from "../shared/schemas";
export function assistanceLabel(events: AssistanceEvent[], attempt?: Pick<Attempt, "assistanceTracking">) {
  const relevant = events.filter((e) => e.status !== "failed");
  if (!relevant.length) return attempt?.assistanceTracking==='known' ? 'Bez pomocy w aplikacji' : 'Historia pomocy nieznana';
  const level = Math.max(...relevant.map((e) => e.level));
  return relevant.some((e) => e.status === "prepared")
    ? `Pomoc mogła zostać ujawniona · poziom ${level}`
    : level === 3
      ? "Po obejrzeniu przykładu"
      : `Z pomocą · poziom ${level}`;
}
export function Versions({ versions }: { versions: AttemptVersion[] }) {
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
            zapisie: {v.assistanceStateAtCapture==='unknown' ? 'nieznany' : v.assistanceLevelAtCapture}
          </p>
          <p className="preserve-text">{v.text || "Jeszcze bez słów."}</p>
        </article>
      ))}
    </details>
  );
}
