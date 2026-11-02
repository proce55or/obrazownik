# Stan projektu
Updated: 2026-11-02
Active task: T13
Status: IN_PROGRESS
Environment: lokalny macOS 13.7.8, Intel, Node 24.21.0
Branch: main
Last verified code commit: SCI-01 — ten checkpoint

## Działa
- T00–T03: E1, autosave, CAS, recovery, podpowiedzi, wersje i samoocena.
- SCI-00/T11: porównano ZIP i 7 modułów; dodatek skopiowany bez nadpisania.
- Inwentaryzacja: docs/science/00-current.md. Priorytet SCI przed T04.

## Weryfikacja
- SCI-01: schemat2, pochodzenie metod/kart, jawne unknown starszej historii.
- Eksport/import: ekspozycje, remap powiązań, skip identycznych rekordów, settings lokalne.
- Bufor oddzielny dla kart; backup sprawdzony i odporny na dowiązania.
- Check: 28 testów PASS; build PASS. Testy nowej migracji wyłącznie tmpdir.
- Kopie/migracje testować wyłącznie w tmpdir; produkcję migrować po sprawdzonej kopii.

## Następny krok
SCI-02/T13: polskie E1/E3 z własnymi polami; potem chronione nowe pisanie E6.

## Ograniczenia
- Pełne MVP T04–T09 nieukończone; zakres dodatku nie oznacza ich zaliczenia.
- Safari wciąż bez ręcznej weryfikacji; brak ustalonego prywatnego remote.

## Wznowienie
Czytaj tasks/T12.md i docs/science/03-integration.md, sekcje 3 i 6.
