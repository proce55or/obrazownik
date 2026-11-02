# 03. Wdrożenie dodatku w działającej aplikacji

## 1. Zasady nadrzędne

To plan modyfikacji istniejącego Obrazownika. Stan kodu na Macu nie został sprawdzony podczas przygotowywania dodatku. Wcześniejszy plan przewidywał React/TypeScript, lokalny serwer i SQLite; nie przyjmuj, że rzeczywisty projekt nadal dokładnie tak wygląda.

Zachowaj aktualny stos, prywatność repozytorium, działanie offline, lokalne teksty i dotychczasowy workflow. Nie resetuj projektu do zadania T00. Nie instaluj LLM, API ani silnika NLP tylko w celu spełnienia tego dodatku.

Najważniejsze są: zachowanie własnego głosu, możliwość uzyskania pomocy, poprawna polszczyzna kart i obserwacja samodzielnego pisania poza treningiem. Informacja o nauce należy do sekcji O ćwiczeniu, nie do każdego ekranu pracy.

## 2. Etapy i kryteria ukończenia

| Etap | Zakres | Kryterium ukończenia |
|---|---|---|
| SCI-00 | Inwentaryzacja kodu i danych | Krótka mapa istnieje / częściowo / brak; aktualna gałąź, testy i ograniczenia opisane; brak przebudowy |
| SCI-01 | Pochodzenie metod, pomoc i ekspozycja | Istniejące rekordy zachowane, nieznana pomoc pozostaje nieznana, testy migracji i eksportu przechodzą |
| SCI-02 | Dopracowanie E1 oraz E3 | Mała paczka istniejących lub nowych kart po polsku, sprawdzona rekcja, zapis wersji sprzed pomocy, pełny przebieg offline |
| SCI-03 | Pomiar nowego pisania E6 | Rozdzielone zbiory, ochrona niewidzianych tematów, podsumowanie bez wyniku poetyckości |
| SCI-04 | Opcjonalne warianty E2 i poprawka E5 | M2/M3/M5 włączane oddzielnie; własne przykłady, możliwość dopisywania słów; test autorstwa i pomocy |
| SCI-05 | Użyteczność i przekazanie | Krótki przegląd językowy, instrukcja pilotażu, sprawdzona kopia danych, zamknięcie aktywnego zadania |

Nie twórz sześciu zadań w pamięci sesji naraz. W indeksie wystarczą identyfikatory i statusy, a pełny opis znajduje się tutaj. Po ukończeniu etapu wykonaj następny, jeżeli nie wymaga nowej decyzji użytkownika.

SCI oznacza etap dodatku, nie nowy obowiązkowy format zadań. W dostarczonym wcześniej skrypcie check-context aktywne zadanie ma format Txx. Dopisz etap SCI do następnego wolnego zadania Txx zgodnie z aktualnym workflow; nie zmieniaj pola Active task na nieobsługiwany identyfikator. Kartę bieżącego zadania utrzymaj poniżej 5 KiB.

### SCI-00: szczegóły inwentaryzacji

Przeczytaj instrukcje repo, bieżący STATE i indeks. Sprawdź git status bez drukowania prywatnych tekstów lub sekretów. Znajdź schemat danych, selektor kart, obsługę pomocy, eksport oraz testy. Zapisz maksymalnie 10–15 wierszy mapowania obecnych funkcji do tego dodatku.

Nie odrzucaj cudzych niezacommitowanych zmian. Jeżeli lokalna baza wymaga migracji, najpierw utwórz spójną kopię przez mechanizm bazy lub zatrzymaną aplikację i sprawdź jej odczyt. Zwykłe kopiowanie aktywnego pliku SQLite może pominąć WAL. Kopia pozostaje poza Git.

## 3. Minimalny model danych

Użyj istniejących pól, jeżeli mają to samo znaczenie. Poniższe nazwy opisują kontrakt, nie nakazują nazw kolumn.

**Definicja metody lub rodziny kart:**

- methodId, version, language: pl.
- sourceRefs: identyfikatory R01–R22.
- basisType: clinical_adaptation, experimental_inspiration, linguistic_resource albo creative_hypothesis.
- adaptationNote: jedno lub dwa zdania o różnicy względem badania.
- validationStatus: unvalidated_polish_app_adaptation, chyba że w przyszłości rzeczywiście opublikowano badanie tej wersji aplikacji.
- contentOrigin i licenseStatus dla materiałów.

Klasyfikacja wskazuje rodzaj podstawy, nie tworzy rankingu medycznej skuteczności. Źródła i notatkę przechowuj przy wersji metody, bez kopiowania bibliografii do każdej odpowiedzi.

**Definicja karty:**

- cardId, cardVersion, methodId.
- responseMode: open_writing, closed_naming albo comprehension.
- itemFamilyId: wspólne pochodzenie treści, np. parafrazy tego samego zadania. To nie identyfikator całej rodziny ćwiczeń E1.
- setRole: training, near_transfer albo independent_writing.
- difficultyTags opisujące słowa i instrukcję, bez diagnozowania użytkownika.

**Próba i ekspozycja:**

- Identyfikator karty i jej wersji, czas oraz stan ukończenia/przerwania.
- Oryginalny tekst przed pomocą i tekst końcowy, jeśli już są zapisywane.
- Pomoc rzeczywiście pokazana: pytanie, wskazówka, przykład, bank słów; poziom oraz czas zdarzenia.
- Stan pomocy: none_confirmed, assisted, unknown. Dawne braki danych nie stają się none_confirmed.
- Zdarzenia ekspozycji na treść. Samo wyświetlenie w podglądzie również oznacza, że temat nie jest już niewidziany.
- Opcjonalna samoocena i komentarz, bez wymuszania profilu medycznego.

Jeżeli interfejs mógł pokazać pomoc, a potwierdzenie zapisu nie dotarło, oznacz niepewność. Pusta lista zdarzeń nie jest wystarczającym dowodem samodzielności. Stosuj idempotentne identyfikatory zdarzeń i aktualny mechanizm snapshotów, jeżeli już istnieją.

Wyliczone widoki postępu mają dać się odtworzyć z zapisanych prób. Nie nadpisuj dawnych wyników przy zmianie metody, listy dopuszczalnych odpowiedzi czy algorytmu.

## 4. Trzy odrębne pytania o efekty

| Widok | Pytanie | Materiał |
|---|---|---|
| Utrzymanie | Czy wracam do wcześniej ćwiczonego słowa lub sposobu pracy? | Znane karty, jawnie oznaczone powtórki |
| Bliskie przeniesienie | Czy korzystam z podobnej umiejętności na innym materiale? | Nowe słowa lub sceny powiązane z treningiem |
| Samodzielne pisanie | Czy łatwiej tworzę własny tekst w nowej sytuacji? | Nowe tematy bez przykładów i banku słów |

Trzecia kategoria jest najbliższa celowi produktu, ale jej prosta obserwacja nie dowodzi klinicznej skuteczności. Nowy temat może naturalnie przywoływać trenowane słowo. Nie dyskwalifikuj takiego tekstu; oznacz powiązanie, jeśli jest znane. Rozróżniaj nowy temat od nowego typu zadania.

### Ochrona niewidzianych tematów

- Osobny zbiór niezależnego pisania nie trafia do treningu ani demonstracji.
- Parafrazy tej samej treści mają wspólny itemFamilyId. Zmieniony identyfikator nie czyni treści nową.
- Selektor uwzględnia historię ekspozycji, wersje i rodzinę treści.
- Po wykorzystaniu tematu nie przedstawiaj go ponownie jako niewidzianego. Powtórka może nadal być użyteczna, lecz ma inny status.
- Po wyczerpaniu zbioru pokaż ten fakt i zaproponuj nową zredagowaną paczkę, zamiast po cichu używać starych tematów.
- Zmienione karty i ich powiązania muszą przechodzić przez eksport/import.
- Brak pewnej historii starszej instalacji oznacza unknown, nie nowy materiał.

Nie potrzebujemy detektora podobieństwa opartego na LLM. Na początek wystarczy ręczne grupowanie kart i testy selektora.

## 5. Pilotaż osobisty, bez udawania badania klinicznego

Propozycja organizacyjna do dobrowolnego stosowania:

1. Zbierz kilka nowych próbek pisania w różnych dniach przed włączeniem dodatkowych wariantów. Dotychczasowy trening zapisz jako kontekst, nie wymazuj go.
2. Przez kolejne tygodnie zachowaj podobne warunki i wprowadzaj po jednej zmianie. Można zacząć od E1/E3, a dopiero później dodać M3 lub M5.
3. Co pewien czas, np. dwa razy w tygodniu, napisz nową próbkę bez podpowiedzi. Częstotliwość jest ustawieniem produktu, nie zaleceniem medycznej dawki.
4. Porównuj osobno nowe pisanie i ćwiczone zadania. Notuj przerwy, zmianę wersji oraz użycie pomocy.
5. Po okresie obserwacji wybierz, które ćwiczenia są pomocne i warte kontynuowania. Brak zmiany nie oznacza, że użytkownik ćwiczył źle.

Dopuszczalne, opcjonalne samooceny 1–5: możliwość wyrażenia intencji, poczucie własnego głosu i odczuwany wysiłek. Pokaż opisy końców skali; nie sumuj ich do wyniku sprawności. To skale robocze bez ustalonych norm i progu klinicznie istotnej zmiany.

Przy porównaniu tekstów można ukryć daty i losować kolejność, żeby zmniejszyć oczekiwania oceniającego. Bez zgody autora nie wysyłaj tekstów osobie trzeciej ani do API. Dodatkowa ocena specjalisty jest osobną decyzją.

Nie stosuj domyślnie testów istotności na kilku próbkach jednej osoby. Pokaż próbki, rozrzut samoocen, udział pomocy i liczbę obserwacji. Temat, zmęczenie i uczenie się samego zadania mogą zmieniać wynik. Prosty układ przed/po nie ustala przyczynowości.

## 6. Testy, które mają znaczenie

1. **Migracja:** otwarcie kopii starej bazy zachowuje tekst, daty, identyfikatory i istniejące metadane; ponowne uruchomienie nie duplikuje danych.
2. **Pomoc:** ujawniony przykład nigdy nie daje none_confirmed; niepewna dostawa daje unknown; ponowienie zdarzenia jest bezpieczne.
3. **Niewidziany materiał:** trening, podgląd, parafraza i import historii wpływają poprawnie na status; wyczerpany zbiór nie resetuje się.
4. **Polszczyzna:** poprawne przyimki, się i przypadki w kartach M4; pełny zapis ąęćłńóśźż; brak automatycznej zamiany oryginalnego tekstu.
5. **Rodzaj odpowiedzi:** wynik zamkniętego nazywania nie staje się wynikiem otwartego pisania; poprawna odmiana nie jest odrzucana przez prosty exact match.
6. **Eksport/import i kopia:** odtworzone dane zachowują wersje, pomoc i ekspozycję. Surowe teksty nie trafiają do Git, logów CI ani snapshotów testowych.
7. **Przebieg:** rozpoczęcie, przerwanie, wznowienie i zapis działają offline; klawiatura i powiększony tekst umożliwiają wykonanie ćwiczenia.

Testy obejmują nowe lub zmienione zachowania. Nie przepisuj całego zestawu testów tylko dlatego, że powstał appendix. Używaj sztucznych tekstów w fixture’ach.

## 7. Ograniczenie pamięci i tokenów

Utrzymaj istniejące limity: AGENTS.md do 3 KiB, PROJECT.md do 2 KiB, STATE.md do 3 KiB, tasks/INDEX.md do 3 KiB; razem maksymalnie 10 KiB. Każdy moduł dokumentacji do 16 KiB, pojedyncza karta zadania do 5 KiB, wszystkie Markdown w repo do 200 KiB, jeśli są to nadal reguły projektu.

Na początku sesji: podstawowe instrukcje + STATE + indeks + jedno zadanie. Appendix czytaj sekcjami. Bibliografia i pełne artykuły tylko wtedy, gdy etap ich wymaga.

STATE zastępuje poprzednie podsumowanie, nie dopisuje transkrypcji. Zapisz: aktywny etap, skończone zmiany, konkretne wyniki testów, blokadę i następny krok. Jedna decyzja ma jedną krótką notatkę; historię zmian kodu przechowuje Git.

Nie kopiuj skonsolidowanego appendixu do repo obok modułów. Nie twórz dokumentu ze wszystkimi wyjściami narzędzi, PDF-ami czy streszczeniami każdej sesji. Jeśli dostępny jest scripts/check-context.mjs, uruchom go; jeśli nie, sprawdź te same limity prostym licznikiem UTF-8.

## 8. Definicja gotowości tej modyfikacji

Użytkownik może przejść dopracowane polskie ćwiczenie, otrzymać pomoc i zachować własny tekst; nowa próbka pisania ma wiarygodnie oznaczoną ekspozycję i pomoc. Interfejs nie obiecuje odzyskania sprawności, a sekcja O ćwiczeniu podaje rzeczywisty rodzaj podstawy naukowej.

Model kończący etap opisuje zmienione zachowanie, testy i ograniczenia. Nie pisze, że aplikacja jest naukowo zwalidowana. Nie publikuje repozytorium i nie wysyła prywatnych tekstów w ramach tego dodatku.
