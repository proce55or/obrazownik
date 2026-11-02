# Prompt do modelu pracującego na Macu

Pracujesz nad istniejącą aplikacją Obrazownik. Wprowadź dodatek naukowy z tego pakietu do aktualnego projektu. Nie buduj aplikacji ponownie.

Celem jest samodzielne znajdowanie słów, tworzenie obrazów i pisanie po polsku we własnym głosie. Narzędzie ma pomagać ćwiczyć, nie pisać za użytkownika ani oceniać jego zdrowia. Wyniki badań metod nie oznaczają walidacji naszej aplikacji.

1. Najpierw przeczytaj instrukcje repo, aktualny STATE i indeks zadań. Sprawdź git status, obecne ćwiczenia, schemat danych, obsługę podpowiedzi, eksport i testy. Zachowaj niezacommitowane zmiany. Nie resetuj stanu do starego T00.
2. Przeczytaj START_NAUKA.md, następnie sekcje 1–2 pliku docs/science/03-integration.md. Przygotuj krótkie mapowanie istnieje / częściowo / brak. Nie zakładaj, że kod dokładnie odpowiada dawnemu planowi.
3. Wykonuj kolejno SCI-00–SCI-05. Zacznij od braków w zapisie pomocy i ekspozycji, dopracuj E1/E3, zapewnij nowe pisanie E6, później dodaj opcjonalne warianty E2 i poprawkę E5. Funkcje już gotowe zweryfikuj, nie dubluj.
4. Czytaj z 02-methods.md tylko aktualnie wdrażany wariant. Źródło sprawdzaj po identyfikatorze R w 04-sources.md lub 05-sources-pl.md. Nie wczytuj całej bibliografii ani PDF-ów przy każdej sesji. Etapy SCI mapuj na obecny format zadań, np. kolejne wolne Txx, aby zachować zgodność z check-context.
5. Zachowaj działanie lokalne, obecny stos technologiczny i prywatność repo. Dane oraz teksty pozostają poza Git. Nie dodawaj LLM, płatnego API, treningu modelu ani wielkiego słownika jako wymagania tego etapu.
6. Przed migracją wykonaj i sprawdź spójną kopię bazy poza repo. Migracje mają być przyrostowe. Nieznana historia podpowiedzi lub ekspozycji pozostaje unknown. Nie nadpisuj oryginalnych tekstów.
7. Karty i instrukcje twórz po polsku. Uwzględnij przypadki, przyimki, się i aspekt czasownika. W otwartym pisaniu nie stosuj jedynej poprawnej odpowiedzi, oceny poetyckości ani nagrody za rzadkość słów.
8. Oddzielaj powtórki, bliskie przeniesienie i nowe pisanie bez pomocy. Po pokazaniu przykładu próba przestaje być samodzielna; użytkownik nadal ma prawo skorzystać z pomocy. Chronione tematy i ich parafrazy nie mogą pojawiać się w treningu.
9. Dodaj krótką informację o inspiracji badawczej i ograniczeniach. Materiał twórczy oznacz jako adaptację lub hipotezę, nie terapię o dowiedzionej skuteczności. Nie kopiuj cudzych zestawów bez sprawdzenia licencji.
10. Uruchom testy adekwatne do zmian: migracja, pomoc, ekspozycja, polskie karty, zapis oraz eksport/import. Po etapie zapisz wynik i jeden następny krok w STATE. Kontynuuj, jeśli nic rzeczywiście nie blokuje pracy.

Pamięć: AGENTS ≤3 KiB, PROJECT ≤2 KiB, STATE ≤3 KiB, INDEX ≤3 KiB, razem ≤10 KiB. Moduł dokumentacji ≤16 KiB, karta zadania ≤5 KiB. Nie dopisuj transkrypcji do pamięci. Do repo skopiuj moduły dodatku tylko raz, bez skonsolidowanego raportu. Zachowaj surowsze istniejące limity, jeśli projekt je ma.

Na końcu podaj: co zmieniłeś, co przetestowałeś, co zostało i jak uruchomić zmodyfikowany przebieg. Oddziel ukończoną implementację od niepotwierdzonej skuteczności klinicznej.
