# Stan projektu
Updated: 2026-11-02
Active task: T15
Status: IN_PROGRESS
Environment: lokalny macOS 13.7.8, Intel, Node 24.21.0
Branch: main
Last verified code commit: checkpoint SCI-02/03 i integracji MVP
Remote: proce55or/obrazownik (private, zweryfikowane API)

## Działa
- SCI-00/01: migracja2, unknown starszej historii, pochodzenie, ekspozycje,
  eksport/import z remapem i sprawdzone kopie; teksty zachowane.
- SCI-02/03: E1/E3 z własnymi polami, pre_hint/final; chronione nowe pisanie,
  atomowe rezerwacje, osobna wersja do pomocy z zachowanym oryginałem.
- Kod pełnego MVP: 5 rodzin, 60 bazowych +6 opcjonalnych +5 near +20 rezerwy,
  3 archiwalne wersje E1, sesje, 2/7/21, zeszyt, dokumenty i obserwacje.
- Narzędzia restore, repo-check i launcher przygotowane przez weryfikatora.
- Brak LLM/API zewnętrznego w ćwiczeniach, dane poza repo.

## Weryfikacja
- npm run check: 94 testy PASS, walidator 91 aktywnych/3 archiwalne PASS,
  context i repo-check PASS. Build PASS.
- E2E: autosave/pomoc/final/restart/recovery/2karty PASS;
  polskie pola E3, źródła i nowe pisanie→osobna pomoc PASS.
- Testy kopii współbieżnych, rzeczywistego restore, migracji, importu i10k
  wpisów zeszytu: PASS; dane wyłącznie tymczasowe.

## Następny krok
Dokończ pełny przeglądarkowy odbiór zeszytu→E5, sesji, kopii/importu,
obserwacji i opcjonalnych metod. Zaktualizuj README/pilotaż. Po testach
przełącz produkcję i wypchnij kolejny sprawdzony commit.

## Ograniczenia
- Produkcja4317 nadal uruchamia poprzedni proces; nie przepinano bazy w toku testów.
- Testy4318, staging QA4319: osobne tmpdir, bez tekstów użytkownika.
- Safari bez rzeczywistego odbioru; pilotaż użytkowy wymaga późniejszych obserwacji.
- Jeden agent QA przerwał turn: Selected model is at capacity. Root kontynuuje.

## Wznowienie
Czytaj tasks/T15.md, git status. npm run check; npm run test:e2e (port4318).
Nie uruchamiaj drugiego procesu na produkcyjnej bazie. Nie cofaj T00.
