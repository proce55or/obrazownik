import { useState } from "react";
import {
  listUnknownRecovery,
  removeUnknownRecovery,
  type UnknownRecoveryCopy,
} from "./recovery";

export function RecoveryUnknownCopies() {
  const [copies, setCopies] = useState<UnknownRecoveryCopy[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState<string[]>([]);
  async function load() {
    setBusy(true);
    try {
      setCopies(await listUnknownRecovery());
      setLoaded(true);
      setMessage("");
    } catch {
      setMessage("Nie udało się odczytać kopii. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }
  function download(copy: UnknownRecoveryCopy, index: number) {
    if (copy.json === undefined) return;
    const url = URL.createObjectURL(
      new Blob([copy.json], { type: "application/json;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `obrazownik-nieznana-kopia-${index + 1}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded((old) => [...old, copy.json!]);
  }
  async function remove(copy: UnknownRecoveryCopy) {
    if (
      !copy.json ||
      !downloaded.includes(copy.json) ||
      !reviewed.includes(copy.json)
    )
      return;
    setBusy(true);
    try {
      await removeUnknownRecovery(copy);
      setCopies(await listUnknownRecovery());
      setMessage("Usunięto wybraną kopię w nieznanym formacie.");
    } catch {
      setMessage(
        "Kopia mogła się zmienić. Odczytaj listę ponownie; nowsza treść pozostaje w przeglądarce.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Kopie w nieznanym formacie</summary>
      <p>
        Te wpisy również zajmują miejsce w buforze. Aplikacja nie usuwa ich
        sama. Najpierw pobierz pełną kopię JSON i sprawdź plik. Dopiero wtedy
        możesz usunąć wskazany wpis.
      </p>
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => {
          void load();
        }}
      >
        Odczytaj kopie w nieznanym formacie
      </button>
      {loaded && copies.length === 0 && <p>Brak kopii w nieznanym formacie.</p>}
      {copies.map((copy, index) => (
        <details key={copy.json ?? `unsupported-${index}`}>
          <summary>Nieznana kopia {index + 1}</summary>
          {copy.json === undefined ? (
            <p>
              Ten wpis zawiera dane, których JSON nie zachowa w całości, na
              przykład datę, dane binarne lub odwołanie do samego siebie.
              Pozostaje w przeglądarce; pobranie i usunięcie są zablokowane, aby
              niczego nie utracić.
            </p>
          ) : (
            <>
              <pre className="preserve-text">{copy.json}</pre>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => download(copy, index)}
              >
                Pobierz surową kopię JSON
              </button>
              <label>
                <input
                  type="checkbox"
                  disabled={busy || !downloaded.includes(copy.json)}
                  checked={reviewed.includes(copy.json)}
                  onChange={(event) => {
                    setReviewed((old) =>
                      event.target.checked
                        ? [...old, copy.json!]
                        : old.filter((value) => value !== copy.json),
                    );
                  }}
                />{" "}
                Sprawdziłem pobrany plik i chcę usunąć ten wpis z przeglądarki
              </label>
              <button
                className="text-button"
                disabled={
                  busy ||
                  !downloaded.includes(copy.json) ||
                  !reviewed.includes(copy.json)
                }
                onClick={() => {
                  void remove(copy);
                }}
              >
                Usuń tę nieznaną kopię
              </button>
            </>
          )}
        </details>
      ))}
      <p role="status">{message}</p>
    </details>
  );
}
