# Bielik na tym Macu — krok po kroku

Ta instrukcja dotyczy przygotowanej instalacji na iMacu Intel z 64 GB RAM.
Model: Bielik-Minitron-7B-v3.0-Instruct, Q4_K_M. Wagi i program uruchamiający
są już zainstalowane w `/Users/proce55or/Obrazownik-modele`. Nie pobieraj ich ponownie.
Wyniki pomiarów i ograniczenia: [benchmark](14-bielik-benchmark.md).

## Co robisz Ty przy uruchomieniu

1. W Finderze naciśnij **Cmd+Shift+G**. Wklej:
   `/Users/proce55or/Code/Obrazownik/Obrazownik_plan` i naciśnij Enter.
2. Otwórz dwuklikiem **Start-Obrazownik-z-Bielikiem.command**.
   Zostaw otwarte okno Terminala. Launcher sprawdza plik modelu i uruchamia
   lokalną aplikację. Pierwszy start wymaga kilkudziesięciu sekund.
3. Poczekaj na przeglądarkę. Adres aplikacji to **http://127.0.0.1:4317**.
   Jeśli strona już była otwarta, odśwież ją po zapisaniu swojego szkicu.
4. Otwórz **Ustawienia i kopie**. Kliknij **Sprawdź połączenie z Bielikiem**.
   Powinien pojawić się komunikat o dostępności lokalnego modelu.
5. Poniżej wybierz tryb opisany w następnym rozdziale i kliknij
   **Zapisz ustawienia**. Zmiana dotyczy nowych prób. Wcześniej otwarty szkic
   zachowuje poprzedni tryb — wróć do Dzisiaj i otwórz nową kartę.

Nie musisz zamykać wszystkich przeglądarek. Podczas testu warto wstrzymać
renderowanie wideo, gry lub inne obciążające zadania. Model korzysta z CPU;
64 GB RAM wystarcza dla tej konfiguracji. Po instalacji Internet nie jest potrzebny.
Mac musi działać; po jego uśpieniu aplikacja i obliczenia nie pracują normalnie.

## Pierwsze porównanie: bez modelu i z modelem

1. W **Ustawienia i kopie → Pomoc w nowych próbach** wybierz
   **Bez LLM — gotowa pomoc aplikacji** i zapisz ustawienia.
2. W Dzisiaj otwórz nową kartę. Napisz swój tekst i wybierz **Zapisz i zakończ**.
   Zapisz dobrowolną samoocenę łatwości i zmęczenia. Jeśli chcesz próbę zupełnie
   bez pomocy, nie otwieraj też gotowych pytań, kroków ani przykładów.
3. W ustawieniach wybierz **Lokalny Bielik**. Zostaw zaznaczone
   **Przygotuj pytanie Bielika w tle po otwarciu ćwiczenia**. Zapisz ustawienia.
4. Otwórz nową kartę z tej samej rodziny, ale z innym tematem. Zacznij pisać.
   Komunikat poinformuje, że pytanie jest przygotowywane. Możesz pisać przez cały czas.
5. Gdy chcesz pomocy, kliknij **Pokaż pytanie Bielika**. Dopiero ten krok
   ujawnia pytanie i zapisuje użycie pomocy. Tekst sprzed pytania zostaje zachowany.
   Możesz też wcale nie otwierać pytania. Model nie pisze do Twojego edytora.
6. Zakończ próbę i wpisz samoocenę. W **Zeszycie** i **Obserwacjach** sprawdź
   obie próby: oddzielnie widać ustawiony tryb oraz potwierdzone pokazanie Bielika.
   Przy porównywaniu można ukryć dodatkowe informacje o próbach.

To test wygody i własnych odczuć. Jeden wynik może zależeć także od tematu,
kolejności i zmęczenia. Innym razem warto odwrócić kolejność. Aby sprawdzić
samodzielne pisanie na nowym temacie, wybierz **Zacznij nowy tekst**.
W tej próbie LLM i pozostałe podpowiedzi są wyłączone. Poproszenie o pomoc
otwiera osobną wersję, zachowując pierwotną próbę.

## Co daje buforowanie

Po otwarciu karty aplikacja przygotowuje jedno krótkie pytanie naprowadzające w tle.
Nie wysyła do modelu Twojego bieżącego tekstu ani dokumentu źródłowego.
Jeśli popiszesz przez kilkanaście sekund, pytanie może być gotowe przed
kliknięciem. Gotowe pytanie dla tego materiału może zostać użyte ponownie,
także po restarcie aplikacji. Zmiana modelu, promptu lub wersji karty zmienia bufor.

Bufor nie przyspiesza samego liczenia. Jeśli poprosisz o pytanie od razu,
trzeba będzie poczekać. Nie przewidzi też analizy fragmentu, którego jeszcze
nie napisałeś. W tej wersji Bielik daje tylko krótkie pytanie naprowadzające;
nie ocenia tekstu i nie prowadzi swobodnej rozmowy. Jego pytanie może być
nietrafne albo nadmiernie sugerujące — możesz je pominąć. Gotowa pomoc
aplikacji pozostaje dostępna i jest oznaczona jako osobne źródło.

## Zatrzymanie i problemy

1. Poczekaj na **Zapisano na Macu** albo użyj **Zapisz szkic i wróć**.
2. W oknie Terminala, które uruchomiło program, naciśnij **Ctrl+C**.
   Launcher zatrzymuje tylko procesy, które sam uruchomił. Jeśli wykrył już
   działającą aplikację lub model, ich właścicielem pozostaje wcześniejsze okno.
3. Aby pracować wyłącznie bez modelu, uruchom **Start-Obrazownik.command**,
   wybierz **Bez LLM** i otwórz nową próbę. Samo wyłączenie opcji w ustawieniach
   nie zamyka procesu modelu ani nie zmienia trybu starych szkiców.

Jeżeli model jest niedostępny, możesz nadal pisać, zapisywać i używać gotowej
pomocy. Uruchom launcher z Bielikiem, ponów sprawdzenie połączenia, a w próbie
kliknij **Przygotuj pytanie Bielika**. Przy komunikacie o zajętym porcie nie
usuwaj danych ani blokady; zachowaj komunikat do diagnozy.

Kod jest w prywatnym repozytorium. Teksty i baza są w `~/Obrazownik-dane`,
wagi oraz logi runtime w `~/Obrazownik-modele`. Żadne z tych danych nie trafiają
przez tę integrację do płatnego API ani na zewnętrzny serwer.
