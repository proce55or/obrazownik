# Stan projektu
Updated: 2026-11-02
Active task: T03
Status: IN_PROGRESS
Environment: lokalny macOS 13.7.8, Intel x86_64, Safari 18.6
Branch: main
Last verified code commit: T02 — commit zawierający ten stan

## Działa
- T00–T02: lokalny React/Node/SQLite, Host/Origin/CSRF, CSP, bez CDN.
- API: bootstrap, ustawienia, lista kart, tworzenie/odczyt/zapis prób.
- CAS revision i idempotentne żądania, walidacja Zod, zachowanie Unicode.
- Migracja 1: wszystkie encje MVP, WAL/foreign_keys, transakcje i blokada
  katalogu. Kopia przed kolejnymi migracjami; odmowa nowszej/uszkodzonej bazy.
- Kod w Obrazownik_plan; dane poza repo. UI jeszcze nie zapisuje tekstu.

## Ostatnia weryfikacja
- npm run check: PASS (8 testów); npm run build: PASS; npm audit: 0.
- tmpdir: restart, polskie znaki, dwie karty, duplikaty, rollback migracji,
  odczyt kopii, zachowanie uszkodzonej/nowszej bazy, drugi proces, CSRF.
- T01: Chromium desktop/390 px, klawiatura, brak zewnętrznych żądań.
- Overrides glob/minimatch usuwają podatności przechodnie; zestaw sprawdzony.

## Następne trzy kroki
1. T03: 3 karty E1, edytor z autosave, flush i stopniowana pomoc.
2. Bufor ratunkowy IndexedDB z odzyskaniem i ochroną konfliktu.
3. Pełna ścieżka przeglądarka → API → baza → restart → odczyt.

## Blokady i niewiadome
- Prywatny remote GitHub nieustalony; brak push nie blokuje prac.
- Produkcyjny ekran w rzeczywistym Safari jeszcze niesprawdzony.
- Pozostałe rodziny, sesje, zeszyt i pełne kopie: T04–T09.

## Wznowienie
Przeczytaj tasks/T03.md; npm run check; sprawdź git status.
