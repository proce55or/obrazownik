# Lokalny Bielik — stan i granice integracji

T17 dodaje opcjonalny model po ukończeniu MVP. Instrukcja użytkownika:
[13-bielik-krok-po-kroku.md](13-bielik-krok-po-kroku.md).
Pomiary: [14-bielik-benchmark.md](14-bielik-benchmark.md).
Aktualne zadanie i limit: [STATE.md](../STATE.md).

## Kontrakt

- Domyślny tryb to `off`. Ustawienia dotyczą nowych prób; każda próba
  zachowuje swój wybór. Samodzielna próba zawsze blokuje model po stronie API.
- `LocalHintService` łączy się tylko z127.0.0.1:4320, bez kluczy, chmury,
  narzędzi i przekierowań. Przed generowaniem sprawdza model i ścieżkę wag.
- Model dostaje bodziec i cel pytania dla rodziny. Bieżący tekst, pola pomocnicze
  i dokument źródłowy autora nie trafiają do modelu. Własne dokumenty mają
  ogólny opis. To pomoc w postaci pytania, nie analiza napisanego tekstu.
- Generacja:80tokenów, timeout180s, jeden aktywny job, maksymalnie4 w kolejce.
  Niepełny lub niepoprawny format daje błąd i pozostawia gotowe podpowiedzi.
  Kontrola formatu nie gwarantuje neutralności ani jakości językowej.
- Bufor ma klucz zależny od SHA256 modelu, wersji promptu i materiału.
  Pamięć128 wpisów; trwałe pliki w `dataDir/llm-cache`. Prefetch zwraca tylko
  stan, nie tekst pytania, i nie zmienia próby ani historii pomocy.
- Jawne pokazanie: serializacja zapisu, CAS, `pre_hint`, event i nowa rewizja
  w transakcji. Potwierdzenie po renderowaniu; niepotwierdzony odbiór jest
  niepewny. Replay działa także przy niedostępnym modelu.
- `provider` oddziela curated/bielik_local/unknown. Metadane zawierają model,
  hash, promptVersion, czas i cacheHit. CacheHit obejmuje ponowne użycie
  w innej próbie oraz odczyt po restarcie. Ustawiony tryb i faktycznie pokazana
  pomoc to osobne informacje w zeszycie i obserwacjach.
- Migracja schema2→3 wykonuje sprawdzoną kopię. Stare rekordy mają unknown,
  nie udajemy znanej historii. Eksport schema3; import zgodny z2/3.
  Metadane modelu zachowuje JSON i kopia Markdown.

## Uruchomienie i testy

Wagi i runtime są poza repo: `~/Obrazownik-modele`. Nie pobierać ponownie.
Przypięta instalacja jest opisana w manifest.json i dokumencie pomiarowym.
Launcher przy nowym starcie sprawdza hash, przy istniejącym procesie ścieżkę,
wersję runtime, slot i alias. Nie zatrzymuje procesu znalezionego na porcie.

`npm run check` obejmuje101 testów, walidację treści i granic Git.
`OBRAZOWNIK_TEST_LLM=1 npm run test:e2e` wykonuje pełne E2E na własnych
syntetycznych danych, w tym bufor, jawne pokazanie, tryb off i blokadę próby
samodzielnej. Dodatkowy scenariusz potwierdza autosave podczas preparing
oraz zapis nowszej wersji przed pokazaniem pytania. Bez flagi testy nie wymagają
modelu. Nigdy nie używaj do testów produkcyjnego `~/Obrazownik-dane`.

T18 jest ograniczoną kontrolą po bezczynności na życzenie użytkownika,
nie stałą pętlą optymalizacji. Po jej zakończeniu harmonogram ma się wyłączyć.
