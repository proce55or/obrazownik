# Obrazownik

Lokalna przestrzeń do ćwiczenia własnego języka obrazowego po polsku.
Autor tworzy odpowiedzi sam. Aplikacja pomaga zacząć, zachowuje teksty
oraz pokazuje użyte wsparcie; nie ocenia jakości poezji.

Działa pięć rodzin: **Właściwość i obraz**, **Most między pojęciami**,
**Czasownik buduje scenę**, **Zmysł i perspektywa** oraz **Wybierz, usuń,
dopisz**. Pakiet obejmuje 60 kart podstawowych, 6 kart opcjonalnych,
5 kart bliskiego przeniesienia i 20 chronionych tematów nowego pisania.

Są krótkie sesje, łagodne powroty 2/7/21 dni, wersje sprzed pomocy,
zeszyt odpowiedzi i własnych dokumentów, praca z fragmentem własnego tekstu,
obserwacje i porównywanie próbek, eksport/import oraz sprawdzane kopie.
Warianty „Jedno słowo, kilka dróg”, „Pojęcie w sytuacji” i „Wspólna cecha
i metafora” włącza się oddzielnie w ustawieniach.

To adaptacje i propozycje twórcze inspirowane badaniami. Polska aplikacja
nie ma potwierdzonej skuteczności klinicznej. Sekcja „O ćwiczeniu i jego
podstawach” wyjaśnia pochodzenie i ograniczenia konkretnej metody.
Stan implementacji i wyniki kontroli: [STATE.md](STATE.md).

## Pierwsze uruchomienie na Macu

Wymagany jest **Node 24.21.x** (wersja w `.nvmrc`). W terminalu otwartym
w katalogu projektu:

```sh
npm ci
npm run doctor
npm run build
```

Następnie otwórz dwuklikiem **Start-Obrazownik.command** lub wykonaj:

```sh
./Start-Obrazownik.command
```

Launcher sprawdza build i otwiera przeglądarkę po kontroli serwera.
Rozpoznaje własną działającą instancję; przy zajętym porcie pokazuje błąd.
Nie instaluje pakietów ani aktualizacji i nie zamyka obcych procesów.
Do startu z terminala bez otwierania przeglądarki służy `npm start`.

Adres: [http://127.0.0.1:4317](http://127.0.0.1:4317).
Zatrzymanie: Ctrl+C w terminalu uruchomionej aplikacji. Przy kolejnych
uruchomieniach wystarczy launcher; build ponów po zmianie kodu.

Pierwsza instalacja zależności wymaga Internetu. Po instalacji i buildzie
ćwiczenia działają offline, gdy lokalny serwer pozostaje uruchomiony.
Serwer nasłuchuje wyłącznie na 127.0.0.1. Nie ma konta, płatnego API,
CDN, telemetrii ani synchronizacji. Telefon nie łączy się z bazą tego Maca
przez własny localhost.

Start oferuje trzyetapowe ćwiczenie z lokalnym Bielikiem7B, który czyta
bieżącą odpowiedź. Pozostałe ćwiczenia domyślnie używają gotowej pomocy.
Instrukcja dla tej instalacji na Macu, krok po kroku: [Bielik](docs/13-bielik-krok-po-kroku.md).

## Pierwsza sesja

1. **Start → Zacznij z Bielikiem**: opisz szczegół, utwórz porównanie,
   następnie małą scenę. Cel i polecenie widzisz nad polem odpowiedzi.
2. **Poproś Bielika o wskazówkę**: model czyta zapisany tekst lokalnie,
   cytuje fragment, omawia cel i proponuje poprawkę. Możesz się nie zgodzić.
3. Popraw odpowiedź i poproś ponownie albo przejdź do kolejnego kroku.
   **Zakończ i zachowaj ćwiczenie** zapisuje scenę wraz z wcześniejszymi etapami.
4. **Zapisz szkic i wróć** pozwala kontynuować później. W **Moje teksty**
   znajdziesz odpowiedzi, dokumenty, ich wersje i eksport Markdown.
5. **Ćwiczenia** zawierają katalog, krótkie sesje i chronione nowe pisanie.
   W próbach chronionych model i podpowiedzi są wyłączone; pomoc tworzy
   osobną wersję. Ustawienia i kopie znajdziesz w **Ustawieniach**.

Oznaczenie samodzielności dotyczy pomocy zarejestrowanej w aplikacji; program nie potrafi
wykluczyć wsparcia użytego poza nią. Obserwacje pokazują teksty i dobrowolne
samooceny, bez wyniku talentu, sprawności czy skuteczności leczenia.

## Dane i odzyskiwanie szkiców

SQLite jest źródłem prawdy. Dane domyślnie zapisują się w
**`~/Obrazownik-dane`**, poza repozytorium. Dokładną ścieżkę pokazują ustawienia.
Alternatywny folder ustawiaj przy zatrzymanym serwerze:

```sh
OBRAZOWNIK_DATA_DIR="/absolutna/sciezka/Dane Obrazownika" npm start
```

Folder wewnątrz repo, także wskazany dowiązaniem, jest odrzucany.
Nie przenoś aktywnej bazy ani jej plików pomocniczych.

Przy błędzie zapisu tekst i pola pomocnicze pozostają w edytorze. Możesz
ponowić zapis albo skopiować swoją pracę. Przy konflikcie dwóch kart
zachowaj lokalną wersję osobno, zamiast nadpisywać nowszy zapis na Macu.
Bufor IndexedDB przechowuje osobne kopie ratunkowe kart przeglądarki
(maksymalnie 10 kopii / 1 MiB); odzyskanie jest proponowane przy wznowieniu.
Bufor nie zastępuje kopii bazy. Zmiany bez potwierdzenia ani z serwera,
ani z bufora mogą zniknąć po awarii.

Folder ma blokadę pojedynczego procesu. Po awarii sprawdź PID z
`.obrazownik-lock/owner.json` poleceniem `ps -p PID -o pid,lstart,command`.
Nie usuwaj blokady, gdy proces działa lub jego tożsamość jest niejasna.
Sam brak odpowiedzi portu nie dowodzi zatrzymania serwera.

## Kopie, eksport i import

W „Ustawieniach” wybierz **„Utwórz i sprawdź kopię”**. Migawka SQLite
trafia do `~/Obrazownik-dane/backups`. Kopie powstają też przed migracją,
przed importem i po pierwszej ukończonej sesji lokalnego dnia.
Retencja obejmuje ostatnie 14 dni kopii automatycznych; ręczne i sprzed zmian
pozostają zachowane. Lista w ustawieniach pokazuje nazwy i rozmiary.

**„Eksportuj wszystkie dane JSON”** pobiera wersjonowany plik z tekstami,
wersjami, historią pomocy, ekspozycjami i powiązaniami. Import pliku do
25 MiB najpierw pokazuje podgląd. Dopiero **„Utwórz kopię i scal dane”**
wykonuje transakcję. Identyczne rekordy są pomijane; różne rekordy o tym
samym ID są zachowywane osobno wraz z przemapowanymi powiązaniami.
Ponowienie tego samego importu nie dubluje danych. Scalanie zachowuje
ustawienia bieżącej instalacji. Błąd walidacji przerywa import bez częściowego zapisu.

Baza, kopie i eksporty nie są automatycznie szyfrowane. Kopia na tym samym
dysku nie chroni przed utratą komputera; osobną kopię na innym nośniku
możesz przechowywać według własnego wyboru. Prywatne pliki pozostają poza Git.

## Pełne przywrócenie bazy

Zapisz otwarte szkice i **zatrzymaj serwer**. W terminalu projektu wskaż
absolutną ścieżkę konkretnej sprawdzonej kopii, np.:

```sh
npm run restore -- "$HOME/Obrazownik-dane/backups/NAZWA-KOPII.sqlite"
```

Zastąp `NAZWA-KOPII.sqlite` rzeczywistą nazwą z listy kopii.
Narzędzie sprawdza blokadę, format, integralność i powiązania, przygotowuje
kopię tymczasową oraz zachowuje dotychczasową bazę pod nową nazwą.
Potwierdza zawartość po przełączeniu; przy błędzie przywraca poprzednie pliki.
Wynik wskazuje miejsce zachowania poprzedniej bazy. Następnie uruchom
launcher i sprawdź wybrany tekst oraz jego wersje.

Próbę odtwarzania wykonuj w osobnym pustym folderze, bez zastępowania
używanych danych:

```sh
OBRAZOWNIK_DATA_DIR="/absolutna/sciezka/Proba odtworzenia" \
  npm run restore -- "/absolutna/sciezka/kopii.sqlite"
OBRAZOWNIK_DATA_DIR="/absolutna/sciezka/Proba odtworzenia" npm start
```

Próba wymaga wolnego portu 4317. Potem zatrzymaj serwer; zwykły launcher
wróci do domyślnego folderu, jeśli nie ustawisz dla niego innej konfiguracji.

## Rozwój i ograniczenia odbioru

```sh
npm run dev               # lokalny Vite 5173 i API 4317
npm run check             # typy, lint, testy, treści, kontekst i granica Git
npm run build
npm run test:e2e          # osobny serwer na 4318 i syntetyczne dane tymczasowe
```

Testy używają danych tymczasowych. Zrzuty i logi są w ignorowanym
`output/playwright/`; prywatne materiały pozostają poza repo.

Interfejs sprawdzano na tym Macu w Chromium. Automatyczna obsługa Safari
była niedostępna; cel buildu Safari 16.6 nie zastępuje ręcznego odbioru
w rzeczywistym Safari. Krótka lista sprawdzeń i dobrowolny pilotaż są w
[docs/12-pilot.md](docs/12-pilot.md). Pilotaż wymaga rzeczywistych obserwacji;
nie został zastąpiony testami technicznymi.

Dokumentacja planu: [START.md](START.md), dodatek: [START_NAUKA.md](START_NAUKA.md).
Kod ma prywatne repozytorium; publikacja aplikacji i źródeł wymaga osobnej decyzji.
Zasady przyszłej licencji opisuje [LICENSE-PLAN.md](LICENSE-PLAN.md).
