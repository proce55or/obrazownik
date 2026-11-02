import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { CardSchema, type Card } from "../domain/cards";
import {
  AttemptSchema,
  DetailSchema,
  type Attempt,
  type AttemptDetail,
  type Bootstrap,
} from "../shared/schemas";
import { api, bootstrap } from "./api";
import { Home } from "./Home";
import { Editor } from "./Editor";
import { Completed } from "./Completed";

export function App() {
  const [boot, setBoot] = useState<Bootstrap>(),
    [cards, setCards] = useState<Card[]>([]),
    [recent, setRecent] = useState<Attempt[]>([]);
  const [detail, setDetail] = useState<AttemptDetail>(),
    [epoch, setEpoch] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const request = useRef<{ cardId: string; clientRequestId: string } | null>(
    null,
  );
  async function refreshHome() {
    const [value, pack, history] = await Promise.all([
      bootstrap(),
      api("/cards"),
      api("/attempts?status=completed&limit=5"),
    ]);
    setBoot(value);
    setCards(z.object({ cards: z.array(CardSchema) }).parse(pack).cards);
    setRecent(
      z.object({ attempts: z.array(AttemptSchema) }).parse(history).attempts,
    );
    setDetail(undefined);
    setError("");
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      bootstrap(),
      api("/cards"),
      api("/attempts?status=completed&limit=5"),
    ])
      .then(([value, pack, history]) => {
        if (!active) return;
        setBoot(value);
        setCards(z.object({ cards: z.array(CardSchema) }).parse(pack).cards);
        setRecent(
          z.object({ attempts: z.array(AttemptSchema) }).parse(history)
            .attempts,
        );
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Nie udało się połączyć.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function open(id: string) {
    const value = DetailSchema.parse(await api(`/attempts/${id}`));
    await api(`/attempts/${id}/shown`, "POST", {});
    setDetail(value);
    setEpoch((old) => old + 1);
    setError("");
    requestAnimationFrame(() => document.getElementById("main")?.focus());
  }
  async function start(cardId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (request.current && request.current.cardId !== cardId)
        throw new Error("Najpierw ponów rozpoczęcie poprzedniego ćwiczenia.");
      request.current ??= { cardId, clientRequestId: crypto.randomUUID() };
      const attempt = AttemptSchema.parse(
        await api("/attempts", "POST", request.current),
      );
      await open(attempt.id);
      request.current = null;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się otworzyć ćwiczenia.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openExisting(id: string) {
    setBusy(true);
    setError("");
    try {
      await open(id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się otworzyć tekstu.",
      );
    } finally {
      setBusy(false);
    }
  }
  const replace = (value: AttemptDetail) => {
    setDetail(value);
    setEpoch((old) => old + 1);
    requestAnimationFrame(() => document.getElementById("main")?.focus());
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      <header className="site-header">
        <span className="brand">
          <img src="/favicon.svg" alt="" />
          obrazownik<span className="brand-dot">.</span>
        </span>
        <span className="header-note">Miejsce na własne słowa</span>
        <span className="local-status">
          <i />
          Tylko na Twoim Macu
        </span>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={
          boot?.settings.fontSize === "large" ? "large-type" : undefined
        }
      >
        <div className="page-top">
          <span className="eyebrow">TWÓJ WŁASNY RYTM</span>
          <span className="version">Pierwsze strony · wersja 0.1</span>
        </div>
        {boot && !detail && (
          <Home
            cards={cards}
            drafts={boot.drafts}
            recent={recent}
            busy={busy}
            onStart={(id) => {
              void start(id);
            }}
            onOpen={(id) => {
              void openExisting(id);
            }}
          />
        )}
        {boot &&
          detail &&
          (detail.attempt.status === "draft" ? (
            <Editor
              key={`${detail.attempt.id}:${epoch}`}
              initial={detail}
              environmentId={boot.environmentId}
              onHome={refreshHome}
              onReplace={replace}
            />
          ) : (
            <Completed
              key={`${detail.attempt.id}:${epoch}`}
              detail={detail}
              onHome={refreshHome}
            />
          ))}
        {!boot && busy && <p role="status">Otwieranie Twojej przestrzeni…</p>}
        {error && (
          <div role="alert" className="connection-error">
            <p>{error}</p>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void refreshHome()
                  .catch((failure) =>
                    setError(
                      failure instanceof Error
                        ? failure.message
                        : "Brak połączenia.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Połącz ponownie
            </button>
          </div>
        )}
      </main>
      <footer>
        <span>Każdy obraz zaczyna się od zauważenia.</span>
        <span>Prywatnie. Lokalnie. Po swojemu.</span>
      </footer>
    </>
  );
}
