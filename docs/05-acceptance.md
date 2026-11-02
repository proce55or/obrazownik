# Weryfikacja
## Q1. Definicja ukończenia MVP
T00–T09 mają sprawdzone kryteria lub jawnie opisany brak dostępu do sprzętu.
Nie ogłaszaj zgodności z iMaciem, jeśli przeprowadzono wyłącznie Linux CI.

- Start lokalny bez konta i płatnego API.
- Cała sesja wszystkich rodzin działa bez Internetu.
- Szkic przetrwa restart serwera i odświeżenie przeglądarki po potwierdzonym zapisie.
- Pomoc jest dobrowolna, odnotowana i nie zmienia pierwszej wersji.
- Próba niezależna używa nowego bodźca, nie podsuwa przykładów.
- Historia pokazuje własne teksty i użyte wsparcie bez oceny artystycznej.
- Eksport/import i odtworzenie kopii sprawdzono na syntetycznych danych.
- Dane pozostają poza repo; staged diff nie zawiera prywatnych treści.
- Interfejs działa klawiaturą, przy 200% i w wąskim układzie.
- Pamięć projektu mieści się w limicie.

## Q2. Testy istotnych reguł
Nie przyjmuj celu 100% coverage. Testuj rzeczywiste ryzyka.
Vitest: dobór kart, ekspozycje, klasyfikacja pomocy, odstępy dat, walidacja.
Integracyjne API: SQLite w tmpdir, transakcje, backup, import i konflikty.
Playwright: kilka ścieżek użytkownika, nie snapshot każdej etykiety.

| Scenariusz | Wymagany wynik |
| --- | --- |
| Pomoc poziomu 1, zamknięcie panelu, dalsze pisanie | Nadal zapis pomocy i wersja sprzed niej |
| Pokaż przykład po dwóch pytaniach | Odpowiedź oznaczona po przykładzie |
| API pomocy zawiedzie przed wyświetleniem | Bez fałszywego pewnego braku pomocy; event opisuje stan |
| Dwa równoczesne zapisy tej samej revision | Jeden sukces, jeden konflikt; oba teksty możliwe do odzyskania |
| Powtórzone complete lub mutationId | Brak duplikatu próby, wersji final i powrotów |
| Przerwanie sesji | Próby zachowane, brak kary i przymusowej zaległości |
| Pominięta karta rezerwowa | Kolejna próba nie przedstawia jej jako nowej |
| Aktualizacja pakietu treści | Stare zadanie odczytane z snapshot |
| Zmiana czasu w Europe/Warsaw | Powrót zachowuje oczekiwaną datę kalendarzową |
| Import z nieobsługiwaną wersją | Nic nie zmieniono, jasny komunikat |
| Import tej samej kopii dwukrotnie | Brak zduplikowanych rekordów |
| Backup i restore do innego tmpdir | Zgodne treści, wersje, zdarzenia i powiązania |
| Awaria migracji testowej | Poprzedni stan czytelny, brak częściowej migracji |

## Q3. Ochrona danych
- Zmiana ze złego Origin lub bez CSRF odrzucona.
- Host niezgodny z konfiguracją odrzucony, CORS nie jest wildcard.
- Próba path traversal nie odczytuje pliku.
- Wstawione HTML/script w tekście wyświetlane literalnie.
- API nie zwraca całej prywatnej bazy na endpointach diagnostyki.
- Logi nie zawierają treści odpowiedzi, kluczy ani body żądań.
- Cała sesja z kontrolą ruchu przeglądarki nie wysyła nic poza localhost.
- Połączenia nasłuchujące tylko lokalnie.
- Testy nigdy nie dotykają ~/Obrazownik-dane.
- Repo-check kontroluje tracked oraz staged, nie tylko .gitignore.

## Q4. Testy użytkowe i Mac
Test ręczny na iMacu, zapisany w dokumencie krótszym niż 1 KiB:
wersja systemu, Node, przeglądarka, commit, scenariusz, wynik, data.
Nie dołączaj historii dokumentów ani osobistych tekstów.

1. Start-Obrazownik.command z folderu, którego ścieżka ma spację.
2. Utworzenie odpowiedzi z ąęćłńóśźż i nowymi liniami.
3. Pomoc, zapis, zamknięcie procesu i ponowne otwarcie.
4. Odczyt tej samej odpowiedzi i informacji o pomocy.
5. Brak Internetu przy zachowanym lokalnym procesie; pełna sesja.
6. Kopia, odtworzenie w testowym katalogu, porównanie.
7. Klawiatura, 200%, szerokość 320 i 390 px.
8. Błąd zapisu i konflikt dwóch kart bez utraty tekstu.

Orientacyjne cele wydajności, nie obietnica bez pomiaru:
reakcja edytora bez zauważalnych przycięć, typowy lokalny autosave <500 ms
po wysłaniu, start produkcyjny <5 s na docelowym Macu przy małej bazie.
Mierz bez LLM. Użyj syntetycznych 10 000 krótkich prób i paginacji do kontroli
skalowania; nie trzymaj ich w pamięci projektu ani Git.
Jeśli cele nieosiągnięte, zmierz wąskie gardło, nie przepisuj na Rust z góry.

## Q5. Pilotaż po uruchomieniu
Przykład organizacji, do dopasowania do energii i preferencji:
- Przez pierwszy tydzień 2–3 krótkie niezależne próbki i oswojenie interfejsu.
- Przez 3–4 tygodnie dobrowolne sesje około 5–15 minut kilka razy w tygodniu.
- Raz w tygodniu nowa niezależna próbka w porównywalnych warunkach.
- Opcjonalnie powrót do nowego zadania po 1–2 tygodniach przerwy.

To nie dawkowanie terapii. Odpoczynek i zmiana zadania są pełnoprawnym wyborem.
Zapisz tylko to, co użytkownik chce: łatwość, własny głos, zmęczenie,
rodzaj pomocy. Nie żądaj wszystkich odpowiedzi.

Przegląd: zestaw próbki podobnej długości i tematu, w losowej kolejności,
bez daty na pierwszym ekranie. Zapytaj autora o konkretność obrazu,
swobodę wyboru, różnorodność relacji i zgodność z intencją.
Można pokazać daty później. Nie generuj automatycznej diagnozy.
Pomocny może być dobrowolny komentarz nauczyciela pisania lub specjalisty
od języka, jeśli użytkownik sam wybierze taki kontakt.

Kryterium dalszego rozwoju: użytkownik rozumie zadania, chce do nich wracać,
pomoc uruchamia jego własne odpowiedzi, a próby bez pomocy dają materiał
do oceny samodzielnej zmiany. Jeśli rośnie wyłącznie liczba ukończonych kart,
nie nazywaj tego powrotem umiejętności. Zmień bodźce lub instrukcje.

T10 może przygotować narzędzia i instrukcję, ale nie może wymyślić przyszłych
wyników pilotażu. Oczekiwanie na rzeczywiste obserwacje nie blokuje używania MVP.
