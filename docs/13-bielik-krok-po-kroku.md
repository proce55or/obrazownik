# Bielik na tym Macu — krok po kroku

Instalacja: iMac Intel,64GB RAM; Bielik-Minitron-7B-v3.0-Instruct Q4_K_M.
Wagi i runtime są w `~/Obrazownik-modele`, dane w `~/Obrazownik-dane`,
poza Git. Nie pobieraj modelu ponownie. [Pomiary konfiguracji](14-bielik-benchmark.md).

## Uruchomienie

1. Finder → Cmd+Shift+G → `/Users/proce55or/Code/Obrazownik/Obrazownik_plan`.
2. Dwuklik **Start-Obrazownik-z-Bielikiem.command**. Zostaw otwarty Terminal.
3. Otwórz **http://127.0.0.1:4317**. Po aktualizacji odśwież zapisany szkic.
4. W razie potrzeby: **Ustawienia → Jak włączyć i sprawdzić Bielika →
   Sprawdź połączenie z Bielikiem**.

Mac musi pozostać uruchomiony. Nie trzeba zamykać wszystkich przeglądarek;
warto wstrzymać renderowanie wideo lub inne ciężkie zadania. Model używa CPU,
Internet po instalacji nie jest potrzebny. Windows i Safari wymagają osobnego odbioru.

## Ćwiczenie prowadzone od wersji0.3.0

1. **Start → Zacznij z Bielikiem**. Ten tryb włącza model dla tego ćwiczenia,
   niezależnie od ustawienia gotowych pytań w innych ćwiczeniach.
2. Przeczytaj polecenie i cel. Napisz odpowiedź w polu **Twoja odpowiedź**.
3. Kliknij **Poproś Bielika o wskazówkę**. Bieżąca odpowiedź trafia wyłącznie
   do lokalnego modelu. Nie trafia do chmury ani wspólnego bufora pytań.
4. Poczekaj na omówienie: cytat, co działa, możliwa poprawka i jedno pytanie.
   Model może potrzebować około minuty, czasem do3min. W tym czasie pole
   jest wstrzymane, aby omówienie dotyczyło dokładnie zapisanej odpowiedzi.
5. Możesz dopracować odpowiedź i poprosić o nowe omówienie albo wybrać
   **Przejdź do kroku2**. Po zmianie tekstu stare omówienie jest oznaczone
   jako nieaktualne; przejście dalej wymaga omówienia aktualnej wersji.
6. Kolejne kroki to porównanie i krótka scena. Po trzecim wybierz
   **Zakończ i zachowaj ćwiczenie**. Odpowiedzi i omówienia znajdziesz
   w **Moje teksty**. **Zapisz szkic i wróć** zachowuje etap na później.

Bielik zna aktualną odpowiedź i cel etapu, nie przeszukuje zeszytu.
Omówienie obejmuje do1800znaków; dłuższy tekst można zachować. Cytat jest
sprawdzany z tekstem, ale trafności interpretacji nie da się zagwarantować.
Możesz się z uwagą nie zgodzić i zachować własne brzmienie. To pomoc
w ćwiczeniu języka, nie punktacja talentu ani dowód efektu terapeutycznego.

## Inne ćwiczenia i bufor pytań

W **Ćwiczeniach** wybierasz temat. **Ustawienia → Pomoc w nowych ćwiczeniach**
pozwala wybrać gotowe podpowiedzi albo dodatkowe pytanie Bielika. Zapisz
ustawienia i otwórz nową próbę; dawny szkic zachowuje swój tryb.

W tych standardowych ćwiczeniach Bielik zna temat, ale NIE czyta odpowiedzi.
Może przygotować pytanie w tle, zanim klikniesz **Pokaż dodatkowe pytanie**.
Dopiero pokazanie zapisuje użycie pomocy. Bufor przechowuje pytania do tematu,
nie odpowiedzi autora. Nie przyspiesza obliczeń omówienia nowego tekstu.

Do porównania wykonaj różne tematy tej samej rodziny bez modelu i z modelem;
odnotuj własną łatwość i zmęczenie. Kolejność i temat również wpływają na wynik.
**Ćwiczenia → Zacznij nowy tekst** otwiera próbę chronioną bez LLM i podpowiedzi.
Poproszenie tam o pomoc tworzy osobną wersję, zachowując pierwotną próbę.

## Zatrzymanie i problemy

Poczekaj na potwierdzenie zapisu lub użyj powrotu do szkicu. W Terminalu
launchera Ctrl+C zatrzymuje jego własne procesy. Bez modelu uruchom
**Start-Obrazownik.command** i wybierz standardowe ćwiczenia.

Przy niedostępności modelu odpowiedź pozostaje zapisana; uruchom launcher
z Bielikiem i ponów prośbę. Przy utracie połączenia użyj przycisku ponowienia,
który sprawdzi tę samą operację. Przy konflikcie wersji zachowaj lokalny tekst
jako osobną wersję. Nie usuwaj bazy ani blokad, aby naprawić zajęty port.
