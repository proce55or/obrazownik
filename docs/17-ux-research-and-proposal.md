# Obrazownik: research i projekt UX/UI

Data: 2026-11-03. T20. **Status: zbadany interfejs i klikalny projekt;
wdrożona aplikacja pozostaje w wersji 0.2.1.**

## Wniosek

Obecny interfejs wymaga od autora zrozumienia programu przed pisaniem.
Problem dotyczy hierarchii, nazw i drogi przez zadanie. Propozycja:
menu boczne, jedno miejsce pracy, widoczne następne działanie; logo zostaje.
Badano zalecenia, nie popularność stylów. Lokalność aplikacji nie zmienia
wymagań czytelności. Użyteczność projektu wymaga sprawdzenia z autorem.

## Co rzeczywiście obejrzano

Aktualny program 0.2.1 w przeglądarce aplikacji Codex. Pełną ścieżkę
przeprowadzono na osobnym serwerze 4319 i bazie w tmpdir. Tekst wyłącznie
syntetyczny. Nie wykonywano ćwiczeń testowych na bazie autora.
Zrzuty pochodzą z tego audytu, zapisano i obejrzano je przed oceną.

| Krok | Stan | Konkretny problem / mocna strona |
| --- | --- | --- |
| 1. Start | Wymaga przebudowy | Duży tytuł powitalny zajmuje główną przestrzeń. Zamiast bezpośredniego ćwiczenia program proponuje abstrakcyjną „sesję”. |
| 2. Wybór ćwiczenia | Trudny do odnalezienia | Katalog znajduje się wewnątrz „Więcej możliwości”, a następnie „Wybierz ćwiczenie i własne tempo”. Po drodze kilka równorzędnych sposobów rozpoczęcia. |
| 3. Pisanie | Krytyczny problem orientacji | Znika główne menu. Tytuł literacki, temat, opis podstaw i cztery opcjonalne pola poprzedzają właściwy tekst. Polecenie nie prowadzi wyraźnie do zakończenia. |
| 4. Zakończenie | Działa, wymaga uproszczenia | Potwierdzenie zapisu i zachowanie tekstu są widoczne. „Jest Twój ślad” jest mniej jednoznaczne niż „Ćwiczenie zakończone”; powrót znajduje się pod kilkoma sekcjami. |

W kroku 3 zmierzono początek textarea na y=1104 CSS px, wysokość strony
1958 px, okno 1624×1272, domyślne pismo18px. Nie jest to uniwersalny pomiar
każdego urządzenia. Konkretny przykład pokazuje dużą odległość polecenia,
pisania i zakończenia, mimo dostępnej szerokości okna.

1. Start:
![Obecny start](../output/ux-audit-2026-11-03/01-start.jpg)
2. Wybór, po rozwinięciu obu sekcji:
![Obecny wybór](../output/ux-audit-2026-11-03/02-wybor.jpg)
3. Pisanie:
![Obecne ćwiczenie](../output/ux-audit-2026-11-03/03-cwiczenie.jpg)
4. Zakończenie z tekstem syntetycznym:
![Obecne zakończenie](../output/ux-audit-2026-11-03/04-zakonczenie.jpg)

Obrazy w output są lokalnymi materiałami audytu, poza Git.

## Aktualne źródła i ich zastosowanie

1. [W3C/WAI: zrozumiała struktura i obsługa](https://www.w3.org/WAI/WCAG2/supplemental/objectives/o1-understandable/)
   i [jasność etapów](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o1p04-clear-steps/):
   znajome elementy, jasny cel, bieżące położenie. Wskazówki dodatkowe,
   nie osobny wymagany poziom WCAG.
2. [Microsoft Fluent 2: nawigacja](https://fluent2.microsoft.design/components/web/react/core/nav/usage):
   krótkie nazwy, widoczna wybrana sekcja, stała kolejność, łatwy dostęp.
   Zastosowanie: menu boczne na szerokim ekranie i podpisane „Menu” w wąskim.
3. [Apple HIG: sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars):
   krótka hierarchia i dostosowanie do szerokości. Przeczytano oficjalny
   Markdown; aktualizacja08.06.2026. Obecny w HIG Liquid Glass nie jest
   warunkiem dobrego UX. Tutaj proponujemy nieprzezroczyste, czytelne tło.
4. [GOV.UK: question pages](https://design-system.service.gov.uk/patterns/question-pages/):
   jedna zrozumiała sprawa naraz, jasny nagłówek i działanie prowadzące dalej.
   Zastosowanie do pisania jest naszą decyzją projektową, nie automatycznym
   przepisaniem zasad formularza administracyjnego.
5. [USWDS: step indicator](https://designsystem.digital.gov/components/step-indicator/):
   pasek etapów tylko dla rzeczywistego procesu z kilkoma częściami.
   Nie tworzyć sztucznych ekranów dla jednego zdania ani procentowej oceny tekstu.
6. [Fluent 2: tooltips](https://fluent2.microsoft.design/components/web/react/core/tooltip/usage/):
   dymek uzupełnia informację, nie zastępuje niezbędnego polecenia.
   [WCAG2.2: hover/focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html):
   można go zamknąć, przenieść na niego wskaźnik i czytać bez limitu czasu.
   Zastosowanie: hover, fokus klawiatury, kliknięcie pytajnika, Escape,
   globalne wyłączenie objaśnień. Dłuższe instrukcje trafiają do panelu pomocy.
7. [WCAG2.2: labels/instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html):
   widoczne objaśnienie oczekiwanego wpisu. Placeholder nie jest jedyną
   instrukcją; polecenie pozostaje nad tekstem również podczas pisania.
8. [WCAG2.2: target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
   [kontrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
   [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html):
   minimum celów24×24CSSpx z wyjątkami, kontrast zwykłego tekstu4,5:1,
   ponowne ułożenie treści przy320CSSpx. Proponowane cele44–48px i bazowe
   pismo18–22px są naszymi bardziej komfortowymi założeniami, nie rzekomym
   wymogiem WCAG dotyczącym konkretnej wielkości fontu.

## Trzy priorytety przebudowy

### 1. Układ aplikacji i menu

- Start: jedna propozycja ćwiczenia; dla otwartego szkicu jedno działanie
  „Kontynuuj ćwiczenie”. Bez dużego hasła powitalnego i kilku paneli startu.
- Ćwiczenia: osobny katalog z prostym opisem celu i przykładem rodzaju zadania.
  Obecne identyfikatory i rodziny pozostają w danych; nazwy w UI opisują działanie.
- Moje teksty: szkice, ukończone ćwiczenia, własne pisanie. Obserwacje jako
  podrzędny widok, bez ocen talentu i klinicznego „postępu”.
- Ustawienia: czytelność, lokalny model, kopie i wymiana danych.
- Osobny, stale dostępny odsyłacz „Jak korzystać”.

Na komputerze menu boczne z etykietami i wybraną sekcją; w wąskim oknie
podpisane menu zwijane. Nie wymuszać braku przewijania kosztem dużego pisma.

### 2. Prowadzenie przez ćwiczenie

Nagłówek opisuje zadanie: „Opisz jedną cechę kamienia”. Następnie polecenie,
pole tekstu i przycisk zakończenia. Informacja „Gdy skończysz, wybierz
Zakończ ćwiczenie” stale widoczna. Podstawy naukowe i opcjonalne narzędzia
nie poprzedzają tekstu w podstawowej ścieżce.

Przy złożonych zadaniach pokazywać bieżący etap i wcześniejszą odpowiedź.
Nie oceniać automatycznie jakości tekstu ani wymuszać kolejnej odpowiedzi.

Nowe sformułowania poleceń wymagają nowych wersji kart, jeśli zmieniają
stimulus/instrukcję. Nie nadpisywać promptSnapshot dawnych prób.

### 3. Dwa różne rodzaje pomocy

**Objaśnienia obsługi** wyjaśniają funkcję sekcji/przycisku. Włączane
przełącznikiem, z krótkim opóźnieniem hover, także po kliknięciu/fokusie.
Podstawowe polecenia pozostają widoczne po wyłączeniu dymków.

**Podpowiedzi do treści** są ujawniane na żądanie i nadal podlegają zapisowi
pochodzenia pomocy. Można zaproponować wybór „Bez Bielika / Z Bielikiem”
przed nową próbą; wybór musi być utrwalony w konfiguracji tej próby.
Opis jasno mówi, że obecny Bielik zna temat, ale nie czyta wpisanego tekstu.
Nowy interfejs sam w sobie nie poprawia trafności generowanych pytań.

Instrukcje obsługi nie są pomocą językową. Przykłady odpowiedzi i pytania
naprowadzające nadal wymagają rejestracji. W próbach chronionych pozostają
objaśnienia obsługi, ale treściowe podpowiedzi i LLM pozostają zablokowane.

## Klikalna propozycja

Pliki: `design/ux-proposal/`. Uruchomienie z katalogu projektu:
`node design/ux-proposal/serve.mjs`, następnie `http://127.0.0.1:4321`.
Można też otworzyć `index.html` lokalnie. Nie wymaga pakietów ani internetu.

Działa menu, trzy tematy, pisanie, powrót i zakończenie, pomoc i wielkość
pisma. Bez bazy i wywołań Bielika: pytanie jest oznaczoną demonstracją.
Tekst tylko w pamięci karty, znika po odświeżeniu. Zapamiętywane są jedynie
preferencje wyglądu. To projekt do oceny, nie miejsce na docelowe teksty.

![Projekt startu](../output/ux-audit-2026-11-03/05-projekt-start.jpg)
![Projekt pisania](../output/ux-audit-2026-11-03/06-projekt-pisanie.jpg)

## Odbiór projektu i plan integracji

Kontrole przeglądarkowe: start → pisanie → pomoc → powrót do szkicu →
zakończenie. Objaśnienie z klawiatury, Escape, wyłącznik. Wąski ekran320px
przy26px, bez poziomego przewijania; poprawiono menu po oględzinach.
Przy1280×800/18px pole zaczyna się około461px, a przycisk zakończenia
kończy się około795px. To pomiar projektu, z inną szerokością niż audyt
starej wersji; nie podajemy z niego procentowego wzrostu użyteczności.

Nie jest to pełny audyt WCAG ani badanie z grupą użytkowników. Rzeczywista
ocena zrozumiałości musi obejmować pierwsze wykonanie zadania bez tłumaczenia
poza aplikacją. Nie testowano tu całego katalogu, Safari ani Windows.

Integracja w kolejnej jednostce:
1. Układ i menu zachowujące DraftQueue, potwierdzenia, CAS i ratunkowe kopie.
2. Ćwiczenie i objaśnienia, błędy/offline/retry, prawdziwa dostępność modelu,
   kompatybilne zapamiętywanie preferencji i wersjonowanie kart.
3. Pełny katalog, zeszyt, obserwacje i ustawienia. Odbiór klawiaturą,
   powiększeniem i wąskim ekranem; zapis po restarcie, CAS, chronione próby,
   eksport/import. Wdrożenie po kontrolach na danych syntetycznych.

Kryterium użytkowe: autor bez pomocy rozmowy potrafi rozpocząć, powiedzieć
własnymi słowami, jakie ma zadanie, napisać odpowiedź, zakończyć i znaleźć
tekst. Sprawdzić także samodzielne włączenie/wyłączenie objaśnień.
