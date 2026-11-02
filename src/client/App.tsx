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
import { Notebook } from "./Notebook";
import { Observations } from "./Observations";
import { Settings } from "./Settings";
import { Completed } from "./Completed";

export function App() {
  const [boot, setBoot] = useState<Bootstrap>(),
    [cards, setCards] = useState<Card[]>([]),
    [recent, setRecent] = useState<Attempt[]>([]);
  const [detail, setDetail] = useState<AttemptDetail>(),
    [epoch, setEpoch] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const [view,setView]=useState<'home'|'notebook'|'observations'|'settings'>('home');
  const [notebookEditing,setNotebookEditing]=useState(false);
  const request = useRef<{ cardId: string; clientRequestId: string; variant:'standard'|'easy';useConstraint:boolean; createdId?:string } | null>(
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
  async function start(cardId: string,variant:'standard'|'easy'='standard',useConstraint=false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (request.current && request.current.cardId !== cardId)
        throw new Error("Najpierw ponów rozpoczęcie poprzedniego ćwiczenia.");
      request.current ??= { cardId, clientRequestId: crypto.randomUUID(),variant,useConstraint };
      const attempt = AttemptSchema.parse(
        await api("/attempts", "POST", {cardId:request.current.cardId,clientRequestId:request.current.clientRequestId,variant:request.current.variant,useConstraint:request.current.useConstraint}),
      );
      request.current.createdId=attempt.id;
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
  const independentRequest=useRef<{clientRequestId:string;role:'independent_writing'|'near_transfer'}|null>(null);
  async function startIndependent(role:'independent_writing'|'near_transfer'='independent_writing'){
    setBusy(true);setError('');try{independentRequest.current??={clientRequestId:crypto.randomUUID(),role};const value=AttemptSchema.parse(await api('/independent','POST',independentRequest.current));await open(value.id);independentRequest.current=null;}catch(failure){setError(failure instanceof Error?failure.message:'Nie udało się rozpocząć.');}finally{setBusy(false);}
  }
  async function openExisting(id: string) {
    setBusy(true);
    setError("");
    try {
      await open(id);
      if(request.current?.createdId===id)request.current=null;
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
  const reviseRequests=useRef(new Map<string,string>()),transformRequests=useRef(new Map<string,string>());
  async function reviseAttempt(id:string){const requestId=reviseRequests.current.get(id)??crypto.randomUUID();reviseRequests.current.set(id,requestId);const created=AttemptSchema.parse(await api(`/attempts/${id}/revise`,'POST',{clientRequestId:requestId}));await open(created.id);reviseRequests.current.delete(id);}
  async function transformDocument(id:string){const requestId=transformRequests.current.get(id)??crypto.randomUUID();transformRequests.current.set(id,requestId);const created=AttemptSchema.parse(await api(`/documents/${id}/transform`,'POST',{clientRequestId:requestId}));await open(created.id);transformRequests.current.delete(id);}
  async function goHome(){await refreshHome();setView('home');}
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
        className={boot?`font-${typeof boot.settings.fontSize==='number'?boot.settings.fontSize:boot.settings.fontSize==='large'?24:18}`:undefined}
      >
        <div className="page-top">
          <span className="eyebrow">TWÓJ WŁASNY RYTM</span>
          <span className="version">Pierwsze strony · wersja 0.1</span>
        </div>
        {boot&&!detail&&!notebookEditing&&<nav className="site-nav" aria-label="Główna nawigacja">{([{id:'home',label:'Dzisiaj'},{id:'notebook',label:'Zeszyt'},{id:'observations',label:'Obserwacje'},{id:'settings',label:'Ustawienia i kopie'}] as const).map(tab=><button className="secondary-button" aria-current={view===tab.id?'page':undefined} key={tab.id} onClick={()=>{setView(tab.id);if(tab.id==='home')void refreshHome().catch(error=>setError(error instanceof Error?error.message:'Brak połączenia.'));}}>{tab.label}</button>)}</nav>}
        {boot&&!detail&&view==='notebook'&&<Notebook environmentId={boot.environmentId} onEditingChange={setNotebookEditing} onOpenAttempt={openExisting} onTransformDocument={transformDocument}/>}
        {boot&&!detail&&view==='observations'&&<Observations/>}
        {boot&&!detail&&view==='settings'&&<Settings boot={boot} onSaved={settings=>setBoot(old=>old?{...old,settings}:old)}/>}
        {boot && !detail && view==='home' && (
          <Home
            onIndependent={role=>{void startIndependent(role);}}
            cards={cards}
            drafts={boot.drafts}
            recent={recent}
            busy={busy}
            onStart={(id,variant,constraint) => {
              void start(id,variant,constraint);
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
              onHome={goHome}
              onReplace={replace}
            />
          ) : (
            <Completed
              key={`${detail.attempt.id}:${epoch}`}
              detail={detail}
              onRevise={reviseAttempt}
              onHome={goHome}
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
