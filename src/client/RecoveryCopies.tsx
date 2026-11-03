import { useState } from "react";
import { listRecovery, removeRecovery } from "./recovery";
import { RecoveryUnknownCopies } from "./RecoveryUnknownCopies";

type Copy = Awaited<ReturnType<typeof listRecovery>>[number];
export function RecoveryCopies({ environmentId }: { environmentId: string }) {
  const [copies, setCopies] = useState<Copy[]>([]);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<string[]>([]);
  const identity = (copy: Copy) => `${copy.key}:${copy.updatedAt}`;
  async function load() {
    setBusy(true);
    try {
      setCopies(await listRecovery());
      setLoaded(true);
      setMessage("");
    } catch {
      setMessage(
        "Nie udało się odczytać kopii w tej przeglądarce. Spróbuj ponownie.",
      );
    } finally {
      setBusy(false);
    }
  }
  function download(copy: Copy) {
    const text = [
      copy.title ?? "Kopia ratunkowa",
      copy.text,
      ...Object.values(copy.scaffolding ?? {}),
    ].join("\n\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `obrazownik-kopia-${copy.id}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported((old) => [...old, identity(copy)]);
  }
  async function remove(copy: Copy) {
    setBusy(true);
    try {
      await removeRecovery(copy);
      setCopies(await listRecovery());
      setMessage("Usunięto wybraną kopię z przeglądarki.");
    } catch {
      setMessage(
        "Kopia mogła zmienić się w innej karcie. Odczytaj listę ponownie.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="recovery-copies">
      <summary>Kopie ratunkowe w tej przeglądarce</summary>
      <p>
        Tu znajdziesz również teksty pozostawione po pracy w innej karcie. Przed
        usunięciem kopii zapisz ją do pliku i sprawdź pobrany tekst. Usunięcie
        zwalnia miejsce w buforze przeglądarki.
      </p>
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => {
          void load();
        }}
      >
        Odczytaj kopie
      </button>
      {loaded && copies.length === 0 && <p>Brak kopii w znanym formacie.</p>}
      {copies.map((copy) => (
        <details key={copy.key}>
          <summary>
            {copy.title || "Pozostawiony tekst"} ·{" "}
            {new Date(copy.updatedAt).toLocaleString("pl-PL")}
          </summary>
          {copy.environmentId !== environmentId && (
            <p>Kopia z wcześniejszej instalacji aplikacji.</p>
          )}
          <pre className="preserve-text">
            {[copy.text, ...Object.values(copy.scaffolding ?? {})].join(
              "\n\n",
            ) || "Pusty tekst"}
          </pre>
          <div className="button-row">
            <button className="secondary-button" onClick={() => download(copy)}>
              Zapisz kopię do pliku
            </button>
            <button
              className="text-button"
              disabled={busy || !exported.includes(identity(copy))}
              onClick={() => {
                void remove(copy);
              }}
            >
              Usuń tę kopię z przeglądarki
            </button>
          </div>
        </details>
      ))}
      <p role="status">{message}</p>
      <RecoveryUnknownCopies />
    </details>
  );
}
