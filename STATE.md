# Stan projektu
Updated: 2026-11-02
Active task: T02
Status: IN_PROGRESS
Environment: lokalny macOS 13.7.8, Intel x86_64, Safari 18.6
Branch: main
Last verified code commit: T01 — commit zawierający ten stan

## Działa
- T00: Node 24.21.0, SQLite smoke (Unicode, transakcja, restart, backup).
- T01: React/Vite/TypeScript, Fastify, ekran Dzisiaj i przejście do edytora.
- Serwer wyłącznie 127.0.0.1:4317; Host/Origin/CSRF, CSP, bez CDN.
- Folder danych poza repo, kontrola realpath i dowiązań, niezależność od cwd.
- Kod w Obrazownik_plan; bez remote i publikacji. Na tym etapie brak zapisu.

## Ostatnia weryfikacja
- npm run check: PASS (3 testy); npm run build: PASS; npm audit: 0 podatności.
- Chromium lokalnie: Dzisiaj → edytor, 390 px, klawiatura, brak błędów konsoli
  i żądań zewnętrznych. Obrazy: output/playwright/t01-*.png (ignorowane).
- React: hooks, semantyka, lokalne zasoby, brak zewnętrznych zależności UI.
- Overrides glob 14.0.3/minimatch 11.0.4 usuwają podatności przechodnie;
  lint, build, statyczny frontend i testy sprawdzone z tym zestawem.

## Następne trzy kroki
1. T02: schematy Zod, adapter SQLite, migracje, idempotencja i CAS revision.
2. Testy restartu, rollbacku, konfliktu i odrzuconych zapisów w tmpdir.
3. T03: pierwsze pełne ćwiczenie, autosave, stopniowane podpowiedzi.

## Blokady i niewiadome
- Prywatne konto/remote GitHub nieustalone; brak push nie blokuje prac.
- Produkcyjny ekran w rzeczywistym Safari jeszcze niesprawdzony.

## Wznowienie
Przeczytaj tasks/T02.md; npm run check; sprawdź git status.
