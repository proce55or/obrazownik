# Produkt i zachowanie
## P1. Intencja
Użytkownik chce odzyskać lub rozwinąć swobodę obrazowania w pisaniu.
Nie zakładaj, że jego obecny styl jest obiektywnie gorszy. Oszczędny tekst
może być świadomą, dobrą decyzją. Aplikacja zwiększa repertuar możliwości:
łatwiej znaleźć słowo, połączyć zjawiska, zbudować konkretną scenę,
zmienić perspektywę i świadomie wybrać wersję.

Czynności użytkownika są sednem produktu. Aplikacja podaje bodziec,
prowadzi pytaniami, umożliwia powrót i zachowuje własne rozwiązania.
Nie poprawia automatycznie na bardziej kwieciste.

Trzy odrębne cele: dostęp do słów, tworzenie relacji i samodzielne pisanie.
Nie łącz ich w jeden liczbowy wynik zdrowia lub talentu.

## P2. Zakres pierwszej wersji
- Jedna lokalna osoba, bez konta i profilu medycznego.
- Pięć rodzin ćwiczeń opisanych w E1–E5.
- Krótka sesja proponująca 3 zadania; można zrobić jedno albo więcej.
- W każdej chwili przerwa, zmiana zadania i pominięcie bez kary.
- Podpowiedzi dostępne po kliknięciu, nigdy automatycznie.
- Zeszyt odpowiedzi i własnych tekstów; wyszukiwanie zwykłego tekstu.
- Powroty do wybranych bodźców i oddzielny tryb nowego pisania bez pomocy.
- Zapis, status zapisu, przywracanie szkicu, eksport/import i lokalne kopie.
- Widok historii oraz krótkie samooceny. Nie ma rankingu poezji.

Brak licznika dni bez przerwy, punktów, leaderboardu, obowiązkowych norm,
odliczania czasu i czerwonych ocen. Czas może być prywatną informacją
pomocniczą; nie staje się presją ani dowodem sprawności.

## P3. Ekrany
| Ekran | Zawartość | Główna czynność |
| --- | --- | --- |
| Dzisiaj | Rozpocznij, kontynuuj szkic, wybierz rodzinę; max 3 sugestie | Zacznij |
| Ćwiczenie | Jedno polecenie, bodziec, edytor, opcjonalna pomoc, status zapisu | Zapisz i zakończ |
| Samodzielna próba | Nowy temat, edytor, brak podpowiedzi i przykładów | Zapisz próbę |
| Zeszyt | Własne teksty i odpowiedzi, filtry rodzin i wsparcia | Otwórz |
| Obserwacje | Porównanie własnych próbek, samooceny i wykorzystanie pomocy | Zobacz teksty |
| Ustawienia i kopie | Wielkość pisma, ruch, folder danych, eksport/import | Utwórz kopię |

Nie pokazuj technicznych parametrów LLM w podstawowym interfejsie.
Nazwy tabel, tokenów i frameworków należą do dokumentacji, nie ćwiczeń.
Informacja o folderze danych jest użyteczna w ustawieniach.

## P4. Przebieg ćwiczenia
1. Wybierz krótką sesję albo rodzinę. Opcjonalnie oznacz energię niska/średnia/wysoka; można pominąć.
2. Zobacz jedno polecenie, np. Połącz okno i oddech w krótkim obrazie.
3. Napisz pierwszą odpowiedź. Puste pole można bez konsekwencji opuścić.
4. Jeśli chcesz, wybierz pomoc. Pierwsza pomoc jest pytaniem o właściwość.
5. Możesz zachować pierwszą wersję i napisać następną.
6. Zakończ. Opcjonalnie oceń łatwość i zgodność z własnym głosem.
7. Wybierz: koniec, następne ćwiczenie, dodaj do zeszytu, wróć kiedyś.

Samooceny: łatwość 1–5, moje brzmienie 1–5, zmęczenie 1–5; każda
opcjonalna, podpisane skrajne wartości. Można zamiast tego napisać notatkę.
Nie wnioskuj z pominięcia o trudności. Nie interpretuj zmęczenia klinicznie.

## P5. Dostępność
- Jedno główne zadanie na ekranie i krótkie zdania instrukcji.
- Czytelny font systemowy, domyślnie 18 px, regulacja 16–26 px.
- Wygodne odstępy, kontrast celu WCAG AA, przyciski minimum 44 px.
- Poprawna obsługa klawiatury, etykiety pól, widoczny fokus.
- Nie polegaj tylko na kolorze. Status zapisu spokojny, bez migania.
- Układ od 320 px; działanie przy powiększeniu 200%.
- Brak konieczności przeciągania; erasure działa także wyborem i przyciskami.
- Nie czytaj każdego autosave przez aria-live. Ogłaszaj zmianę stanu/błąd z umiarem.
- Poszanowanie prefers-reduced-motion, brak zbędnych animacji.
- Nie wymagaj zamknięcia oczu ani rzeczywistego widzenia obrazu w wyobraźni.
  Można budować obraz ze słów, relacji, pamięci i obserwacji.
- Bez medycznej ankiety na starcie. Instrukcja może mówić o treningu pisania.

## P6. Pierwsze uruchomienie i błędy
Start: wyjaśnij, że teksty pozostają na tym komputerze; wskaż ustawienia kopii.
Pozwól od razu spróbować zadania. Nie żądaj importu dawnych wierszy.

Zapis: stany Zapisywanie, Zapisano, Brak połączenia z lokalną aplikacją,
Nie udało się zapisać. Przy błędzie zachowaj edytor i zaoferuj skopiowanie
tekstu. Nie pokazuj sukcesu przed odpowiedzią API.

Awaria serwera: lokalny bufor ratunkowy w przeglądarce może pomóc,
ale nie jest kopią danych ani drugą równorzędną bazą. Jego reguły opisuje D4.
Aktualizacja programu nie może kasować folderu danych.

## P7. Użyteczność a skuteczność
Po działającej wersji wykonaj mały pilotaż z autorem: czy rozumie polecenia,
czy pomoc pobudza jego odpowiedź, czy chętnie wraca, czy łatwiej zaczyna pisać.
Nowe próby porównuj z własnymi wcześniejszymi próbkami. Zmiana pojedynczej
samooceny lub stylometrii nie dowodzi rehabilitacji. Jeśli powstanie cel
kliniczny, wymaga osobnego opracowania z właściwymi specjalistami.
