import { useEffect, useState } from "react";
import { z } from "zod";
import type { AssistanceEvent } from "../shared/schemas";
import { api, responseData, userMessage } from "./api";
import "./LocalModel.css";

export function modelModeLabel(mode: "off" | "bielik" | "unknown") {
  return mode === "bielik"
    ? "Pomoc: Bielik na tym komputerze"
    : mode === "off"
      ? "Pomoc: gotowe podpowiedzi"
      : "Sposób pomocy nieznany";
}

export type BielikAssistanceState =
  "delivered" | "prepared" | "none" | "unknown";

export function bielikAssistanceLabel(state: BielikAssistanceState) {
  return state === "delivered"
    ? "Pokazano pytanie Bielika"
    : state === "prepared"
      ? "Nie potwierdzono pokazania pytania Bielika"
      : state === "none"
        ? "Nie pokazano pytania Bielika"
        : "Brak pełnej historii pytań Bielika";
}

export function bielikAssistanceState(
  events: AssistanceEvent[],
  tracking: "known" | "unknown",
): BielikAssistanceState {
  const local = events.filter((event) => event.provider === "bielik_local");
  if (local.some((event) => event.status === "delivered")) return "delivered";
  if (local.some((event) => event.status === "prepared")) return "prepared";
  if (
    events.some(
      (event) =>
        event.provider === "unknown" &&
        (event.status === "prepared" || event.status === "delivered"),
    )
  )
    return "unknown";
  return tracking === "known" ? "none" : "unknown";
}

export function providerLabel(provider: AssistanceEvent["provider"]) {
  return provider === "bielik_local"
    ? "Pytanie lokalnego Bielika"
    : provider === "curated"
      ? "Gotowa pomoc aplikacji"
      : "Źródło pomocy nieznane";
}

export function ModelSources({ events }: { events: AssistanceEvent[] }) {
  const relevant = events.filter((event) => event.status !== "failed");
  if (!relevant.length) return null;
  return (
    <details className="model-sources">
      <summary>Źródła użytej pomocy</summary>
      <ul>
        {relevant.map((event) => (
          <li key={event.id}>
            <strong>{providerLabel(event.provider)}</strong>
            {event.llm && (
              <>
                <br />
                {event.llm.modelId} · {event.llm.promptVersion}
                <br />
                {new Date(event.llm.generatedAt).toLocaleString("pl-PL")}
                <br />
                {(event.llm.generationMs / 1000).toFixed(1)} s ·{" "}
                {event.llm.cacheHit
                  ? "przygotowane wcześniej"
                  : "pierwsze przygotowanie"}
                <br />
                <span className="model-fingerprint">
                  SHA256: {event.llm.modelSha256}
                </span>
              </>
            )}
            {event.status === "prepared" && (
              <p>Nie udało się potwierdzić, czy pytanie zostało pokazane.</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

const RuntimeSchema = z.object({
  enabled: z.boolean(),
  available: z.boolean(),
  modelId: z.string().nullable(),
  message: z.string(),
});

export function ModelConnection() {
  const [result, setResult] = useState<z.infer<typeof RuntimeSchema>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function check() {
    setBusy(true);
    setError("");
    try {
      setResult(responseData(RuntimeSchema, await api("/llm/status")));
    } catch (failure) {
      setResult(undefined);
      setError(userMessage(failure, "Nie udało się sprawdzić połączenia."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="local-model">
      <summary>Jak włączyć i sprawdzić Bielika</summary>
      <p>
        Uruchom <strong>Start-Obrazownik-z-Bielikiem.command</strong>. Następnie
        wybierz Bielika powyżej i zapisz ustawienia. Samodzielne pisanie
        korzysta tylko z Twoich słów.
      </p>
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => {
          void check();
        }}
      >
        {busy ? "Sprawdzanie…" : "Sprawdź połączenie z Bielikiem"}
      </button>
      <p role="status">
        {error ||
          (result
            ? result.available
              ? "Bielik jest gotowy do pomocy."
              : "Bielik jest teraz niedostępny. Możesz pisać i używać gotowych podpowiedzi."
            : "Połączenie nie zostało jeszcze sprawdzone.")}
      </p>
      {result && (
        <details>
          <summary>Informacje o połączeniu</summary>
          <p>{result.message}</p>
          {result.modelId && <p>Model: {result.modelId}</p>}
        </details>
      )}
    </details>
  );
}

const PreparationSchema = z.object({
  status: z.enum(["idle", "preparing", "ready", "error", "disabled"]),
  message: z.string(),
  prefetchEnabled: z.boolean().optional(),
});
type Preparation = z.infer<typeof PreparationSchema>;
const preparationMessages: Record<Preparation["status"], string> = {
  idle: "Możesz przygotować dodatkowe pytanie i w tym czasie pisać dalej.",
  preparing: "Pytanie jest przygotowywane. Możesz pisać dalej.",
  ready: "Pytanie jest gotowe. Pokaż je, jeśli chcesz skorzystać z pomocy.",
  error:
    "Nie udało się przygotować pytania. Możesz spróbować ponownie lub użyć gotowych podpowiedzi.",
  disabled: "W tym ćwiczeniu dodatkowe pytanie jest wyłączone.",
};

export function LocalModel({
  attemptId,
  disabled,
  onReveal,
}: {
  attemptId: string;
  disabled: boolean;
  onReveal: () => Promise<void>;
}) {
  const [state, setState] = useState<Preparation>();
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const base = `/attempts/${attemptId}/llm`;
    async function poll(initial = false) {
      try {
        let value = responseData(
          PreparationSchema,
          await api(`${base}/status`),
        );
        if (!active) return;
        if (initial && value.status === "idle" && value.prefetchEnabled) {
          value = responseData(
            PreparationSchema,
            await api(`${base}/prefetch`, "POST", {}),
          );
          if (!active) return;
        }
        setState(value);
        if (value.status === "preparing")
          timer = setTimeout(() => {
            void poll();
          }, 2000);
      } catch (failure) {
        if (active)
          setState({
            status: "error",
            message: userMessage(failure, "Nie udało się przygotować pytania."),
          });
      }
    }
    void poll(true);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [attemptId, refresh]);

  async function prepare() {
    setBusy(true);
    try {
      const value = responseData(
        PreparationSchema,
        await api(`/attempts/${attemptId}/llm/prefetch`, "POST", {}),
      );
      setState(value);
      setRefresh((previous) => previous + 1);
    } catch (failure) {
      setState({
        status: "error",
        message: userMessage(
          failure,
          "Dodatkowa pomoc jest teraz niedostępna.",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    setBusy(true);
    try {
      await onReveal();
    } catch (failure) {
      setState({
        status: "error",
        message: userMessage(failure, "Nie udało się pokazać pytania."),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="local-model" aria-label="Dodatkowe pytanie">
      <h4>Dodatkowe pytanie</h4>
      <p>
        Przygotowanie pytania nie oznacza użycia pomocy. Pokażemy je na Twoje
        życzenie.
      </p>
      <p role="status">
        {state
          ? preparationMessages[state.status]
          : "Sprawdzanie dodatkowej pomocy…"}
      </p>
      {state?.status === "ready" ? (
        <button
          className="secondary-button"
          disabled={disabled || busy}
          onClick={() => {
            void reveal();
          }}
        >
          Pokaż dodatkowe pytanie
        </button>
      ) : (
        <button
          className="secondary-button"
          disabled={
            disabled ||
            busy ||
            !state ||
            state.status === "preparing" ||
            state.status === "disabled"
          }
          onClick={() => {
            void prepare();
          }}
        >
          {state?.status === "preparing"
            ? "Przygotowywanie pytania…"
            : "Przygotuj dodatkowe pytanie"}
        </button>
      )}
      {(state?.status === "error" || state?.status === "disabled") && (
        <>
          <p>Możesz pisać dalej. Zapis tekstu działa bez tej pomocy.</p>
          <details>
            <summary>Szczegóły połączenia</summary>
            <p>{state.message}</p>
          </details>
        </>
      )}
    </section>
  );
}
