import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  AttemptSchema,
  AssistanceSchema,
  DetailSchema,
  type AttemptDetail,
} from "../shared/schemas";
import {
  DraftQueue,
  type RecoveryDraft,
  type SaveStatus,
} from "../domain/draft-queue";
import { api, ApiError } from "./api";
import { findRecovery, putRecovery, clearRecovery } from "./recovery";
import { assistanceLabel, Versions } from "./AttemptNotes";
interface Props {
  initial: AttemptDetail;
  environmentId: string;
  onHome: () => Promise<void>;
  onReplace: (detail: AttemptDetail) => void;
}
type Action = "hint1" | "hint2" | "hint3" | "complete" | "skip" | "recovery";
export function Editor({ initial, environmentId, onHome, onReplace }: Props) {
  const [attempt, setAttempt] = useState(initial.attempt),
    [text, setText] = useState(initial.attempt.currentText);
  const [status, setStatus] = useState<SaveStatus>("saved"),
    [error, setError] = useState("");
  const [events, setEvents] = useState(initial.assistanceEvents),
    [versions, setVersions] = useState(initial.versions);
  const [hintOpen, setHintOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [bufferError, setBufferError] = useState(false);
  const [recovery, setRecovery] = useState<RecoveryDraft>(),
    [checkingRecovery, setCheckingRecovery] = useState(true);
  const [serverText, setServerText] = useState<string>(),
    [pendingKind, setPendingKind] = useState<Action | null>(null);
  const pending = useRef<{
    kind: Action;
    path: string;
    body: Record<string, unknown>;
  } | null>(null);
  const [queue] = useState(
    () =>
      new DraftQueue({
        attempt: initial.attempt,
        environmentId,
        send: async (input) =>
          AttemptSchema.parse(
            await api(`/attempts/${initial.attempt.id}`, "PATCH", input),
          ),
        putRecovery,
        clearRecovery: (text, fields) =>
          clearRecovery(environmentId, initial.attempt.id, text, fields),
        onStatus: (next, message) => {
          setStatus(next);
          if (message) setError(message);
          else if (next === "saved") setError("");
        },
        onAck: setAttempt,
        onBufferError: () => setBufferError(true),
      }),
  );
  useEffect(() => {
    let active = true;
    (async()=>{
      let draft=await findRecovery(environmentId,initial.attempt.id);
      while(draft&&draft.text===initial.attempt.currentText&&JSON.stringify(draft.scaffolding??{})===JSON.stringify(initial.attempt.scaffolding)){
        await clearRecovery(environmentId,draft.id,draft.text,draft.scaffolding??{});
        draft=await findRecovery(environmentId,initial.attempt.id);
      }
      if(active&&draft)setRecovery(draft);
    })().catch(()=>{if(active)setBufferError(true);}).finally(()=>{if(active)setCheckingRecovery(false);});
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (queue.dirty || pending.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => {
      active = false;
      queue.dispose();
      window.removeEventListener("beforeunload", preventLoss);
    };
  }, [environmentId, initial.attempt.id, initial.attempt.currentText, initial.attempt.scaffolding, queue]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(recovery?.text ?? text);
      setError("Tekst skopiowany.");
    } catch {
      setError("Zaznacz tekst w polu i skopiuj go skrótem ⌘C.");
    }
  }
  async function showConflict() {
    try {
      const detail = DetailSchema.parse(await api(`/attempts/${attempt.id}`));
      setServerText(detail.attempt.currentText);
    } catch {
      /* Local text stays visible. */
    }
  }
  async function perform(
    kind: Action,
    path: string,
    extra: Record<string, unknown> = {},
  ) {
    if (pending.current && pending.current.kind !== kind) {
      setError("Najpierw ponów poprzednią operację.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await queue.flush();
      pending.current ??= {
        kind,
        path,
        body: {
          expectedRevision: queue.currentRevision,
          clientMutationId: crypto.randomUUID(),
          ...extra,
        },
      };
      setPendingKind(kind);
      const result = await api<unknown>(
        pending.current.path,
        "POST",
        pending.current.body,
      );
      pending.current = null;
      setPendingKind(null);
      return result;
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Nie udało się zapisać.",
      );
      if (failure instanceof ApiError && failure.status === 409) {
        setStatus("conflict");
        await showConflict();
        pending.current = null;
        setPendingKind(null);
      }
      throw failure;
    } finally {
      setBusy(false);
    }
  }
  async function requestHint(level: number) {
    try {
      const result = await perform(
        `hint${level}` as Action,
        `/attempts/${attempt.id}/hints`,
        { level },
      );
      if (!result) return;
      const received = z
        .object({ attempt: AttemptSchema, event: AssistanceSchema })
        .parse(result);
      queue.acceptRevision(received.attempt);
      setEvents((old) => [
        ...old.filter((e) => e.id !== received.event.id),
        received.event,
      ]);
      setHintOpen(true);
      const detail = DetailSchema.parse(await api(`/attempts/${attempt.id}`));
      setVersions(detail.versions);
      // Confirm only after the content has been rendered. A failure remains conservative.
      requestAnimationFrame(() => {
        void api(
          `/attempts/${attempt.id}/hints/${received.event.id}/delivered`,
          "POST",
          {},
        )
          .then((value) => {
            const delivered = AssistanceSchema.parse(value);
            setEvents((old) =>
              old.map((e) => (e.id === delivered.id ? delivered : e)),
            );
          })
          .catch(() =>
            setError(
              "Podpowiedź mogła zostać ujawniona. Nie udało się potwierdzić jej odbioru.",
            ),
          );
      });
    } catch {
      /* The editor and pending mutation are preserved. */
    }
  }
  async function finish(skip = false) {
    try {
      const result = await perform(
        skip ? "skip" : "complete",
        `/attempts/${attempt.id}/${skip ? "skip" : "complete"}`,
      );
      if (!result) return;
      const saved = AttemptSchema.parse(result);
      queue.acceptRevision(saved);
      await queue.settleRecovery();
      const detail = DetailSchema.parse(await api(`/attempts/${attempt.id}`));
      onReplace(detail);
    } catch {
      /* Status explains why the editor remains open. */
    }
  }
  async function pause() {
    setBusy(true);
    try {
      await queue.flush();
      await queue.settleRecovery();
      await onHome();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się zapisać szkicu.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function preserveRecovery() {
    const local = recovery?.text ?? text;
    setBusy(true);
    try {
      await queue.settleRecovery();
      // Recovery creates a separate immutable version, never overwrites currentText.
      if (pending.current?.kind !== "recovery")
        pending.current = {
          kind: "recovery",
          path: `/attempts/${attempt.id}/recovery`,
          body: { text: local, clientMutationId: crypto.randomUUID() },
        };
      setPendingKind("recovery");
      await api(pending.current.path, "POST", pending.current.body);
      pending.current = null;
      setPendingKind(null);
      await clearRecovery(environmentId, attempt.id, local);
      onReplace(DetailSchema.parse(await api(`/attempts/${attempt.id}`)));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się zachować osobnej wersji.",
      );
    } finally {
      setBusy(false);
    }
  }
  const blocked =
    busy ||
    checkingRecovery ||
    !!recovery ||
    status === "conflict" ||
    !!pendingKind;
  const actionDisabled = (kind: Action) =>
    busy ||
    checkingRecovery ||
    !!recovery ||
    status === "conflict" ||
    (!!pendingKind && pendingKind !== kind);
  const statusText = {
    saved: "Zapisano na Macu",
    dirty: "Oczekuje na zapis…",
    saving: "Zapisywanie…",
    error: "Nie udało się zapisać",
    conflict: "Wersje wymagają porównania",
  }[status];
  const maxLevel = Math.max(
    0,
    ...events.filter((e) => e.status !== "failed").map((e) => e.level),
  );
  return (
    <section className="exercise">
      <div className="editor-top">
        <button
          className="text-button"
          disabled={busy || !!pendingKind || !!recovery || checkingRecovery}
          onClick={() => {
            void pause();
          }}
        >
          ← Zapisz szkic i wróć
        </button>
        <span className="eyebrow">WŁAŚCIWOŚĆ I OBRAZ</span>
      </div>
      <h1>{attempt.promptSnapshot.title}</h1>
      <div className="prompt-card">
        <span className="eyebrow">TWÓJ PUNKT WYJŚCIA</span>
        <h2>{attempt.promptSnapshot.stimulus}</h2>
        <p>{attempt.promptSnapshot.instruction}</p>
        {attempt.constraints.map((c) => (
          <p className="fine-print" key={c}>
            {c}
          </p>
        ))}
      </div>
      {recovery && (
        <aside className="recovery-panel" aria-label="Odzyskiwanie szkicu">
          <h2>Został tu niezapisany tekst</h2>
          <p>
            To kopia ratunkowa z tej przeglądarki.{" "}
            {recovery.baseRevision !== attempt.revision
              ? "Wersja na Macu zmieniła się. Zachowaj odzyskany tekst jako osobną wersję."
              : "Możesz przywrócić ją do edytora albo zachować osobno."}
          </p>
          <details>
            <summary>Pokaż odzyskany tekst</summary>
            <p className="preserve-text">{recovery.text}</p>
          </details>
          <div className="button-row">
            {recovery.baseRevision === attempt.revision && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  setText(recovery.text);
                  queue.setText(recovery.text);
                  setRecovery(undefined);
                }}
              >
                Przywróć do edytora
              </button>
            )}
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                void preserveRecovery();
              }}
            >
              Zachowaj jako osobną wersję
            </button>
            <button
              className="text-button"
              onClick={() => {
                void copy();
              }}
            >
              Kopiuj tekst
            </button>
          </div>
        </aside>
      )}
      <div className="editor-label">
        <label htmlFor="response">Twoje słowa</label>
        <span
          className="save-status"
          aria-live={
            status === "error" || status === "conflict" ? "polite" : "off"
          }
        >
          {statusText}
        </span>
      </div>
      <textarea
        id="response"
        className="writing-field"
        disabled={blocked}
        maxLength={50_000}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          queue.setText(event.target.value);
        }}
        placeholder="Zacznij od jednego szczegółu…"
        aria-describedby="writing-note"
      />
      <div className="writing-meta">
        <p id="writing-note">
          Możesz pisać z pamięci, ze słów albo z obserwacji. Bez pośpiechu.
        </p>
        <span>{text.length.toLocaleString("pl-PL")} / 50 000</span>
      </div>
      {bufferError && (
        <p className="connection-error">
          Bufor ratunkowy jest niedostępny lub pełny. Niepotwierdzone zmiany
          mogą zniknąć po zamknięciu. Skopiuj tekst przed wyjściem.
        </p>
      )}
      {(error || status === "conflict") && (
        <div role="alert" className="connection-error">
          <p>
            {error ||
              "Tekst zmienił się w innej karcie. Twoje słowa pozostają tutaj."}
          </p>
          <div className="button-row">
            <button
              className="secondary-button"
              onClick={() => {
                void copy();
              }}
            >
              Kopiuj tekst
            </button>
            {status === "error" && !pendingKind && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  void queue.flush().catch(() => {});
                }}
              >
                Ponów zapis
              </button>
            )}
            {status === "conflict" && (
              <>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    void preserveRecovery();
                  }}
                >
                  Zachowaj mój tekst jako osobną wersję
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    void showConflict();
                  }}
                >
                  Pokaż wersję na Macu
                </button>
              </>
            )}
          </div>
          {serverText !== undefined && (
            <details open>
              <summary>Aktualna wersja na Macu</summary>
              <p className="preserve-text">{serverText || "Brak tekstu."}</p>
            </details>
          )}
        </div>
      )}
      <aside className="hint-panel">
        <div className="hint-top">
          <div>
            <h3>Gdy przyda się mały krok</h3>
            <p>Podpowiedzi są dobrowolne. Możesz zostać przy swoich słowach.</p>
          </div>
          {events.length > 0 && (
            <button
              className="text-button"
              onClick={() => setHintOpen((v) => !v)}
            >
              {hintOpen ? "Schowaj pomoc" : "Pokaż użyte podpowiedzi"}
            </button>
          )}
        </div>
        <div className="button-row">
          <button
            className="secondary-button"
            disabled={actionDisabled("hint1")}
            onClick={() => {
              void requestHint(1);
            }}
          >
            1 · Pytanie naprowadzające
          </button>
          {maxLevel >= 1 && (
            <button
              className="secondary-button"
              disabled={actionDisabled("hint2")}
              onClick={() => {
                void requestHint(2);
              }}
            >
              2 · Prostszy krok
            </button>
          )}
          {maxLevel >= 2 && (
            <button
              className="secondary-button"
              disabled={actionDisabled("hint3")}
              onClick={() => {
                void requestHint(3);
              }}
            >
              3 · Pokaż przykład
            </button>
          )}
        </div>
        {hintOpen &&
          events.map((event) => (
            <div className="hint-content" key={event.id}>
              <span className="eyebrow">
                {event.level === 3
                  ? "PRZYKŁAD APLIKACJI · NIE JEST WZORCEM"
                  : `POMOC ${event.level}`}
              </span>
              <p>{event.revealedContentSnapshot}</p>
            </div>
          ))}
        <p className="assistance-label">{assistanceLabel(events, attempt)}</p>
      </aside>
      <div className="editor-actions">
        <button
          className="primary-button"
          disabled={actionDisabled("complete")}
          onClick={() => {
            void finish();
          }}
        >
          Zapisz i zakończ <span aria-hidden="true">✓</span>
        </button>
        <button
          className="text-button"
          disabled={actionDisabled("skip")}
          onClick={() => {
            void finish(true);
          }}
        >
          Pomiń bez kary
        </button>
      </div>
      <Versions versions={versions} />
    </section>
  );
}
