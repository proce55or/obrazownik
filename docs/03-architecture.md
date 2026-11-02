# Architektura
## A1. Decyzja i jej powód
Aplikacja internetowa uruchamiana lokalnie: React + TypeScript w przeglądarce,
serwer Node.js na tym samym iMacu, SQLite w folderze użytkownika.
Jeden proces serwuje zbudowany frontend i API pod jednym adresem.
W rozwoju Vite może być osobnym procesem z proxy do lokalnego API.

To świadoma zmiana poprzedniej propozycji samej PWA z IndexedDB:
obecne wymaganie to automatyczny, przewidywalny zapis w folderze na Macu.
Pamięć przeglądarki nie jest tym samym co wybrany folder, a API wyboru
folderu nie ma jednolitego wsparcia przeglądarek [S4].
Nie wdrażaj na początku dwóch równorzędnych baz i synchronizacji.

MVP pracuje bez Internetu po instalacji zależności i zbudowaniu.
Lokalny proces musi być uruchomiony. To nie oznacza samodzielnej aplikacji
offline na iPhonie. Instalowanie zależności pierwszy raz wymaga ich pobrania.

## A2. Środowisko docelowe i zgodność
Podane środowisko: iMac 2017, Intel i7, 64 GB RAM, 8 GB VRAM,
macOS Ventura 13.7.8. Informacje są deklaracją, nie pomiarem wykonanym tutaj.
T00 weryfikuje wersję systemu, architekturę, Node i przeglądarkę; bez numerów
seryjnych, spisu dokumentów i historii użytkownika.

Wybrana linia runtime: Node 24 LTS, aktualna sprawdzona poprawka z tej linii,
co najmniej 24.16.0. Przed przypięciem sprawdź release notes i wykonaj smoke
test zapisu/odczytu/backup. Gotowe binaria tej linii wymagają macOS >=13.5 [S1].
To argument za testem na podanej Venturze, nie gwarancja całego toolchainu.
Nie stosuj automatycznie Node latest. Zapisz dokładną wersję w .nvmrc
i zakresie engines; zachowaj package-lock.json.

node:sqlite w sprawdzonej dokumentacji ma status Release candidate [S2].
To jawny kompromis: brak zewnętrznego dodatku C++ do budowania na starym Macu,
prosta instalacja, izolacja dostępu do SQLite w jednym adapterze.
Nie nazywaj tego stabilnym API bez sprawdzenia. Użyj małego, podstawowego
podzbioru DatabaseSync, prepared statements i backup; unikaj świeżych dodatków.
Jeśli test ujawni rzeczywisty problem, zapisz decyzję i zweryfikuj alternatywny
sterownik SQLite na Intel/Ventura. Nie zmieniaj formatu danych w ciszy.

React, Vite i zależności dobierz do tej linii Node i przypnij lockfile [S3].
Nie uruchamiaj codziennie aktualizacji. Nie używaj eksperymentalnych wersji.
Sprawdź produkcyjny build w rzeczywistym Safari na Macu; nowy dev-server
może wymagać nowszej przeglądarki niż wynikowy build.
Cel początkowy produkcji: Safari 16.6 lub nowsze, plus współczesny Chromium.
Ustaw odpowiedni build.target; nie zakładaj, że transpiler dodaje brakujące
Web API. Korzystaj z prostych funkcji dostępnych na docelowej przeglądarce.

Nie trzeba GPU, Dockera, Rust, Go, Pythona ani LLM do działania MVP.
Python może później przygotowywać zasoby. Nie uruchamiaj MLX na Intel.
Nie proponuj aktualizacji systemu tylko po to, aby ominąć plan.

## A3. Stos i granice modułów
| Warstwa | Wybór | Odpowiedzialność |
| --- | --- | --- |
| UI | React, TypeScript, zwykły CSS | Ekrany i dostępność |
| Build | Vite dla UI, tsc dla serwera | Powtarzalny build |
| HTTP | Fastify i oficjalne statyczne pliki, zgodne wersje | API i frontend |
| Walidacja | Zod, współdzielone schematy | Dane z API i import |
| Baza | SQLite/node:sqlite w jednym adapterze | Transakcje, migracje |
| Logika | Czyste funkcje TypeScript | Dobór, wsparcie, powroty |
| Testy | Vitest + kilka testów Playwright | Reguły, API, pełna ścieżka |
| Pamięć projektu | Markdown i skrypt Node | Przekazanie modelowi |

Nie dodawaj ORM, Redis, wektorowej bazy, Next.js, Electron ani generatora agentów.
Nie twórz mikroserwisów. SQL w adapterze, nie w komponentach.
Fastify/React nie mają narzucać sposobu oceny tekstów.

Struktura docelowa:
- src/client/: screens, components, api, styles.
- src/server/: server, routes, storage, migrations, backup.
- src/domain/: exercise, session, schedule, assistance.
- src/shared/: schemas i typy.
- content/pl/: wersjonowane, neutralne karty.
- tests/: unit, integration, e2e; syntetyczne dane.
- scripts/: doctor, start, check-context, repo-check.
- docs/, tasks/ oraz cztery małe pliki stanu w korzeniu.

To jeden pakiet npm, bez monorepo i osobnej publikacji modułów.
Granice src/domain i src/shared umożliwiają późniejszy interfejs mobilny,
ale nie implementuj obecnie drugiego silnika danych.

## A4. Foldery i uruchamianie
Proponowany kod na iMacu: ~/Developer/obrazownik.
Dane: ~/Obrazownik-dane, ustawiane przez OBRAZOWNIK_DATA_DIR, domyślnie
wyliczane z os.homedir(), nigdy z aktualnego katalogu procesu.

Folder danych:
- obrazownik.sqlite oraz pliki pomocnicze SQLite;
- backups/: sprawdzone migawki, nie surowe kopie aktywnej bazy;
- exports/: dobrowolne pliki JSON/Markdown;
- logs/: krótkie logi techniczne bez treści;
- resources/: przyszłe prywatne indeksy i zasoby;
- models/: przyszłe lokalne modele, obecnie brak.

Oryginalne teksty i próby są w bazie. Eksport Markdown jest czytelną kopią,
nie osobnym źródłem prawdy. Nie obiecuj zapisywania każdej zmiany do dwóch
równorzędnych formatów. Nie skanuj innych folderów użytkownika.

Przed utworzeniem danych sprawdź realpath względem korzenia repo;
nie pozwalaj przez konfigurację i symlink umieścić produkcyjnych danych
wewnątrz repo. Testy używają osobnego tmpdir i nigdy realnego folderu użytkownika.
Nie przenoś folderu danych przez zwykłą edycję pola w UI; pierwsza wersja
pokazuje ścieżkę i opisuje zmianę przy zatrzymanej aplikacji.

Komendy docelowe:
- npm ci: instalacja z lockfile;
- npm run doctor: sprawdza runtime i możliwość użycia katalogu;
- npm run dev: Vite i serwer, oba lokalnie;
- npm run build: frontend i serwer;
- npm start: produkcyjny lokalny serwer na 127.0.0.1:4317;
- npm run check: typy, lint, testy logiki/API, walidacja treści i pamięci;
- npm run test:e2e: kilka krytycznych scenariuszy;
- npm run backup / restore: kontrolowane operacje opisane w D6.

W gotowej wersji Start-Obrazownik.command ustala własny katalog, sprawdza Node,
uruchamia serwer i otwiera adres po poprawnym healthcheck. Nie reinstaluje
pakietów i nie robi git pull przy każdym starcie. Nie zamyka cudzych procesów.
Zajęty port: rozpoznaj własny zdrowy serwer lub pokaż błąd; nie zabijaj portu.
Ścieżki ze spacjami muszą działać. Skrypt ma nie wymagać sudo.
Proces serwera i narzędzie restore korzystają ze wspólnej blokady katalogu
danych. Drugi proces nie zaczyna migracji ani restore. Zastałej blokady nie
usuwaj tylko dlatego, że port nie odpowiada; zweryfikuj jej właściciela.

## A5. Granica sieci
Domyślnie tylko 127.0.0.1, bez 0.0.0.0 i tuneli. Aplikacja nie wykonuje
zewnętrznych żądań podczas ćwiczeń: zasoby, fonty, skrypty lokalne.
Nie dodawaj CDN, analityki, crash-reportingu ani automatycznego update-checkera.

Waliduj Host do używanego lokalnego adresu. Nie włączaj CORS wildcard.
Przeglądarka i API ten sam origin; w dev użyj proxy Vite.
Dla operacji zmiany danych sprawdzaj Origin, Content-Type i token CSRF
wiązany z lokalną sesją przeglądarki. Samo localhost nie usuwa ryzyka
wywołania przez obcą stronę. Mechanizm ma być prosty, bez kont użytkowników.
Zabezpiecz odczyty przed dostępem obcego originu, nie wystawiaj surowych plików.

Renderuj importowane teksty jako tekst, nie HTML. Bez niekontrolowanego
dangerouslySetInnerHTML. Stałe zapytania SQL i parametry, limity żądań,
brak tras do odczytu dowolnej ścieżki. Produkcyjny CSP ma pozwalać na własne
zasoby, bez zewnętrznych domen. Testy opisuje Q3.

Lokalne dane nie są automatycznie zaszyfrowane. Dostęp do konta systemowego
lub dysku może dawać dostęp do bazy. Nie projektuj własnej kryptografii w MVP.
Kopie na tym samym dysku nie chronią przed utratą komputera.
