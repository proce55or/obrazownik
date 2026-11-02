# Zgodność środowiska — T00

Sprawdzenie lokalne 2026-11-02: macOS Ventura 13.7.8 (22H730), x86_64,
Safari 18.6, Node v24.21.0, npm 11.19.0, Git 2.39.3.
Nie odczytywano dokumentów użytkownika, sekretów ani numerów seryjnych.

Wersja Node przypięta w .nvmrc. Potwierdzona w oficjalnych
[release notes 24.21.0 LTS](https://nodejs.org/en/blog/release/v24.21.0).
Adapter będzie korzystał wyłącznie z DatabaseSync, prepared statements i backup.

Wykonano smoke test node:sqlite w systemowym tmpdir: zapis syntetycznego
tekstu z polskimi znakami i nową linią w transakcji, zamknięcie połączenia,
ponowne otwarcie, backup API i odczyt kopii. Wszystkie asercje PASS;
folder tymczasowy usunięty. Kontroler kontekstu PASS.

Folder projektu: Obrazownik_plan, lokalne repo main, bez remote.
Produkcja będzie używać ~/Obrazownik-dane; testy zawsze osobnego tmpdir.
Test przeglądarkowego buildu nastąpi w T01; wykrycie wersji Safari
nie jest testem interfejsu.
