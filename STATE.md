# Stan projektu
Updated: 2026-11-02
Active task: T01
Status: IN_PROGRESS
Environment: lokalny macOS 13.7.8, Intel x86_64, Safari 18.6
Branch: main
Last verified code commit: brak; zakończono T00

## Działa
- T00: Node 24.21.0, npm 11.19.0, Git 2.39.3; runtime w .nvmrc.
- Repo lokalne w Obrazownik_plan; oryginalny MD i ZIP poza repo bez zmian.

## Ostatnia weryfikacja
- node:sqlite: polskie znaki, nowe linie, transakcja, ponowne otwarcie,
  backup i odczyt kopii: PASS, wyłącznie w tmpdir.
- Kontroler pamięci: PASS. Interfejs jeszcze niezbudowany.

## Następne trzy kroki
1. T01: szkielet React/TypeScript/Vite + Fastify, lokalny ekran Dzisiaj.
2. Sprawdzić API, granicę sieci, folder danych i produkcyjny build.
3. Kontynuować T02 po odbiorze szkieletu.

## Blokady i niewiadome
- Brak ustalonego prywatnego remote; kod nie jest pushowany.
- Produkcyjny ekran w Safari jeszcze niezweryfikowany.

## Wznowienie
Przeczytaj tasks/T01.md; sprawdź git status i package.json.
