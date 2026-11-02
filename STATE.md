# Stan projektu
Updated: 2026-11-02
Active task: T10
Status: TODO — oczekiwanie na obserwacje; MVP gotowe lokalnie
Environment: macOS 13.7.8 Intel, Node 24.21.0
Branch: main
Remote: proce55or/obrazownik (private, zweryfikowane API)

## Działa
- Pełny lokalny MVP: pięć rodzin, 60 bazowych +6 opcjonalnych +5 near
  +20 chronionych tematów, trzy archiwalne wersje E1, dziewięć metod.
- SCI-00–05: źródła i ograniczenia metod, własne polskie pola E1/E3,
  pre_hint/final, osobna wersja wspomagana, zachowany oryginał E5.
- Sesje, powroty2/7/21, trwały zeszyt, wersje, porównanie i obserwacje,
  kopie, JSON export/import, restore i launcher. Brak LLM/telemetrii.
- Produkcja4317 działa z schema2, dane ~/Obrazownik-dane. Sprawdzona
  kopia schema1 przed migracją; odciski tekstów/dat/wersji zgodne po niej.

## Weryfikacja
- npm run check: 94 testy/19 plików PASS; walidator91+3 PASS,
  TypeScript/lint/context/repo-check PASS. Build i pełne E2E PASS.
- E2E: autosave/restart/recovery/konflikt/pomoc/pola, nowe pisanie,
  zeszyt→E5, pięć rodzin po2 karty, opcjonalne metody, ustawienia,
  kopia, JSON/importx2, porównanie, sesja i kopia dnia: PASS.
- 320/390px, CSS zoom200%, fokus klawiatury: PASS. Kontrast opisów
  poprawiony i sprawdzony. Dodatkowo zapis bez IndexedDB i sieci zewnętrznej PASS.
- Restore/migracje/import i 10k rekordów zeszytu: testy tmpdir PASS.
  npm audit i audit --omit=dev: 0 podatności.
- Szczegóły: docs/11-release-verification.md; instrukcja README.md.

## Pozostało świadomie
- Rzeczywiste Safari/powiększenie przeglądarki i dwuklik Findera:
  VERIFY_ON_MAC, automatyzacja Safari niedostępna. Chromium na Macu działa.
- T10: pilotaż przygotowany w docs/12-pilot.md, czeka na obserwacje autora.
  Nie udowodniono skuteczności klinicznej. Nie wymyślać wyników pilotażu.

## Zasoby i wznowienie
Użytkownik nakazał pozostawić co najmniej20% limitu: sprawdzaj licznik
Codex, zatrzymuj pracę z zapasem przed80% zużycia; limit wspólny dla konta.
Ostatni odczyt54%. Nie kontynuuj tylko po to, aby zużywać limit.
Po zgłoszeniu problemu: git status, właściwa karta i dowód; nie cofaj T00.
Testy mają własny port4318 i tmpdir. Nigdy nie resetuj produkcyjnej bazy.
