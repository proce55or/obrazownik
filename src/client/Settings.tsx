import { useEffect, useState } from "react";
import { z } from "zod";
import {
  SettingsSchema,
  type Bootstrap,
  type Settings as SettingsValue,
} from "../shared/schemas";
import { api, responseData, userMessage } from "./api";
import { ModelConnection } from "./LocalModel";
import { RecoveryCopies } from "./RecoveryCopies";

function download(name: string, value: unknown) {
  const href = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

const PreviewSchema = z.object({
  digest: z.string(),
  attempts: z.number(),
  documents: z.number(),
  versions: z.number(),
  exposures: z.number(),
  assistanceEvents: z.number(),
  identical: z.number(),
  conflicts: z.number(),
  remapped: z.number(),
});
const BackupsSchema = z.object({
  backups: z.array(
    z.object({ name: z.string(), size: z.number(), createdAt: z.string() }),
  ),
});
const timezones = [
  { id: "Europe/Warsaw", label: "Warszawa (Polska)" },
  { id: "Europe/London", label: "Londyn (Wielka Brytania)" },
  { id: "Europe/Berlin", label: "Berlin (Niemcy)" },
  { id: "Europe/Vilnius", label: "Wilno (Litwa)" },
  { id: "Europe/Kyiv", label: "Kijów (Ukraina)" },
  { id: "America/New_York", label: "Nowy Jork (USA)" },
  { id: "America/Los_Angeles", label: "Los Angeles (USA)" },
  { id: "America/Toronto", label: "Toronto (Kanada)" },
  { id: "UTC", label: "Czas uniwersalny (UTC)" },
];
const optionalMethods = [
  { id: "M2", label: "Jedno słowo, kilka dróg" },
  { id: "M3", label: "Pojęcie w sytuacji" },
  { id: "M5", label: "Wspólna cecha i metafora" },
] as const;

function timezoneLabel(id: string) {
  return (
    timezones.find((zone) => zone.id === id)?.label ??
    id.split("/").at(-1)?.replaceAll("_", " ") ??
    id
  );
}

export function Settings({
  boot,
  onSaved,
}: {
  boot: Bootstrap;
  onSaved: (settings: SettingsValue) => void;
}) {
  const [value, setValue] = useState(boot.settings);
  const [offsets, setOffsets] = useState(
    boot.settings.repeatOffsetsDays.join(", "),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">(
    "success",
  );
  const [backups, setBackups] = useState<
    z.infer<typeof BackupsSchema>["backups"]
  >([]);
  const [bundle, setBundle] = useState<unknown>();
  const [preview, setPreview] = useState<z.infer<typeof PreviewSchema>>();
  const computerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const savedCustomTimezone =
    value.timezone !== computerTimezone &&
    !timezones.some((zone) => zone.id === value.timezone);

  function report(text: string, kind: "success" | "error") {
    setMessage(text);
    setMessageKind(kind);
  }

  async function loadBackups() {
    const result = responseData(BackupsSchema, await api("/backups"));
    setBackups(result.backups);
  }

  useEffect(() => {
    let active = true;
    api("/backups")
      .then((result) => {
        if (active) setBackups(responseData(BackupsSchema, result).backups);
      })
      .catch((error: unknown) => {
        if (active)
          report(userMessage(error, "Nie udało się odczytać kopii."), "error");
      });
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    setBusy(true);
    setMessage("");
    const days = offsets.split(",").map((item) => Number(item.trim()));
    const input = SettingsSchema.safeParse({
      ...value,
      repeatOffsetsDays: days,
    });
    if (!input.success) {
      report(
        "Sprawdź dni powrotów: wpisz różne liczby od 1 do 365, najwyżej sześć, oddzielone przecinkami.",
        "error",
      );
      setBusy(false);
      return;
    }
    try {
      const saved = responseData(
        SettingsSchema,
        await api("/settings", "PATCH", input.data),
      );
      setValue(saved);
      onSaved(saved);
      report("Ustawienia zapisane.", "success");
    } catch (error) {
      report(userMessage(error, "Nie udało się zapisać ustawień."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function backup() {
    setBusy(true);
    setMessage("");
    try {
      await api<{ filename: string }>("/backup", "POST", {});
      await loadBackups();
      report(
        "Kopia została utworzona i sprawdzona. Znajdziesz ją na liście kopii.",
        "success",
      );
    } catch (error) {
      report(userMessage(error, "Nie udało się utworzyć kopii."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/export");
      download(
        `obrazownik-${new Date().toISOString().slice(0, 10)}.json`,
        result,
      );
      report(
        "Eksport przygotowany. Zapisz plik w wybranym miejscu.",
        "success",
      );
    } catch (error) {
      report(
        userMessage(error, "Nie udało się przygotować eksportu."),
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function previewFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    setPreview(undefined);
    setBundle(undefined);
    try {
      if (file.size > 25 * 1024 * 1024)
        throw new Error("Plik jest za duży. Wybierz plik do 25 MB.");
      const data: unknown = JSON.parse(await file.text());
      const result = responseData(
        PreviewSchema,
        await api("/import/preview", "POST", data),
      );
      setBundle(data);
      setPreview(result);
    } catch (error) {
      report(
        error instanceof SyntaxError
          ? "Nie udało się odczytać pliku. Wybierz plik JSON wyeksportowany z Obrazownika."
          : userMessage(error, "Nie udało się sprawdzić pliku."),
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview || !bundle) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ recordCount: number; duplicate: boolean }>(
        "/import/confirm",
        "POST",
        { bundle, digest: preview.digest },
      );
      setPreview(undefined);
      setBundle(undefined);
      await loadBackups();
      report(
        result.duplicate
          ? "Ten plik został już dodany. Nie utworzono duplikatów."
          : "Dane z pliku zostały dodane. Twoje ustawienia pozostały bez zmian.",
        "success",
      );
    } catch (error) {
      report(
        userMessage(error, "Nie udało się dodać danych z pliku."),
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings">
      <p className="small-heading">Ustawienia i kopie</p>
      <h1>Twoja przestrzeń.</h1>
      <section className="prompt-card">
        <h2>Czytelność i własny rytm</h2>
        <div className="ratings-grid">
          <label>
            Wielkość tekstu w całej aplikacji
            <select
              value={
                typeof value.fontSize === "number"
                  ? value.fontSize
                  : value.fontSize === "large"
                    ? 24
                    : 18
              }
              onChange={(event) =>
                setValue((old) => ({
                  ...old,
                  fontSize: Number(event.target.value),
                }))
              }
            >
              {Array.from({ length: 11 }, (_, index) => index + 16).map(
                (size) => (
                  <option value={size} key={size}>
                    {size} px
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Strefa czasowa
            <select
              value={value.timezone}
              aria-describedby="timezone-help"
              onChange={(event) =>
                setValue((old) => ({ ...old, timezone: event.target.value }))
              }
            >
              <option value={computerTimezone}>
                Czas tego komputera ({timezoneLabel(computerTimezone)})
              </option>
              {timezones
                .filter((zone) => zone.id !== computerTimezone)
                .map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.label}
                  </option>
                ))}
              {savedCustomTimezone && (
                <option value={value.timezone}>
                  Zapisana strefa: {timezoneLabel(value.timezone)}
                </option>
              )}
            </select>
          </label>
        </div>
        <p id="timezone-help" className="fine-print">
          Możesz wybrać aktualny czas komputera albo swoje miejsce pobytu.
          Zapisujemy wybraną strefę; po podróży możesz ją zmienić tutaj.
        </p>
        <label className="choice">
          <input
            type="checkbox"
            checked={value.repeatEnabled}
            onChange={(event) =>
              setValue((old) => ({
                ...old,
                repeatEnabled: event.target.checked,
              }))
            }
          />
          Proponuj powroty do ćwiczeń
        </label>
        <details>
          <summary>Dostosuj dni powrotów</summary>
          <label>
            Ile dni po zapisaniu ćwiczenia proponować powrót?
            <input
              value={offsets}
              onChange={(event) => setOffsets(event.target.value)}
              aria-describedby="review-help"
            />
          </label>
          <p id="review-help" className="fine-print">
            Domyślnie po 2, 7 i 21 dniach. Wpisz liczby oddzielone przecinkami.
            Powroty są propozycją. Nie ma zaległości.
          </p>
        </details>
        <details>
          <summary>Dodatkowe rodzaje ćwiczeń</summary>
          <fieldset>
            <legend>Włącz wybrane ćwiczenia</legend>
            {optionalMethods.map((method) => (
              <label className="choice" key={method.id}>
                <input
                  type="checkbox"
                  checked={value.optionalMethods.includes(method.id)}
                  onChange={(event) =>
                    setValue((old) => ({
                      ...old,
                      optionalMethods: event.target.checked
                        ? [...old.optionalMethods, method.id]
                        : old.optionalMethods.filter((id) => id !== method.id),
                    }))
                  }
                />
                {method.label}
              </label>
            ))}
          </fieldset>
        </details>
        <fieldset>
          <legend>Dodatkowa pomoc</legend>
          <label>
            Pomoc w nowych ćwiczeniach
            <select
              value={value.llmMode}
              onChange={(event) =>
                setValue((old) => ({
                  ...old,
                  llmMode: event.target.value as SettingsValue["llmMode"],
                }))
              }
            >
              <option value="off">Gotowe podpowiedzi aplikacji</option>
              <option value="bielik">Bielik - pomoc na tym komputerze</option>
            </select>
          </label>
          <p className="fine-print">
            Wybór dotyczy nowych ćwiczeń. Otwarte ćwiczenia zachowują
            wcześniejszy wybór. Pytanie może być nietrafne. Tekst piszesz
            samodzielnie.
          </p>
          <details>
            <summary>Przygotowywanie dodatkowego pytania</summary>
            <label className="choice">
              <input
                type="checkbox"
                checked={value.llmPrefetch}
                onChange={(event) =>
                  setValue((old) => ({
                    ...old,
                    llmPrefetch: event.target.checked,
                  }))
                }
              />
              Przygotuj pytanie w tle po otwarciu ćwiczenia
            </label>
            <p className="fine-print">
              Pytanie pozostaje ukryte, dopóki nie zechcesz go zobaczyć.
            </p>
          </details>
          <ModelConnection />
        </fieldset>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => {
            void save();
          }}
        >
          Zapisz ustawienia
        </button>
      </section>

      <section className="versions">
        <h2>Dane i sprawdzone kopie</h2>
        <p>Twoje teksty pozostają na tym komputerze.</p>
        <div className="button-row">
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => {
              void backup();
            }}
          >
            Utwórz i sprawdź kopię
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              void exportData();
            }}
          >
            Eksportuj wszystkie dane JSON
          </button>
        </div>
        <p className="fine-print">
          Kopię zapisaną na tym samym dysku możesz stracić razem z komputerem.
          Zachowaj też eksport w innym miejscu. Plik eksportu nie jest
          zaszyfrowany.
        </p>
        <details>
          <summary>Lista kopii ({backups.length})</summary>
          {backups.map((backup) => (
            <p className="backup-row" key={backup.name}>
              <span>{backup.name}</span>
              <span>
                {(backup.size / 1024).toFixed(1)} KB ·{" "}
                {new Date(backup.createdAt).toLocaleString("pl")}
              </span>
            </p>
          ))}
          {backups.length === 0 && <p>Nie ma jeszcze zapisanych kopii.</p>}
        </details>
        <details>
          <summary>Miejsce zapisu i przywracanie kopii</summary>
          <p>Folder z Twoimi tekstami:</p>
          <p className="data-path">{boot.dataDir}</p>
          <p>Zmieniaj folder przy zatrzymanej aplikacji.</p>
          <p>
            Kopia automatyczna powstaje po pierwszej zakończonej sesji dnia oraz
            przed importem i zmianą formatu danych. Zachowujemy kopie z
            ostatnich 14 dni. Kopie ręczne i sprzed zmian pozostają.
          </p>
          <details>
            <summary>Techniczne kroki pełnego przywracania</summary>
            <p>
              Zatrzymaj aplikację i użyj polecenia{" "}
              <code>npm run restore -- /ścieżka/do/kopii.sqlite</code>. Dokładne
              kroki są w instrukcji projektu.
            </p>
          </details>
        </details>
        <RecoveryCopies environmentId={boot.environmentId} />
      </section>

      <section className="versions">
        <h2>Dodaj dane z eksportu</h2>
        <label>
          Plik Obrazownika JSON (do 25 MB)
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void previewFile(file);
            }}
          />
        </label>
        <p className="fine-print">
          Najpierw sprawdzimy plik i pokażemy podgląd. Po Twoim potwierdzeniu
          utworzymy kopię i dodamy dane. Różne wersje tekstu zachowamy osobno.
          Twoje ustawienia pozostaną bez zmian.
        </p>
        {preview && (
          <div className="prompt-card">
            <h3>Podgląd importu</h3>
            <p>
              Ćwiczenia: {preview.attempts}; własne teksty: {preview.documents}.
            </p>
            <p>
              Identyczne wpisy: {preview.identical}. Różne wersje:{" "}
              {preview.conflicts}.
            </p>
            <details>
              <summary>Szczegóły pliku</summary>
              <p>
                Wersje ćwiczeń: {preview.versions}; zapisy pomocy:{" "}
                {preview.assistanceEvents}; zapisy pokazania materiału:{" "}
                {preview.exposures}; zmieniane identyfikatory:{" "}
                {preview.remapped}.
              </p>
            </details>
            <div className="button-row">
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => {
                  void confirm();
                }}
              >
                Utwórz kopię i scal dane
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setPreview(undefined);
                  setBundle(undefined);
                }}
              >
                Anuluj import
              </button>
            </div>
          </div>
        )}
      </section>
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
