# Dane, kontrakty i niezawodność
## D1. Zasady
SQLite jest źródłem prawdy. Jeden lokalny proces aplikacji i wiele możliwych
kart przeglądarki. Włącz foreign_keys i WAL, ustaw busy_timeout.
Każdy zapis logiczny jest transakcją. Po błędzie rollback bez cichego
zastąpienia bazy pustą. Daty zdarzeń ISO UTC; harmonogram dodatkowo ma
lokalną datę YYYY-MM-DD i strefę IANA użytkownika.

Dokładny SQL tworzy T02. Poniższe pola są kontraktem zachowania, nie
narzucają niepotrzebnej normalizacji. Encje JSON też muszą mieć schemat Zod.
Odpowiedzi językowe: Unicode, nowe linie i polskie znaki zachowane dokładnie.
Nie normalizuj oryginału w miejscu; wersja do wyszukiwania może być pomocnicza.

## D2. Encje
| Encja | Minimalne pola |
| --- | --- |
| settings | schemaVersion, timezone, fontSize, repeatEnabled, repeatOffsetsDays |
| sessions | id UUID, startedAt, endedAt?, energy?, status |
| attempts | id, sessionId?, cardId, cardVersion, promptSnapshot, family, partition, mode, status, revision, currentText, createdAt, updatedAt, completedAt?, sourceAttemptId?, constraints, selfRatings? |
| attemptVersions | id, attemptId, text, createdAt, reason, assistanceLevelAtCapture |
| assistanceEvents | id, attemptId, level, kind, revealedContentSnapshot, requestedAt, deliveredAt?, status |
| exposures | id, cardId, cardVersion, attemptId, shownAt, kind |
| documents | id, title, currentText, revision, createdAt, updatedAt, source=own/sample |
| documentVersions | id, documentId, text, createdAt, reason |
| dueReviews | id, sourceAttemptId, offsetDays, dueLocalDate, timezone, state |
| migrationHistory | version, appliedAt |
| importBatches | id, sourceDigest, importedAt, recordCount |

attempt.mode: training | independent | repeat.
attempt.status: draft | completed | skipped | abandoned.
assistanceEvent.status: prepared | delivered | failed.
W MVP pomoc pochodzi z kart, ale zapis eventów nie ma zakładać dostawcy LLM.
attempt.promptSnapshot przechowuje wybraną instrukcję i bodziec z wariantem,
żeby aktualizacja pakietu nie zmieniła historycznego zadania.
Pomoc pobieraj oddzielnie; snapshot widoczny w niezależnym trybie jej nie zawiera.
sourceAttemptId może prowadzić do poprzedniej próby; nie nadpisuje jej.

Przed ujawnieniem pomocy zachowaj pre_hint version. Przy ukończeniu final;
przed świadomą większą edycją zachowaj manual version. Autosave aktualizuje
currentText, nie tworzy wersji po każdym znaku. Dla ukończonej próby edycja
tworzy osobną wersję, pierwotny final zostaje. Dla dokumentu utwórz wersję
przed zastąpieniem całości i przy świadomym zapisie wersji.
Nie buduj nieskończonego keyloggera ani nagrania pisania.

Niezależność jest informacją o zarejestrowanej pomocy w aplikacji.
Nie oznacza, że program potrafi wykluczyć pomoc używaną poza nim.
Każda próba pokazuje etykietę z assistanceEvents, nie heurystyczną ocenę tekstu.
Jeżeli doręczenie podpowiedzi jest niepewne po awarii, oznacz pomoc jako
możliwie ujawnioną; nie zaliczaj próby do pewnych prób bez pomocy.

## D3. Minimalne API
Wspólny błąd: { error: { code, message, retryable } }. Nie zwracaj stacktrace,
ścieżek prywatnych ani tekstów z innych dokumentów. Listy mają paginację
limit <=100, body zwykłego zapisu <=128 KiB; pojedynczy tekst <=50 000 znaków.
Walidacja błędu zachowuje wpisany tekst w kliencie.

| Metoda i trasa | Kontrakt |
| --- | --- |
| GET /api/health | Wersja aplikacji/schema i zdrowie, bez treści danych |
| GET /api/bootstrap | Ustawienia, stan szkicu, token CSRF, informacja o trybie |
| GET /api/cards?family=... | Karty treningowe bez pełnej rezerwy i bez przykładów |
| POST /api/sessions | Rozpoczyna sesję; zwraca id i 3 proponowane próby |
| PATCH /api/sessions/:id | Kończy/porzuca sesję; nie kasuje prób |
| POST /api/attempts | Tworzy próbę, przyjmuje clientRequestId do deduplikacji |
| POST /api/attempts/:id/shown | Idempotentnie zapisuje ekspozycję |
| PATCH /api/attempts/:id | text, expectedRevision, clientMutationId; zwraca nową revision |
| POST /api/attempts/:id/hints | Żądany poziom i revision; utrwala pre_hint oraz event, zwraca pomoc |
| POST /api/attempts/:id/hints/:eventId/delivered | Potwierdza pokazanie; idempotentnie |
| POST /api/attempts/:id/complete | Kończy raz, tworzy final i harmonogram w transakcji |
| GET /api/attempts | Filtry mode/family/assistance; lista |
| GET /api/attempts/:id | Własna próba, wersje i etykiety pomocy |
| POST /api/independent | Dobiera niewidziany bodziec z rezerwy i tworzy próbę |
| GET/POST /api/documents | Lista / nowy tekst |
| GET/PATCH /api/documents/:id | Odczyt / CAS revision i nowa wersja gdy potrzebna |
| GET /api/reviews | Co najwyżej wskazówki powrotu na bieżący dzień |
| PATCH /api/settings | Walidacja ustawień |
| POST /api/backup | Tworzy kontrolowaną migawkę |
| GET /api/export | Pobiera wersjonowany eksport JSON |

API importu można dodać w T07 jako preview + confirm. Destrukcyjne przywracanie
całej bazy wyłącznie w narzędziu przy zatrzymanym serwerze. Nie implementuj
dowolnego plikowego API. Wszystkie operacje zmiany z ochroną A5.

409 revision_conflict: zwróć aktualną rewizję i bezpieczny opis. UI zachowuje
lokalny tekst, oferuje kopię obok wersji serwera, nigdy automatyczne last-write-wins.
clientMutationId z poprzedniego potwierdzonego zapisu zwraca ten sam wynik;
nie zwiększa rewizji drugi raz. Zmiana treści z tym samym ID to błąd.

## D4. Autosave, awaria i bufor
Domyślnie 600 ms po zakończeniu pisania; jedno żądanie w locie na dokument.
Zmiany powstałe w trakcie czekania łącz w kolejny zapis. Nie zapisuj przy
każdym naciśnięciu klawisza. Każde żądanie ma expectedRevision i mutationId.
Koniec ćwiczenia najpierw czeka na flush, potem complete. Jeśli flush
nie przejdzie, nie pokazuj ukończenia.

Przy braku połączenia zachowaj tekst w pamięci i mały bufor ratunkowy
IndexedDB: id, baseRevision, text, updatedAt, environmentId.
Jest tylko awaryjną kopią bieżących szkiców, nie historią wszystkich danych.
Normalny zapis potwierdzony przez serwer usuwa odpowiedni bufor.
W przeglądarce bez działającego bufora pokaż ograniczenie i Kopiuj tekst.
Nie obiecuj gwarancji zachowania znaków, które nigdy nie dostały potwierdzenia.

Po wznowieniu zaproponuj odzyskanie; porównaj rewizję serwera. Przy konflikcie
stwórz odrębną wersję, nie nadpisuj. Limit bufora: 10 szkiców, łącznie 1 MiB.
Nie usuwaj niezapisanych danych w ciszy przy przekroczeniu limitu: pokaż
komunikat i eksport/kopiowanie. Oddziel testowy environmentId od użytkowego.
Nie wykorzystuj beforeunload jako jedynego sposobu zapisu.

## D5. Migracje i aktualizacje
Migracje numerowane, monotoniczne, małe, ze schematem wersji aplikacji.
Przed zmianą już istniejącej bazy utwórz migawkę i sprawdź ją.
Uruchom migrację w transakcji; po błędzie zachowaj starą bazę.
Jeżeli nowy program nie rozumie nowszego schematu, pokaż czytelny komunikat,
nie cofaj bazy i nie twórz pustej pod tą samą nazwą.

Nie dodawaj fikcyjnych migracji produkcyjnych wyłącznie dla testu.
Testuj mechanizm rollback na testowej migracji; test historyczny dodaj
wtedy, gdy faktycznie powstanie druga wersja schematu.
Zmiana pakietu ćwiczeń nie może przepisywać starych promptSnapshot.

## D6. Kopie i odtwarzanie
Użyj sqlite.backup do pliku tymczasowego w backups, potem integrity_check
na kopii i atomowej zmiany nazwy [S2, S5]. Nie kopiuj aktywnego .sqlite
ignorując WAL. Błąd kopii nie usuwa danych. Nie oznaczaj pliku jako gotowego
przed zakończeniem walidacji.

Automatycznie: przed migracją/importem oraz po pierwszej ukończonej sesji
danego dnia. Retencja zwykłych automatycznych kopii: ostatnie 14 udanych
dni z kopią. Kopie ręczne i sprzed migracji nie są samoczynnie usuwane.
Informuj o ich rozmiarze; czyszczenie ręczne z podglądem.
Tymczasowe nieudane kopie można usuwać tylko jako własne .tmp,
nigdy jako jedyną istniejącą poprawną kopię.

Eksport JSON: formatVersion, appVersion, exportedAt, dane i powiązania.
Bez kluczy, cache i logów. Limit importu MVP: 25 MiB; pokaż jasny komunikat,
nie próbuj wczytywać bez limitu. Plik eksportu nie jest zaszyfrowany.

Import w trybie scalania:
1. Wczytaj do przestrzeni tymczasowej i waliduj cały schemat oraz FK.
2. Wyświetl liczby rekordów, konflikty i brakujące typy.
3. Domyślnie pomiń identyczne id+treść; przy różnych danych z tym samym id
   zachowaj obie wersje, nadając nowe ID całej kolidującej grupie i przemapuj FK.
4. Przy wieloznacznej referencji przerwij z błędem; nie zgaduj.
5. Po zatwierdzeniu utwórz kopię i wykonaj jedną transakcję.
6. Zachowaj sourceDigest/importBatches; ponowny ten sam import jest idempotentny.
7. Nie zmieniaj ustawień użytkownika automatycznie przy scalaniu.

Restore pełnej bazy: serwer zatrzymany, sprawdzenie kopii, zachowanie obecnej
bazy pod nową nazwą, przełączenie atomowe, smoke test. Przy błędzie powrót.
Instrukcja musi działać na ścieżkach ze spacjami i nie zawierać niejawnego rm.
Rzeczywiste odtworzenie w pustym testowym folderze jest warunkiem odbioru.

Dodatkowa kopia na innym nośniku pozostaje wyborem użytkownika.
Repozytorium nie zastępuje backupu jego danych.
