import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { z } from "zod";
import { AttemptSchema, AssistanceStateSchema } from "../shared/schemas";
import {
  DocumentSchema,
  DocumentVersionSchema,
  type DocumentRecord,
} from "../shared/records";
import {
  DraftQueue,
  type RecoveryDraft,
  type SaveStatus,
} from "../domain/draft-queue";
import { api, ApiError } from "./api";
import { clearRecovery, findRecovery, putRecovery } from "./recovery";
import "./notebook.css";

const DocumentDetailSchema = z.object({
  document: DocumentSchema,
  versions: z.array(DocumentVersionSchema),
});
type DocumentDetail = z.infer<typeof DocumentDetailSchema>;
const NotebookAttemptSchema = AttemptSchema.extend({
  assistanceState: AssistanceStateSchema,
  assistanceLevel: z.number().int().min(0).max(3),
});
const AttemptPageSchema = z.object({
  attempts: z.array(NotebookAttemptSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
const DocumentPageSchema = z.object({
  documents: z.array(DocumentSchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
const families = {
  property: "Właściwość i obraz",
  bridge: "Most między pojęciami",
  verb: "Czasownik buduje scenę",
  sense: "Zmysł i perspektywa",
  transform: "Wybierz, usuń, dopisz",
};
const modes = {
  training: "Trening",
  repeat: "Powrót",
  near_transfer: "Bliskie przeniesienie",
  independent: "Samodzielna próba",
  assisted_writing: "Nowe pisanie z pomocą",
};
function helpLabel(state: string, level: number) {
  return state === "unknown"
    ? "Historia pomocy nieznana lub niepewna"
    : state === "none_confirmed"
      ? "Bez pomocy w aplikacji"
      : level === 3
        ? "Po obejrzeniu przykładu"
        : `Z pomocą · poziom ${level}`;
}
function date(value: string) {
  return new Date(value).toLocaleString("pl-PL");
}
async function readTextFile(file?: File): Promise<string | undefined> {
  if (!file) return;
  if (!/\.(txt|md)$/i.test(file.name))
    throw new Error(
      "Wybierz plik .txt albo .md. Plik zostanie odczytany jako zwykły tekst.",
    );
  if (file.size > 256 * 1024)
    throw new Error("Plik jest za duży. Wybierz fragment do 50 000 znaków.");
  const text = await file.text();
  if (text.length > 50_000)
    throw new Error(
      "Tekst przekracza limit 50 000 znaków. Wybierz krótszy fragment.",
    );
  return text;
}
async function downloadMarkdown(id: string, type: "documents" | "attempts") {
  const response = await fetch(`/api/${type}/${id}/markdown`, {
    credentials: "same-origin",
  });
  if (!response.ok)
    throw new Error("Nie udało się pobrać tekstu. Spróbuj ponownie.");
  const url = URL.createObjectURL(
    new Blob([await response.text()], { type: "text/markdown;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `obrazownik-${id}.md`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Pagination({
  total,
  offset,
  limit,
  busy,
  onPage,
}: {
  total: number;
  offset: number;
  limit: number;
  busy: boolean;
  onPage: (offset: number) => void;
}) {
  return (
    <nav className="notebook-pagination" aria-label="Strony zeszytu">
      <button
        className="secondary-button"
        disabled={busy || offset === 0}
        onClick={() => onPage(Math.max(0, offset - limit))}
      >
        ← Poprzednie
      </button>
      <span>
        {total
          ? `${offset + 1}–${Math.min(offset + limit, total)} z ${total}`
          : "Brak zapisanych tekstów"}
      </span>
      <button
        className="secondary-button"
        disabled={busy || offset + limit >= total}
        onClick={() => onPage(offset + limit)}
      >
        Następne →
      </button>
    </nav>
  );
}
interface Props {
  environmentId: string;
  onOpenAttempt: (id: string) => void | Promise<void>;
  onTransformDocument: (id: string) => void | Promise<void>;
  onEditingChange?: (active: boolean) => void;
}
export function Notebook({
  environmentId,
  onOpenAttempt,
  onTransformDocument,
  onEditingChange,
}: Props) {
  const [tab, setTab] = useState<"documents" | "attempts">("documents"),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const [family, setFamily] = useState(""),
    [mode, setMode] = useState(""),
    [help, setHelp] = useState(""),
    [offset, setOffset] = useState(0),
    [reload, setReload] = useState(0);
  const [documents, setDocuments] =
      useState<z.infer<typeof DocumentPageSchema>>(),
    [attempts, setAttempts] = useState<z.infer<typeof AttemptPageSchema>>();
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [editor, setEditor] = useState<DocumentDetail>(),
    [epoch, setEpoch] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [creating, setCreating] = useState(false),
    [pendingCreate, setPendingCreate] = useState(false);
  const createRequest = useRef<{
    title: string;
    text: string;
    clientRequestId: string;
  } | null>(null);
  const editing = !!editor || showCreate;
  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (title || text || pendingCreate) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [title, text, pendingCreate]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      query: search,
      limit: "20",
      offset: String(offset),
    });
    if (tab === "attempts") {
      if (family) params.set("family", family);
      if (mode) params.set("mode", mode);
      if (help) params.set("assistance", help);
    }
    api(`/${tab === "documents" ? "documents" : "notebook"}?${params}`)
      .then((value) => {
        if (!active) return;
        if (tab === "documents") setDocuments(DocumentPageSchema.parse(value));
        else setAttempts(AttemptPageSchema.parse(value));
        setError("");
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "Nie udało się otworzyć zeszytu.",
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [tab, search, family, mode, help, offset, reload]);
  function refresh() {
    setBusy(true);
    setReload((value) => value + 1);
  }
  function changeTab(next: typeof tab) {
    setTab(next);
    setOffset(0);
    setBusy(true);
  }
  async function openDocument(id: string) {
    setBusy(true);
    setError("");
    try {
      setEditor(DocumentDetailSchema.parse(await api(`/documents/${id}`)));
      setEpoch((value) => value + 1);
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
  async function importNew(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setCreating(true);
    setError("");
    try {
      const imported = await readTextFile(file);
      if (imported !== undefined) {
        setText(imported);
        if (!title)
          setTitle(file!.name.replace(/\.(txt|md)$/i, "").slice(0, 200));
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się odczytać pliku.",
      );
    } finally {
      setCreating(false);
    }
  }
  async function create() {
    setCreating(true);
    setError("");
    createRequest.current ??= {
      title,
      text,
      clientRequestId: crypto.randomUUID(),
    };
    setPendingCreate(true);
    try {
      const created = DocumentSchema.parse(
        await api("/documents", "POST", createRequest.current),
      );
      createRequest.current = null;
      setPendingCreate(false);
      setTitle("");
      setText("");
      setShowCreate(false);
      refresh();
      await openDocument(created.id);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się utworzyć tekstu.",
      );
    } finally {
      setCreating(false);
    }
  }
  function replaceEditor(value: DocumentDetail) {
    setEditor(value);
    setEpoch((previous) => previous + 1);
  }
  const createForm = (
    <section className="notebook-create">
      <button
        className="text-button"
        disabled={creating}
        onClick={() => {
          createRequest.current = null;
          setPendingCreate(false);
          setTitle("");
          setText("");
          setShowCreate(false);
          refresh();
        }}
      >
        ← Porzuć formularz i wróć do zeszytu
      </button>
      <h2>Nowa strona</h2>
      <p className="fine-print">
        Nadaj tytuł i otwórz stronę, na której kolejne słowa będą zapisywane
        automatycznie. Możesz też świadomie wybrać plik .txt lub .md; aplikacja
        nie przegląda Twoich folderów.
      </p>
      <label htmlFor="new-document-title">Tytuł</label>
      <input
        id="new-document-title"
        value={title}
        maxLength={200}
        disabled={creating || pendingCreate}
        onChange={(event) => setTitle(event.target.value)}
      />
      {text && (
        <details>
          <summary>Podgląd wybranego pliku</summary>
          <p className="preserve-text">{text}</p>
        </details>
      )}
      <div className="button-row">
        <button
          className="primary-button"
          disabled={creating}
          onClick={() => {
            void create();
          }}
        >
          {pendingCreate ? "Ponów tworzenie tekstu" : "Utwórz tekst"}
        </button>
        <label className="secondary-button notebook-file-label">
          Wczytaj .txt lub .md
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            disabled={creating || pendingCreate}
            onChange={(event) => {
              void importNew(event);
            }}
          />
        </label>
      </div>
    </section>
  );
  if (editor)
    return (
      <DocumentEditor
        key={`${editor.document.id}:${epoch}`}
        initial={editor}
        environmentId={environmentId}
        onClose={() => {
          setEditor(undefined);
          refresh();
        }}
        onReload={replaceEditor}
        onTransform={onTransformDocument}
      />
    );
  if (showCreate)
    return (
      <section className="notebook">
        {createForm}
        {error && (
          <div className="connection-error" role="alert">
            <p>{error}</p>
            <p className="fine-print">
              Pokazanie błędu nie usuwa wybranego pliku. Jeśli zapis dotarł do
              serwera, tekst pozostaje w zeszycie.
            </p>
          </div>
        )}
      </section>
    );
  const total =
    tab === "documents" ? (documents?.total ?? 0) : (attempts?.total ?? 0);
  return (
    <section className="notebook">
      <span className="eyebrow">PRYWATNA PRZESTRZEŃ NA TEKSTY</span>
      <h1>Twój zeszyt</h1>
      <p className="intro">
        Własne teksty i odpowiedzi z ćwiczeń. Możesz do nich wracać, bez ocen i
        porównań z innymi.
      </p>
      <div className="button-row" role="group" aria-label="Rodzaj tekstów">
        <button
          className="secondary-button"
          aria-pressed={tab === "documents"}
          onClick={() => changeTab("documents")}
        >
          Własne teksty
        </button>
        <button
          className="secondary-button"
          aria-pressed={tab === "attempts"}
          onClick={() => changeTab("attempts")}
        >
          Odpowiedzi z ćwiczeń
        </button>
      </div>
      <form
        className="notebook-search"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(query);
          setOffset(0);
          setBusy(true);
          setReload((value) => value + 1);
        }}
      >
        <label htmlFor="notebook-search">Szukaj w tytule i tekście</label>
        <div>
          <input
            id="notebook-search"
            type="search"
            maxLength={500}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="secondary-button" type="submit">
            Szukaj
          </button>
        </div>
      </form>
      {tab === "attempts" && (
        <div className="ratings-grid notebook-filters">
          <label>
            Rodzina ćwiczeń
            <select
              value={family}
              onChange={(event) => {
                setFamily(event.target.value);
                setOffset(0);
                setBusy(true);
              }}
            >
              <option value="">Wszystkie</option>
              {Object.entries(families).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rodzaj pracy
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value);
                setOffset(0);
                setBusy(true);
              }}
            >
              <option value="">Wszystkie</option>
              {Object.entries(modes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Użyta pomoc
            <select
              value={help}
              onChange={(event) => {
                setHelp(event.target.value);
                setOffset(0);
                setBusy(true);
              }}
            >
              <option value="">Wszystkie</option>
              <option value="none_confirmed">Bez pomocy w aplikacji</option>
              <option value="question">Z pytaniem</option>
              <option value="direction">Ze wskazówką</option>
              <option value="example">Po przykładzie</option>
              <option value="unknown">Historia nieznana lub niepewna</option>
            </select>
          </label>
        </div>
      )}
      {error && (
        <div className="connection-error" role="alert">
          <p>{error}</p>
          <button className="secondary-button" onClick={refresh}>
            Ponów odczyt
          </button>
        </div>
      )}
      {busy && (
        <p role="status" className="fine-print">
          Otwieranie zeszytu…
        </p>
      )}
      <div className="notebook-list" aria-busy={busy}>
        {tab === "documents"
          ? documents?.documents.map((item) => (
              <article key={item.id}>
                <h2>{item.title || "Bez tytułu"}</h2>
                <p className="notebook-excerpt">
                  {item.currentText.slice(0, 180) ||
                    "Miejsce na pierwsze słowa."}
                </p>
                <p className="fine-print">
                  Ostatni zapis: {date(item.updatedAt)}
                </p>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      void openDocument(item.id);
                    }}
                  >
                    Otwórz tekst
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      void downloadMarkdown(item.id, "documents").catch(
                        (failure) => setError(failure.message),
                      );
                    }}
                  >
                    Pobierz Markdown
                  </button>
                </div>
              </article>
            ))
          : attempts?.attempts.map((item) => (
              <article key={item.id}>
                <span className="eyebrow">{families[item.family]}</span>
                <h2>{item.promptSnapshot.title}</h2>
                <p className="notebook-excerpt">
                  {item.currentText.slice(0, 180) || "Jeszcze bez słów."}
                </p>
                <p className="fine-print">
                  {helpLabel(item.assistanceState, item.assistanceLevel)} ·{" "}
                  {item.status === "draft"
                    ? "szkic"
                    : item.status === "completed"
                      ? "zapisane"
                      : item.status === "skipped"
                        ? "pominięte"
                        : "przerwane"}
                </p>
                <div className="button-row">
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      void Promise.resolve(onOpenAttempt(item.id)).catch(
                        (failure) =>
                          setError(
                            failure instanceof Error
                              ? failure.message
                              : "Nie udało się otworzyć próby.",
                          ),
                      );
                    }}
                  >
                    Otwórz odpowiedź
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      void downloadMarkdown(item.id, "attempts").catch(
                        (failure) => setError(failure.message),
                      );
                    }}
                  >
                    Pobierz Markdown
                  </button>
                </div>
              </article>
            ))}
      </div>
      {!busy && total === 0 && (
        <p className="notebook-empty">
          {search || family || mode || help
            ? "Nie ma tekstów pasujących do wybranych filtrów."
            : "Zeszyt jest jeszcze pusty. Możesz zacząć od jednego zdania."}
        </p>
      )}
      <Pagination
        total={total}
        offset={offset}
        limit={20}
        busy={busy}
        onPage={(next) => {
          setOffset(next);
          setBusy(true);
        }}
      />
      {tab === "documents" && !showCreate && (
        <button className="primary-button" onClick={() => setShowCreate(true)}>
          Nowy tekst <span aria-hidden="true">＋</span>
        </button>
      )}
    </section>
  );
}

type ExtraAction = {
  kind: "rename" | "replace" | "version" | "recovery";
  path: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
};
function DocumentEditor({
  initial,
  environmentId,
  onClose,
  onReload,
  onTransform,
}: {
  initial: DocumentDetail;
  environmentId: string;
  onClose: () => void;
  onReload: (value: DocumentDetail) => void;
  onTransform: Props["onTransformDocument"];
}) {
  const [document, setDocument] = useState(initial.document),
    [title, setTitle] = useState(initial.document.title),
    [text, setText] = useState(initial.document.currentText),
    [versions, setVersions] = useState(initial.versions);
  const [status, setStatus] = useState<SaveStatus>("saved"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [bufferError, setBufferError] = useState(false),
    [checking, setChecking] = useState(true),
    [recovery, setRecovery] = useState<RecoveryDraft>(),
    [pendingKind, setPendingKind] = useState<ExtraAction["kind"] | null>(null),
    [serverText, setServerText] = useState<string>();
  const pending = useRef<ExtraAction | null>(null),
    titleRef = useRef(title),
    documentRef = useRef(document);
  const [queue] = useState(
    () =>
      new DraftQueue<DocumentRecord>({
        attempt: initial.document,
        environmentId,
        send: async (input) =>
          DocumentSchema.parse(
            await api(`/documents/${initial.document.id}`, "PATCH", {
              text: input.text,
              expectedRevision: input.expectedRevision,
              clientMutationId: input.clientMutationId,
            }),
          ),
        putRecovery,
        clearRecovery: (confirmed, fields) =>
          clearRecovery(environmentId, initial.document.id, confirmed, fields),
        onAck: setDocument,
        onStatus: (next, message) => {
          setStatus(next);
          if (message) setError(message);
          else if (next === "saved") setError("");
        },
        onBufferError: () => setBufferError(true),
      }),
  );
  useEffect(() => {
    let active = true;
    findRecovery(environmentId, initial.document.id)
      .then(async (value) => {
        if (!active) return;
        if (value && value.text !== initial.document.currentText)
          setRecovery(value);
        else if (value)
          await clearRecovery(
            environmentId,
            initial.document.id,
            value.text,
            {},
          );
      })
      .catch(() => {
        if (active) setBufferError(true);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    const warn = (event: BeforeUnloadEvent) => {
      if (
        queue.dirty ||
        pending.current ||
        titleRef.current !== documentRef.current.title
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      active = false;
      queue.dispose();
      window.removeEventListener("beforeunload", warn);
    };
  }, [environmentId, initial.document.id, initial.document.currentText, queue]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(recovery?.text ?? text);
      setError("Tekst skopiowany.");
    } catch {
      setError("Zaznacz tekst i skopiuj go skrótem ⌘C.");
    }
  }
  async function action(
    kind: ExtraAction["kind"],
    extra: Record<string, unknown> = {},
  ) {
    if (pending.current && pending.current.kind !== kind)
      throw new Error("Najpierw ponów poprzednią operację.");
    setBusy(true);
    setError("");
    try {
      await queue.flush();
      pending.current ??= {
        kind,
        path: `/documents/${document.id}${kind === "version" ? "/versions" : ""}`,
        method: kind === "version" ? "POST" : "PATCH",
        body: {
          expectedRevision: queue.currentRevision,
          clientMutationId: crypto.randomUUID(),
          ...(kind === "version" ? {} : { text, title }),
          ...extra,
        },
      };
      setPendingKind(kind);
      const value = await api(
        pending.current.path,
        pending.current.method,
        pending.current.body,
      );
      const detail =
        kind === "version"
          ? DocumentDetailSchema.parse(value)
          : { document: DocumentSchema.parse(value), versions };
      pending.current = null;
      setPendingKind(null);
      queue.acceptRevision(detail.document);
      setText(detail.document.currentText);
      setTitle(detail.document.title);
      titleRef.current = detail.document.title;
      documentRef.current = detail.document;
      setVersions(detail.versions);
      if (kind === "replace") {
        const updated = DocumentDetailSchema.parse(
          await api(`/documents/${document.id}`),
        );
        setVersions(updated.versions);
      }
      return detail.document;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się wykonać operacji.",
      );
      if (failure instanceof ApiError && failure.status === 409) {
        pending.current = null;
        setPendingKind(null);
        setStatus("conflict");
      }
      throw failure;
    } finally {
      setBusy(false);
    }
  }
  async function finish(next: () => void | Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await queue.flush();
      if (title !== document.title) await action("rename");
      await queue.settleRecovery();
      await next();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się zapisać tekstu.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function replaceFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    try {
      const imported = await readTextFile(file);
      if (imported !== undefined)
        await action("replace", { text: imported, replaceAll: true });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się wczytać tekstu.",
      );
    }
  }
  async function preserveSeparate() {
    const local = recovery?.text ?? text;
    setBusy(true);
    setError("");
    try {
      await queue.settleRecovery();
      if (!pending.current) {
        const latest = DocumentDetailSchema.parse(
          await api(`/documents/${document.id}`),
        );
        pending.current = {
          kind: "recovery",
          method: "POST",
          path: `/documents/${document.id}/versions`,
          body: {
            expectedRevision: latest.document.revision,
            clientMutationId: crypto.randomUUID(),
            text: local,
          },
        };
      }
      if (pending.current.kind !== "recovery")
        throw new Error("Najpierw ponów poprzednią operację.");
      setPendingKind("recovery");
      const detail = DocumentDetailSchema.parse(
        await api(
          pending.current.path,
          pending.current.method,
          pending.current.body,
        ),
      );
      pending.current = null;
      setPendingKind(null);
      await clearRecovery(environmentId, document.id, local, {});
      onReload(detail);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Nie udało się zachować wersji.",
      );
      if (failure instanceof ApiError && failure.status === 409) {
        pending.current = null;
        setPendingKind(null);
      }
    } finally {
      setBusy(false);
    }
  }
  async function showServer() {
    try {
      setServerText(
        DocumentDetailSchema.parse(await api(`/documents/${document.id}`))
          .document.currentText,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Brak połączenia.");
    }
  }
  const blocked =
    busy || checking || !!recovery || status === "conflict" || !!pendingKind;
  const labels = {
    saved: "Zapisano na Macu",
    dirty: "Oczekuje na zapis…",
    saving: "Zapisywanie…",
    error: "Nie udało się zapisać",
    conflict: "Wersje wymagają porównania",
  };
  return (
    <section className="notebook document-editor">
      <div className="editor-top">
        <button
          className="text-button"
          disabled={busy || checking || !!recovery || !!pendingKind}
          onClick={() => {
            void finish(onClose);
          }}
        >
          ← Zapisz i wróć do zeszytu
        </button>
        <span className="eyebrow">WŁASNY TEKST</span>
      </div>
      <h1>{document.title || "Bez tytułu"}</h1>
      <div className="notebook-title">
        <label htmlFor="document-title">Tytuł</label>
        <input
          id="document-title"
          maxLength={200}
          disabled={blocked}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            titleRef.current = event.target.value;
          }}
        />
        <button
          className="secondary-button"
          disabled={
            busy ||
            checking ||
            !!recovery ||
            status === "conflict" ||
            (!!pendingKind && pendingKind !== "rename") ||
            (!pendingKind && title === document.title)
          }
          onClick={() => {
            void action("rename").catch(() => {});
          }}
        >
          Zapisz tytuł
        </button>
      </div>
      {recovery && (
        <aside className="recovery-panel">
          <h2>Odnaleziono niezapisany tekst</h2>
          <p>
            {recovery.baseRevision === document.revision
              ? "Możesz przywrócić go do edytora lub zachować osobno."
              : "Bieżący tekst zmienił się. Zachowaj kopię jako osobną wersję, bez nadpisania nowszego tekstu."}
          </p>
          <details>
            <summary>Pokaż kopię ratunkową</summary>
            <p className="preserve-text">{recovery.text}</p>
          </details>
          <div className="button-row">
            {recovery.baseRevision === document.revision && (
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
                void preserveSeparate();
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
        <label htmlFor="document-text">Twój tekst</label>
        <span
          className="save-status"
          aria-live={
            status === "error" || status === "conflict" ? "polite" : "off"
          }
        >
          {labels[status]}
        </span>
      </div>
      <textarea
        id="document-text"
        className="writing-field"
        value={text}
        maxLength={50_000}
        disabled={blocked}
        onChange={(event) => {
          setText(event.target.value);
          queue.setText(event.target.value);
        }}
      />
      <p className="fine-print">
        {text.length.toLocaleString("pl-PL")} / 50 000 znaków. Treść pozostaje
        na Twoim komputerze.
      </p>
      {bufferError && (
        <p className="connection-error">
          Bufor ratunkowy jest niedostępny lub pełny. Skopiuj niepotwierdzone
          zmiany przed zamknięciem.
        </p>
      )}
      {error && (
        <div className="connection-error" role="alert">
          <p>{error}</p>
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
                onClick={() => {
                  void queue.flush().catch(() => {});
                }}
              >
                Ponów zapis
              </button>
            )}
            {pendingKind && pendingKind !== "recovery" && (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  void action(pendingKind).catch(() => {});
                }}
              >
                Ponów ostatnią operację
              </button>
            )}
            {(status === "conflict" || pendingKind === "recovery") && (
              <>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    void preserveSeparate();
                  }}
                >
                  Zachowaj mój tekst jako osobną wersję
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    void showServer();
                  }}
                >
                  Pokaż tekst na Macu
                </button>
              </>
            )}
          </div>
          {serverText !== undefined && (
            <details open>
              <summary>Aktualny tekst na Macu</summary>
              <p className="preserve-text">{serverText || "Brak słów."}</p>
            </details>
          )}
        </div>
      )}
      <div className="button-row">
        <button
          className="secondary-button"
          disabled={
            busy ||
            checking ||
            !!recovery ||
            status === "conflict" ||
            (!!pendingKind && pendingKind !== "version")
          }
          onClick={() => {
            void action("version").catch(() => {});
          }}
        >
          Zachowaj wersję
        </button>
        <button
          className="secondary-button"
          disabled={blocked}
          onClick={() => {
            void finish(() => downloadMarkdown(document.id, "documents"));
          }}
        >
          Pobierz Markdown
        </button>
        <button
          className="secondary-button"
          disabled={blocked}
          onClick={() => {
            void finish(() => onTransform(document.id));
          }}
        >
          Przekształć w ćwiczeniu
        </button>
        <label
          className={`secondary-button notebook-file-label${blocked ? " notebook-disabled" : ""}`}
        >
          Zastąp tekst plikiem
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            disabled={blocked}
            onChange={(event) => {
              void replaceFile(event);
            }}
          />
        </label>
      </div>
      <details className="versions">
        <summary>Zachowane wersje ({versions.length})</summary>
        <p className="fine-print">
          Zastąpienie tekstu plikiem zachowuje poprzednią treść. Wersje można
          porównać bez zmieniania oryginału.
        </p>
        {versions.map((version) => (
          <article key={version.id}>
            <h3>
              {version.reason === "pre_replace"
                ? "Przed zastąpieniem całości"
                : "Zachowana osobna wersja"}
            </h3>
            <p className="fine-print">{date(version.createdAt)}</p>
            <p className="preserve-text">
              {version.text || "Jeszcze bez słów."}
            </p>
          </article>
        ))}
      </details>
      {versions.length > 0 && (
        <details className="versions">
          <summary>Porównaj z poprzednią wersją</summary>
          <VersionComparison current={text} versions={versions} />
        </details>
      )}
    </section>
  );
}
function VersionComparison({
  current,
  versions,
}: {
  current: string;
  versions: DocumentDetail["versions"];
}) {
  const [selected, setSelected] = useState(versions[0].id),
    [hidden, setHidden] = useState(true),
    [reverse, setReverse] = useState(false);
  const version =
    versions.find((value) => value.id === selected) ?? versions[0];
  const samples = reverse ? [version.text, current] : [current, version.text];
  return (
    <div className="notebook-comparison">
      <label>
        Wersja do porównania
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {versions.map((item, index) => (
            <option value={item.id} key={item.id}>
              {hidden ? `Wersja ${index + 1}` : date(item.createdAt)}
            </option>
          ))}
        </select>
      </label>
      <div className="button-row">
        <label>
          <input
            type="checkbox"
            checked={hidden}
            onChange={(event) => setHidden(event.target.checked)}
          />{" "}
          Ukryj daty i pochodzenie stron
        </label>
        <button
          className="secondary-button"
          onClick={() =>
            setReverse(crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0)
          }
        >
          Losuj kolejność
        </button>
      </div>
      <div className="notebook-comparison-grid">
        {samples.map((sample, index) => (
          <article key={index}>
            <h3>
              {hidden
                ? `Tekst ${index + 1}`
                : (reverse ? index === 0 : index === 1)
                  ? `Wersja z ${date(version.createdAt)}`
                  : "Bieżący tekst"}
            </h3>
            <p className="preserve-text">{sample || "Jeszcze bez słów."}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
