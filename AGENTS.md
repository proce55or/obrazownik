# Instrukcja dla wykonawcy
Czytaj na początku każdej sesji. Aktualne polecenie użytkownika ma pierwszeństwo.

1. Cel: własny trening języka obrazowego. Nie buduj generatora wierszy, diagnostyki ani rankingu talentu.
2. Start kontekstu: ten plik, PROJECT.md, STATE.md, tasks/INDEX.md i jedna aktywna karta. Specyfikacje czytaj po nagłówkach wskazanych w karcie.
3. Najpierw sprawdź git status i rzeczywiste pliki. Nie nadpisuj cudzych zmian. Brak kodu oznacza rozpoczęcie od T00.
4. Jedno aktywne zadanie. Wykonuj kod, test i zapis stanu. Po sukcesie możesz przejść dalej bez pytania o rutynowe kroki.
5. Kod w repo prywatnym. Dane i sekrety poza repo. Brak automatycznej publikacji, telemetrii, konta chmurowego, API i pobierania modeli.
6. MVP: React/TypeScript + lokalny Node + SQLite, bez LLM. Szczegóły w docs/03-architecture.md. Nie zamieniaj stosu bez konkretnego blokera i krótkiej decyzji.
7. Zapisy traktuj jako trwałe dopiero po potwierdzeniu serwera. Nie usuwaj tekstu przy błędzie. Nie wykonuj migracji/resetu na danych użytkownika podczas testów.
8. Po jednostce pracy aktualizuj STATE.md i status w indeksie, zamiast dopisywać dziennik. Nie umieszczaj rozmów, pełnych logów ani wierszy w pamięci projektu.
9. Limity: AGENTS 3 KiB, PROJECT 2 KiB, STATE 3 KiB, indeks 3 KiB; razem do 10 KiB. Karta zadania do 5 KiB. Jedna sekcja specyfikacji na żądanie.
10. Uruchom node scripts/check-context.mjs. Przekroczenie napraw przez redakcję i usunięcie powtórzeń, nie zwiększenie limitu.
11. Weryfikuj ważne ścieżki: zapis po restarcie, konflikt wersji, podpowiedzi, niezależna próba, eksport/import. Nie twórz testów samych etykiet.
12. DONE wymaga dowodów kryteriów karty. Gdy sprzęt niedostępny, oznacz VERIFY_ON_MAC; nigdy nie wymyślaj wyniku.
13. Po zmianie interfejsu sprawdź go wizualnie, także w wąskiej szerokości i klawiaturą. Błędy stylistyczne wierszy nie blokują zapisu.
14. Po sprawdzeniu staged diff commituj tylko pliki zadania. Push wyłącznie do ustalonego prywatnego remote. Nie używaj force push ani git add . bez kontroli.
15. Jeśli kontekst się kończy: najpierw STATE.md z następną komendą, potem krótki komunikat. Nie uruchamiaj nowego dużego zadania.
16. Pisz po polsku. Raport: działające zachowanie, testy, ograniczenie, następny krok. Oddziel wykonane od zaplanowanego.
