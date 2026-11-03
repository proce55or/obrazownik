# Stan projektu
Updated: 2026-11-03, Europe/Warsaw
Active task: T10
Status: READY_FOR_USER — wdrożone poprawki po przeglądzie
Environment: macOS13.7.8 Intel, Node24.21.0
Branch: main; Release:0.2.1, schema3
Remote: proce55or/obrazownik (PRIVATE sprawdzone API)

## Działa i jest wdrożone
MVP + SCI-00–05 + T17/T18 + T19. Zdrowie produkcji127.0.0.1:4317
potwierdza0.2.1/schema3, lokalny Bielik4320 jest dostępny i właściwy.
Przed restartem wykonano sprawdzoną ręczną kopię SQLite. Stary właściciel
launchera zatrzymany łagodnie po potwierdzeniu PID/komend; nowy launcher
uruchomiony przez Launch Services. Format bazy nie wymagał migracji.

T19: sesje nie wyczerpują puli po pustych przerwaniach; jawne powtórki
zachowują historię, pierwsze ukończenie nadal planuje2/7/21. Klient rozróżnia
odmowę i nieznany wynik zapisu, oferuje retry zakończenia. Autosave obejmuje
tytuł dokumentu. Bufor ma timeout/retry, scalanie zapisów i okresowe utrwalanie
podczas ciągłego pisania; kopie można pobrać i świadomie usunąć.
Globalne pismo16–26px, prostszy Dzisiaj, ustawienia i język. Zredagowano91
kart w nowych wersjach, zachowano94 starsze; rezerwa nadal chroniona.
Szczegóły: docs/16-review-fixes.md. Bielik pozostaje opcjonalny, bez tekstu
autora w modelu. Instrukcja: docs/13-bielik-krok-po-kroku.md.

## Weryfikacja
- npm run check:116 testów/22 pliki PASS; typy/lint/treści/context/repo PASS.
- npm run build:0.2.1 PASS.
- OBRAZOWNIK_TEST_LLM=1 npm run test:e2e: cały przebieg PASS, również
  rzeczywisty Bielik, pisanie podczas przygotowania i najnowszy pre_hint.
- Odbiór320/390px,16/26px, zoom200%, klawiatura i wizualny przegląd PASS.
- Utracone odpowiedzi complete/skip/PATCH, CAS dokumentów, tytuł/recovery,
  offline model, timeoutIndexedDB i eksport/usunięcie kopii PASS.
- Testy wyłącznie w tmpdir; dane użytkownika i wagi poza Git.
Safari i ręczny dwuklik Findera pozostają VERIFY_ON_MAC. T10 czeka na
rzeczywiste obserwacje autora, osobno od technicznego odbioru.

## Dalsza praca i zasoby
Nie powtarzać zaliczonych pełnych testów bez nowej przyczyny. T18 zakończone,
harmonogram usunięty. Nie tworzyć nowego nocnego zadania.
Dane ~/Obrazownik-dane; wagi ~/Obrazownik-modele/bielik-7b.
Ostatni limit61% użyte/39% pozostało. Cel zachować20%; przy>=78% lub braku
licznika nie zaczynać kosztownej pracy. Następny krok: pilotaż autoraT10.
