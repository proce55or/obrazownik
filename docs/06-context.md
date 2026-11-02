# Pamięć projektu i oszczędzanie kontekstu
## C1. Rozdziel trzy rodzaje pamięci
1. Pamięć projektu: cel, aktualna implementacja, następny krok. Mała i w Git.
2. Dane użytkownika: teksty, próby i preferencje. W lokalnej bazie, nie w czacie.
3. Historia kodu: Git. Nie dubluj jej w dzienniku rozmów.

Plik stanu nie może stać się transkrypcją ani magazynem wyników ćwiczeń.
Długi plan jest dokumentacją do odczytu fragmentami. Nie jest stałym
system promptem, a załączanie go w całości w każdej rozmowie marnuje kontekst.

## C2. Budżety
KiB oznacza 1024 bajty UTF-8. Bajty nie są tokenami; rzeczywisty koszt
zależy od modelu i języka. Kontroler egzekwuje bajty, a nie udaje tokenizera.

| Plik lub zbiór | Twardy limit | Zastosowanie |
| --- | --- | --- |
| AGENTS.md | 3 KiB | Procedura pracy |
| PROJECT.md | 2 KiB | Cel i niezmienne |
| STATE.md | 3 KiB | Bieżący stan |
| tasks/INDEX.md | 3 KiB | Nawigacja |
| Powyższe cztery łącznie | 10 KiB | Rdzeń każdej sesji |
| Jedna karta tasks/Txx.md | 5 KiB | Tylko bieżące zadanie |
| docs/DECISIONS.md | 4 KiB | Aktualne decyzje |
| Jeden dokument specyfikacji | 16 KiB | Czytaj potrzebne sekcje |
| Wszystkie pliki Markdown w repo | 200 KiB | Ochrona przed nową megahistorią |

Normalna sesja: rdzeń + jedna karta, zwykle znacznie poniżej limitu 15 KiB.
Potem jedna potrzebna sekcja, orientacyjnie do 6 KiB, oraz właściwy kod.
Budżet nie oznacza obowiązku wypełnienia plików do limitu.
Nie zwiększaj limitów, żeby ominąć błąd check-context.

Kontroler obejmuje wszystkie pliki .md/.markdown poza zależnościami,
buildami i katalogami lokalnymi. Nowy wielki MEMORY.md też ma spowodować
błąd. Nie obchodź tego zmianą rozszerzenia na .txt/.json albo wklejeniem
historii do komentarzy kodu. Pliki danych mają odrębne przeznaczenie.

## C3. Algorytm rozpoczęcia
1. Sprawdź, gdzie jesteś: lokalny Mac, środowisko chmurowe, istniejące repo.
2. Otwórz cztery pliki rdzenia. STATE może być nieaktualny.
3. Sprawdź git status --short, ostatnie kilka commitów i konkretne zmienione pliki.
4. Otwórz aktywną kartę. Jeśli status DONE, wybierz pierwszą gotową zależnościami.
5. rg po identyfikatorze funkcji/zadania, nie odczyt całego src.
6. Otwórz tylko wskazaną sekcję dokumentacji i potrzebne zależności kodu.
7. Wykonaj najmniejszy kompletny krok z istotnym sprawdzeniem.

Nie czytaj na starcie całego lockfile, pełnych logów, wszystkich testów,
starych raportów badawczych i pozostałych kart. Nie streszczaj ich cyklicznie.
Źródła internetowe sprawdzaj ponownie tylko przy realnej niepewności
lub zmianie zależności, nie w każdej turze.

## C4. Aktualizacja po pracy
STATE.md ma zawierać:
- Active task, status, środowisko i gałąź;
- działające zachowania, maksymalnie 5 krótkich punktów;
- wykonane komendy testów i wynik, najwięcej 3 pozycje;
- niewiadome/blokery, maksymalnie 3;
- następne 1–3 konkretne kroki z nazwą pliku;
- uwagi o niezacommitowanych zmianach, jeśli są.

Nie wpisuj daty wykonania testu, którego nie było. Last verified code commit
ma oznaczać hash rzeczywiście testowanego kodu. Jeśli testowano working tree,
zapisz to jawnie; nie twórz samoodnoszącego hash dla przyszłego commitu stanu.
Wyniki sprzed późniejszej edycji plików nie są automatycznie aktualne.

Przy zmianie decyzji zaktualizuj właściwą specyfikację i krótki wpis w
DECISIONS.md: data, decyzja, powód, konsekwencja. Stare wersje są w Git,
nie dopisuj całej dyskusji. Nie potrzebujemy osobnego archiwum czatów.

## C5. Gdy kończy się kontekst
Zatrzymaj się po małym, spójnym kroku. Zapisz STATE przed dodatkowym kodem.
Utrwal dokładną następną czynność, np. Dokończ walidację importu w
src/server/backup/import.ts, następnie test duplikatów. Nie pisz ogólnego kontynuuj.

Uruchom kontroler. Skróć stare listy, usuń powtórzenia, przenieś wyłącznie
trwałą specyfikację do właściwej sekcji. Nie przenoś całego dziennika.
Sprawdź diff, a jeśli bezpieczne, wykonaj lokalny commit.
Nowemu modelowi wystarczy prompt wznowienia i dostęp do plików.

Zapis stanu wymaga narzędzi plikowych lub commitów. Żaden prompt nie daje
trwałej pamięci modelowi bez tego dostępu. Jeśli środowisko jest tylko czatem,
wygeneruj mały STATE.md do pobrania, oznaczając brak implementacji i testów.
Nie udawaj, że zapisano na iMacu plik utworzony tylko w chmurze.
