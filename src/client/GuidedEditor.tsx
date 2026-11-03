import { useEffect, useRef, useState } from "react";
import {
  DraftQueue,
  type RecoveryDraft,
  type SaveStatus,
} from "../domain/draft-queue";
import { GUIDED_STEPS, isGuidedFeedbackCurrent } from "../shared/guided";
import {
  AttemptSchema,
  AssistanceSchema,
  DetailSchema,
  VersionSchema,
  type AttemptDetail,
} from "../shared/schemas";
import {
  api,
  ApiError,
  isUncertainOutcome,
  isWriteConflict,
  responseData,
  userMessage,
} from "./api";
import { clearRecovery, findRecovery, putRecovery } from "./recovery";
import { InterfaceHelp } from "./AppShell";
import { GUIDED_CRITERIA, GuidedHistory, ReviewContent } from "./GuidedReview";
import { Versions } from "./AttemptNotes";

type Action = "feedback" | "next" | "complete" | "recovery";
type Pending = { kind: Action; path: string; body: Record<string, unknown> };
export function GuidedEditor({
  initial,
  environmentId,
  onHome,
  onReplace,
}: {
  initial: AttemptDetail;
  environmentId: string;
  onHome: () => Promise<void>;
  onReplace: (detail: AttemptDetail) => void;
}) {
  const [attempt, setAttempt] = useState(initial.attempt);
  const [text, setText] = useState(initial.attempt.currentText);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [bufferError, setBufferError] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);
  const [recovery, setRecovery] = useState<RecoveryDraft>();
  const [pendingKind, setPendingKind] = useState<Action | null>(null);
  const [serverText, setServerText] = useState<string>();
  const pending = useRef<Pending | null>(null);
  const writingRef = useRef<HTMLTextAreaElement>(null);
  const feedbackRef = useRef<HTMLElement>(null);
  const recoveryRef = useRef<HTMLElement>(null);
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
        clearRecovery: (value, fields) =>
          clearRecovery(environmentId, initial.attempt.id, value, fields),
        onStatus: (next, message) => {
          setStatus(next);
          if (message) setError(message);
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
    const persist = () => {
      void queue.settleRecovery();
    };
    const preventLoss = (event: BeforeUnloadEvent) => {
      persist();
      if (queue.dirty || pending.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    window.addEventListener("pagehide", persist);
    return () => {
      active = false;
      queue.dispose();
      window.removeEventListener("beforeunload", preventLoss);
      window.removeEventListener("pagehide", persist);
    };
  }, [environmentId, initial.attempt, queue]);

  useEffect(() => {
    if (recovery) recoveryRef.current?.focus();
    else if (!checkingRecovery) writingRef.current?.focus();
  }, [recovery, checkingRecovery]);

  const review = attempt.guided?.feedback;
  const reviewEventId = review?.eventId;
  useEffect(() => {
    if (!reviewEventId) return;
    const frame = requestAnimationFrame(() => {
      void api(
        `/attempts/${initial.attempt.id}/hints/${reviewEventId}/delivered`,
        "POST",
        {},
      )
        .then((value) => responseData(AssistanceSchema, value))
        .catch(() =>
          setNotice(
            "Wskazówka jest widoczna, ale nie udało się potwierdzić jej pokazania. Tekst pozostaje zapisany.",
          ),
        );
    });
    return () => cancelAnimationFrame(frame);
  }, [initial.attempt.id, reviewEventId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(recovery?.text ?? text);
      setNotice("Tekst skopiowany.");
    } catch {
      setError("Zaznacz tekst w polu i użyj skrótu kopiowania na klawiaturze.");
    }
  }
  async function showConflict() {
    try {
      setServerText(
        responseData(DetailSchema, await api(`/attempts/${attempt.id}`)).attempt
          .currentText,
      );
    } catch {
      /* The local answer remains visible. */
    }
  }
  async function pause() {
    setBusy(true);
    setError("");
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
  async function perform(kind: Exclude<Action, "recovery">) {
    if (busy || (pending.current && pending.current.kind !== kind)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await queue.flush();
      // Finish cleanup of the acknowledged previous answer before a stage
      // transition can replace it with a new, empty response on the server.
      await queue.settleRecovery();
      pending.current ??= {
        kind,
        path: `/attempts/${attempt.id}/${kind === "complete" ? "complete" : `guided/${kind}`}`,
        body: {
          expectedRevision: queue.currentRevision,
          clientMutationId: crypto.randomUUID(),
        },
      };
      setPendingKind(kind);
      const result = await api(
        pending.current.path,
        "POST",
        pending.current.body,
      );
      if (kind === "complete") {
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
      } else {
        const detail = responseData(DetailSchema, result);
        queue.acceptRevision(detail.attempt);
        pending.current = null;
        setPendingKind(null);
        if (kind === "next") {
          await queue.settleRecovery();
          onReplace(detail);
        } else {
          requestAnimationFrame(() => feedbackRef.current?.focus());
        }
      }
    } catch (failure) {
      setError(
        userMessage(
          failure,
          "Nie udało się otrzymać odpowiedzi. Twój tekst pozostaje tutaj.",
        ),
      );
      if (isWriteConflict(failure)) {
        setStatus("conflict");
        await showConflict();
      }
      const definiteModelFailure =
        failure instanceof ApiError &&
        [
          "guided_unavailable",
          "guided_generation_failed",
          "guided_busy",
          "guided_invalid_feedback",
        ].includes(failure.code);
      if (definiteModelFailure || !isUncertainOutcome(failure)) {
        pending.current = null;
        setPendingKind(null);
      }
    } finally {
      setBusy(false);
    }
  }
  async function preserveRecovery() {
    const local = recovery?.text ?? text;
    setBusy(true);
    setError("");
    try {
      await queue.settleRecovery();
      if (pending.current?.kind !== "recovery")
        pending.current = {
          kind: "recovery",
          path: `/attempts/${attempt.id}/recovery`,
          body: {
            text: local,
            scaffolding: recovery?.scaffolding ?? attempt.scaffolding,
            clientMutationId: crypto.randomUUID(),
          },
        };
      setPendingKind("recovery");
      responseData(
        VersionSchema,
        await api(pending.current.path, "POST", pending.current.body),
      );
      await clearRecovery(
        environmentId,
        attempt.id,
        local,
        recovery?.scaffolding ?? attempt.scaffolding,
      );
      const detail = responseData(
        DetailSchema,
        await api(`/attempts/${attempt.id}`),
      );
      pending.current = null;
      setPendingKind(null);
      onReplace(detail);
    } catch (failure) {
      setError(userMessage(failure, "Nie udało się zachować osobnej wersji."));
    } finally {
      setBusy(false);
    }
  }

  const guided = attempt.guided!;
  const step = GUIDED_STEPS[guided.step];
  const currentReview = isGuidedFeedbackCurrent({ currentText: text, guided });
  const blocked =
    busy ||
    checkingRecovery ||
    !!recovery ||
    status === "conflict" ||
    !!pendingKind;
  const statusText = {
    saved: "Zapisano na tym komputerze",
    dirty: "Oczekuje na zapis…",
    saving: "Zapisywanie…",
    error: "Zapis wymaga ponowienia",
    conflict: "Wersje wymagają porównania",
  }[status];
  return (
    <section className="guided-editor">
      <div className="guided-top">
        <button
          className="text-button"
          disabled={blocked}
          onClick={() => {
            void pause();
          }}
        >
          ← Zapisz szkic i wróć
        </button>
        <span className="eyebrow">Z LOKALNYM BIELIKIEM</span>
      </div>
      <ol className="guided-progress" aria-label="Kroki ćwiczenia">
        {GUIDED_STEPS.map((item, index) => (
          <li
            key={item.title}
            aria-current={guided.step === index ? "step" : undefined}
          >
            <span>{index + 1}</span>
            {item.title}
            {index < guided.step ? " ✓" : ""}
          </li>
        ))}
      </ol>
      <div className="guided-layout">
        <div className="guided-writing">
          <p className="eyebrow">
            KROK {guided.step + 1} Z 3 · KAMIEŃ NAD RZEKĄ
          </p>
          <h1>{step.title}</h1>
          <p className="guided-instruction" id="guided-instruction">
            {step.instruction}
          </p>
          <p className="guided-criterion">
            <strong>Cel tego kroku:</strong> {GUIDED_CRITERIA[guided.step]}
          </p>
          {guided.history.length > 0 && (
            <div className="previous-answer">
              <h2>Twoje zdanie z poprzedniego kroku</h2>
              <p className="preserve-text">
                {guided.history[guided.history.length - 1].answer}
              </p>
            </div>
          )}
          {recovery && (
            <aside
              className="recovery-panel"
              ref={recoveryRef}
              tabIndex={-1}
              aria-label="Odzyskiwanie szkicu"
            >
              <h2>Został niezapisany tekst</h2>
              <p>
                To kopia ratunkowa z tej przeglądarki. Zachowaj ją przed dalszym
                pisaniem.
              </p>
              <details>
                <summary>Pokaż odzyskaną odpowiedź</summary>
                <p className="preserve-text">{recovery.text}</p>
              </details>
              <div className="button-row">
                {recovery.baseRevision === attempt.revision && (
                  <button
                    className="secondary-button"
                    disabled={busy || !!pendingKind}
                    onClick={() => {
                      setText(recovery.text);
                      queue.setText(recovery.text);
                      queue.setScaffolding(recovery.scaffolding ?? {});
                      setRecovery(undefined);
                    }}
                  >
                    Przywróć do edytora
                  </button>
                )}
                <button
                  className="secondary-button"
                  disabled={
                    busy || (!!pendingKind && pendingKind !== "recovery")
                  }
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
          <div className="help-heading field-heading">
            <label htmlFor="guided-answer">Twoja odpowiedź</label>
            <InterfaceHelp label="Twoja odpowiedź">
              Tutaj piszesz własnymi słowami. Tekst zapisuje się automatycznie.
              Przycisk pod polem poprosi Bielika o przeczytanie zapisanej
              odpowiedzi.
            </InterfaceHelp>
          </div>
          <textarea
            id="guided-answer"
            ref={writingRef}
            className="writing-field"
            value={text}
            maxLength={50_000}
            disabled={blocked}
            aria-describedby="guided-instruction guided-save-status"
            placeholder={step.placeholder}
            onChange={(event) => {
              setText(event.target.value);
              queue.setText(event.target.value);
              setError("");
            }}
          />
          <p
            className="field-note"
            id="guided-save-status"
            aria-live={
              status === "error" || status === "conflict" ? "polite" : "off"
            }
          >
            {statusText} · {text.length.toLocaleString("pl-PL")} znaków
          </p>
          {text.length > 1800 && (
            <p className="stale-note" role="status">
              Bielik może omówić do 1800 znaków w jednym kroku. Skróć odpowiedź
              do kilku zdań, aby poprosić o wskazówkę. Dłuższy tekst pozostaje w
              szkicu.
            </p>
          )}
          {busy && pendingKind === "feedback" && (
            <p className="guided-wait" role="status">
              Bielik czyta tę odpowiedź na Twoim komputerze. Przygotowanie
              wskazówki może potrwać do trzech minut. Pole jest chwilowo
              wstrzymane, aby wskazówka dotyczyła dokładnie tego tekstu.
            </p>
          )}
          {bufferError && (
            <p className="connection-error" role="alert">
              Bufor ratunkowy jest niedostępny. Skopiuj tekst przed zamknięciem
              strony, jeśli zapis nie został potwierdzony.
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {error && (
            <div className="connection-error" role="alert">
              <p>{error}</p>
              {pendingKind && (
                <p>
                  Nie mamy jeszcze potwierdzenia operacji. Ponów ją, aby
                  bezpiecznie sprawdzić wynik. Twoja odpowiedź pozostaje tutaj.
                </p>
              )}
              <div className="button-row">
                <button
                  className="secondary-button"
                  onClick={() => {
                    void copy();
                  }}
                >
                  Kopiuj odpowiedź
                </button>
                {status === "error" && !pendingKind && (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      void queue.flush().catch(() => {});
                    }}
                  >
                    Ponów zapis
                  </button>
                )}
                {pendingKind &&
                  pendingKind !== "recovery" &&
                  status !== "conflict" && (
                    <button
                      className="primary-button"
                      disabled={busy}
                      onClick={() => {
                        void perform(pendingKind);
                      }}
                    >
                      Ponów{" "}
                      {pendingKind === "feedback"
                        ? "prośbę o wskazówkę"
                        : pendingKind === "next"
                          ? "przejście dalej"
                          : "zakończenie"}
                    </button>
                  )}
              </div>
            </div>
          )}
          {status === "conflict" && (
            <section className="recovery-panel">
              <h2>Odpowiedź zmieniła się w innej karcie</h2>
              <p>
                Zachowaj swój tekst jako osobną wersję. Nie zastąpi on wersji
                już zapisanej.
              </p>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  void preserveRecovery();
                }}
              >
                Zachowaj moją osobną wersję
              </button>
              {serverText !== undefined && (
                <details>
                  <summary>Pokaż wersję zapisaną na komputerze</summary>
                  <p className="preserve-text">{serverText}</p>
                </details>
              )}
            </section>
          )}
          <div className="button-row guided-actions">
            <button
              className="primary-button"
              disabled={blocked || !text.trim() || text.length > 1800}
              onClick={() => {
                void perform("feedback");
              }}
            >
              {review
                ? "Poproś o nową wskazówkę"
                : "Poproś Bielika o wskazówkę"}
            </button>
          </div>
          {review && (
            <section
              className={`guided-feedback${currentReview ? "" : " stale-feedback"}`}
              aria-label="Wskazówka lokalnego Bielika"
              ref={feedbackRef}
              tabIndex={-1}
            >
              <span className="eyebrow">
                LOKALNY BIELIK · KROK {review.step + 1}
              </span>
              <h2>Wskazówka do Twojej odpowiedzi</h2>
              {!currentReview && (
                <p className="stale-note" role="status">
                  Odpowiedź została zmieniona. Poniższa wskazówka dotyczy
                  poprzedniej wersji. Poproś o nową wskazówkę przed przejściem
                  dalej.
                </p>
              )}
              <ReviewContent review={review} />
              <p className="fine-print">
                To propozycja modelu. Możesz się z nią nie zgodzić. Wybór słów
                należy do Ciebie.
              </p>
              <div className="button-row">
                <button
                  className="secondary-button"
                  disabled={blocked}
                  onClick={() => {
                    writingRef.current?.focus();
                    writingRef.current?.setSelectionRange(
                      text.length,
                      text.length,
                    );
                  }}
                >
                  Chcę dopracować odpowiedź
                </button>
                <button
                  className="primary-button"
                  disabled={blocked || !currentReview}
                  onClick={() => {
                    void perform(guided.step === 2 ? "complete" : "next");
                  }}
                >
                  {guided.step === 2
                    ? "Zakończ i zachowaj ćwiczenie"
                    : `Przejdź do kroku ${guided.step + 2} →`}
                </button>
              </div>
            </section>
          )}
        </div>
        <aside className="guided-goal">
          <div className="help-heading">
            <h2>Po co ten krok?</h2>
            <InterfaceHelp label="Cel ćwiczenia">
              Ćwiczysz konkretny sposób tworzenia obrazu. Wskazówka Bielika
              dotyczy Twojej odpowiedzi na aktualne polecenie.
            </InterfaceHelp>
          </div>
          <p>{step.purpose}</p>
          <p className="fine-print">
            Wystarczy jedna próba. Możesz poprawić ją po wskazówce albo zachować
            swoje brzmienie.
          </p>
        </aside>
      </div>
      <GuidedHistory reviews={guided.history} />
      <Versions versions={initial.versions} />
    </section>
  );
}
