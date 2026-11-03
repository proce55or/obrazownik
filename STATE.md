# Stan projektu
Updated: 2026-11-03, Europe/Warsaw
Active task: T18
Status: IN_PROGRESS — przygotowana nocna kontrola po bezczynności
Environment: macOS13.7.8 Intel, Node24.21.0
Branch: main; zweryfikowany kod:8a4f698
Release: 0.2.0, schema3
Remote: proce55or/obrazownik (private, ponownie sprawdzone API)

## Działa i jest wdrożone
MVP + SCI-00–05 oraz T17. Produkcja127.0.0.1:4317 działa z istniejącą
bazą ~/Obrazownik-dane. Przed migracją sprawdzona kopia schema2;
po migracji schema3: integralnośćOK i zgodne odciski wszystkich rekordów
użytkownika (teksty, wersje, pomoc, daty, powiązania, ustawienia).
Start przez Launch Services otworzył rzeczywisty launcher w Terminalu,
Bielik4320 i aplikacja4317 mają wspólnego właściciela launchera. Stary proces
sprzed aktualizacji Codex był martwy; jego blokadę zachowano pod inną nazwą.

Bielik7B Q4_K_M poza repo, SHA256PASS, CPU4/ctx2048/slot1. Domyślnieoff;
nowe próby zapamiętują tryb, samodzielne blokują model. Bufor nie ujawnia
pytania; jawny pokaz zachowuje pre_hint i źródło/model. Timeout/offline
nie blokują zapisu. Jakość pytań eksperymentalna, czas zwykle kilka–kilkanaście
sekund w pomiarze. Instrukcja krok po kroku: docs/13-bielik-krok-po-kroku.md.
Pomiary: docs/14-bielik-benchmark.md; kontrakt: docs/15-bielik-resume.md.

## Weryfikacja
- npm run check:101 testów/20 plików PASS, lint/typy/treści/context/repo PASS.
- Build0.2.0 PASS. Pełne E2E z rzeczywistym modelem PASS.
- Osobno autosave podczas preparing oraz najnowszy tekst w pre_hint PASS.
- 320/390px, powiększenie CSS200%, klawiatura i zrzuty: PASS.
- npm audit --omit=dev:0 podatności. Wagi i logi nie są w Git.
- Ręczne Safari i literalny dwuklik Findera pozostają VERIFY_ON_MAC;
  T10 czeka na rzeczywiste obserwacje autora. Brak dowodu skuteczności klinicznej.

## Nocny nadzór i limit
Harmonogram `obrazownik-nocne-doko-czenie-i-kontrola`: ACTIVE w tej rozmowie,
co godzinę, maksymalnie10 razy, najpóźniej03.11 o11:00. T18 opisuje jedną
kontrolę po bezczynności i wyłączenie harmonogramu po sukcesie.
Baseline w ~/Obrazownik-modele/bielik-7b/qa-night przygotowany; komenda:
`node scripts/check-bielik-idle.mjs --verify`. Nie powtarzaj --prepare.
Nocny test nie został jeszcze wykonany — nie raportuj go jako PASS.
Caffeinate do11:00, PID w logs/night-awake.json; ekran może się wygasić.
Cel zostawić20%,15% to dolna granica użytkownika. Przy>=78% lub braku
licznika nie zaczynaj kosztownej pracy; zapisz stan i wyłącz harmonogram.
Ostatni odczyt58%. Limit wspólny dla konta. Testy tylko na danych syntetycznych.
