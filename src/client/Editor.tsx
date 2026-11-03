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
import {
  api,
  isUncertainOutcome,
  isWriteConflict,
  responseData,
  userMessage,
} from "./api";
import { findRecovery, putRecovery, clearRecovery } from "./recovery";
import { AboutExercise } from "./AboutExercise";
import { FAMILY_LABELS } from "../shared/config";
import { assistanceLabel, Versions } from "./AttemptNotes";
import { LocalModel, providerLabel } from "./LocalModel";
interface Props {
  initial: AttemptDetail;
  environmentId: string;
  onHome: () => Promise<void>;
  onReplace: (detail: AttemptDetail) => void;
}
type Action =
  | "llmHint"
  | "hint1"
  | "hint2"
  | "hint3"
  | "complete"
  | "skip"
  | "recovery"
  | "assisted";
export function Editor({ initial, environmentId, onHome, onReplace }: Props) {
  const [attempt, setAttempt] = useState(initial.attempt),
    [text, setText] = useState(initial.attempt.currentText);
  const [fields, setFields] = useState(initial.attempt.scaffolding);
  const [status, setStatus] = useState<SaveStatus>("saved"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
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
          responseData(
            AttemptSchema,
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
    (async () => {
      let draft = await findRecovery(environmentId, initial.attempt.id);
      while (
        draft &&
        draft.text === initial.attempt.currentText &&
        JSON.stringify(draft.scaffolding ?? {}) ===
          JSON.stringify(initial.attempt.scaffolding)
      ) {
        await clearRecovery(
          environmentId,
          draft.id,
          draft.text,
          draft.scaffolding ?? {},
        );
        draft = await findRecovery(environmentId, initial.attempt.id);
      }
      if (active && draft) setRecovery(draft);
    })()
      .catch(() => {
        if (active) setBufferError(true);
      })
      .finally(() => {
        if (active) setCheckingRecovery(false);
      });
    const persistOnExit = () => {
      void queue.settleRecovery();
    };
    const preventLoss = (event: BeforeUnloadEvent) => {
      persistOnExit();
      if (queue.dirty || pending.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    window.addEventListener("pagehide", persistOnExit);
    return () => {
      active = false;
      queue.dispose();
      window.removeEventListener("beforeunload", preventLoss);
      window.removeEventListener("pagehide", persistOnExit);
    };
  }, [
    environmentId,
    initial.attempt.id,
    initial.attempt.currentText,
    initial.attempt.scaffolding,
    queue,
  ]);
  useEffect(() => {
    const bank = initial.assistanceEvents.filter(
      (event) => event.kind === "word_bank" && event.status === "prepared",
    );
    const frame = requestAnimationFrame(() => {
      for (const event of bank)
        void api(
          `/attempts/${initial.attempt.id}/hints/${event.id}/delivered`,
          "POST",
          {},
        )
          .then((value) => {
            const delivered = responseData(AssistanceSchema, value);
            setEvents((old) =>
              old.map((e) => (e.id === delivered.id ? delivered : e)),
            );
          })
          .catch(() =>
            setError(
              "Nie udało się potwierdzić pokazania słów pomocniczych. Możesz pisać dalej.",
            ),
          );
    });
    return () => cancelAnimationFrame(frame);
  }, [initial.attempt.id, initial.assistanceEvents]);
  const recoveryRef = useRef<HTMLElement>(null),
    conflictRef = useRef<HTMLDivElement>(null);
  const writingRef = useRef<HTMLTextAreaElement>(null),
    [selection, setSelection] = useState({ start: 0, end: 0 });
  const hasConflict = status === "conflict";
  useEffect(() => {
    if (recovery) recoveryRef.current?.focus();
    else if (hasConflict) conflictRef.current?.focus();
    else if (!checkingRecovery) writingRef.current?.focus();
  }, [recovery, hasConflict, checkingRecovery]);
  function moveSelection(front: boolean) {
    if (selection.end <= selection.start) return;
    const piece = text.slice(selection.start, selection.end),
      rest = text.slice(0, selection.start) + text.slice(selection.end),
      next = front ? piece + " " + rest : rest + " " + piece;
    setText(next);
    queue.setText(next);
    setSelection({ start: 0, end: 0 });
  }
  async function copy() {
    try {
      const localFields = recovery?.scaffolding ?? fields,
        body = recovery?.text ?? text;
      const rendered = Object.entries(localFields)
        .map(
          ([id, value]) =>
            `${attempt.scaffoldSlots.find((s) => s.id === id)?.label ?? id}: ${value}`,
        )
        .join("\n");
      await navigator.clipboard.writeText(
        body + (rendered ? "\n\nMoje pola:\n" + rendered : ""),
      );
      setNotice("Tekst skopiowany.");
    } catch {
      setError("Zaznacz tekst w polu i skopiuj go skrótem ⌘C.");
    }
  }
  async function showConflict() {
    try {
      const detail = responseData(
        DetailSchema,
        await api(`/attempts/${attempt.id}`),
      );
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
      // Validate before releasing the mutation: a new server may have accepted
      // the write even when this page cannot read its response.
      if (kind === "complete" || kind === "skip")
        responseData(AttemptSchema, result);
      else if (kind === "assisted") responseData(DetailSchema, result);
      else
        responseData(
          z.object({ attempt: AttemptSchema, event: AssistanceSchema }),
          result,
        );
      if (kind !== "complete" && kind !== "skip") {
        pending.current = null;
        setPendingKind(null);
      }
      return result;
    } catch (failure) {
      setError(userMessage(failure, "Nie udało się zapisać."));
      if (isWriteConflict(failure)) {
        setStatus("conflict");
        await showConflict();
      }
      if (!isUncertainOutcome(failure)) {
        pending.current = null;
        setPendingKind(null);
      }
      throw failure;
    } finally {
      setBusy(false);
    }
  }
  async function requestHint(level: number, localModel = false) {
    try {
      const result = await perform(
        localModel ? "llmHint" : (`hint${level}` as Action),
        localModel
          ? `/attempts/${attempt.id}/llm/hint`
          : `/attempts/${attempt.id}/hints`,
        localModel ? {} : { level },
      );
      if (!result) return;
      const received = responseData(
        z.object({ attempt: AttemptSchema, event: AssistanceSchema }),
        result,
      );
      queue.acceptRevision(received.attempt);
      setEvents((old) => [
        ...old.filter((e) => e.id !== received.event.id),
        received.event,
      ]);
      setHintOpen(true);
      const detail = responseData(
        DetailSchema,
        await api(`/attempts/${attempt.id}`),
      );
      setVersions(detail.versions);
      // Confirm only after the content has been rendered. A failure remains conservative.
      requestAnimationFrame(() => {
        void api(
          `/attempts/${attempt.id}/hints/${received.event.id}/delivered`,
          "POST",
          {},
        )
          .then((value) => {
            const delivered = responseData(AssistanceSchema, value);
            setEvents((old) =>
              old.map((e) => (e.id === delivered.id ? delivered : e)),
            );
          })
          .catch(() =>
            setError(
              "Podpowiedź jest widoczna, ale nie udało się potwierdzić jej pokazania. Możesz pisać dalej.",
            ),
          );
      });
    } catch (failure) {
      setError(userMessage(failure, "Nie udało się pokazać podpowiedzi."));
      // Unknown transport outcomes keep the mutation id for a safe retry.
      if (localModel) throw failure;
    }
  }
  async function finish(skip = false) {
    try {
      const result = await perform(
        skip ? "skip" : "complete",
        `/attempts/${attempt.id}/${skip ? "skip" : "complete"}`,
      );
      if (!result) return;
      const saved = responseData(AttemptSchema, result);
      queue.acceptRevision(saved);
      await queue.settleRecovery();
      const detail = responseData(
        DetailSchema,
        await api(`/attempts/${attempt.id}`),
      );
      pending.current = null;
      setPendingKind(null);
      onReplace(detail);
    } catch (failure) {
      setError(
        userMessage(
          failure,
          "Nie udało się potwierdzić zakończenia. Ponów zakończenie poniżej.",
        ),
      );
    }
  }
  async function chooseAssistance() {
    try {
      const value = await perform(
        "assisted",
        `/attempts/${attempt.id}/assisted`,
      );
      if (value) onReplace(DetailSchema.parse(value));
    } catch {
      /* Original text remains in its own attempt. */
    }
  }
  async function pause() {
    setBusy(true);
    try {
      await queue.flush();
      await queue.settleRecovery();
      await onHome();
    } catch (failure) {
      setError(userMessage(failure, "Nie udało się zapisać szkicu."));
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
          body: {
            text: local,
            scaffolding: recovery?.scaffolding ?? fields,
            clientMutationId: crypto.randomUUID(),
          },
        };
      setPendingKind("recovery");
      await api(pending.current.path, "POST", pending.current.body);
      pending.current = null;
      setPendingKind(null);
      await clearRecovery(
        environmentId,
        attempt.id,
        local,
        recovery?.scaffolding ?? fields,
      );
      onReplace(
        responseData(DetailSchema, await api(`/attempts/${attempt.id}`)),
      );
    } catch (failure) {
      setError(userMessage(failure, "Nie udało się zachować osobnej wersji."));
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
    ...events
      .filter((e) => e.status !== "failed" && e.kind !== "word_bank")
      .map((e) => e.level),
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
          <span aria-hidden="true">← </span>Zapisz szkic i wróć
        </button>
        <span className="eyebrow">
          {attempt.mode === "independent"
            ? "NOWE SAMODZIELNE PISANIE"
            : attempt.setRole === "independent_writing"
              ? "WERSJA WSPOMAGANA"
              : FAMILY_LABELS[attempt.family]}
        </span>
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
      <AboutExercise attempt={attempt} />
      {attempt.scaffoldSlots.length > 0 && (
        <section className="scaffold">
          <h3>Moje kroki do własnego zdania</h3>
          <p className="fine-print">
            Wybierz dowolne pole. Możesz pominąć wszystkie i od razu pisać.
          </p>
          <div className="button-row">
            {attempt.scaffoldSlots
              .filter((slot) => !(slot.id in fields))
              .map((slot) => (
                <button
                  className="secondary-button"
                  key={slot.id}
                  disabled={
                    busy ||
                    checkingRecovery ||
                    !!recovery ||
                    status === "conflict"
                  }
                  onClick={() => {
                    const next = { ...fields, [slot.id]: "" };
                    setFields(next);
                    queue.setScaffolding(next);
                  }}
                >
                  {slot.label} +
                </button>
              ))}
          </div>
          {attempt.scaffoldSlots
            .filter((slot) => slot.id in fields)
            .map((slot) => (
              <label className="scaffold-field" key={slot.id}>
                {slot.label}
                <textarea
                  maxLength={4000}
                  disabled={
                    busy ||
                    checkingRecovery ||
                    !!recovery ||
                    status === "conflict"
                  }
                  value={fields[slot.id]}
                  onChange={(e) => {
                    const next = { ...fields, [slot.id]: e.target.value };
                    setFields(next);
                    queue.setScaffolding(next);
                  }}
                />
              </label>
            ))}
        </section>
      )}
      {attempt.sourceText !== null && (
        <section className="scaffold source-workshop">
          <h3>Tekst źródłowy - pozostaje zachowany</h3>
          <p className="preserve-text">{attempt.sourceText}</p>
          <p className="fine-print">
            Możesz wybierać słowa, przestawiać fragmenty i dopisywać dowolne
            własne słowa. Oryginał pozostaje zachowany.
          </p>
          <details>
            <summary>Wybierz słowa z fragmentu</summary>
            <div className="word-bank">
              {attempt.sourceText
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 160)
                .map((word, index) => (
                  <button
                    className="secondary-button"
                    key={index}
                    disabled={
                      busy ||
                      !!recovery ||
                      checkingRecovery ||
                      status === "conflict"
                    }
                    onClick={() => {
                      const next =
                        text + (text && !/\s$/.test(text) ? " " : "") + word;
                      setText(next);
                      queue.setText(next);
                    }}
                  >
                    {word}
                  </button>
                ))}
            </div>
          </details>
        </section>
      )}
      {recovery && (
        <aside
          className="recovery-panel"
          aria-label="Odzyskiwanie szkicu"
          ref={recoveryRef}
          tabIndex={-1}
        >
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
                  setFields(recovery.scaffolding ?? {});
                  queue.setScaffolding(recovery.scaffolding ?? {});
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
        ref={writingRef}
        onSelect={() => {
          const area = writingRef.current;
          if (area)
            setSelection({
              start: area.selectionStart,
              end: area.selectionEnd,
            });
        }}
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
      {attempt.sourceText !== null && (
        <div className="button-row">
          <button
            className="secondary-button"
            disabled={blocked || selection.end <= selection.start}
            onClick={() => moveSelection(true)}
          >
            Zaznaczenie na początek
          </button>
          <button
            className="secondary-button"
            disabled={blocked || selection.end <= selection.start}
            onClick={() => moveSelection(false)}
          >
            Zaznaczenie na koniec
          </button>
        </div>
      )}
      <div className="writing-meta">
        <p id="writing-note">
          Możesz pisać z pamięci, ze słów albo z obserwacji. Bez pośpiechu.
        </p>
        <span>{text.length.toLocaleString("pl-PL")} / 50 000</span>
      </div>
      {notice && <p role="status">{notice}</p>}
      {bufferError && (
        <p className="connection-error">
          Bufor ratunkowy jest niedostępny lub pełny. Niepotwierdzone zmiany
          mogą zniknąć po zamknięciu. Skopiuj tekst przed wyjściem.
        </p>
      )}
      {(error || status === "conflict") && (
        <div
          role="alert"
          className="connection-error"
          ref={conflictRef}
          tabIndex={-1}
        >
          <p>
            {error ||
              "Tekst zmienił się w innej karcie. Twoje słowa pozostają tutaj."}
          </p>
          {(pendingKind === "complete" || pendingKind === "skip") && (
            <p>
              Nie mamy jeszcze potwierdzenia zakończenia. Tekst pozostaje tutaj.
              Ponowienie bezpiecznie sprawdzi poprzedni zapis.
            </p>
          )}
          <div className="button-row">
            {(pendingKind === "complete" || pendingKind === "skip") && (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => {
                  void finish(pendingKind === "skip");
                }}
              >
                Ponów zakończenie
              </button>
            )}
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
      {attempt.mode === "independent" ? (
        <aside className="hint-panel">
          <h3>Twoje pierwsze słowa bez podpowiedzi</h3>
          <p>
            Jeśli chcesz pomocy, zachowamy tę próbę osobno i otworzymy wersję
            wspomaganą. Możesz też po prostu przerwać.
          </p>
          <button
            className="text-button"
            disabled={actionDisabled("assisted")}
            onClick={() => {
              void chooseAssistance();
            }}
          >
            Potrzebuję pomocy - otwórz osobną wersję
          </button>
        </aside>
      ) : (
        <aside className="hint-panel">
          <div className="hint-top">
            <div>
              <h3>Gdy przyda się mały krok</h3>
              <p>
                Podpowiedzi są dobrowolne. Możesz zostać przy swoich słowach.
              </p>
            </div>
            {events.length > 0 && (
              <button
                className="text-button"
                onClick={() => setHintOpen((v) => !v)}
              >
                {hintOpen ? "Schowaj podpowiedzi" : "Pokaż użyte podpowiedzi"}
              </button>
            )}
          </div>
          {attempt.llmMode === "bielik" && (
            <LocalModel
              attemptId={attempt.id}
              disabled={actionDisabled("llmHint")}
              onReveal={() => requestHint(1, true)}
            />
          )}
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
            {maxLevel >= 2 && attempt.setRole !== "independent_writing" && (
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
                <p className="fine-print">{providerLabel(event.provider)}</p>
                <p>{event.revealedContentSnapshot}</p>
              </div>
            ))}
          <p className="assistance-label">{assistanceLabel(events, attempt)}</p>
        </aside>
      )}
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
          Pomiń ćwiczenie
        </button>
      </div>
      <Versions versions={versions} slots={attempt.scaffoldSlots} />
    </section>
  );
}
