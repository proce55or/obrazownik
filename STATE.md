# Stan projektu
Updated: 2026-11-02
Active task: T04
Status: TODO
Environment: lokalny macOS 13.7.8, Intel x86_64, Node 24.21.0
Branch: main
Last verified code commit: T03 — commit obejmujący ten stan

## Działa
- T00–T03: React/Vite/TypeScript + lokalny Fastify/SQLite, bez LLM i CDN.
- Dzisiaj, 3 karty E1, autosave 600 ms z kolejką, przerwa, pominięcie,
  ukończenie i opcjonalne samooceny. Powrót do szkiców i ostatnich tekstów.
- 3 poziomy pomocy na żądanie, niezmienne pre_hint/final, trwała historia pomocy.
- CAS i idempotencja, bufor ratunkowy IndexedDB, osobna wersja przy konflikcie.
- Host/Origin/CSRF, CSP, blokada procesu, dane poza repo, transakcyjne migracje.
- Kod w Obrazownik_plan; oryginalne MD/ZIP poza repo pozostają bez zmian.

## Ostatnia weryfikacja
- npm run check: PASS, 15 testów; npm run build: PASS.
- npm run test:e2e: ścieżka UI/API/baza, 3 podpowiedzi, final i samoocena,
  odświeżenie po błędzie, odzyskanie, konflikt kart, zgubiona odpowiedź,
  restart procesu i ponowny zapis. Wyłącznie dane tymczasowe.
- Chromium: desktop, 390/320 px, klawiatura, długi polski tekst, bez CDN.
- npm run doctor w tmpdir: PASS; npm audit: 0 podatności.
- Produkcyjne błędy sprawdzone także ze static plugin; zamykanie surowego
  połączenia TCP przed HTTP nie blokuje zakończenia serwera.
- Szczegóły: docs/10-verification.md. Instrukcja: README.md.

## Następne trzy kroki
1. T04: przeczytaj E2–E5 i E7 w docs/02-exercises.md.
2. Rozszerz wspólny edytor o pozostałe rodziny, warianty i dostępne erasure.
3. Pakiet 60 kart treningowych + 20 rezerwowych z metadanymi i walidatorem.

## Blokady i ograniczenia
- Pełne kopie/eksport/import dopiero T07; bufor nie jest kopią bazy.
- Sesje, powroty i niezależne próby T05; pełny zeszyt T06.
- Obsługa Safari przez narzędzie niedostępna (startup service failed).
  Build celuje w Safari 16.6; ręczna kontrola tego Safari wciąż wymagana.
- Brak ustalonego prywatnego remote GitHub; nie wykonano push ani publikacji.

## Wznowienie
Przeczytaj tasks/T04.md; sprawdź git status; npm run check.
Przed npm run test:e2e zatrzymaj serwer na 4317. npm start uruchamia build.
