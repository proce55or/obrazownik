# Odbiór lokalnego MVP i dodatku naukowego

2026-11-02, macOS 13.7.8 Intel, Node 24.21.0, Chromium przez Playwright CLI.
Program działa lokalnie na 127.0.0.1:4317, schemaVersion 2. Nie publikowano
aplikacji ani prywatnych danych. Repo proce55or/obrazownik zweryfikowano jako prywatne.

## Zakres i dowody

- `npm run check`: 19 plików, 94 testy PASS; TypeScript, ESLint, kontrola
  kontekstu i tracked/staged repo PASS.
- Walidacja treści: 91 aktywnych kart, 3 wersje archiwalne, 9 metod;
  60 podstawowych (po 12 na rodzinę), 6 opcjonalnych, 5 near transfer,
  20 chronionych tematów nowego pisania. Wszystkie PASS.
- `npm run build`: PASS. `npm audit` oraz `npm audit --omit=dev`: 0 podatności.
- `npm run test:e2e`: PASS na osobnym procesie4318 i tymczasowej bazie.
  Test odmawia użycia bazy innej instancji. Pliki tests/e2e zawierają
  rzeczywiste scenariusze CLI, a nie atrapę testu.

Przeglądarka → API → SQLite → odczyt po restarcie: autosave, Unicode,
nowe linie, trzy poziomy pomocy, pre_hint, final i samoocena potwierdzone.
Błąd sieci i przeładowanie → odzyskanie IndexedDB; dwie karty → konflikt409
i odrębna wersja; utracona odpowiedź pomocy → bezpieczne ponowienie: PASS.

Polskie pola E3 są zachowane przed pomocą i przy ukończeniu. Źródła metody
są widoczne. Nowe pisanie nie pobiera podpowiedzi; wybranie wsparcia tworzy
osobną próbę, zachowuje tekst oryginału i oznacza materiał jako widziany.

Zeszyt → nowy dokument z tagami → autosave → ręczna wersja → Markdown →
E5 → nowy tekst: PASS. Źródło niezmienione; tagi pozostają tekstem.
Sprawdzono dwa zadania każdej rodziny i po jednym wariancie M2/M3/M5,
łatwiejszą instrukcję, przyciski wyboru słów oraz własną odpowiedź.

Ustawienia16–26px, oddzielne włączanie wariantów, ręczna kopia, pobranieJSON,
podgląd/import i jego ponowienie bez duplikatów, porównanie dwóch próbek,
sesja zakończona po jednym zadaniu i automatyczna kopia: PASS w UI.

Integracja testuje rzeczywisty restore, zachowanie poprzedniej bazy,
rollback migracji/importu, niepoprawne pliki, remap powiązanych konfliktów,
pomoc unknown, ekspozycje i wyczerpanie rezerwy. Terminy2/7/21, DST,
ponowienie ukończenia, maksymalnie jeden powrót dnia i równoległe kopie: PASS.
Zeszyt testowano na syntetycznych10 000 rekordów z paginacją.

## Czytelność i prywatność

Obejrzano zrzuty pięciu rodzin, zeszytu, ustawień i obserwacji. W320/390px
oraz przy CSS zoom200% brak poziomego przepełnienia. Tab przechodzi po
kontrolkach z widocznym fokusem. Tekst ustawiony na26px pozostaje używalny.
Po wykryciu zbyt jasnych opisów zwiększono kontrast; pomiar widocznych
napisów strony startowej i ustawień nie wykazał wyników poniżej4,5:1
(3:1 dla dużego tekstu). To nie jest pełny audyt WCAG.

Scenariusze E2E rejestrują brak zewnętrznych żądań. Dodatkowa próba na
testowym4319 blokowała całą sieć poza localhost i celowo wyłączała IndexedDB:
pokazano ostrzeżenie o buforze, a zapis serwerowy i ukończenie zadziałały.
Host/Origin/CSRF, blokada procesu, ścieżki i symlinki mają testy odrzucenia.
Żaden test nie używał domyślnej bazy; artefakty syntetyczne są poza Git.

## Przełączenie używanej instancji

Zatrzymano wyłącznie własny proces4317, sprawdzając PID i katalog procesu.
Aktualizacja utworzyła sprawdzoną kopię schema1 przed migracją do schema2.
Porównano odciski treści, identyfikatorów, dat i wersji przed i po:
zgodne. Sprawdzono integralność obu baz. Launcher --no-open rozpoznał
działającą instancję; ekran nowej wersji otwarto w przeglądarce.
Nie wykonywano prób restore ani resetu na domyślnych danych.

## Pozostały odbiór użytkowy

Safari: VERIFY_ON_MAC. Automatyczna obsługa rzeczywistego Safari była
niedostępna. CSS zoom200% w Chromium nie zastępuje powiększenia przeglądarki
w Safari. Test launchera ze spacjami działał na rzeczywistym macOS z fixture
i --no-open; dwuklik Findera i pełny przebieg Safari pozostają do sprawdzenia.

Pilotaż: przygotowany w docs/12-pilot.md, nieprzeprowadzony. Wymaga
rzeczywistych obserwacji autora. Program nie jest zwalidowaną interwencją
kliniczną. Te ograniczenia nie blokują używania lokalnego programu w Chromium.
