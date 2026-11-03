import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { SessionSchema, type Session } from "../shared/records";
import { AttemptSchema, type Attempt } from "../shared/schemas";
import { api, isUncertainOutcome, responseData, userMessage } from "./api";

type Energy = "low" | "medium" | "high";
type SessionStatus = "completed" | "abandoned";
const AttemptResponseSchema = z.object({ attempt: AttemptSchema });
const ActiveSessionSchema = z.object({ session: SessionSchema.nullable() });

const statusLabels: Record<Attempt["status"], string> = {
  draft: "szkic",
  completed: "zapisane",
  skipped: "pominięte",
  abandoned: "przerwane",
};

export function SessionPanel({ onOpen }: { onOpen: (id: string) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [energy, setEnergy] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">(
    "success",
  );
  const request = useRef<{ clientRequestId: string; energy?: Energy } | null>(
    null,
  );
  const ending = useRef<{
    clientMutationId: string;
    status: SessionStatus;
  } | null>(null);

  async function load(value: Session | null) {
    if (!value) {
      setSession(null);
      setAttempts([]);
      return;
    }
    const results = await Promise.all(
      value.attemptIds.map((id) => api(`/attempts/${id}`)),
    );
    const loaded = results.map(
      (result) => responseData(AttemptResponseSchema, result).attempt,
    );
    setAttempts(loaded);
    setSession(value);
  }

  useEffect(() => {
    let active = true;
    api("/sessions/active")
      .then(async (result) => {
        const value = responseData(ActiveSessionSchema, result).session;
        if (!active) return;
        if (!value) return;
        const results = await Promise.all(
          value.attemptIds.map((id) => api(`/attempts/${id}`)),
        );
        if (!active) return;
        setAttempts(
          results.map(
            (item) => responseData(AttemptResponseSchema, item).attempt,
          ),
        );
        setSession(value);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessageKind("error");
        setMessage(userMessage(error, "Nie udało się odczytać sesji."));
      });
    return () => {
      active = false;
    };
  }, []);

  async function start() {
    setBusy(true);
    setMessage("");
    try {
      request.current ??= {
        clientRequestId: crypto.randomUUID(),
        ...(energy ? { energy: energy as Energy } : {}),
      };
      await load(
        responseData(
          SessionSchema,
          await api("/sessions", "POST", request.current),
        ),
      );
      request.current = null;
    } catch (error) {
      if (!isUncertainOutcome(error)) {
        request.current = null;
      }
      setMessageKind("error");
      setMessage(userMessage(error, "Nie udało się zacząć sesji."));
    } finally {
      setBusy(false);
    }
  }

  async function finish(status: SessionStatus) {
    if (!session) return;
    setBusy(true);
    setMessage("");
    try {
      ending.current ??= { clientMutationId: crypto.randomUUID(), status };
      await api(`/sessions/${session.id}`, "PATCH", ending.current);
      ending.current = null;
      await load(null);
      setMessageKind("success");
      setMessage(
        status === "completed"
          ? "Sesja zakończona. Twoje teksty są zapisane. Kopia dnia została sprawdzona."
          : "Sesja przerwana. Twoje teksty pozostają w zeszycie.",
      );
    } catch (error) {
      setMessageKind("error");
      setMessage(userMessage(error, "Nie udało się zamknąć sesji."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="session-panel" aria-labelledby="session-title">
      <span className="eyebrow">Wystarczy jedno ćwiczenie</span>
      <h2 id="session-title">
        {session ? "Twoja krótka sesja" : "Krótka sesja we własnym rytmie"}
      </h2>
      {session ? (
        <>
          <p>
            Dwie propozycje ćwiczeń i co najwyżej jeden zaplanowany powrót.
            Możesz skończyć w dowolnej chwili.
          </p>
          {attempts.map((attempt) => (
            <button
              className="draft-link"
              key={attempt.id}
              disabled={busy}
              onClick={() => onOpen(attempt.id)}
            >
              <span>
                <strong>{attempt.promptSnapshot.title}</strong>
                <small>
                  {attempt.mode === "repeat"
                    ? "Powrót do znanego ćwiczenia"
                    : attempt.status === "draft"
                      ? "Czeka na Twoje słowa"
                      : "Twoje ćwiczenie"}
                  {" · "}
                  {statusLabels[attempt.status]}
                </small>
              </span>
              <span>
                Otwórz <span aria-hidden="true">→</span>
              </span>
            </button>
          ))}
          <div className="button-row">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                void finish("completed");
              }}
            >
              Zakończ sesję na dziś
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                void finish("abandoned");
              }}
            >
              Przerwij sesję
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Dwie propozycje ćwiczeń i co najwyżej jeden zaplanowany powrót. Nie
            musisz robić całej sesji.
          </p>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => {
              void start();
            }}
          >
            {busy ? "Przygotowywanie sesji…" : "Zaproponuj krótką sesję"}
          </button>
          <details className="session-preferences">
            <summary>Dopasuj sesję do swojej energii</summary>
            <label>
              Jaką masz dziś energię?
              <select
                value={energy}
                onChange={(event) => setEnergy(event.target.value)}
              >
                <option value="">Bez wyboru</option>
                <option value="low">Mało energii</option>
                <option value="medium">Średnio</option>
                <option value="high">Dużo energii</option>
              </select>
            </label>
          </details>
        </>
      )}
      {message && (
        <p
          role={messageKind === "error" ? "alert" : "status"}
          className={
            messageKind === "error" ? "connection-error" : "notice-success"
          }
        >
          {message}
        </p>
      )}
    </section>
  );
}
